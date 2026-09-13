const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const root = process.cwd();
const requireProject = createRequire(path.join(root, 'package.json'));
const ts = requireProject('typescript');

// Execute the actual route code, with only its runtime bindings replaced.
function loadTS(relative, bindings = {}) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(name => {
    if (Object.hasOwn(bindings, name)) return bindings[name];
    if (name.startsWith('@/lib/')) return loadTS(name.slice(2) + '.ts', bindings);
    throw new Error('Unexpected test dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}

function fixture(t, options = {}) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of fs.readdirSync(path.join(root, 'drizzle')).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(fs.readFileSync(path.join(root, 'drizzle', file), 'utf8'));
  }
  const project = { id: 'project-a', title: '테스트 작품', synopsis: '테스트 시놉시스', genre: 'SF', tone: '긴장', targetEpisodes: 12, content: {} };
  function insertProject(id, owner) {
    sqlite.prepare('INSERT INTO story_projects (id, owner_id, title, synopsis, genre, tone, content) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, owner, project.title, project.synopsis, project.genre, project.tone, '{}');
  }
  function insertHistory(id, projectId, owner) {
    sqlite.prepare('INSERT INTO story_generations (id, owner_id, project_id, action, model, input_summary, output) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, owner, projectId, 'episode', 'test-model', '테스트', '기존 원고');
  }
  insertProject('project-a', 'owner-a');
  insertProject('project-b', 'owner-b');
  const DB = {
    prepare(sql) {
      return { bind(...args) {
        return { async all() { return { results: sqlite.prepare(sql).all(...args) }; }, async run() {
          if (options.failProjectUpdate && sql.startsWith('UPDATE story_projects')) throw new Error('Simulated update failure');
          if (options.failProjectDelete && sql.startsWith('DELETE FROM story_projects')) throw new Error('Simulated database failure');
          const result = sqlite.prepare(sql).run(...args);
          return { meta: { changes: Number(result.changes) } };
        } };
      } };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
  t.after(() => sqlite.close());
  return { sqlite, DB, project, insertHistory, count: table => sqlite.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n };
}
function deleteRequest(owner = 'owner-a') {
  return new Request('https://storywell.test/api/projects/project-a', { method: 'DELETE', headers: { 'oai-authenticated-user-id': owner } });
}
const params = () => ({ params: Promise.resolve({ id: 'project-a' }) });
function generationRoute(DB, provider) {
  return loadTS('app/api/ai/generate/route.ts', {
    'cloudflare:workers': { env: { DB } },
    '@/lib/server/openai': { selectOpenAIModel: () => 'gpt-5.6-terra', createOpenAIResponse: provider },
  });
}
function generationRequest(project, signal, overrides = {}) {
  return new Request('https://storywell.test/api/ai/generate', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'owner-a' },
    body: JSON.stringify({ action: 'episode', project, episode: { number: 1 }, ...overrides }),
  });
}

test('deletion removes the selected owner project and its history only', async t => {
  const f = fixture(t);
  f.insertHistory('a-history', 'project-a', 'owner-a');
  f.insertHistory('b-history', 'project-b', 'owner-b');
  const route = loadTS('app/api/projects/[id]/route.ts', { 'cloudflare:workers': { env: { DB: f.DB } } });
  assert.equal((await route.DELETE(deleteRequest(), params())).status, 200);
  assert.equal(f.count('story_projects'), 1);
  assert.equal(f.count('story_generations'), 1);
  assert.equal(f.sqlite.prepare('SELECT id FROM story_projects').get().id, 'project-b');
  assert.equal(f.sqlite.prepare('SELECT id FROM story_generations').get().id, 'b-history');
});

test('another owner cannot delete a project or its history', async t => {
  const f = fixture(t);
  f.insertHistory('a-history', 'project-a', 'owner-a');
  const route = loadTS('app/api/projects/[id]/route.ts', { 'cloudflare:workers': { env: { DB: f.DB } } });
  assert.equal((await route.DELETE(deleteRequest('owner-b'), params())).status, 404);
  assert.equal(f.count('story_projects'), 2);
  assert.equal(f.count('story_generations'), 1);
});

test('a failed project deletion rolls back history removal', async t => {
  const f = fixture(t, { failProjectDelete: true });
  f.insertHistory('a-history', 'project-a', 'owner-a');
  const route = loadTS('app/api/projects/[id]/route.ts', { 'cloudflare:workers': { env: { DB: f.DB } } });
  assert.equal((await route.DELETE(deleteRequest(), params())).status, 500);
  assert.equal(f.count('story_projects'), 2);
  assert.equal(f.count('story_generations'), 1);
});

test('successful generation is recorded for an existing owned project', async t => {
  const f = fixture(t);
  const route = generationRoute(f.DB, async () => Response.json({ id: 'test-response', output_text: '생성된 테스트 원고' }));
  const response = await route.POST(generationRequest(f.project));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).result, '생성된 테스트 원고');
  assert.equal(f.count('story_generations'), 1);
});

test('late generation cannot recreate history for a deleted project', async t => {
  const f = fixture(t);
  const route = generationRoute(f.DB, async () => {
    f.sqlite.prepare('DELETE FROM story_projects WHERE id = ?').run('project-a');
    return Response.json({ output_text: '늦게 도착한 원고' });
  });
  assert.equal((await route.POST(generationRequest(f.project))).status, 200);
  assert.equal(f.count('story_generations'), 0);
});

test('cancellation reaches the provider and does not record a generation', async t => {
  const f = fixture(t);
  const controller = new AbortController();
  let providerSignal;
  const route = generationRoute(f.DB, async (_body, signal) => {
    providerSignal = signal;
    controller.abort();
    signal.throwIfAborted();
  });
  const response = await route.POST(generationRequest(f.project, controller.signal));
  assert.equal(response.status, 499);
  assert.equal(providerSignal.aborted, true);
  assert.equal((await response.json()).code, 'AI_CANCELLED');
  assert.equal(f.count('story_generations'), 0);
});

test('cancellation while reading the response also prevents history writes', async t => {
  const f = fixture(t);
  const controller = new AbortController();
  const route = generationRoute(f.DB, async () => ({ ok: true, async json() {
    controller.abort();
    return { output_text: '취소 후 도착한 원고' };
  } }));
  assert.equal((await route.POST(generationRequest(f.project, controller.signal))).status, 499);
  assert.equal(f.count('story_generations'), 0);
});

test('client rejects a late response even when transport ignores cancellation', async t => {
  const { requestAI } = loadTS('lib/ai-request.ts');
  let resolveResponse;
  const pendingResponse = new Promise(resolve => { resolveResponse = resolve; });
  t.mock.method(globalThis, 'fetch', async () => pendingResponse);
  const controller = new AbortController();
  const pending = requestAI({ action: 'episode' }, controller.signal);
  controller.abort();
  resolveResponse(Response.json({ result: 'must not be applied' }));
  await assert.rejects(pending, { name: 'AbortError' });
});

test('client skips already cancelled requests and can send a new request afterwards', async t => {
  const { requestAI } = loadTS('lib/ai-request.ts');
  let calls = 0;
  let selectedModel;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    calls++;
    selectedModel = JSON.parse(init.body).model;
    return Response.json({ result: '새 원고' });
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(requestAI({}, controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
  const result = await requestAI({ model: 'gpt-6-astra' }, new AbortController().signal);
  assert.equal(result.result, '새 원고');
  assert.equal(selectedModel, 'gpt-6-astra');
  assert.equal(calls, 1);
});

test('legacy targets default to 5000 and rebuilding a plan preserves goals by episode number', () => {
  const targets = loadTS('lib/episode-target.ts');
  const previous = [{ number: 1, targetCharacters: 3200 }, { number: 2, targetCharacters: 7600 }];
  const result = targets.withEpisodeTargets([{ number: 2, targetCharacters: 99 }, { number: 1 }, { number: 3 }], previous);
  assert.deepEqual(result.map(item => item.targetCharacters), [7600, 3200, 5000]);
  assert.equal(targets.getTargetCharacters({ number: 1 }), 5000);
  const project = { content: { episodes: previous, episodeDrafts: { 1: { body: '보존할 원고' } } } };
  const changed = targets.setEpisodeTarget(project, 1, 4500);
  assert.equal(changed.content.episodes[0].targetCharacters, 4500);
  assert.equal(changed.content.episodes[1].targetCharacters, 7600);
  assert.equal(project.content.episodes[0].targetCharacters, 3200);
  assert.equal(changed.content.episodeDrafts, project.content.episodeDrafts);
});

test('per-episode goals survive create, update and reload with manuscript contents intact', async t => {
  const f = fixture(t);
  const bindings = { 'cloudflare:workers': { env: { DB: f.DB } } };
  const collection = loadTS('app/api/projects/route.ts', bindings);
  const item = loadTS('app/api/projects/[id]/route.ts', bindings);
  const content = { episodes: [{ number: 1, targetCharacters: 3200 }, { number: 2, targetCharacters: 7600 }],
    episodeDrafts: { 1: { body: '공백 포함 원고를 보존합니다.' } } };
  const createdResponse = await collection.POST(new Request('https://storywell.test/api/projects', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'owner-a' },
    body: JSON.stringify({ ...f.project, content }),
  }));
  assert.equal(createdResponse.status, 201);
  const { project } = await createdResponse.json();
  project.content.episodes[0].targetCharacters = 4500;
  const updated = await item.PUT(new Request('https://storywell.test/api/projects/' + project.id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'owner-a' },
    body: JSON.stringify(project),
  }), { params: Promise.resolve({ id: project.id }) });
  assert.equal(updated.status, 200);
  const response = await collection.GET(new Request('https://storywell.test/api/projects', { headers: { 'oai-authenticated-user-id': 'owner-a' } }));
  const reloaded = (await response.json()).projects.find(item => item.id === project.id);
  assert.deepEqual(reloaded.content.episodes.map(episode => episode.targetCharacters), [4500, 7600]);
  assert.equal(reloaded.content.episodeDrafts[1].body, content.episodeDrafts[1].body);
});

