/* eslint-disable @typescript-eslint/no-require-imports, @next/next/no-assign-module-variable */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = process.cwd();
const requireProject = createRequire(path.join(root, 'package.json'));
const ts = requireProject('typescript');

function loadTS(relative) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
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
  assert.match(component, /speechSynthesis/);
  assert.match(component, /localStorage/);
  assert.doesNotMatch(component, /fetch\s*\(/);
  assert.match(studio, /<ManuscriptReader[\s\S]*text=\{activeManuscript\}/);
  assert.match(studio, /textareaRef=\{manuscriptRef\}/);
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
