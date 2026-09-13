"use client";

import { useState } from "react";
import { LoaderCircle, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Character } from "@/lib/story-engine";

type Props = {
  draft: Character;
  originalName?: string;
  isNew: boolean;
  busy: boolean;
  onChange: (draft: Character) => void;
  onClose: () => void;
  onSave: () => Promise<void>;
  onDelete: () => Promise<void>;
};

const detailFields = [
  { key: "desire", label: "욕망", placeholder: "이 인물이 가장 원하는 것은 무엇인가요?" },
  { key: "fear", label: "두려움", placeholder: "잃거나 마주하기 두려워하는 것은 무엇인가요?" },
  { key: "secret", label: "숨은 비밀", placeholder: "다른 인물이 아직 모르는 사실" },
  { key: "voice", label: "목소리와 말투", placeholder: "말의 길이, 어휘, 호칭, 감정 표현 방식" },
  { key: "state", label: "현재 상태", placeholder: "현재의 상황, 관계, 감정과 변화" },
] as const;

export function CharacterEditorDialog({ draft, originalName, isNew, busy, onChange, onClose, onSave, onDelete }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  return (
    <>
      <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
        <DialogContent className="project-dialog character-editor-dialog sm:max-w-3xl" showCloseButton={!busy}>
          <form onSubmit={event => { event.preventDefault(); if (!busy) void onSave(); }}>
            <DialogHeader>
              <DialogTitle>{isNew ? "새 인물 추가" : "인물 편집"}</DialogTitle>
              <DialogDescription>이름과 설정을 수정한 뒤 저장하세요. 기존 원고의 문장은 그대로 유지됩니다.</DialogDescription>
            </DialogHeader>
            <fieldset className="dialog-fields" disabled={busy}>
              <div className="character-editor-grid">
                <label><span>이름 <em>필수</em></span><Input value={draft.name} required autoFocus onChange={event => onChange({ ...draft, name: event.target.value })} placeholder="인물 이름" /></label>
                <label><span>역할</span><Input value={draft.role ?? ""} onChange={event => onChange({ ...draft, role: event.target.value })} placeholder="주인공, 조력자, 라이벌 등" /></label>
                <label><span>인물 유형</span><Input value={draft.archetype ?? ""} onChange={event => onChange({ ...draft, archetype: event.target.value })} placeholder="예: 상처 입은 관찰자" /></label>
                <label><span>표시 색상</span><Input type="color" className="character-color-input" value={/^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : "#8ec5a4"} onChange={event => onChange({ ...draft, color: event.target.value })} /></label>
                {detailFields.map(field => <label key={field.key} className={field.key === "state" ? "character-wide-field" : ""}><span>{field.label}</span><Textarea value={draft[field.key] ?? ""} onChange={event => onChange({ ...draft, [field.key]: event.target.value })} placeholder={field.placeholder} /></label>)}
              </div>
            </fieldset>
            <DialogFooter className="character-editor-footer">
              {!isNew ? <Button type="button" variant="outline" className="character-delete-button" disabled={busy} onClick={() => setDeleteOpen(true)}><Trash2 />인물 삭제</Button> : null}
              <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>취소</Button>
              <Button type="submit" disabled={busy || !draft.name.trim()}>{busy ? <LoaderCircle className="animate-spin" /> : <Save />}{busy ? "저장 중…" : "인물 저장"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={deleteOpen} onOpenChange={open => { if (!busy) setDeleteOpen(open); }}>
        <DialogContent className="project-dialog sm:max-w-lg" showCloseButton={!busy}>
          <DialogHeader><DialogTitle>인물을 삭제할까요?</DialogTitle><DialogDescription>‘{originalName ?? draft.name}’ 인물 카드와 해당 카드의 편집 내용을 삭제합니다. 기존 원고와 다른 인물은 유지됩니다.</DialogDescription></DialogHeader>
          <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => setDeleteOpen(false)}>유지하기</Button><Button type="button" variant="destructive" disabled={busy} onClick={() => { void onDelete(); }}>{busy ? <LoaderCircle className="animate-spin" /> : <Trash2 />}삭제하고 저장</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
