/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.cwd();
const requireProject = createRequire(path.join(root, 'package.json'));
const ts = requireProject('typescript');

function loadTS(relative, resolve = require) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(resolve, module, module.exports);
  return module.exports;
}

const voice = (name, lang = 'ko-KR', localService = true) => ({
  name,
  voiceURI: name,
  lang,
  localService,
});

test('manuscript splitting preserves Korean text and original offsets', () => {
  const { splitManuscript } = loadTS('lib/manuscript-reader.ts');
  const text = '첫 문장입니다.\n\n“두 번째 문장입니다!” 마지막 문장입니다.';
  const chunks = splitManuscript(text, 24);
  assert.deepEqual(chunks.map(item => item.text), ['첫 문장입니다.', '“두 번째 문장입니다!”', '마지막 문장입니다.']);
  for (const chunk of chunks) assert.equal(text.slice(chunk.start, chunk.end), chunk.text);
});

test('Korean voices are filtered and known male voices are ranked first', () => {
  const { prepareKoreanVoices } = loadTS('lib/manuscript-reader.ts');
  const result = prepareKoreanVoices([
    voice('Microsoft SunHi Online (Natural)'),
    voice('English Male', 'en-US'),
    voice('Microsoft InJoon Online (Natural)', 'ko-KR', false),
    voice('알 수 없는 한국어 음성'),
  ]);
  assert.deepEqual(result.map(item => item.name), [
    'Microsoft InJoon Online (Natural)',
    'Microsoft SunHi Online (Natural)',
    '알 수 없는 한국어 음성',
  ]);
  assert.equal(result[0].gender, 'male');
  assert.equal(result[1].gender, 'female');
  assert.equal(result[2].gender, 'unknown');
});

test('preferred voice chooses saved choice, then Korean male, then a local Korean voice', () => {
  const { choosePreferredVoice, getReaderPitch } = loadTS('lib/manuscript-reader.ts');
  const voices = [voice('Microsoft SunHi Online (Natural)'), voice('Microsoft InJoon Online (Natural)', 'ko-KR', false)];
  assert.equal(choosePreferredVoice(voices, voices[0].voiceURI).voiceURI, voices[0].voiceURI);
  assert.equal(choosePreferredVoice(voices).voiceURI, voices[1].voiceURI);
  assert.equal(choosePreferredVoice([voice('기기 한국어 음성')]).voiceURI, '기기 한국어 음성');
  assert.equal(getReaderPitch('natural'), 1);
  assert.equal(getReaderPitch('male-low'), 0.78);
});

test('native voices keep non-enumerable browser properties and their original object', () => {
  const { prepareKoreanVoices } = loadTS('lib/manuscript-reader.ts');
  const native = {};
  Object.defineProperties(native, {
    name: { value: 'Microsoft InJoon Online (Natural)' },
    voiceURI: { value: 'Microsoft InJoon Online (Natural)' },
    lang: { value: 'ko-KR' },
    localService: { value: false },
  });
  const [prepared] = prepareKoreanVoices([native]);
  assert.equal(prepared.name, 'Microsoft InJoon Online (Natural)');
  assert.equal(prepared.voiceURI, 'Microsoft InJoon Online (Natural)');
  assert.equal(prepared.gender, 'male');
  assert.equal(prepared.raw, native);
});