test('invalid targets are rejected by create and update without changing saved data', async t => {
  const f = fixture(t);
  const bindings = { 'cloudflare:workers': { env: { DB: f.DB } } };
  const collection = loadTS('app/api/projects/route.ts', bindings);
  const item = loadTS('app/api/projects/[id]/route.ts', bindings);
  for (const targetCharacters of [0, -1, 1.5, 20001, '4000', null]) {
    const body = JSON.stringify({ ...f.project, content: { episodes: [{ number: 1, targetCharacters }] } });
    const options = { headers: { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'owner-a' }, body };
    assert.equal((await collection.POST(new Request('https://storywell.test/api/projects', { ...options, method: 'POST' }))).status, 400);
    assert.equal((await item.PUT(new Request('https://storywell.test/api/projects/project-a', { ...options, method: 'PUT' }), params())).status, 400);
  }
  assert.equal(f.count('story_projects'), 2);
  assert.equal(f.sqlite.prepare('SELECT content FROM story_projects WHERE id = ?').get('project-a').content, '{}');
});

test('AI drafting receives the selected episode goal and a sufficient larger output allowance', async t => {
  const f = fixture(t);
  const sent = [];
  const route = generationRoute(f.DB, async body => { sent.push(body); return Response.json({ output_text: '테스트 원고' }); });
  for (const targetCharacters of [3200, 12000]) {
    const response = await route.POST(generationRequest(f.project, undefined, { episode: { number: 2, targetCharacters } }));
    assert.equal(response.status, 200);
  }
  assert.match(sent[0].input, /공백 포함 목표 3200자/);
  assert.match(sent[1].input, /공백 포함 목표 12000자/);
  assert.ok(sent[1].max_output_tokens > sent[0].max_output_tokens);
  assert.doesNotMatch(sent[0].input, /4,500~5,500/);
});

