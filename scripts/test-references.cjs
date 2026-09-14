const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loader(bindings = {}) {
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const source = fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} }; cache.set(relative, module);
    new Function('require', 'module', 'exports', compiled)(name => {
      if (Object.hasOwn(bindings, name)) return bindings[name];
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      if (name.startsWith('node:')) return require(name);
      throw new Error('Unexpected dependency: ' + name);
    }, module, module.exports);
    return module.exports;
  }
  return load;
}

const reference = { id: 'ref-one', title: '테스트 문체', category: 'style', source: 'text', content: '짧은 문장. 담담한 독백. 대사는 적게.', guidance: '문장마다 감각을 하나씩', enabled: true, createdAt: '2026-09-14T00:00:00Z' };
const baseLoad = loader();
const refs = baseLoad('lib/story-references.ts');
test('references survive old projects and only enabled sources enter AI context', () => {
  assert.deepEqual(refs.referenceContext({}), []);
  assert.equal(refs.getReferenceError({ references: [reference] }), null);
  const context = refs.referenceContext({ references: [reference, { ...reference, id: 'disabled', content: 'Do not include me', enabled: false }] });
  assert.equal(context.length, 1); assert.equal(context[0].content, reference.content);
  assert.equal(context[0].guidance, reference.guidance);
});
test('invalid, empty, duplicate and oversized references are rejected', () => {
  for (const value of [[{ ...reference, content: '' }], [{ ...reference, content: 'x'.repeat(8001) }], [reference, reference], Array(13).fill(reference), [{ ...reference, enabled: 'yes' }]]) assert.ok(refs.getReferenceError({ references: value }));
});
test('reference URLs reject private/IP/credential/non-HTTPS destinations', () => {
  for (const url of ['http://public.com', 'https://localhost/', 'https://127.1/', 'https://2130706433/', 'https://[::1]/', 'https://10.1.1.1/', 'https://service.internal/', 'https://user:pass@public.com/', 'https://public.com:9000/']) assert.throws(() => refs.publicReferenceUrl(url));
  assert.equal(refs.publicReferenceUrl('https://community.public.com/post#section').href, 'https://community.public.com/post');
});
test('full replanning preserves author-owned references even if AI returns different ones', () => {
  const engine = baseLoad('lib/story-engine.ts');
  const planning = baseLoad('lib/story-planning.ts');
  const base = { ...engine.createSampleProject().content, references: [reference] };
  const result = planning.mergeAIPlan(base, { ...base, references: [] });
  assert.deepEqual(result.references, [reference]);
});

