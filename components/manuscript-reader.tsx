"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, RefreshCw, SkipBack, SkipForward, Square, Volume2 } from "lucide-react";
import { choosePreferredVoice, getReaderPitch, prepareKoreanVoices, splitManuscript, type ManuscriptChunk, type PreparedVoice, type ReaderTone } from "@/lib/manuscript-reader";

type ReaderPhase = "ready" | "starting" | "speaking" | "paused" | "ended" | "error" | "unsupported";
type Props = { text: string; documentKey: string; textareaRef: RefObject<HTMLTextAreaElement | null> };
const STORAGE_KEY = "storywell.reader.preferences.v1";
const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];

function voiceLabel(voice: PreparedVoice<SpeechSynthesisVoice>) {
  const gender = voice.gender === "male" ? "남성" : voice.gender === "female" ? "여성" : "성별 미표시";
  return `${voice.name} · ${gender} · ${voice.localService ? "기기" : "온라인"}`;
}

export function ManuscriptReader({ text, documentKey, textareaRef }: Props) {
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
  const generation = useRef(0);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const startTimer = useRef<number | null>(null);
  const chunksRef = useRef(chunks);
  const indexRef = useRef(index);
  const startSpeechRef = useRef<(nextIndex: number, list?: ManuscriptChunk[]) => void>(() => undefined);

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
        if (rates.includes(saved.rate)) setRate(saved.rate);
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
    const reset = window.setTimeout(() => {
      cancelOwned();
      const next = splitManuscript(text);
      chunksRef.current = next;
      indexRef.current = 0;
      setChunks(next); setIndex(0); setScope("회차 전체"); setMessage("");
      setPhase(supported ? "ready" : "unsupported");
    }, 0);
    return () => window.clearTimeout(reset);
  }, [text, documentKey, cancelOwned, supported]);

  const startSpeech = useCallback((nextIndex: number, list = chunksRef.current) => {
    if (!supported || !list.length) return;
    const selected = voices.find(voice => voice.voiceURI === voiceURI);
    if (!selected) { setPhase("error"); setMessage("한국어 음성을 찾지 못했습니다. 기기에 한국어 음성을 설치한 뒤 새로고침하세요."); return; }
    const chunk = list[nextIndex];
    if (!chunk) { setPhase("ended"); setMessage("낭독을 마쳤습니다."); return; }
    cancelOwned();
    chunksRef.current = list; indexRef.current = nextIndex;
    setChunks(list); setIndex(nextIndex); setMessage(""); setPhase("starting");
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
    nextUtterance.onend = () => {
      if (token !== generation.current) return;
      clearStartTimer(); utterance.current = null;
      if (nextIndex >= list.length - 1) { setPhase("ended"); setMessage("낭독을 마쳤습니다."); return; }
      startSpeechRef.current(nextIndex + 1, list);
    };
    nextUtterance.onerror = event => {
      if (token !== generation.current) return;
      clearStartTimer(); utterance.current = null; setPhase("error");
      setMessage(event.error === "network" ? "온라인 음성 연결에 실패했습니다. 기기 음성으로 바꾸거나 인터넷 연결을 확인하세요." : "음성 재생이 중단되었습니다. 다른 한국어 음성을 선택해 다시 재생하세요.");
    };
    startTimer.current = window.setTimeout(() => {
      if (token === generation.current) { cancelOwned(); setPhase("error"); setMessage("음성 재생이 시작되지 않았습니다. 브라우저의 재생 허용 상태를 확인하세요."); }
    }, 10000);
    try { window.speechSynthesis.resume(); window.speechSynthesis.speak(nextUtterance); }
    catch { cancelOwned(); setPhase("error"); setMessage("이 환경에서 음성 엔진을 시작하지 못했습니다."); }
  }, [cancelOwned, clearStartTimer, rate, supported, tone, voiceURI, voices]);

  useEffect(() => {
    startSpeechRef.current = startSpeech;
  }, [startSpeech]);

  const playAll = () => {
    if (!text.trim()) { setMessage("먼저 이 회차의 원고를 작성하세요."); return; }
    if (phase === "paused" && utterance.current) { window.speechSynthesis.resume(); setPhase("speaking"); return; }
    const next = phase === "ended" || scope !== "회차 전체" ? splitManuscript(text) : chunksRef.current;
    const nextIndex = phase === "ended" || scope !== "회차 전체" ? 0 : indexRef.current;
    setScope("회차 전체"); startSpeechRef.current(nextIndex, next);
  };
  const playSelection = () => {
    const field = textareaRef.current;
    const start = field?.selectionStart ?? 0;
    const end = field?.selectionEnd ?? 0;
    if (end <= start || !text.slice(start, end).trim()) { setMessage("원고 입력창에서 읽을 문장을 먼저 선택하세요."); return; }
    const next = splitManuscript(text.slice(start, end)).map(chunk => ({ ...chunk, start: chunk.start + start, end: chunk.end + start }));
    setScope("선택한 부분"); startSpeechRef.current(0, next);
  };
  const pause = () => {
    if (!utterance.current || !["starting", "speaking"].includes(phase)) return;
    clearStartTimer(); window.speechSynthesis.pause(); setPhase("paused"); setMessage("");
  };
  const stop = () => {
    cancelOwned();
    const next = splitManuscript(text); chunksRef.current = next; indexRef.current = 0;
    setChunks(next); setIndex(0); setScope("회차 전체"); setPhase(supported ? "ready" : "unsupported"); setMessage("");
  };
  const move = (delta: number) => {
    if (!chunksRef.current.length) return;
    const wasPlaying = ["starting", "speaking"].includes(phase);
    const nextIndex = Math.max(0, Math.min(chunksRef.current.length - 1, indexRef.current + delta));
    cancelOwned(); indexRef.current = nextIndex; setIndex(nextIndex); setPhase("ready");
    if (wasPlaying) startSpeechRef.current(nextIndex, chunksRef.current);
  };

  const current = chunks[index]?.text || "원고를 작성하면 현재 낭독 구간이 여기에 표시됩니다.";
  const progress = phase === "ended" ? 100 : chunks.length ? Math.floor(index / chunks.length * 100) : 0;
  const activeVoice = voices.find(voice => voice.voiceURI === voiceURI);
  const hasMale = voices.some(voice => voice.gender === "male");
  const available = supported && Boolean(text.trim()) && voices.length > 0;
  const playing = phase === "starting" || phase === "speaking";
  const status = message || (!supported ? "이 브라우저는 음성 낭독을 지원하지 않습니다." : !voices.length ? "한국어 음성이 없습니다. 기기 음성을 설치한 뒤 새로고침하세요." : phase === "speaking" ? "낭독 중" : phase === "paused" ? "일시정지됨 · 이어 듣기를 누르세요." : phase === "starting" ? "음성 재생을 시작합니다…" : phase === "ended" ? "낭독을 마쳤습니다." : "재생 버튼을 누르면 읽기 시작합니다.");

  return <section className="manuscript-reader" aria-label="원고 음성 낭독">
    <div className="reader-heading"><div><Volume2 /><span><strong>원고 듣기</strong><small>눈으로 놓친 문장의 호흡을 귀로 확인하세요.</small></span></div><span className="reader-badge">브라우저 음성</span></div>
    <div className="reader-actions">
      <button type="button" className="reader-primary" disabled={!available || playing} onClick={playAll}><Play />{phase === "paused" ? "이어 듣기" : phase === "ended" ? "다시 듣기" : "읽어주기"}</button>
      <button type="button" disabled={!available} onClick={playSelection}>선택한 부분 듣기</button>
      <button type="button" disabled={!playing} onClick={pause}><Pause />일시정지</button>
      <button type="button" disabled={!text.trim() || !supported} onClick={stop}><Square />정지</button>
    </div>
    <div className="reader-settings">
      <label><span>한국어 목소리</span><select aria-label="한국어 목소리" value={voiceURI} disabled={!voices.length} onChange={event => { setVoiceURI(event.target.value); savePreference(rate, event.target.value, tone); }}><option value="">한국어 음성 없음</option>{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voiceLabel(voice)}</option>)}</select></label>
      <label><span>읽기 속도</span><select aria-label="읽기 속도" value={rate} disabled={!supported} onChange={event => { const next = Number(event.target.value); setRate(next); savePreference(next, voiceURI, tone); }}>{rates.map(value => <option key={value} value={value}>{value}배속</option>)}</select></label>
      <label><span>음성 톤</span><select aria-label="음성 톤" value={tone} disabled={!supported} onChange={event => { const next = event.target.value as ReaderTone; setTone(next); savePreference(rate, voiceURI, next); }}><option value="natural">원음</option><option value="male-low">남성 저음 톤</option></select></label>
      <button type="button" onClick={refreshVoices} disabled={!supported}><RefreshCw />음성 새로고침</button>
    </div>
    <div className="reader-position"><button type="button" aria-label="이전 낭독 구간" disabled={!available || index <= 0} onClick={() => move(-1)}><SkipBack />이전</button><span>{chunks.length ? index + 1 : 0} / {chunks.length} 구간 · {progress}%</span><button type="button" aria-label="다음 낭독 구간" disabled={!available || index >= chunks.length - 1} onClick={() => move(1)}>다음<SkipForward /></button></div>
    <progress max="100" value={progress} aria-label="원고 낭독 진행률" />
    <div className="reader-current"><span>{scope}</span><p>{current}</p></div>
    <p className="reader-status" role="status" aria-live="polite">{status}</p>
    <p className={activeVoice && !activeVoice.localService ? "reader-privacy online" : "reader-privacy"}>{activeVoice && !activeVoice.localService ? "온라인 음성은 브라우저·운영체제의 음성 제공업체로 원고를 전송할 수 있습니다. 민감한 원고는 ‘기기’ 음성을 선택하세요." : "원고와 음원은 StoryWell 서버에 저장되거나 업로드되지 않습니다."}</p>
    <p className="reader-note">{hasMale ? "설치된 한국어 남성 음성을 우선 표시합니다." : "설치된 한국어 남성 음성이 없으면 ‘남성 저음 톤’을 선택하거나 Windows 음성 설정에서 한국어 남성 음성(예: Microsoft InJoon)을 설치하세요."} 저음 톤은 선택한 기기·온라인 음성의 음높이를 낮추며, 목소리·속도·톤 변경은 다음 구간부터 적용됩니다.</p>
  </section>;
}
