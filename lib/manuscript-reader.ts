export type ManuscriptChunk = { text: string; start: number; end: number };
export type VoiceGender = "male" | "female" | "unknown";
export type VoiceLike = { name: string; voiceURI: string; lang: string; localService: boolean };
export type PreparedVoice<T extends VoiceLike = VoiceLike> = VoiceLike & { gender: VoiceGender; raw: T };

const MALE_VOICE = /(?:\bin[ -]?joon\b|\bhyun[- ]?su\b|\bmin[- ]?su\b|\bmale\b|남성)/iu;
const FEMALE_VOICE = /(?:\bsun[- ]?hi\b|\byuna\b|\bsora\b|\bheami\b|\bfemale\b|여성)/iu;

export function splitManuscript(text: string, maxLength = 180): ManuscriptChunk[] {
  if (!Number.isInteger(maxLength) || maxLength < 20) throw new RangeError("maxLength must be an integer >= 20");
  const chunks: ManuscriptChunk[] = [];
  const closeQuote = /[”’"'」』)\]]/u;
  const punctuation = /[.!?。！？…]/u;
  let start = 0;
  while (start < text.length) {
    while (start < text.length && /\s/u.test(text[start])) start++;
    if (start >= text.length) break;
    const limit = Math.min(start + maxLength, text.length);
    let cut = 0;
    for (let index = start; index < limit; index++) {
      if (text[index] === "\n" || text[index] === "\r") { cut = index; break; }
      if (punctuation.test(text[index])) {
        let end = index + 1;
        while (end < limit && (punctuation.test(text[end]) || closeQuote.test(text[end]))) end++;
        if (end === text.length || /\s/u.test(text[end])) { cut = end; break; }
      }
    }
    if (!cut) {
      cut = limit;
      if (limit < text.length) {
        for (let index = limit - 1; index >= start + Math.floor(maxLength / 2); index--) {
          if (/\s/u.test(text[index])) { cut = index; break; }
        }
        const previous = text.charCodeAt(cut - 1);
        const next = text.charCodeAt(cut);
        if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) cut--;
      }
    }
    let end = cut;
    while (end > start && /\s/u.test(text[end - 1])) end--;
    if (end > start) chunks.push({ text: text.slice(start, end), start, end });
    start = Math.max(cut, start + 1);
  }
  return chunks;
}

export function inferVoiceGender(voice: Pick<VoiceLike, "name" | "voiceURI">): VoiceGender {
  const label = voice.name + " " + voice.voiceURI;
  if (MALE_VOICE.test(label)) return "male";
  if (FEMALE_VOICE.test(label)) return "female";
  return "unknown";
}

export function prepareKoreanVoices<T extends VoiceLike>(voices: readonly T[]): PreparedVoice<T>[] {
  return voices
    .filter(voice => /^ko(?:[-_]|$)/i.test(voice.lang))
    .map(voice => ({ name: voice.name, voiceURI: voice.voiceURI, lang: voice.lang, localService: voice.localService, gender: inferVoiceGender(voice), raw: voice }))
    .sort((left, right) => {
      const genderRank = { male: 0, female: 1, unknown: 2 } as const;
      return genderRank[left.gender] - genderRank[right.gender]
        || Number(right.localService) - Number(left.localService)
        || left.name.localeCompare(right.name, "ko");
    });
}

export type ReaderTone = "natural" | "male-low";

export function getReaderPitch(tone: ReaderTone): number {
  return tone === "male-low" ? 0.78 : 1;
}

export function choosePreferredVoice<T extends VoiceLike>(voices: readonly T[], savedURI = ""): T | undefined {
  return voices.find(voice => voice.voiceURI === savedURI)
    ?? voices.find(voice => inferVoiceGender(voice) === "male")
    ?? voices.find(voice => voice.localService)
    ?? voices[0];
}


export type ReaderBookmark = { version: 1; fingerprint: string; offset: number; completed: boolean; updatedAt: number };

export function manuscriptFingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return text.length + ":" + (hash >>> 0).toString(16);
}

export function safeReadingOffset(text: string, requested: number): number {
  let offset = Math.max(0, Math.min(text.length, Number.isFinite(requested) ? Math.floor(requested) : 0));
  if (offset > 0 && offset < text.length && /[\uDC00-\uDFFF]/.test(text[offset]) && /[\uD800-\uDBFF]/.test(text[offset - 1])) offset--;
  return offset;
}

export function bookmarkKey(documentKey: string): string {
  return "storywell.reader.position.v1:" + encodeURIComponent(documentKey);
}

export function makeReaderBookmark(text: string, offset: number, completed = false): ReaderBookmark {
  return { version: 1, fingerprint: manuscriptFingerprint(text), offset: safeReadingOffset(text, offset), completed, updatedAt: Date.now() };
}

export function restoreReaderBookmark(text: string, value: unknown): ReaderBookmark | undefined {
  if (!value || typeof value !== "object") return;
  const bookmark = value as Partial<ReaderBookmark>;
  if (bookmark.version !== 1 || bookmark.fingerprint !== manuscriptFingerprint(text) || typeof bookmark.offset !== "number" || !Number.isFinite(bookmark.offset) || bookmark.offset < 0 || bookmark.offset > text.length || typeof bookmark.completed !== "boolean") return;
  return makeReaderBookmark(text, bookmark.offset, bookmark.completed && bookmark.offset === text.length);
}

export function readingChunksFrom(text: string, offset: number, maxLength = 180): ManuscriptChunk[] {
  const start = safeReadingOffset(text, offset);
  return splitManuscript(text.slice(start), maxLength).map(chunk => ({ ...chunk, start: chunk.start + start, end: chunk.end + start }));
}
