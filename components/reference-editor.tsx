"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpenText, FileUp, Link2, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { MAX_REFERENCES, MAX_REFERENCE_TEXT, MAX_REFERENCE_FILE_BYTES, REFERENCE_FILE_ACCEPT, type StoryReference } from "@/lib/story-references";

type Props = { value: StoryReference[]; onChange: (value: StoryReference[]) => void; model: string; disabled?: boolean; onImportingChange: (busy: boolean) => void; onPendingChange: (pending: boolean) => void };

export function ReferenceEditor({ value, onChange, model, disabled, onImportingChange, onPendingChange }: Props) {
  const [category, setCategory] = useState<StoryReference["category"]>("material");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [guidance, setGuidance] = useState("");
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const pending = Boolean(title.trim() || text.trim() || guidance.trim() || url.trim());
  useEffect(() => { onPendingChange(pending); }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  const blocked = disabled || importing;
  const full = value.length >= MAX_REFERENCES;
  const update = (id: string, patch: Partial<StoryReference>) => onChange(value.map(ref => ref.id === id ? { ...ref, ...patch } : ref));
  const append = (ref: StoryReference) => {
    onChange([...value, ref]); setTitle(""); setText(""); setGuidance(""); setUrl(""); setError("");
  };
  const addText = () => {
    if (!title.trim() || !text.trim()) { setError("레퍼런스 이름과 참고 본문을 입력해 주세요."); return; }
    append({ id: crypto.randomUUID(), title: title.trim(), category, source: "text", content: text.trim(), guidance: guidance.trim(), enabled: true, createdAt: new Date().toISOString() });
  };
  const importSource = async (file?: File) => {
    if (blocked || full || controller.current) return;
    if (file && file.size > MAX_REFERENCE_FILE_BYTES) { setError("파일은 4MB 이하로 선택해 주세요."); return; }
    if (!file && !url.trim()) { setError("불러올 사이트 주소를 입력해 주세요."); return; }
    const abort = new AbortController(); controller.current = abort;
    setImporting(true); onImportingChange(true); setError("");
    try {
      const body = new FormData(); body.set("category", category); body.set("title", title.trim()); body.set("guidance", guidance.trim()); body.set("model", model);
      if (file) body.set("file", file); else body.set("url", url.trim());
      const response = await fetch("/api/references/import", { method: "POST", body, signal: abort.signal });
      const data = await response.json() as { reference?: StoryReference; error?: string };
      if (!response.ok || !data.reference) throw new Error(data.error ?? "자료를 불러오지 못했습니다.");
      append(data.reference);
    } catch (problem) {
      if (!abort.signal.aborted) setError(problem instanceof Error ? problem.message : "자료를 불러오지 못했습니다. 본문을 직접 붙여넣을 수도 있습니다.");
    } finally {
      if (!abort.signal.aborted) { setImporting(false); onImportingChange(false); }
      controller.current = null;
      if (fileInput.current) fileInput.current.value = "";
    }
  };
  return <section className="reference-editor" aria-label="작품 레퍼런스">
    <div className="reference-heading"><strong><BookOpenText />레퍼런스</strong><span>{value.length} / {MAX_REFERENCES}</span></div>
    <p className="reference-help">사이트·커뮤니티·밈은 소재로, 예시 문장은 문체로 참고합니다. 체크한 자료를 설계·집필·다듬기에 함께 사용합니다.</p>
    <div className="reference-list">
      {value.map(ref => <details className="reference-card" key={ref.id}>
        <summary><span>{ref.category === "style" ? "문체·문장" : "소재·배경"}</span><strong>{ref.title}</strong><small>{ref.enabled ? "참고 중" : "제외됨"}</small></summary>
        <div className="reference-card-body">
          <label className="reference-enabled"><Checkbox checked={ref.enabled} disabled={blocked} onCheckedChange={checked => update(ref.id, { enabled: checked === true })} />AI 작업에 참고하기</label>
          <label><span>레퍼런스 이름</span><Input value={ref.title} maxLength={120} disabled={blocked} onChange={event => update(ref.id, { title: event.target.value })} /></label>
          <label><span>참고 본문 / 분석 내용</span><Textarea value={ref.content} maxLength={MAX_REFERENCE_TEXT} disabled={blocked} onChange={event => update(ref.id, { content: event.target.value })} /></label>
          <label><span>반영할 특징</span><Textarea value={ref.guidance} maxLength={1000} disabled={blocked} onChange={event => update(ref.id, { guidance: event.target.value })} placeholder="짧고 단호한 문장, 내면 독백 중심, 빠른 반전 등" /></label>
          <div className="reference-card-footer"><span>{ref.content.length.toLocaleString()}자{ref.file ? " · " + ref.file.name : ""}</span>
            {ref.url ? <a href={ref.url} target="_blank" rel="noopener noreferrer">출처 보기</a> : null}
            {ref.file ? <a href={"/api/references/files/" + ref.file.id}>원본 받기</a> : null}
            <Button type="button" size="sm" variant="ghost" disabled={blocked} onClick={() => onChange(value.filter(item => item.id !== ref.id))} aria-label={ref.title + " 레퍼런스 목록에서 빼기"}><Trash2 />목록에서 빼기</Button>
          </div>
        </div>
      </details>)}
    </div>
    {full ? <p className="reference-help">12개가 등록되어 있습니다. 필요 없는 자료를 목록에서 뺀 뒤 추가하세요.</p> : <div className="reference-compose">
      <div className="reference-compose-row">
        <label><span>참고 목적</span><NativeSelect value={category} disabled={blocked} onChange={event => setCategory(event.target.value as StoryReference["category"])}><NativeSelectOption value="material">소재·배경·밈</NativeSelectOption><NativeSelectOption value="style">문체·문장</NativeSelectOption></NativeSelect></label>
        <label><span>레퍼런스 이름</span><Input value={title} disabled={blocked} maxLength={120} onChange={event => setTitle(event.target.value)} placeholder={category === "style" ? "예: 재벌집 막내아들 문체 참고" : "예: 직장인 커뮤니티의 회식 밈"} /></label>
      </div>
      <label><span>반영할 특징 <small>선택</small></span><Input value={guidance} disabled={blocked} maxLength={1000} onChange={event => setGuidance(event.target.value)} placeholder={category === "style" ? "닮게 쓰고 싶은 문장 리듬, 대사 방식, 전개 속도" : "참고할 배경, 분위기, 표현의 쓰임새"} /></label>
      <label><span>참고 본문 붙여넣기</span><Textarea value={text} disabled={blocked} maxLength={MAX_REFERENCE_TEXT} onChange={event => setText(event.target.value)} placeholder="참고할 게시글, 밈 설명, 문체 예시를 붙여넣으세요. 작품명만 쓰기보다 예시 문장과 원하는 특징을 함께 넣으면 좋습니다." /><small>{text.length.toLocaleString()} / 8,000자</small></label>
      <Button type="button" variant="outline" disabled={blocked || !text.trim()} onClick={addText}><Plus />붙여넣은 자료 추가</Button>
      <div className="reference-import-row"><Input type="url" aria-label="레퍼런스 사이트 주소" value={url} disabled={blocked} onChange={event => setUrl(event.target.value)} placeholder="https:// 사이트 또는 게시글 주소" /><Button type="button" variant="outline" disabled={blocked || !url.trim()} onClick={() => void importSource()}><Link2 />주소 불러오기</Button></div>
      <input ref={fileInput} type="file" accept={REFERENCE_FILE_ACCEPT} className="sr-only" aria-label="레퍼런스 파일 선택" disabled={blocked} onChange={event => { const file = event.target.files?.[0]; if (file) void importSource(file); }} />
      <Button type="button" variant="outline" disabled={blocked} onClick={() => fileInput.current?.click()}><FileUp />파일 업로드</Button>
      <p className="reference-help">TXT·MD·PDF·PNG·JPG·WEBP, 파일당 4MB 이하. 이미지·PDF·웹페이지는 AI가 참고 내용을 추출합니다. 접근이 제한된 사이트는 본문이나 화면 캡처를 넣어 주세요.</p>
    </div>}
    {pending && !importing ? <p className="reference-help" role="status">작성 중인 자료를 먼저 추가하거나 불러온 뒤 작품을 저장해 주세요. <Button type="button" variant="ghost" size="sm" disabled={blocked} onClick={() => { setTitle(""); setText(""); setGuidance(""); setUrl(""); setError(""); }}>추가 입력 비우기</Button></p> : null}
    {importing ? <p className="reference-progress" role="status"><LoaderCircle className="animate-spin" />자료를 읽고 참고 내용을 정리하고 있습니다…</p> : null}
    {error ? <p className="reference-error" role="alert">{error}</p> : null}
  </section>;
}