test('AI rejects invalid targets before calling the provider and defaults older episodes to 5000', async t => {
  const f = fixture(t);
  const sent = [];
  const route = generationRoute(f.DB, async body => { sent.push(body); return Response.json({ output_text: '테스트 원고' }); });
  const invalid = await route.POST(generationRequest(f.project, undefined, { episode: { number: 1, targetCharacters: -1 } }));
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'INVALID_TARGET_CHARACTERS');
  assert.equal(sent.length, 0);
  assert.equal((await route.POST(generationRequest(f.project))).status, 200);
  assert.match(sent[0].input, /공백 포함 목표 5000자/);
});

test('new story length defaults apply to every episode and reject invalid values', () => {
  const { buildStory } = loadTS('lib/story-engine.ts');
  const input = { title: '목표 검증', synopsis: '설정한 분량으로 이야기를 설계한다.', genre: 'SF', tone: '긴장', targetEpisodes: 12 };
  assert.ok(buildStory({ ...input, targetCharacters: 3400 }).episodes.every(episode => episode.targetCharacters === 3400));
  assert.ok(buildStory(input).episodes.every(episode => episode.targetCharacters === 5000));
  for (const targetCharacters of [0, -1, 1.5, 20001, NaN]) assert.throws(() => buildStory({ ...input, targetCharacters }), /회차당 목표 글자 수/);
});