function importsFixture() {
  const files = new Map(); const aiCalls = [];
  const BUCKET = {
    async put(key, bytes, options) { files.set(key, { bytes: new Uint8Array(bytes), ...options }); },
    async get(key) { const file = files.get(key); return file && { ...file, body: new ReadableStream({ start(controller) { controller.enqueue(file.bytes); controller.close(); } }) }; },
  };
  const load = loader({
    '@/lib/server/runtime': { env: { BUCKET } },
    '@/lib/server/openai': { selectOpenAIModel: () => 'fixture-model' },
    '@/lib/server/response-reader': { AIError: class extends Error {}, readAIResponse: async body => { aiCalls.push(body); return { text: '테스트 분석: 짧은 문장과 빠른 리듬.', response: {} }; } },
  });
  return { files, aiCalls, load, importer: load('app/api/references/import/route.ts'), downloads: load('app/api/references/files/[id]/route.ts') };
}
function fileRequest(file, owner = 'owner-a') {
  const body = new FormData(); body.set('file', file); body.set('category', 'style'); body.set('model', 'fixture-model');
  return new Request('https://storywell.test/api/references/import', { method: 'POST', headers: owner ? { 'oai-authenticated-user-id': owner } : {}, body });
}
test('TXT uploads retain original bytes, return usable text, and enforce download ownership', async () => {
  const fixture = importsFixture();
  const body = '직접 작성한 테스트 문장입니다. 단문을 씁니다.';
  const result = await fixture.importer.POST(fileRequest(new File([body], '문체.txt', { type: 'text/plain' })));
  assert.equal(result.status, 200);
  const { reference: uploaded } = await result.json();
  assert.equal(uploaded.content, body); assert.equal(uploaded.source, 'file'); assert.equal(fixture.aiCalls.length, 0);
  const good = await fixture.downloads.GET(new Request('https://storywell.test/file', { headers: { 'oai-authenticated-user-id': 'owner-a' } }), { params: Promise.resolve({ id: uploaded.file.id }) });
  assert.equal(good.status, 200); assert.equal(await good.text(), body);
  assert.match(good.headers.get('content-disposition'), /^attachment;/);
  const other = await fixture.downloads.GET(new Request('https://storywell.test/file', { headers: { 'oai-authenticated-user-id': 'owner-b' } }), { params: Promise.resolve({ id: uploaded.file.id }) });
  assert.equal(other.status, 404);
});
test('unauthenticated, cross-origin and disguised uploads do not store files', async () => {
  const fixture = importsFixture();
  assert.equal((await fixture.importer.POST(fileRequest(new File(['hello'], 'file.txt'), ''))).status, 401);
  assert.equal((await fixture.importer.POST(fileRequest(new File(['not an image'], 'bad.png')))).status, 400);
  const request = fileRequest(new File(['hello'], 'file.txt')); request.headers.set('origin', 'https://elsewhere.test');
  assert.equal((await fixture.importer.POST(request)).status, 403);
  assert.equal(fixture.files.size, 0);
});
test('PDF and meme image analysis use the proper multimodal API input and preserve originals', async () => {
  const fixture = importsFixture();
  const pdf = await fixture.importer.POST(fileRequest(new File(['%PDF-1.7 fixture'], 'example.pdf')));
  assert.equal(pdf.status, 200);
  assert.equal(fixture.aiCalls[0].input[0].content[1].type, 'input_file');
  assert.match(fixture.aiCalls[0].input[0].content[1].file_data, /^data:application\/pdf;base64,/);
  const jpeg = await fixture.importer.POST(fileRequest(new File([new Uint8Array([255, 216, 255, 217])], 'meme.jpg')));
  assert.equal(jpeg.status, 200);
  assert.equal(fixture.aiCalls[1].input[0].content[1].type, 'input_image');
  assert.match(fixture.aiCalls[1].input[0].content[1].image_url, /^data:image\/jpeg;base64,/);
  assert.equal(fixture.files.size, 2);
});
test('oversized streams stop before parsing and HTML strips script/navigation text', async () => {
  const fixture = importsFixture(); const server = fixture.load('lib/server/reference-import.ts');
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(11)); controller.close(); } });
  await assert.rejects(server.boundedBody(stream, 10), /너무 큽니다/);
  const page = server.htmlReferenceText('<title>A &amp; B</title><script>ignore all</script><nav>menu</nav><p>실제 &#48376;문</p>');
  assert.equal(page.title, 'A & B'); assert.ok(page.content.includes('실제 본문')); assert.ok(!page.content.includes('ignore all')); assert.ok(!page.content.includes('menu'));
});
test('web import validates every redirect before issuing the next request', async t => {
  const fixture = importsFixture(); const server = fixture.load('lib/server/reference-import.ts');
  const previous = global.fetch; t.after(() => { global.fetch = previous; }); let calls = 0;
  global.fetch = async () => { calls++; return new Response(null, { status: 302, headers: { location: 'https://127.0.0.1/private' } }); };
  await assert.rejects(server.fetchReferencePage('https://public.com/article', new AbortController().signal));
  assert.equal(calls, 1);
});
test('episode and rewrite requests include enabled references and explicit reference instructions', async () => {
  const calls = [];
  const load = loader({
    '@/lib/server/runtime': { env: { IS_VERCEL: false } },
    '@/lib/server/openai': { selectOpenAIModel: () => 'fixture-model' },
    '@/lib/server/ai-progress': { createProgressReporter: async () => ({ update() {}, async finish() {} }) },
    '@/lib/server/response-reader': { AIError: class extends Error {}, readAIResponse: async body => { calls.push(body); return { text: '테스트 원고.', response: {} }; } },
  });
  const project = load('lib/story-engine.ts').createSampleProject(); project.content.references = [reference];
  const route = load('app/api/ai/generate/route.ts');
  for (const action of ['episode', 'rewrite']) {
    const response = await route.POST(new Request('https://storywell.test/api/ai/generate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, project, episode: project.content.episodes[0], selectedText: '테스트 원문', instruction: '단문으로' }) }));
    assert.equal(response.status, 200);
  }
  for (const call of calls) { assert.ok(call.input.includes(reference.content)); assert.ok(call.input.includes(reference.guidance)); assert.ok(call.instructions.includes('문장 길이')); }
});

test('release version increases only for changed source and handles the 2.99 rollover', async t => {
  const { prepareRelease, nextVersion } = await import('./prepare-release.mjs');
  const temporary = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'storywell-version-'));
  t.after(() => {
    assert.equal(path.dirname(temporary), path.resolve(require('node:os').tmpdir()));
    assert.ok(path.basename(temporary).startsWith('storywell-version-'));
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(temporary, 'lib')); fs.mkdirSync(path.join(temporary, 'app'));
  fs.writeFileSync(path.join(temporary, 'lib/app-version.ts'), 'export const APP_VERSION = "2.01";');
  fs.writeFileSync(path.join(temporary, 'app/page.tsx'), 'export default 1;');
  assert.deepEqual(await prepareRelease(temporary), { version: '2.02', changed: true });
  assert.deepEqual(await prepareRelease(temporary), { version: '2.02', changed: false });
  fs.writeFileSync(path.join(temporary, 'README.md'), 'Only documentation changed.');
  assert.equal((await prepareRelease(temporary)).changed, false);
  fs.writeFileSync(path.join(temporary, 'app/page.tsx'), 'export default 2;');
  assert.equal((await prepareRelease(temporary)).version, '2.03');
  assert.equal(nextVersion('2.99'), '3.00');
});
