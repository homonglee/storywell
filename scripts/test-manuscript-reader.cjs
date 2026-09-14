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
  for (const label of ['읽어주기', '선택한 부분 듣기', '일시정지', '정지', '이전', '다음', '음성 새로고침', '한국어 남성', '남성 저음 톤']) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /speechSynthesis/);
  assert.match(component, /localStorage/);
  assert.doesNotMatch(component, /fetch\s*\(/);
  assert.match(studio, /<ManuscriptReader[\s\S]*text=\{activeManuscript\}/);
  assert.match(studio, /textareaRef=\{manuscriptRef\}/);
});
