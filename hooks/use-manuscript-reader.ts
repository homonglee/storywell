"use client";

import { RefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bookmarkKey, makeReaderBookmark, restoreReaderBookmark, readingChunksFrom, choosePreferredVoice, getReaderPitch, prepareKoreanVoices, splitManuscript, type ManuscriptChunk, type PreparedVoice, type ReaderTone } from "@/lib/manuscript-reader";

type ReaderPhase = "ready" | "starting" | "speaking" | "paused" | "ended" | "error" | "unsupported";
type Props = { text: string; documentKey: string; textareaRef: RefObject<HTMLTextAreaElement | null> };
const STORAGE_KEY = "storywell.reader.preferences.v1";
export const readerRates = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function useManuscriptReader({ text, documentKey, textareaRef }: Props) {
  const [supported, setSupported] = useState(true);
  const [voices, setVoices] = useState<PreparedVoice<SpeechSynthesisVoice>[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [rate, setRate] = useState(1);
  const [tone, setTone] = useState<ReaderTone>("natural");
  const [phase, setPhase] = useState<ReaderPhase>("ready");
  const [chunks, setChunks] = useState<ManuscriptChunk[]>(() => splitManuscript(text));
  const [index, setIndex] = useState(0);
  const [scope, setScope] = useState("회차 전체");
  const [message, setMessage] = useState("");
  const [position, setPosition] = useState(0);
  const positionRef = useRef(0);
  const completedRef = useRef(false);
  const fullChunks = useMemo(() => splitManuscript(text), [text]);
  const generation = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const startTimer = useRef<number | null>(null);
  const chunksRef = useRef(chunks);
  const indexRef = useRef(index);
  const startSpeechRef = useRef<(nextIndex: number, list?: ManuscriptChunk[]) => void>(() => undefined);

  const savePosition = useCallback((offset: number, completed = false) => {
    const bookmark = makeReaderBookmark(text, offset, completed);
    positionRef.current = bookmark.offset; completedRef.current = bookmark.completed;
    setPosition(bookmark.offset);
    try { window.localStorage.setItem(bookmarkKey(documentKey), JSON.stringify(bookmark)); } catch { /* Listening also works without browser storage. */ }
  }, [text, documentKey]);

  const clearStartTimer = useCallback(() => {
    if (startTimer.current !== null) window.clearTimeout(startTimer.current);
    startTimer.current = null;
  }, []);
  const cancelOwned = useCallback(() => {
    generation.current++;
    clearStartTimer();
    if (utterance.current && "speechSynthesis" in window) window.speechSynthesis.cancel();
    utterance.current = null;
  }, [clearStartTimer]);
  const savePreference = (nextRate: number, nextVoice: string, nextTone: ReaderTone) => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ rate: nextRate, voiceURI: nextVoice, tone: nextTone })); }
    catch { /* Preferences are optional; manuscripts are never stored here. */ }
  };
  const refreshVoices = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    const next = prepareKoreanVoices(window.speechSynthesis.getVoices());
    setVoices(next);
    setVoiceURI(previous => {
      let saved = previous;
      if (!saved) {
        try { saved = String(JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}").voiceURI || ""); }
        catch { saved = ""; }
      }
      return choosePreferredVoice(next, saved)?.voiceURI ?? "";
    });
  }, []);

  useEffect(() => {
    const available = "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance === "function";
    const initialize = window.setTimeout(() => {
      setSupported(available);
      if (!available) { setPhase("unsupported"); return; }
      try {
        const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
        if (readerRates.includes(saved.rate)) setRate(saved.rate);
        if (saved.tone === "male-low") setTone("male-low");
      } catch { /* Preferences are optional. */ }
      refreshVoices();
    }, 0);
    if (!available) return () => window.clearTimeout(initialize);
    window.speechSynthesis.addEventListener("voiceschanged", refreshVoices);
    const retry = window.setTimeout(refreshVoices, 1200);
    return () => {
      window.clearTimeout(initialize);
      window.clearTimeout(retry);
      window.speechSynthesis.removeEventListener("voiceschanged", refreshVoices);
      cancelOwned();
    };
  }, [cancelOwned, refreshVoices]);

  useEffect(() => {
    cancelOwned();
    let restored;
    try { restored = restoreReaderBookmark(text, JSON.parse(window.localStorage.getItem(bookmarkKey(documentKey)) || "null")); } catch { /* Optional position history. */ }
    const offset = restored?.offset ?? 0;
    const completed = Boolean(restored?.completed);
    positionRef.current = offset; completedRef.current = completed;
    const next = readingChunksFrom(text, completed ? 0 : offset);
    chunksRef.current = next; indexRef.current = 0;
    const reset = window.setTimeout(() => {
      setPosition(offset); setChunks(next); setIndex(0);
      setScope(offset > 0 ? "마지막 들은 위치부터" : "회차 전체"); setMessage("");
      setPhase(completed ? "ended" : "ready");
    }, 0);
    const persist = () => {
      try { window.localStorage.setItem(bookmarkKey(documentKey), JSON.stringify(makeReaderBookmark(text, positionRef.current, completedRef.current))); } catch { /* Optional history. */ }
    };
    window.addEventListener("pagehide", persist);
    return () => { window.clearTimeout(reset); window.removeEventListener("pagehide", persist); persist(); cancelOwned(); };
  }, [text, documentKey, cancelOwned]);

  const startSpeech = useCallback((nextIndex: number, list = chunksRef.current) => {
    if (!supported || !list.length) return;
    const selected = voices.find(voice => voice.voiceURI === voiceURI);
    if (!selected) { setPhase("error"); setMessage("한국어 음성을 찾지 못했습니다. 기기에 한국어 음성을 설치한 뒤 새로고침하세요."); return; }
    const chunk = list[nextIndex];
    if (!chunk) { setPhase("ended"); setMessage("낭독을 마쳤습니다."); return; }
    cancelOwned();
    chunksRef.current = list; indexRef.current = nextIndex;
    setChunks(list); setIndex(nextIndex); savePosition(chunk.start); setMessage(""); setPhase("starting");
    const token = ++generation.current;
    const nextUtterance = new SpeechSynthesisUtterance(chunk.text);
    utterance.current = nextUtterance;
    nextUtterance.lang = selected.lang || "ko-KR";
    nextUtterance.voice = selected.raw;
    nextUtterance.rate = rate;
    nextUtterance.pitch = getReaderPitch(tone);
    nextUtterance.volume = 1;
    nextUtterance.onstart = () => {
      if (token !== generation.current) return;
      clearStartTimer(); setPhase("speaking");
    };
    nextUtterance.onboundary = event => {
      if (token === generation.current && event.charIndex >= 0 && event.charIndex < chunk.text.length) savePosition(chunk.start + event.charIndex);
    };
    nextUtterance.onend = () => {
      if (token !== generation.current) return;
      clearStartTimer(); utterance.current = null;
      if (nextIndex >= list.length - 1) { savePosition(text.length, true); setPhase("ended"); setMessage("낭독을 마쳤습니다."); return; }
      startSpeechRef.current(nextIndex + 1, list);
    };
    nextUtterance.onerror = event => {
      if (token !== generation.current) return;
      clearStartTimer(); utterance.current = null;
      if (document.visibilityState === "hidden") {
        setPhase("paused");
        setMessage("브라우저가 백그라운드 음성을 중단했습니다. 돌아온 뒤 이어 듣기를 눌러 주세요.");
        return;
      }
      setPhase("error");
      setMessage(event.error === "network" ? "온라인 음성 연결에 실패했습니다. 기기 음성으로 바꾸거나 인터넷 연결을 확인하세요." : "음성 재생이 중단되었습니다. 다른 한국어 음성을 선택해 다시 재생하세요.");
    };
    startTimer.current = window.setTimeout(() => {
      if (token === generation.current) { cancelOwned(); setPhase("error"); setMessage("음성 재생이 시작되지 않았습니다. 브라우저의 재생 허용 상태를 확인하세요."); }
    }, 10000);
    try { window.speechSynthesis.resume(); window.speechSynthesis.speak(nextUtterance); }
    catch { cancelOwned(); setPhase("error"); setMessage("이 환경에서 음성 엔진을 시작하지 못했습니다."); }
  }, [cancelOwned, clearStartTimer, rate, supported, tone, voiceURI, voices, savePosition, text]);

  useEffect(() => {
    startSpeechRef.current = startSpeech;
  }, [startSpeech]);

  const playAll = () => {
    if (!text.trim()) { setMessage("먼저 이 회차의 원고를 작성하세요."); return; }
    const start = phase === "ended" ? 0 : positionRef.current;
    setScope(start > 0 ? "마지막 들은 위치부터" : "회차 전체");
    startSpeechRef.current(0, readingChunksFrom(text, start));
  };
  const playSelection = () => {
    const field = textareaRef.current;
    const start = field?.selectionStart ?? 0;
    if (!text.slice(start).trim()) { setMessage("원고 입력창에서 읽기를 시작할 위치를 선택하세요."); return; }
    const next = readingChunksFrom(text, start);
    setScope("선택한 위치부터 끝까지"); startSpeechRef.current(0, next);
  };
  const pause = () => {
    if (!utterance.current || !["starting", "speaking"].includes(phase)) return;
    cancelOwned(); savePosition(positionRef.current); setPhase("paused"); setMessage("");
  };
  const stop = () => {
    cancelOwned();
    savePosition(positionRef.current, completedRef.current);
    setPhase(!supported ? "unsupported" : completedRef.current ? "ended" : "ready"); setMessage("위치를 기억했습니다. 이어 듣기로 계속 들을 수 있습니다.");
  };
  const foundIndex = fullChunks.findIndex(chunk => position < chunk.end);
  const fullIndex = foundIndex < 0 ? Math.max(0, fullChunks.length - 1) : foundIndex;
  const move = (delta: number) => {
    if (!fullChunks.length) return;
    const wasPlaying = ["starting", "speaking"].includes(phase);
    const target = fullChunks[Math.max(0, Math.min(fullChunks.length - 1, fullIndex + delta))].start;
    const next = readingChunksFrom(text, target);
    cancelOwned(); chunksRef.current = next; indexRef.current = 0;
    setChunks(next); setIndex(0); savePosition(target); setScope("이동한 위치부터"); setPhase("ready");
    if (wasPlaying) startSpeechRef.current(0, next);
  };

  const current = chunks[index]?.text || "원고를 작성하면 현재 낭독 구간이 여기에 표시됩니다.";
  const progress = phase === "ended" ? 100 : text.length ? Math.floor(position / text.length * 100) : 0;
  const activeVoice = voices.find(voice => voice.voiceURI === voiceURI);
  const hasMale = voices.some(voice => voice.gender === "male");
  const available = supported && Boolean(text.trim()) && voices.length > 0;
  const playing = phase === "starting" || phase === "speaking";
  const status = message || (!supported ? "이 브라우저는 음성 낭독을 지원하지 않습니다." : !voices.length ? "한국어 음성이 없습니다. 기기 음성을 설치한 뒤 새로고침하세요." : phase === "speaking" ? "낭독 중" : phase === "paused" ? "일시정지됨 · 이어 듣기를 누르세요." : phase === "starting" ? "음성 재생을 시작합니다…" : phase === "ended" ? "낭독을 마쳤습니다." : "재생 버튼을 누르면 읽기 시작합니다.");

  const playFromStart = () => { setScope("회차 전체"); startSpeechRef.current(0, readingChunksFrom(text, 0)); };
  const changeVoice = (next: string) => { setVoiceURI(next); savePreference(rate, next, tone); };
  const changeRate = (next: number) => { setRate(next); savePreference(next, voiceURI, tone); };
  const changeTone = (next: ReaderTone) => { setTone(next); savePreference(rate, voiceURI, next); };
  return { supported, voices, voiceURI, rate, tone, phase, position, scope, current, progress, activeVoice, hasMale, available, playing, status, fullIndex, totalChunks: fullChunks.length, hasText: Boolean(text.trim()), playAll, playSelection, pause, stop, move, refreshVoices, playFromStart, changeVoice, changeRate, changeTone };
}

export type ManuscriptReaderState = ReturnType<typeof useManuscriptReader>;
