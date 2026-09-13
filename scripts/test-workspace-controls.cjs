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
        return { async run() {
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
function generationRequest(project, signal) {
  return new Request('https://storywell.test/api/ai/generate', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'oai-authenticated-user-id': 'owner-a' },
    body: JSON.stringify({ action: 'episode', project, episode: { number: 1 } }),
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
