"use client";

import { Pause, Play, RefreshCw, SkipBack, SkipForward, Square, Volume2 } from "lucide-react";
import { type PreparedVoice, type ReaderTone } from "@/lib/manuscript-reader";
import { readerRates, type ManuscriptReaderState } from "@/hooks/use-manuscript-reader";

function voiceLabel(voice: PreparedVoice<SpeechSynthesisVoice>) {
  const gender = voice.gender === "male" ? "남성" : voice.gender === "female" ? "여성" : "성별 미표시";
  return `${voice.name} · ${gender} · ${voice.localService ? "기기" : "온라인"}`;
}

export function ManuscriptReader({ reader }: { reader: ManuscriptReaderState }) {
  const { supported, voices, voiceURI, rate, tone, phase, position, scope, current, progress, activeVoice, hasMale, available, playing, status, fullIndex, totalChunks, hasText, playAll, playSelection, pause, stop, move, refreshVoices, playFromStart, changeVoice, changeRate, changeTone } = reader;
  return <section className="manuscript-reader" aria-label="원고 음성 낭독">
    <div className="reader-heading"><div><Volume2 /><span><strong>원고 듣기</strong><small>눈으로 놓친 문장의 호흡을 귀로 확인하세요.</small></span></div><span className="reader-badge">브라우저 음성</span></div>
    <div className="reader-actions">
      <button type="button" className="reader-primary" disabled={!available || playing} onClick={playAll}><Play />{phase === "ended" ? "처음부터 다시 듣기" : phase === "paused" || position > 0 ? "이어 듣기" : "읽어주기"}</button>
      <button type="button" disabled={!available} onClick={playSelection}>선택한 위치부터 듣기</button>
      <button type="button" disabled={!playing} onClick={pause}><Pause />일시정지</button>
      <button type="button" disabled={!hasText || !supported} onClick={stop}><Square />정지</button>
      <button type="button" disabled={!available} onClick={playFromStart}>처음부터 듣기</button>
    </div>
    <div className="reader-settings">
      <label><span>한국어 목소리</span><select aria-label="한국어 목소리" value={voiceURI} disabled={!voices.length} onChange={event => changeVoice(event.target.value)}><option value="">한국어 음성 없음</option>{voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voiceLabel(voice)}</option>)}</select></label>
      <label><span>읽기 속도</span><select aria-label="읽기 속도" value={rate} disabled={!supported} onChange={event => changeRate(Number(event.target.value))}>{readerRates.map(value => <option key={value} value={value}>{value}배속</option>)}</select></label>
      <label><span>음성 톤</span><select aria-label="음성 톤" value={tone} disabled={!supported} onChange={event => changeTone(event.target.value as ReaderTone)}><option value="natural">원음</option><option value="male-low">낮은 음높이</option></select></label>
      <button type="button" onClick={refreshVoices} disabled={!supported}><RefreshCw />음성 새로고침</button>
    </div>
    <div className="reader-position"><button type="button" aria-label="이전 낭독 구간" disabled={!available || fullIndex <= 0} onClick={() => move(-1)}><SkipBack />이전</button><span>{totalChunks ? fullIndex + 1 : 0} / {totalChunks} 구간 · {progress}%</span><button type="button" aria-label="다음 낭독 구간" disabled={!available || fullIndex >= totalChunks - 1} onClick={() => move(1)}>다음<SkipForward /></button></div>
    <progress max="100" value={progress} aria-label="원고 낭독 진행률" />
    <div className="reader-current"><span>{scope}</span><p>{current}</p></div>
    <p className="reader-status" role="status" aria-live="polite">{status}</p>
    <p className={activeVoice && !activeVoice.localService ? "reader-privacy online" : "reader-privacy"}>{activeVoice && !activeVoice.localService ? "온라인 음성은 브라우저·운영체제의 음성 제공업체로 원고를 전송할 수 있습니다. 민감한 원고는 ‘기기’ 음성을 선택하세요." : "듣기 기능은 원고나 음원을 별도로 업로드하지 않습니다."}</p>
    <p className="reader-note">팝업을 닫거나 StoryWell의 다른 탭을 보면서 계속 들을 수 있습니다. 작품·회차나 원고를 바꾸면 낭독을 멈춥니다. 휴대폰의 앱 전환·화면 잠금 중에는 브라우저가 음성을 중단할 수 있습니다.</p>
    <p className="reader-note">마지막 들은 위치는 이 브라우저에서 작품·회차별로 기억합니다. 원고 내용이 바뀌면 위치를 다시 선택해 주세요.</p>
    <p className="reader-note">{hasMale ? "설치된 한국어 남성 음성을 우선 표시합니다." : "기기에 한국어 남성 음성이 없습니다. Microsoft Heami는 여성 음성입니다."} 음높이 조절은 목소리의 성별을 바꾸지 않습니다. 목소리·속도·톤 변경은 다음 구간부터 적용됩니다.</p>
  </section>;
}