test('writing workspace exposes a complete manuscript reader without storing audio', () => {
  const component = fs.readFileSync(path.join(root, 'components/manuscript-reader.tsx'), 'utf8');
  const studio = fs.readFileSync(path.join(root, 'app/studio.tsx'), 'utf8');
  for (const label of ['읽어주기', '선택한 위치부터 듣기', '일시정지', '정지', '이전', '다음', '음성 새로고침', '한국어 남성', '낮은 음높이']) {
    assert.match(component, new RegExp(label));
  }
  const engine = fs.readFileSync(path.join(root, 'hooks/use-manuscript-reader.ts'), 'utf8');
  assert.match(engine, /speechSynthesis/);
  assert.match(engine, /localStorage/);
  assert.doesNotMatch(engine, /fetch\s*\(/);
  assert.doesNotMatch(component, /fetch\s*\(/);
  assert.match(studio, /useManuscriptReader\(\{ text: activeManuscript,[^\n]*textareaRef: manuscriptRef/);
  assert.match(studio, /<ManuscriptReader reader=\{reader\}/);
  assert.doesNotMatch(component, /useEffect|speechSynthesis\.cancel/);
});

test('the sticky header opens the manuscript reader in an accessible popup instead of inline', () => {
  const studio = fs.readFileSync(path.join(root, 'app/studio.tsx'), 'utf8');
  const styles = fs.readFileSync(path.join(root, 'app/globals.css'), 'utf8');
  const header = studio.slice(studio.indexOf('<header className="studio-header">'), studio.indexOf('</header>'));
  const writingArea = studio.slice(studio.indexOf('<Textarea ref={manuscriptRef}'), studio.indexOf('<div className="manuscript-footer">'));

  assert.match(header, /onClick=\{\(\) => setReaderOpen\(true\)\}[\s\S]*원고 듣기/);
  assert.match(studio, /<Dialog open=\{readerOpen\} onOpenChange=\{setReaderOpen\}>[\s\S]*<DialogContent className="reader-dialog[^"]*"[\s\S]*<ManuscriptReader/);
  assert.doesNotMatch(writingArea, /<ManuscriptReader/);
  assert.match(styles, /\.studio-header\s*\{[\s\S]*position:\s*sticky/);
  assert.match(styles, /\.reader-dialog\s*\{[\s\S]*max-height:\s*90dvh[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.reader-button\s*\{[\s\S]*grid-column:\s*1\s*\/\s*-1/);
});

test('Heami is identified as female rather than an unspecified or male voice', () => {
  const { inferVoiceGender } = loadTS('lib/manuscript-reader.ts');
  assert.equal(inferVoiceGender(voice('Microsoft Heami - Korean (Korean)')), 'female');
});

test('reading from a selected start includes all subsequent sentences with original offsets', () => {
  const { readingChunksFrom } = loadTS('lib/manuscript-reader.ts');
  const text = '건너뛸 첫 문장. 선택한 두 번째 문장. 선택 밖의 세 번째 문장. 마지막 문장.';
  const start = text.indexOf('선택한');
  const result = readingChunksFrom(text, start);
  assert.equal(result[0].start, start);
  assert.equal(result.at(-1).end, text.length);
  assert.equal(result.at(-1).text, '마지막 문장.');
  for (const chunk of result) assert.equal(text.slice(chunk.start, chunk.end), chunk.text);
  assert.ok(result.every(chunk => chunk.start >= start));
});

test('bookmarks restore an offset per work and episode without storing manuscript text', () => {
  const { bookmarkKey, makeReaderBookmark, restoreReaderBookmark } = loadTS('lib/manuscript-reader.ts');
  const text = '처음 문장. 중간 문장. 마지막 문장.';
  const storage = new Map();
  storage.set(bookmarkKey('work1:1'), JSON.stringify(makeReaderBookmark(text, 7)));
  storage.set(bookmarkKey('work1:2'), JSON.stringify(makeReaderBookmark(text, 14)));
  assert.notEqual(bookmarkKey('work1:1'), bookmarkKey('work2:1'));
  assert.equal(restoreReaderBookmark(text, JSON.parse(storage.get(bookmarkKey('work1:1')))).offset, 7);
  assert.equal(restoreReaderBookmark(text, JSON.parse(storage.get(bookmarkKey('work1:2')))).offset, 14);
  assert.ok(!storage.get(bookmarkKey('work1:1')).includes('처음 문장'));
});

test('changed manuscripts and corrupted or out of range bookmarks cannot restore stale positions', () => {
  const { makeReaderBookmark, restoreReaderBookmark } = loadTS('lib/manuscript-reader.ts');
  const text = '첫 문장. 다음 문장.';
  const bookmark = makeReaderBookmark(text, 6);
  assert.equal(restoreReaderBookmark('새' + text.slice(1), bookmark), undefined);
  for (const value of [null, {}, {...bookmark, offset: -1}, {...bookmark, offset: 10000}, {...bookmark, offset: NaN}, {...bookmark, version: 2}, {...bookmark, completed: 'yes'}]) {
    assert.equal(restoreReaderBookmark(text, value), undefined);
  }
  const completed = makeReaderBookmark(text, text.length, true);
  assert.equal(restoreReaderBookmark(text, completed).completed, true);
});

test('cursor offsets never split surrogate pairs or read beyond the manuscript', () => {
  const { safeReadingOffset, readingChunksFrom } = loadTS('lib/manuscript-reader.ts');
  const text = '앞😀뒤. 끝.';
  assert.equal(safeReadingOffset(text, 2), 1);
  assert.equal(readingChunksFrom(text, 2)[0].text, '😀뒤.');
  assert.deepEqual(readingChunksFrom(text, text.length), []);
  assert.equal(safeReadingOffset(text, Infinity), 0);
});


// Exercise the real reader hook with deterministic browser events; no device audio is played.
function readerHarness(t, initialText = '첫 문장입니다. 두 번째 문장입니다.') {
  const previous = { window: global.window, document: global.document, utterance: global.SpeechSynthesisUtterance };
  const slots = [], effects = [], timers = new Map(), storage = new Map(), spoken = [];
  let cursor = 0, dirty = false, timerId = 0, cancels = 0;
  const changed = (a, b) => !a || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], value => { const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; dirty = true; } }];
    },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useMemo(make, deps) { const i = cursor++; if (!slots[i] || changed(slots[i].deps, deps)) slots[i] = { deps, value: make() }; return slots[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(effect, deps) {
      const i = cursor++;
      if (!slots[i] || changed(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    },
  };
  class Utterance { constructor(text) { this.text = text; } }
  const synthesis = { cancel() { cancels++; }, resume() {}, speak(u) { spoken.push(u); },
    pause() { throw new Error('Native Android pause/resume cannot be relied on'); },
    getVoices: () => [voice('Microsoft Heami')], addEventListener() {}, removeEventListener() {} };
  global.document = { visibilityState: 'visible' };
  global.window = { speechSynthesis: synthesis, SpeechSynthesisUtterance: Utterance,
    setTimeout(fn, delay) { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout(id) { timers.delete(id); },
    addEventListener() {}, removeEventListener() {},
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) } };
  global.SpeechSynthesisUtterance = Utterance;
  const { useManuscriptReader } = loadTS('hooks/use-manuscript-reader.ts', id => id === 'react' ? react : id === '@/lib/manuscript-reader' ? loadTS('lib/manuscript-reader.ts') : require(id));
  let props = { text: initialText, documentKey: 'work:1', textareaRef: { current: { selectionStart: 0 } } }, result;
  const render = (update = {}) => {
    props = { ...props, ...update };
    for (let n = 0; n < 20; n++) {
      cursor = 0; dirty = false; result = useManuscriptReader(props);
      while (effects.length) effects.shift()();
      for (const [id, timer] of timers) if (timer.delay === 0) { timers.delete(id); timer.fn(); }
      if (!dirty) return result;
    }
    throw new Error('Reader render did not settle');
  };
  const unmount = () => { for (const slot of slots) slot?.cleanup?.(); };
  t.after(() => { unmount(); global.window = previous.window; global.document = previous.document; global.SpeechSynthesisUtterance = previous.utterance; });
  render();
  return { render, spoken, storage, unmount, get cancels() { return cancels; } };
}

test('a popup or tab rerender preserves the active reader; changing episodes cancels it', t => {
  const h = readerHarness(t);
  h.render().playAll();
  const u = h.spoken.at(-1); u.onstart();
  assert.equal(h.render().phase, 'speaking');
  const before = h.cancels;
  assert.equal(h.render({ popupOpen: false, activeTab: 'characters' }).phase, 'speaking');
  assert.equal(h.cancels, before);
  h.render({ documentKey: 'work:2' });
  assert.ok(h.cancels > before);
  u.onend(); // A late callback from the previous episode cannot start another utterance.
  assert.equal(h.spoken.length, 1);
  assert.equal(h.render().phase, 'ready');
});

test('pause and resume restart from the last word without depending on native resume', t => {
  const h = readerHarness(t);
  h.render().playAll();
  const u = h.spoken.at(-1); u.onstart(); u.onboundary({ charIndex: 2 });
  h.render().pause();
  assert.equal(h.render().phase, 'paused');
  h.render().playAll();
  assert.equal(h.spoken.at(-1).text, u.text.slice(2));
  const before = h.spoken.length; u.onend();
  assert.equal(h.spoken.length, before);
});

test('background interruption preserves position and reports the browser limitation', t => {
  const h = readerHarness(t);
  h.render().playAll();
  const u = h.spoken.at(-1); u.onstart(); u.onboundary({ charIndex: 2 });
  global.document.visibilityState = 'hidden'; u.onerror({ error: 'interrupted' });
  const reader = h.render();
  assert.equal(reader.phase, 'paused');
  assert.equal(reader.position, 2);
  assert.match(reader.status, /브라우저가 백그라운드 음성을 중단/);
  assert.equal(JSON.parse([...h.storage.values()][0]).offset, 2);
});

test('leaving the app releases its active speech and ignores late events', t => {
  const h = readerHarness(t);
  h.render().playAll(); const u = h.spoken.at(-1); u.onstart();
  const before = h.cancels; h.unmount();
  assert.ok(h.cancels > before);
  u.onend(); assert.equal(h.spoken.length, 1);
});