test('character edits and deletion select stable IDs and preserve other story data', () => {
  const { createCharacterDraft, saveCharacterInProject, removeCharacterFromProject } = loadTS('lib/character-editor.ts');
  const first = { ...createCharacterDraft(), name: '같은 이름' };
  const second = { ...createCharacterDraft(), name: '같은 이름' };
  const project = { content: { characters: [first, second], manuscript: '기존 원고', episodes: [{ number: 1, targetCharacters: 3400 }], memories: [{ subject: '기존 기억' }] } };
  const changed = saveCharacterInProject(project, { ...first, name: '  새 이름  ', role: '주인공', archetype: '관찰자', desire: '진실', fear: '망각', secret: '목격자', voice: '짧은 말', state: '조사 중', color: '#123456' }, false);
  assert.equal(changed.content.characters[0].name, '새 이름');
  assert.equal(changed.content.characters[0].id, first.id);
  assert.equal(changed.content.characters[1], second);
  assert.equal(project.content.characters[0].name, '같은 이름');
  const removed = removeCharacterFromProject(changed, first.id);
  assert.deepEqual(removed.content.characters, [second]);
  assert.equal(removed.content.manuscript, project.content.manuscript);
  assert.equal(removed.content.episodes, project.content.episodes);
  assert.equal(removed.content.memories, project.content.memories);
  assert.deepEqual(removeCharacterFromProject(removed, second.id).content.characters, []);
  assert.throws(() => saveCharacterInProject(project, { ...first, name: ' ' }, false), /인물 이름/);
  assert.throws(() => saveCharacterInProject(project, first, true), /이미 추가/);
  assert.throws(() => removeCharacterFromProject(project, 'missing'), /찾지 못/);
});

test('all character fields and new story targets persist through create, edit, add, delete and reload', async t => {
  const f = fixture(t);
  const { buildStory } = loadTS('lib/story-engine.ts');
  const { createCharacterDraft, saveCharacterInProject, removeCharacterFromProject } = loadTS('lib/character-editor.ts');
  const bindings = { 'cloudflare:workers': { env: { DB: f.DB } } };
  const collection = loadTS('app/api/projects/route.ts', bindings);
  const item = loadTS('app/api/projects/[id]/route.ts', bindings);
  const headers = { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'owner-a' };
  const response = await collection.POST(new Request('https://storywell.test/api/projects', { method: 'POST', headers, body: JSON.stringify({ ...f.project, content: buildStory({ ...f.project, targetCharacters: 3400 }) }) }));
  assert.equal(response.status, 201);
  let project = (await response.json()).project;
  const originalManuscript = project.content.manuscript;
  const edited = { ...project.content.characters[0], name: '새 주인공', role: '탐정', archetype: '추적자', desire: '기억 찾기', fear: '잊히는 것', secret: '열쇠의 주인', voice: '낮고 느린 말투', state: '증거를 확보함', color: '#abcdef' };
  project = saveCharacterInProject(project, edited, false);
  const added = { ...createCharacterDraft(), name: '새 인물', secret: '새 비밀' };
  project = saveCharacterInProject(project, added, true);
  const put = async project => item.PUT(new Request('https://storywell.test/api/projects/' + project.id, { method: 'PUT', headers, body: JSON.stringify(project) }), { params: Promise.resolve({ id: project.id }) });
  assert.equal((await put(project)).status, 200);
  let loaded = (await (await collection.GET(new Request('https://storywell.test/api/projects', { headers }))).json()).projects.find(value => value.id === project.id);
  assert.deepEqual(loaded.content.characters[0], edited);
  assert.deepEqual(loaded.content.characters.at(-1), added);
  project = removeCharacterFromProject(loaded, added.id);
  assert.equal((await put(project)).status, 200);
  loaded = (await (await collection.GET(new Request('https://storywell.test/api/projects', { headers }))).json()).projects.find(value => value.id === project.id);
  assert.equal(loaded.content.characters.length, 4);
  assert.equal(loaded.content.manuscript, originalManuscript);
  assert.ok(loaded.content.episodes.every(episode => episode.targetCharacters === 3400));
});

test('blank character names and failed saves do not overwrite saved characters', async t => {
  const f = fixture(t, { failProjectUpdate: true });
  const bindings = { 'cloudflare:workers': { env: { DB: f.DB } } };
  const collection = loadTS('app/api/projects/route.ts', bindings);
  const item = loadTS('app/api/projects/[id]/route.ts', bindings);
  const headers = { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'owner-a' };
  const invalidBody = JSON.stringify({ ...f.project, content: { characters: [{ id: 'lead', name: ' ' }] } });
  assert.equal((await collection.POST(new Request('https://storywell.test/api/projects', { method: 'POST', headers, body: invalidBody }))).status, 400);
  assert.equal((await item.PUT(new Request('https://storywell.test/api/projects/project-a', { method: 'PUT', headers, body: invalidBody }), params())).status, 400);
  const validBody = JSON.stringify({ ...f.project, content: { characters: [{ id: 'lead', name: '보존할 편집값' }] } });
  assert.equal((await item.PUT(new Request('https://storywell.test/api/projects/project-a', { method: 'PUT', headers, body: validBody }), params())).status, 500);
  assert.equal(f.sqlite.prepare('SELECT content FROM story_projects WHERE id = ?').get('project-a').content, '{}');
});
