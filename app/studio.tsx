"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookMarked, BookOpenText, BrainCircuit, Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, Download, FileText, GitBranch, Lightbulb, LoaderCircle, Menu, Pencil, Plus, RotateCcw, Save, Search, Square, Trash2, RefreshCw, ShieldCheck, Sparkles, Target, Users, WandSparkles, X, Feather } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { buildStory, createSampleProject, type Character, type Foreshadow, type EpisodeDraft, type ProjectInput, type StoryIdea, type StoryProject } from "@/lib/story-engine";

import { isAIAbort, requestAI } from "@/lib/ai-request";
import { mergeAIPlan, mergeMemories, isTemplateContent } from "@/lib/story-planning";
import { EpisodeTargetInput } from "@/components/episode-target-input";
import { CharacterEditorDialog } from "@/components/character-editor-dialog";
import { createCharacterDraft, saveCharacterInProject, removeCharacterFromProject } from "@/lib/character-editor";
import { DEFAULT_TARGET_CHARACTERS, MAX_TARGET_CHARACTERS, getContentTargetError, getTargetCharacters, setEpisodeTarget, withEpisodeTargets } from "@/lib/episode-target";

const genres = ["현대 판타지", "로맨스 판타지", "미스터리", "무협", "SF", "로맨스", "드라마"];
const tones = ["빠르고 통쾌한", "서늘하지만 따뜻한", "유쾌하고 경쾌한", "묵직하고 서정적인", "긴장감 있고 어두운"];
type ModelTool = { name: string; title?: string; description: string; inputSchema: Record<string, unknown>; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute: (input: unknown) => unknown | Promise<unknown> };
type ModelContextDocument = Document & { modelContext?: { registerTool: (tool: ModelTool, options?: { signal?: AbortSignal }) => void | Promise<void> } };
const initialForm: ProjectInput = { title: "", synopsis: "", genre: "현대 판타지", tone: "서늘하지만 따뜻한", targetEpisodes: 80, targetCharacters: DEFAULT_TARGET_CHARACTERS };
type AIAction = "plan" | "episode" | "rewrite" | "analyze" | "ideas";
const aiActionLabels: Record<AIAction, string> = { plan: "전체 설계", episode: "회차 집필", rewrite: "원고 다듬기", analyze: "연속성 검사", ideas: "소재 제안" };
type GenerationVersion = { id: string; action: "plan" | "episode" | "rewrite" | "analyze" | "ideas"; model: string; inputSummary: string; output: string; createdAt: string };
type RewriteProposal = { original: string; revised: string; start: number; end: number; wholeEpisode: boolean; instruction: string };
type ModelOption = { id: string; label: string; note: string };
const defaultModelOptions: ModelOption[] = [
  { id: "gpt-5.6-terra", label: "GPT-5.6 Terra", note: "균형 잡힌 창작" },
  { id: "gpt-5.6-sol", label: "GPT-5.6 Sol", note: "깊이 있는 설계" },
  { id: "gpt-5.6-luna", label: "GPT-5.6 Luna", note: "빠른 초안 작업" },
  { id: "gpt-6-astra", label: "GPT-6 Astra", note: "복잡한 창작 작업" },
];

function formatDate(value?: string) {
  if (!value) return "방금";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value));
}
function statusTone(status: string) {
  if (status === "done") return "bg-emerald-400";
  if (status === "draft") return "bg-amber-400";
  return "bg-slate-500";
}

function normalizeProject(project: StoryProject): StoryProject {
  project = { ...project, content: { ...project.content, episodes: withEpisodeTargets(project.content.episodes, project.content.episodes) } };
  if (project.content.episodeDrafts) return project;
  const first = project.content.episodes[0];
  const body = project.content.manuscript ?? "";
  return {
    ...project,
    content: {
      ...project.content,
      episodeDrafts: body && first ? { "1": { episodeNumber: 1, title: first.title, body, status: "draft", revision: 1, updatedAt: project.updatedAt ?? new Date().toISOString() } } : {},
    },
  };
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim() || "StoryWell-원고";
}

function episodeBody(project: StoryProject, episodeNumber: number) {
  return project.content.episodeDrafts?.[String(episodeNumber)]?.body ?? (episodeNumber === 1 ? project.content.manuscript ?? "" : "");
}

function updateEpisodeDraft(project: StoryProject, episodeNumber: number, body: string, status: EpisodeDraft["status"] = "draft") {
  const episode = project.content.episodes.find((item) => item.number === episodeNumber);
  const previous = project.content.episodeDrafts?.[String(episodeNumber)];
  const draft: EpisodeDraft = {
    episodeNumber,
    title: episode?.title ?? episodeNumber + "화",
    body,
    status,
    revision: (previous?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  return {
    ...project,
    content: {
      ...project.content,
      manuscript: episodeNumber === 1 ? body : project.content.manuscript,
      episodeDrafts: { ...(project.content.episodeDrafts ?? {}), [String(episodeNumber)]: draft },
      episodes: project.content.episodes.map((item) => item.number === episodeNumber ? { ...item, status, words: body.length } : item),
    },
  };
}

export default function StoryStudio() {
  const sample = useMemo(() => createSampleProject(), []);
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [current, setCurrent] = useState<StoryProject>(sample);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [form, setForm] = useState<ProjectInput>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeEpisode, setActiveEpisode] = useState(1);
  const [episodePage, setEpisodePage] = useState(0);
  const [query, setQuery] = useState("");
  const [aiConfigured, setAiConfigured] = useState(false);
  const [aiModel, setAiModel] = useState("gpt-5.6-terra");
  const [modelOptions, setModelOptions] = useState<ModelOption[]>(defaultModelOptions);
  const [foreshadowDraft, setForeshadowDraft] = useState<Foreshadow | null>(null);
  const [aiElapsed, setAiElapsed] = useState(0);
  const [aiProgress, setAiProgress] = useState("");
  const [aiPreview, setAiPreview] = useState("");
  const [aiError, setAiError] = useState("");
  const [aiTask, setAiTask] = useState<AIAction | null>(null);
  const aiControllerRef = useRef<AbortController | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [versions, setVersions] = useState<GenerationVersion[]>([]);
  const [versionTick, setVersionTick] = useState(0);
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [rewriteProposal, setRewriteProposal] = useState<RewriteProposal | null>(null);
  const manuscriptRef = useRef<HTMLTextAreaElement | null>(null);
  const [characterEditor, setCharacterEditor] = useState<{ projectId: string; original: Character | null; draft: Character } | null>(null);
  const characterEditorDirty = Boolean(characterEditor && JSON.stringify(characterEditor.original) !== JSON.stringify(characterEditor.draft));

  const savedCurrent = projects.find((project) => project.id === current.id);
  const hasUnsavedChanges = current !== (savedCurrent ?? sample);
  const busy = Boolean(aiTask) || saving || deleting || loading || reloading;

  useEffect(() => () => { aiControllerRef.current?.abort(); }, []);
  useEffect(() => {
    if (!aiTask) return;
    const started = Date.now(); setAiElapsed(0);
    const timer = setInterval(() => setAiElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [aiTask]);
  useEffect(() => {
    if (!hasUnsavedChanges && !characterEditorDirty && !aiTask) return;
    const protectDraft = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", protectDraft);
    return () => window.removeEventListener("beforeunload", protectDraft);
  }, [hasUnsavedChanges, characterEditorDirty, aiTask]);

  useEffect(() => {
    let active = true;
    fetch("/api/projects")
      .then(async (response) => {
        if (!response.ok) throw new Error("작품 보관함을 불러오지 못했습니다.");
        return response.json() as Promise<{ projects: StoryProject[] }>;
      })
      .then((data) => {
        if (!active) return;
        const normalized = data.projects.map(normalizeProject);
        setProjects(normalized);
        if (normalized.length) setCurrent(normalized[0]);
      })
      .catch(() => toast.error("작품 보관함을 불러오지 못했습니다. 연결을 확인하고 다시 불러오기를 눌러 주세요."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (current.id === "sample" || current.id.startsWith("draft-")) {
      setVersions([]);
      return;
    }
    const controller = new AbortController();
    fetch("/api/generations?projectId=" + encodeURIComponent(current.id), { signal: controller.signal })
      .then((response) => response.json())
      .then((value) => { if (!controller.signal.aborted) setVersions(((value as { versions?: GenerationVersion[] }).versions ?? [])); })
      .catch(() => { if (!controller.signal.aborted) setVersions([]); });
    return () => controller.abort();
  }, [current.id, versionTick]);

  useEffect(() => {
    fetch("/api/ai/status")
      .then((response) => response.json())
      .then((value) => {
        const data = value as { configured?: boolean; model?: string; models?: string[] };
        setAiConfigured(Boolean(data.configured));
        const models = data.models?.length ? data.models : defaultModelOptions.map((item) => item.id);
        setModelOptions(models.map((id) => defaultModelOptions.find((item) => item.id === id) ?? { id, label: id, note: "연결된 모델" }));
        const saved = window.localStorage.getItem("storywell-ai-model");
        if (saved && models.includes(saved)) setAiModel(saved);
        else if (data.model) setAiModel(data.model);
      })
      .catch(() => setAiConfigured(false));
  }, []);

  const persistProject = useCallback(async (project: StoryProject) => {
    const targetError = getContentTargetError(project.content);
    if (targetError) throw new Error(targetError);
    const isNew = project.id === "sample" || project.id.startsWith("draft-");
    const response = await fetch(isNew ? "/api/projects" : "/api/projects/" + project.id, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    const data = (await response.json()) as { project?: StoryProject; updatedAt?: string; error?: string };
    if (!response.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
    return normalizeProject(data.project ?? { ...project, updatedAt: data.updatedAt });
  }, []);

  const createProject = useCallback(async (input: ProjectInput) => {
    const title = input.title.trim(), synopsis = input.synopsis.trim();
    if (!title || !synopsis) throw new Error("제목과 시놉시스를 입력해 주세요.");
    if (!aiConfigured) throw new Error("AI 연결을 확인하지 못했습니다. 잠시 후 새로고침하여 다시 시도해 주세요.");
    if (aiControllerRef.current) throw new Error("진행 중인 AI 작업을 먼저 취소해 주세요.");
    const draft: StoryProject = { id: "draft-" + crypto.randomUUID(), ...input, title, synopsis, status: "AI 설계 대기", content: buildStory(input) };
    const controller = new AbortController();
    aiControllerRef.current = controller;
    setAiTask("plan"); setAiError(""); setAiProgress("작품 정보를 저장합니다."); setAiPreview("");
    setSaving(true);
    try {
      const saved = await persistProject(draft);
      setProjects(items => [saved, ...items.filter(item => item.id !== saved.id)]);
      setCurrent(saved); setActiveEpisode(1); setEpisodePage(0);
      setDialogOpen(false); setMobileOpen(false); setForm(initialForm); setSaving(false);
      setAiProgress("시놉시스에 맞춘 인물과 세계관 설계를 요청했습니다.");
      controller.signal.throwIfAborted();
      const data = await requestAI({ action: "plan", project: saved, model: aiModel }, controller.signal, event => {
        if (event.message) setAiProgress(event.message);
      });
      controller.signal.throwIfAborted();
      if (!data.result) throw new Error("AI 설계 결과가 없습니다.");
      const updated = { ...saved, status: "AI 설계 완료", content: mergeAIPlan(saved.content, data.result as Partial<StoryProject["content"]>) };
      setSaving(true);
      const completed = await persistProject(updated);
      setCurrent(completed); setProjects(items => [completed, ...items.filter(item => item.id !== completed.id)]);
      setVersionTick(value => value + 1);
      toast.success("시놉시스에 맞춘 AI 전체 설계를 저장했습니다.");
      return completed;
    } catch (error) {
      if (!isAIAbort(error)) setAiError((error instanceof Error ? error.message : "AI 설계에 실패했습니다.") + " 저장된 작품에서 ‘AI로 전체 설계’를 눌러 다시 시도할 수 있습니다.");
      throw error;
    } finally {
      setSaving(false);
      if (aiControllerRef.current === controller) { aiControllerRef.current = null; setAiTask(null); }
    }
  }, [persistProject, aiConfigured, aiModel]);

  useEffect(() => {
    const modelContext = (document as ModelContextDocument).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await modelContext.registerTool({
        name: "create_story_project",
        title: "새 웹소설 설계",
        description: "제목과 시놉시스로 새 웹소설 프로젝트를 만들고 전체 회차, 인물, 복선, 소재를 설계합니다.",
        inputSchema: { type: "object", properties: { title: { type: "string" }, synopsis: { type: "string" }, genre: { type: "string" }, tone: { type: "string" }, targetEpisodes: { type: "integer", minimum: 12, maximum: 200 }, targetCharacters: { type: "integer", minimum: 1, maximum: MAX_TARGET_CHARACTERS, description: "모든 회차의 초기 목표 글자 수(공백 포함), 기본 5000" } }, required: ["title", "synopsis"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (value) => {
          const input = value as Partial<ProjectInput>;
          const project = await createProject({ title: String(input.title ?? ""), synopsis: String(input.synopsis ?? ""), genre: String(input.genre ?? "현대 판타지"), tone: String(input.tone ?? "서늘하지만 따뜻한"), targetEpisodes: Number(input.targetEpisodes ?? 80), targetCharacters: input.targetCharacters === undefined ? undefined : Number(input.targetCharacters) });
          return { id: project.id, title: project.title, episodes: project.targetEpisodes, status: project.status };
        },
      }, { signal: lifecycle.signal });
      await modelContext.registerTool({
        name: "read_story_status",
        title: "현재 작품 현황",
        description: "현재 열린 작품의 회차 수, 캐릭터, 복선과 집필 진행 상태를 확인합니다.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: () => ({ title: current.title, episodes: current.content.episodes.length, characters: current.content.characters.length, openForeshadows: current.content.foreshadows.filter((item) => item.status !== "planned").length, draftedEpisodes: current.content.episodes.filter((item) => item.status !== "planned").length }),
      }, { signal: lifecycle.signal });
    };
    void register().catch(() => undefined);
    return () => lifecycle.abort();
  }, [createProject, current]);

  const updateContent = (patch: Partial<StoryProject["content"]>) => setCurrent((project) => ({ ...project, content: { ...project.content, ...patch } }));
  const editActiveManuscript = (body: string) => setCurrent((project) => {
    const episode = project.content.episodes.find((item) => item.number === activeEpisode);
    const previous = project.content.episodeDrafts?.[String(activeEpisode)];
    return {
      ...project,
      content: {
        ...project.content,
        manuscript: activeEpisode === 1 ? body : project.content.manuscript,
        episodeDrafts: {
          ...(project.content.episodeDrafts ?? {}),
          [String(activeEpisode)]: {
            episodeNumber: activeEpisode,
            title: episode?.title ?? activeEpisode + "화",
            body,
            status: previous?.status ?? "draft",
            revision: previous?.revision ?? 1,
            updatedAt: new Date().toISOString(),
          },
        },
        episodes: project.content.episodes.map((item) => item.number === activeEpisode ? { ...item, status: "draft" as const, words: body.length } : item),
      },
    };
  });
  const editEpisodeTarget = (number: number, value: number | undefined) => setCurrent(project => setEpisodeTarget(project, number, value));
  const saveCurrent = async () => {
    setSaving(true);
    try {
      const saved = await persistProject(current);
      setCurrent(saved);
      setProjects((items) => [saved, ...items.filter((item) => item.id !== saved.id && item.id !== current.id)]);
      toast.success("작품 설정과 원고를 저장했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  };
  const markEpisodeDone = async () => {
    if (!activeManuscript.trim()) {
      toast.error("완료로 표시할 원고가 없습니다.");
      return;
    }
    await persistUpdated(updateEpisodeDraft(current, active.number, activeManuscript, "done"), active.number + "화를 완성 원고로 표시했습니다.");
  };
  const cancelAI = (notify = true) => {
    const controller = aiControllerRef.current;
    if (!controller || saving) return;
    controller.abort();
    aiControllerRef.current = null;
    setAiTask(null);
    setAiProgress(""); setAiPreview("");
    if (notify) toast.info("AI 작업을 취소했습니다. 기존 원고는 그대로 유지됩니다.");
  };

  const callAI = async (action: AIAction, extra: Record<string, unknown> = {}) => {
    const targetError = getContentTargetError(current.content);
    if (targetError) throw new Error(targetError);
    if (!aiConfigured) throw new Error("AI 연결을 확인하지 못했습니다. 잠시 후 새로고침해 주세요.");
    if (aiControllerRef.current) throw new Error("진행 중인 AI 작업을 먼저 취소해 주세요.");
    const controller = new AbortController();
    aiControllerRef.current = controller;
    setAiTask(action); setAiError(""); setAiProgress("AI 연결을 시작합니다."); setAiPreview("");
    try {
      const data = await requestAI({ action, project: current, model: aiModel, ...extra }, controller.signal, event => {
        if (event.message) setAiProgress(event.message);
        if (event.type === "delta" && event.text) setAiPreview(text => (text + event.text).slice(-1200));
      });
      controller.signal.throwIfAborted();
      if (data.model) setAiModel(data.model);
      setVersionTick(value => value + 1);
      return data.result;
    } catch (error) {
      if (!isAIAbort(error)) setAiError(error instanceof Error ? error.message : "AI 생성에 실패했습니다.");
      throw error;
    } finally {
      if (aiControllerRef.current === controller) { aiControllerRef.current = null; setAiTask(null); }
    }
  };

  const persistUpdated = async (project: StoryProject, message: string) => {
    setSaving(true);
    try {
      const saved = await persistProject(project);
      setCurrent(saved);
      setProjects((items) => [saved, ...items.filter((item) => item.id !== saved.id && item.id !== project.id)]);
      toast.success(message);
    } finally {
      setSaving(false);
    }
  };

  const deleteCurrentProject = async () => {
    if (!savedCurrent || busy) return;
    const target = current;
    setDeleting(true);
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(target.id), { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error ?? "작품을 삭제하지 못했습니다.");
      }
      const remaining = projects.filter((project) => project.id !== target.id);
      setProjects(remaining);
      setCurrent(remaining[0] ?? sample);
      setActiveEpisode(1);
      setEpisodePage(0);
      setVersions([]);
      setRewriteProposal(null);
      setRewriteInstruction("");
      setQuery("");
      setDeleteOpen(false);
      toast.success(target.title + " 작품과 AI 생성 기록을 삭제했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "작품을 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const reloadWorkspace = async () => {
    if (saving || deleting || reloading || loading) return;
    cancelAI(false);
    setReloading(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      if (!response.ok) throw new Error("다시 불러오지 못했습니다. 현재 원고는 그대로 유지됩니다.");
      const data = await response.json() as { projects: StoryProject[] };
      const normalized = data.projects.map(normalizeProject);
      const selected = normalized.find((project) => project.id === current.id) ?? normalized[0] ?? sample;
      setProjects(normalized);
      setCurrent(selected);
      if (selected.id !== current.id) { setActiveEpisode(1); setEpisodePage(0); }
      setVersions([]);
      setVersionTick((value) => value + 1);
      setRewriteProposal(null);
      setRewriteInstruction("");
      setReloadOpen(false);
      toast.success("저장된 작품을 다시 불러왔습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "다시 불러오지 못했습니다.");
    } finally {
      setReloading(false);
    }
  };
  const requestReload = () => {
    if (hasUnsavedChanges || rewriteProposal) setReloadOpen(true);
    else void reloadWorkspace();
  };

  const regeneratePlan = async () => {
    try {
      const result = (await callAI("plan")) as Partial<StoryProject["content"]> | undefined;
      if (!result) throw new Error("AI가 이야기 구조를 반환하지 못했습니다.");
      const content = mergeAIPlan(current.content, result);
      const updated = { ...current, content, status: "AI 설계 완료" };
      await persistUpdated(updated, aiModel + "이 전체 작품을 다시 설계했습니다.");
      setActiveEpisode(1);
      setEpisodePage(0);
    } catch (error) {
      if (!isAIAbort(error)) toast.error(error instanceof Error ? error.message : "AI 설계에 실패했습니다.");
    }
  };

  const generateEpisode = async () => {
    try {
      if (!active.beat?.trim() || !current.content.characters.length) throw new Error("먼저 AI로 전체 설계를 완료한 뒤 집필해 주세요.");
      const text = (await callAI("episode", { episode: active })) as string;
      if (!text?.trim()) throw new Error("생성된 원고가 비어 있습니다.");
      const updated = updateEpisodeDraft(current, active.number, text);
      await persistUpdated(updated, active.number + "화 원고를 생성하고 버전으로 보관했습니다.");
    } catch (error) {
      if (!isAIAbort(error)) toast.error(error instanceof Error ? error.message : "회차 원고 생성에 실패했습니다.");
    }
  };

  const rewriteManuscript = async (instruction: string, forceWhole = false) => {
    try {
      const body = episodeBody(current, active.number);
      if (!body.trim()) throw new Error("먼저 원고를 입력하거나 AI로 이번 화를 집필해 주세요.");
      const textarea = manuscriptRef.current;
      const start = textarea?.selectionStart ?? 0;
      const end = textarea?.selectionEnd ?? 0;
      const hasSelection = !forceWhole && end > start;
      const selectedText = hasSelection ? body.slice(start, end) : body;
      const text = (await callAI("rewrite", {
        instruction,
        episode: active,
        selectedText,
        rewriteTarget: hasSelection ? "selection" : "episode",
        beforeContext: hasSelection ? body.slice(Math.max(0, start - 1200), start) : "",
        afterContext: hasSelection ? body.slice(end, end + 1200) : "",
      })) as string;
      if (!text?.trim()) throw new Error("수정된 원고가 비어 있습니다.");
      setRewriteProposal({ original: selectedText, revised: text, start: hasSelection ? start : 0, end: hasSelection ? end : body.length, wholeEpisode: !hasSelection, instruction });
    } catch (error) {
      if (!isAIAbort(error)) toast.error(error instanceof Error ? error.message : "원고 재작성에 실패했습니다.");
    }
  };

  const applyRewrite = async () => {
    if (!rewriteProposal) return;
    const body = episodeBody(current, active.number);
    const nextBody = body.slice(0, rewriteProposal.start) + rewriteProposal.revised + body.slice(rewriteProposal.end);
    await persistUpdated(updateEpisodeDraft(current, active.number, nextBody), rewriteProposal.wholeEpisode ? "다듬은 원고를 적용하고 저장했습니다." : "선택 문단 수정안을 적용하고 저장했습니다.");
    setRewriteProposal(null);
    setRewriteInstruction("");
  };

  const analyzeContinuity = async () => {
    try {
      const result = (await callAI("analyze", { episode: active })) as {
        summary?: string;
        memories?: StoryProject["content"]["memories"];
        issues?: StoryProject["content"]["issues"];
        stateChanges?: { character: string; state: string }[];
      };
      const stateMap = new Map((result.stateChanges ?? []).map((item) => [item.character, item.state]));
      const characters = current.content.characters.map((character) => ({ ...character, state: stateMap.get(character.name) ?? character.state }));
      const updated = { ...current, content: { ...current.content, characters, memories: mergeMemories(current.content.memories ?? [], result.memories ?? []), issues: result.issues ?? [], currentSummary: result.summary ?? current.content.currentSummary, analyzedAt: new Date().toISOString() } };
      await persistUpdated(updated, "원고에서 새 기억을 추출하고 연속성을 검사했습니다.");
    } catch (error) {
      if (!isAIAbort(error)) toast.error(error instanceof Error ? error.message : "연속성 검사에 실패했습니다.");
    }
  };

  const restoreVersion = async (version: GenerationVersion) => {
    try {
      let content = { ...current.content };
      if (version.action === "episode" || version.action === "rewrite") {
        const matchedEpisode = Number(version.inputSummary.match(/(\d+)화/)?.[1] ?? activeEpisode);
        const restored = updateEpisodeDraft({ ...current, content }, matchedEpisode, version.output);
        content = restored.content;
      } else if (version.action === "plan") {
        content = mergeAIPlan(content, JSON.parse(version.output) as Partial<StoryProject["content"]>);
      } else if (version.action === "ideas") {
        const result = JSON.parse(version.output) as { ideas?: StoryIdea[] };
        content = { ...content, ideas: result.ideas ?? content.ideas };
      } else {
        const result = JSON.parse(version.output) as { summary?: string; memories?: StoryProject["content"]["memories"]; issues?: StoryProject["content"]["issues"] };
        content = { ...content, currentSummary: result.summary, memories: result.memories ?? [], issues: result.issues ?? [] };
      }
      await persistUpdated({ ...current, content }, "선택한 AI 버전을 복원했습니다.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "버전을 복원하지 못했습니다.");
    }
  };
  const addIdea = async () => {
    try {
      const result = await callAI("ideas") as { ideas?: StoryIdea[] };
      if (!result?.ideas?.length) throw new Error("AI 소재가 비어 있습니다.");
      await persistUpdated({ ...current, content: { ...current.content, ideas: [...result.ideas, ...current.content.ideas] } }, "작품에 맞춘 새 AI 소재를 저장했습니다.");
    } catch (error) { if (!isAIAbort(error)) toast.error(error instanceof Error ? error.message : "소재 생성에 실패했습니다."); }
  };
  const toggleWorldRule = async () => {
    try { await persistUpdated({ ...current, content: { ...current.content, worldRuleLocked: !current.content.worldRuleLocked } }, current.content.worldRuleLocked ? "세계관 규칙 잠금을 해제했습니다." : "세계관 규칙을 잠그고 저장했습니다."); }
    catch (error) { toast.error(error instanceof Error ? error.message : "설정 저장에 실패했습니다."); }
  };
  const applyIdea = async (idea: StoryIdea) => {
    try {
      await persistUpdated({ ...current, content: { ...current.content, episodes: current.content.episodes.map(episode => episode.number === active.number ? { ...episode, beat: episode.beat + "\n소재 후보: " + idea.title + " — " + idea.reason } : episode) } }, active.number + "화 설계에 소재 후보를 추가했습니다.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "소재를 저장하지 못했습니다."); }
  };
  const addCharacter = () => setCharacterEditor({ projectId: current.id, original: null, draft: createCharacterDraft() });
  const saveCharacter = async () => {
    if (!characterEditor || busy) return;
    try {
      if (characterEditor.projectId !== current.id) throw new Error("작품이 변경되었습니다. 편집창을 닫고 다시 선택해 주세요.");
      const updated = saveCharacterInProject(current, characterEditor.draft, !characterEditor.original);
      await persistUpdated(updated, characterEditor.original ? "인물 설정을 저장했습니다." : "새 인물을 추가하고 저장했습니다.");
      setCharacterEditor(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "인물을 저장하지 못했습니다. 입력 내용은 유지됩니다.");
    }
  };
  const deleteCharacter = async () => {
    if (!characterEditor?.original || busy) return;
    try {
      if (characterEditor.projectId !== current.id) throw new Error("작품이 변경되었습니다. 편집창을 닫고 다시 선택해 주세요.");
      const updated = removeCharacterFromProject(current, characterEditor.original.id);
      await persistUpdated(updated, characterEditor.original.name + " 인물을 삭제했습니다.");
      setCharacterEditor(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "인물을 삭제하지 못했습니다.");
    }
  };
  const addForeshadow = () => setForeshadowDraft({ id: "foreshadow-" + crypto.randomUUID(), label: "", seedEpisode: activeEpisode, payoffEpisode: Math.min(current.targetEpisodes, activeEpisode + 12), status: "planned", note: "" });
  const saveForeshadow = async () => {
    if (!foreshadowDraft || busy) return;
    if (!foreshadowDraft.label.trim() || !Number.isInteger(foreshadowDraft.seedEpisode) || !Number.isInteger(foreshadowDraft.payoffEpisode) || foreshadowDraft.seedEpisode < 1 || foreshadowDraft.seedEpisode > foreshadowDraft.payoffEpisode || foreshadowDraft.payoffEpisode > current.targetEpisodes) {
      toast.error("복선 이름과 작품 범위 안의 설치·회수 회차를 확인해 주세요."); return;
    }
    const exists = current.content.foreshadows.some(item => item.id === foreshadowDraft.id);
    try {
      await persistUpdated({ ...current, content: { ...current.content, foreshadows: exists ? current.content.foreshadows.map(item => item.id === foreshadowDraft.id ? foreshadowDraft : item) : [...current.content.foreshadows, foreshadowDraft] } }, "복선을 저장했습니다.");
      setForeshadowDraft(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "복선을 저장하지 못했습니다."); }
  };

  const filteredProjects = projects.filter((project) => project.title.toLowerCase().includes(query.toLowerCase()));
  const active = current.content.episodes.find((item) => item.number === activeEpisode) ?? current.content.episodes[0];
  const activeManuscript = episodeBody(current, active?.number ?? 1);
  const activeTarget = getTargetCharacters(active);
  const targetCompletion = Math.round(activeManuscript.length / activeTarget * 100);
  const episodeSlice = current.content.episodes.slice(episodePage * 12, episodePage * 12 + 12);
  const totalEpisodePages = Math.ceil(current.content.episodes.length / 12);
  const drafted = current.content.episodes.filter((item) => item.status !== "planned").length;
  const completion = Math.round((drafted / current.content.episodes.length) * 100);
  const exportProject = (format: "txt" | "md" | "json", scope: "episode" | "all" = "all") => {
    const drafts = current.content.episodes
      .map((episode) => ({ episode, body: episodeBody(current, episode.number) }))
      .filter(({ body }) => Boolean(body.trim()));
    const selected = scope === "episode" ? drafts.filter(({ episode }) => episode.number === active.number) : drafts;
    let payload = "";
    let mime = "text/plain;charset=utf-8";
    if (format === "json") {
      payload = JSON.stringify({ exportedAt: new Date().toISOString(), project: current }, null, 2);
      mime = "application/json;charset=utf-8";
    } else if (format === "md") {
      payload = `# ${current.title}\n\n> ${current.genre} · ${current.tone} · 목표 ${current.targetEpisodes}화\n\n${current.synopsis}\n\n## 작품 설계\n\n- 로그라인: ${current.content.logline}\n- 주제: ${current.content.theme}\n- 세계관 규칙: ${current.content.worldRule}\n- 핵심 질문: ${current.content.centralQuestion}\n- 결말의 약속: ${current.content.endingPromise}\n\n## 등장인물\n\n${current.content.characters.map((character) => `### ${character.name} · ${character.role}\n\n- 욕망: ${character.desire}\n- 두려움: ${character.fear}\n- 비밀: ${character.secret}\n- 말투: ${character.voice}`).join("\n\n")}\n\n## 원고\n\n${selected.map(({ episode, body }) => `### ${episode.number}화. ${episode.title}\n\n${body}`).join("\n\n---\n\n")}`;
      mime = "text/markdown;charset=utf-8";
    } else {
      payload = `${current.title}\n${current.genre} · ${current.tone}\n\n${selected.map(({ episode, body }) => `${episode.number}화. ${episode.title}\n\n${body}`).join("\n\n========================================\n\n")}`;
    }
    const blob = new Blob(["\uFEFF", payload], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFilename(current.title)}-${scope === "episode" ? active.number + "화" : "전체원고"}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success(scope === "episode" ? active.number + "화 원고를 내보냈습니다." : "작품 원고를 내보냈습니다.");
  };
  const submitProject = async (event: FormEvent) => {
    event.preventDefault();
    try { await createProject(form); } catch (error) { if (!isAIAbort(error)) toast.error(error instanceof Error ? error.message : "작품을 만들지 못했습니다."); }
  };
  const chooseModel = (model: string) => {
    setAiModel(model);
    window.localStorage.setItem("storywell-ai-model", model);
    toast.success(model + "을(를) 다음 AI 작업에 사용합니다.");
  };

  return (
    <main className="min-h-screen bg-[var(--ink)] text-[var(--paper)]">
      <Toaster position="bottom-right" />
      <header className="studio-header">
        <button className="mobile-menu" aria-label="작품 목록 열기" onClick={() => setMobileOpen(true)}><Menu /></button>
        <div className="brand-mark" aria-hidden="true"><Feather /></div>
        <div className="brand-copy"><strong>StoryWell</strong><span>웹소설 창작 스튜디오</span></div>
        <div className="header-divider" />
        <div className="project-crumb"><BookMarked /><span>{current.title}</span></div>
        <div className="header-actions">
          <Button variant="outline" className="manual-button" onClick={() => setManualOpen(true)}><BookOpenText /><span className="header-action-label">사용자매뉴얼</span></Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className={"model-selector " + (aiConfigured ? "ready" : "pending")} disabled={!aiConfigured} title={aiConfigured ? `AI 모델: ${aiModel}` : "AI 연결 필요"}><Sparkles /><span className="header-action-label">{aiConfigured ? aiModel : "AI 연결 필요"}</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="model-menu w-64">
              <DropdownMenuLabel>AI 모델 선택</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {modelOptions.map((option) => <DropdownMenuItem key={option.id} className={option.id === aiModel ? "selected-model" : ""} onClick={() => chooseModel(option.id)}><span><strong>{option.label}</strong><small>{option.note}</small></span>{option.id === aiModel ? <Check /> : null}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="save-state"><span className="save-dot" />{saving ? "저장 중" : hasUnsavedChanges ? "저장 필요" : "저장됨"}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Download /><span className="header-action-label">내보내기</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>원고 파일</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => exportProject("txt", "episode")}>현재 회차 · TXT</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => exportProject("txt")}>전체 원고 · TXT</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportProject("md")}>작품 설계 포함 · Markdown</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportProject("json")}>백업 데이터 · JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={saveCurrent} disabled={busy}><Save /><span className="header-action-label">저장</span></Button>
        </div>
      </header>

      <div className="studio-shell">
        <aside className={"project-sidebar " + (mobileOpen ? "is-open" : "")}>
          <div className="mobile-sidebar-head"><strong>작품 보관함</strong><button aria-label="작품 목록 닫기" onClick={() => setMobileOpen(false)}><X /></button></div>
          <Button className="new-project-button" disabled={busy} onClick={() => setDialogOpen(true)}><Plus />새 작품 설계</Button>
          <label className="project-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="작품 검색" aria-label="작품 검색" /></label>
          <div className="sidebar-label"><span>내 작품</span><span>{projects.length}</span></div>
          <div className="project-list">
            {loading ? <div className="project-loading">작품을 불러오는 중…</div> : null}
            {filteredProjects.map((project) => (
              <button key={project.id} disabled={busy} className={"project-item " + (current.id === project.id ? "active" : "")} onClick={() => { setCurrent(project); setMobileOpen(false); setActiveEpisode(1); setEpisodePage(0); }}>
                <span className="project-glyph">{project.title.slice(0, 1)}</span><span><strong>{project.title}</strong><small>{project.targetEpisodes}화 · {formatDate(project.updatedAt)}</small></span><ChevronRight />
              </button>
            ))}
            {!loading && !filteredProjects.length ? (
              <button className="project-item sample" disabled={busy} onClick={() => { setCurrent(sample); setMobileOpen(false); }}><span className="project-glyph">달</span><span><strong>샘플 작품 살펴보기</strong><small>80화 구성 · 저장 전</small></span><ChevronRight /></button>
            ) : null}
          </div>
          <div className="sidebar-note"><ShieldCheck /><div><strong>작가의 설정이 기준입니다</strong><p>고정한 설정은 이후 회차에서도 임의로 바뀌지 않습니다.</p></div></div>
        </aside>
        {mobileOpen ? <button className="sidebar-backdrop" aria-label="작품 목록 닫기" onClick={() => setMobileOpen(false)} /> : null}

        <section className="workspace">
          <div className="workspace-controls">
            <div className="task-status">
              {aiTask ? <><LoaderCircle className="animate-spin" /><span role="status">{aiActionLabels[aiTask]} · {aiProgress || "진행 중"} · {aiElapsed}초 경과</span><Button variant="outline" className="cancel-task-button" disabled={saving} onClick={() => cancelAI()}><Square />작업 취소</Button></> : <span role="status">{reloading ? "작품을 다시 불러오는 중…" : saving ? "원고를 저장하는 중…" : hasUnsavedChanges ? "저장하지 않은 변경사항이 있습니다" : savedCurrent ? "저장된 작품을 편집하고 있습니다" : "샘플 작품을 살펴보고 있습니다"}</span>}
            </div>
            <div className="workspace-control-buttons">
              <Button variant="outline" onClick={requestReload} disabled={saving || deleting || reloading || loading} title="진행 중인 AI 작업을 취소하고 저장된 작품을 다시 불러옵니다"><RefreshCw className={reloading ? "animate-spin" : ""} />다시 불러오기</Button>
              <Button variant="outline" className="delete-project-button" onClick={() => setDeleteOpen(true)} disabled={busy || !savedCurrent}><Trash2 />작품 삭제</Button>
            </div>
          </div>
          {aiError ? <div className="ai-error-panel" role="alert"><CircleAlert /><span>{aiError}</span><Button variant="ghost" onClick={() => setAiError("")}>닫기</Button></div> : null}
          {aiTask && aiPreview ? <div className="ai-preview-panel"><p>생성 중인 본문 · 완료 후 저장됩니다</p><pre>{aiPreview}</pre></div> : null}
          {isTemplateContent(current.content) && current.id !== "sample" ? <div className="ai-template-notice">이 작품에는 이전 버전의 기본 예시가 포함되어 있습니다. ‘AI로 전체 설계’를 실행하면 시놉시스에 맞춰 인물과 회차를 새로 설계합니다. 저장된 원고는 유지됩니다.</div> : null}
          <div className="workspace-head">
            <div><div className="eyebrow"><span>{current.genre}</span><i /><span>{current.tone}</span></div><h1>{current.title}</h1><p>{current.synopsis}</p></div>
            <Button className="magic-button" onClick={regeneratePlan} disabled={busy}>{aiTask === "plan" ? <LoaderCircle className="animate-spin" /> : <WandSparkles />}{aiTask === "plan" ? "전체 이야기를 설계하는 중…" : "AI로 전체 설계"}</Button>
          </div>
          <div className="metric-row">
            <div className="metric-card"><span className="metric-icon amber"><FileText /></span><div><small>전체 회차</small><strong>{current.content.episodes.length}<em>화</em></strong></div></div>
            <div className="metric-card"><span className="metric-icon blue"><Users /></span><div><small>주요 인물</small><strong>{current.content.characters.length}<em>명</em></strong></div></div>
            <div className="metric-card"><span className="metric-icon violet"><GitBranch /></span><div><small>관리 복선</small><strong>{current.content.foreshadows.length}<em>개</em></strong></div></div>
            <div className="metric-card progress-card"><div className="metric-progress-head"><span><small>집필 진행률</small><strong>{completion}%</strong></span><span>{drafted}/{current.targetEpisodes}화</span></div><Progress value={completion} className="story-progress" /></div>
          </div>

          <Tabs defaultValue="overview" className="story-tabs">
            <TabsList variant="line" className="story-tab-list">
              <TabsTrigger value="overview"><Target />전체 설계</TabsTrigger><TabsTrigger value="characters"><Users />캐릭터</TabsTrigger><TabsTrigger value="episodes"><FileText />회차</TabsTrigger><TabsTrigger value="writing"><Feather />집필</TabsTrigger><TabsTrigger value="foreshadow"><GitBranch />복선</TabsTrigger><TabsTrigger value="ideas"><Lightbulb />소재 우물</TabsTrigger><TabsTrigger value="versions"><Clock3 />AI 버전</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="tab-panel">
              <div className="overview-grid">
                <article className="feature-card wide-card"><div className="card-kicker"><Sparkles />작품의 한 문장</div><h2>{current.content.logline}</h2><div className="theme-quote"><span>핵심 질문</span><p>{current.content.centralQuestion}</p></div></article>
                <article className="feature-card rule-card"><div className="card-kicker"><ShieldCheck />절대 규칙</div><p>{current.content.worldRule}</p><button className="text-action" disabled={busy || !current.content.worldRule} onClick={toggleWorldRule}>{current.content.worldRuleLocked ? "잠금 해제" : "설정 잠금"} <ChevronRight /></button></article>
              </div>
              <div className="section-title"><div><span>MACRO PLOT</span><h2>12단계 전체 이야기 지도</h2></div><Badge variant="outline">{current.targetEpisodes}화 기준</Badge></div>
              <div className="arc-map">
                {Array.from({ length: 12 }, (_, index) => {
                  const episode = current.content.episodes[Math.floor(index * (current.content.episodes.length - 1) / 11)];
                  return <button key={index} className="arc-node" onClick={() => { setActiveEpisode(episode.number); setEpisodePage(Math.floor((episode.number - 1) / 12)); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{episode.stage}</strong><small>{episode.number}화 부근</small></button>;
                })}
              </div>
              <div className="overview-bottom">
                <article className="feature-card"><div className="card-kicker"><BrainCircuit />주제와 결말의 약속</div><h3>{current.content.theme}</h3><p>{current.content.endingPromise}</p></article>
                <article className="feature-card continuity-card"><div className="card-kicker"><ShieldCheck />연속성 검사</div><strong>{current.content.analyzedAt ? (current.content.issues?.length ?? 0) : "—"}</strong><span>{current.content.analyzedAt ? "개 확인 항목" : "미검사"}</span><p>{current.content.analyzedAt ? "마지막 검사: " + formatDate(current.content.analyzedAt) : "AI 연속성 검사를 실행하면 실제 결과가 표시됩니다."}</p></article>
              </div>
            </TabsContent>

            <TabsContent value="characters" className="tab-panel">
              <div className="section-title"><div><span>CHARACTER BIBLE</span><h2>욕망이 이야기를 움직이는 인물</h2></div><Button variant="outline" disabled={busy} onClick={addCharacter}><Plus />인물 추가</Button></div>
              <div className="character-grid">
                {!current.content.characters.length ? <p className="character-empty-state">등록된 인물이 없습니다. ‘인물 추가’로 새 캐릭터를 만들어 보세요.</p> : null}
                {current.content.characters.map((character) => (
                  <article className="character-card" key={character.id}>
                    <div className="character-head"><span className="character-avatar" style={{ background: character.color }}>{character.name.slice(0, 1)}</span><div><Badge variant="outline">{character.role}</Badge><h3>{character.name}</h3><p>{character.archetype}</p></div><Button size="sm" variant="outline" className="character-edit-button" disabled={busy} aria-label={character.name + " 편집"} onClick={() => setCharacterEditor({ projectId: current.id, original: character, draft: { ...character } })}><Pencil />편집</Button></div>
                    <dl className="character-facts"><div><dt>욕망</dt><dd>{character.desire}</dd></div><div><dt>두려움</dt><dd>{character.fear}</dd></div><div><dt>숨은 비밀</dt><dd>{character.secret}</dd></div><div><dt>목소리</dt><dd>{character.voice}</dd></div></dl>
                    <div className="character-state"><span className="save-dot" />현재: {character.state}</div>
                  </article>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="episodes" className="tab-panel">
              <div className="section-title"><div><span>EPISODE BLUEPRINT</span><h2>전체 회차 스크립트</h2></div><div className="page-control"><Button variant="outline" size="sm" disabled={episodePage === 0} onClick={() => setEpisodePage((page) => page - 1)}>이전</Button><span>{episodePage + 1} / {totalEpisodePages}</span><Button variant="outline" size="sm" disabled={episodePage >= totalEpisodePages - 1} onClick={() => setEpisodePage((page) => page + 1)}>다음</Button></div></div>
              <div className="episode-list">
                {episodeSlice.map((episode) => (
                  <div key={episode.number} className="episode-item"><button className={"episode-row " + (activeEpisode === episode.number ? "active" : "")} onClick={() => setActiveEpisode(episode.number)}><span className={"status-line " + statusTone(episode.status)} /><strong>{String(episode.number).padStart(3, "0")}</strong><div><h3>{episode.title}</h3><p>{episode.beat}</p></div><Badge variant="outline">{episode.stage}</Badge><span className="episode-emotion">{episode.emotion}</span><ChevronRight /></button><EpisodeTargetInput episode={episode} disabled={busy} compact onChange={value => editEpisodeTarget(episode.number, value)} /></div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="writing" className="tab-panel writing-panel">
              <aside className="episode-rail"><span>회차</span>{current.content.episodes.map((episode) => <button key={episode.number} title={episode.title} className={activeEpisode === episode.number ? "active" : ""} onClick={() => setActiveEpisode(episode.number)}>{episode.number}<i className={statusTone(episode.status)} /></button>)}</aside>
              <section className="manuscript">
                <div className="manuscript-head"><div><span>EPISODE {String(active.number).padStart(3, "0")}</span><h2>{active.title}</h2></div><Badge className="draft-badge">{active.status === "done" ? "완성" : activeManuscript ? "초안" : "미집필"}</Badge></div>
                <div className="episode-brief"><div><Target /><span><small>이번 화 목표</small>{active.beat}</span></div><div><Sparkles /><span><small>마지막 훅</small>{active.hook}</span></div></div>
                <div className="episode-length-control">
                  <EpisodeTargetInput episode={active} disabled={busy} onChange={value => editEpisodeTarget(active.number, value)} />
                  <div className="episode-length-status">
                    <div><span>{activeManuscript.length.toLocaleString()} / {activeTarget.toLocaleString()}자</span><strong>{targetCompletion}%</strong></div>
                    <Progress value={Math.min(100, targetCompletion)} className="episode-length-progress" aria-label={active.number + "화 목표 글자 수 달성률"} />
                    <small>{activeManuscript.length >= activeTarget ? "목표 분량을 채웠습니다." : (activeTarget - activeManuscript.length).toLocaleString() + "자 더 쓰면 목표 달성"} · AI 집필도 이 목표를 참고합니다.</small>
                  </div>
                </div>
                <Textarea ref={manuscriptRef} className="manuscript-editor" readOnly={busy} value={activeManuscript} onChange={(event) => editActiveManuscript(event.target.value)} placeholder={active.number + "화 원고를 직접 쓰거나 AI로 집필하세요."} aria-label={active.number + "화 원고"} />
                <div className="manuscript-footer"><span>{activeManuscript.length.toLocaleString()}자</span><span>{activeManuscript.trim() ? activeManuscript.trim().split(/\s+/).length.toLocaleString() : 0}어절</span><span>리비전 {current.content.episodeDrafts?.[String(active.number)]?.revision ?? 0}</span><Button variant="outline" onClick={markEpisodeDone} disabled={busy || !activeManuscript.trim()}><CheckCircle2 />완료 표시</Button><Button onClick={saveCurrent} disabled={busy}><Save />원고 저장</Button></div>
              </section>
              <aside className="writing-assistant">
                <div className="assistant-title"><BrainCircuit /><div><strong>집필 조력자</strong><span>기억 {current.content.memories?.length ?? 0}개 · 현재 회차 맥락 연결</span></div></div>
                <div className="assistant-check"><h3>이번 화 설계</h3><p>{active.beat || "전체 설계를 완료하면 이번 화의 사건이 표시됩니다."}</p><p>{active.emotion ? "감정: " + active.emotion : ""}</p><p>{active.hook ? "마지막 훅: " + active.hook : ""}</p></div>
                <Button className="assistant-generate episode-generate" onClick={generateEpisode} disabled={busy}>{aiTask === "episode" ? <LoaderCircle className="animate-spin" /> : <Feather />}{aiTask === "episode" ? "원고를 집필하는 중…" : "AI로 이번 화 집필"}</Button>
                <p className="selection-hint">문장을 선택하면 그 부분만, 선택하지 않으면 회차 전체를 수정합니다. 결과는 적용 전에 비교할 수 있습니다.</p>
                <div className="assistant-actions"><button onClick={() => rewriteManuscript("대사를 더 짧고 날카롭게 다듬어라.")} disabled={busy}>대사를 더 날카롭게</button><button onClick={() => rewriteManuscript("감정을 직접 설명하지 말고 행동과 감각으로 더 섬세하게 보여줘라.")} disabled={busy}>감정선을 더 섬세하게</button><button onClick={() => rewriteManuscript("사건 진행 속도를 높이고 불필요한 설명을 덜어내라.")} disabled={busy}>전개 속도 높이기</button><button onClick={() => rewriteManuscript("마지막 장면의 긴장과 클리프행어를 강화하라.")} disabled={busy}>마지막 훅 강화</button></div>
                <div className="custom-rewrite"><Textarea value={rewriteInstruction} onChange={(event) => setRewriteInstruction(event.target.value)} placeholder="예: 주인공의 불안을 직접 설명하지 말고 손동작으로 보여줘" /><Button variant="outline" onClick={() => rewriteManuscript(rewriteInstruction)} disabled={busy || !rewriteInstruction.trim()}>{aiTask === "rewrite" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}맞춤 수정안</Button></div>
                <Button className="assistant-generate" variant="outline" onClick={() => rewriteManuscript("문장 반복을 줄이고 장면 전환과 호흡을 매끄럽게 다듬어라.", true)} disabled={busy}>{aiTask === "rewrite" ? <LoaderCircle className="animate-spin" /> : <Sparkles />}{aiTask === "rewrite" ? "원고를 다듬는 중…" : "원고 전체 다듬기"}</Button>
              </aside>
            </TabsContent>

            <TabsContent value="foreshadow" className="tab-panel">
              <div className="section-title"><div><span>FORESHADOW TRACKER</span><h2>복선의 설치부터 회수까지</h2></div><div className="section-actions"><Button variant="outline" disabled={busy} onClick={addForeshadow}><Plus />복선 등록</Button><Button className="magic-button" onClick={analyzeContinuity} disabled={busy}>{aiTask === "analyze" ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}{aiTask === "analyze" ? "검사 중…" : "AI 연속성 검사"}</Button></div></div>
              <div className="foreshadow-board">
                {current.content.foreshadows.map((item) => <article key={item.id} className="foreshadow-card"><div className="foreshadow-top"><GitBranch /><Badge variant={item.status === "seeded" ? "default" : "outline"}>{item.status === "seeded" ? "설치됨" : item.status === "developing" ? "발전 중" : "예정"}</Badge></div><h3>{item.label}</h3><p>{item.note}</p><Button variant="outline" disabled={busy} onClick={() => setForeshadowDraft({ ...item })} aria-label={item.label + " 복선 편집"}><Pencil />편집</Button><div className="payoff-line"><span>{item.seedEpisode}화 설치</span><i /><span>{item.payoffEpisode}화 회수</span></div></article>)}
              </div>
              <article className="consistency-report">
                <div className="report-score"><ShieldCheck /><strong>연속성 검사</strong><span>{current.content.issues?.length ? current.content.issues.length + "건" : "양호"}</span></div>
                {(current.content.issues?.length ? current.content.issues : [{ severity: "확인" as const, category: "시간선", title: "검사 대기", evidence: "AI 연속성 검사를 실행하면 원고와 설정을 비교합니다.", suggestion: "집필 후 검사를 실행하세요." }]).slice(0, 4).map((issue, index) => (
                  <div className={"report-item " + (issue.severity === "오류" || issue.severity === "경고" ? "warning" : "")} key={issue.title + index}><CircleAlert /><span><strong>{issue.severity}: {issue.title}</strong><small>{issue.evidence} · {issue.suggestion}</small></span></div>
                ))}
              </article>
              <div className="memory-section">
                <div className="section-title"><div><span>STORY MEMORY</span><h2>원고에서 확정된 기억</h2></div><Badge variant="outline">{current.content.memories?.length ?? 0}개</Badge></div>
                <div className="memory-grid">{(current.content.memories ?? []).map((memory, index) => <article className="memory-card" key={memory.subject + index}><div><Badge variant="outline">{memory.category}</Badge><span>{memory.episode}화 · 신뢰도 {memory.confidence}%</span></div><h3>{memory.subject}</h3><p>{memory.fact}</p><footer>{memory.locked ? "잠긴 설정" : "검토 가능"}</footer></article>)}</div>
              </div>
            </TabsContent>

            <TabsContent value="ideas" className="tab-panel">
              <div className="idea-hero"><div><span>STORY WELL</span><h2>새 사건을 억지로 만들지 않습니다.</h2><p>인물의 욕망, 아직 갚지 않은 대가, 미회수 복선에서 다음 이야기를 길어 올립니다.</p></div><Button className="magic-button" disabled={busy} onClick={addIdea}><WandSparkles />새 소재 길어 올리기</Button></div>
              <div className="idea-grid">{current.content.ideas.map((idea, index) => <article className="idea-card" key={idea.title + index}><div><Badge variant="outline">{idea.energy}</Badge><span>{idea.span}</span></div><h3>{idea.title}</h3><p>{idea.reason}</p><footer><span>원천</span><strong>{idea.source}</strong><button aria-label={idea.title + " 적용"} disabled={busy} onClick={() => applyIdea(idea)}><ChevronRight /></button></footer></article>)}</div>
            </TabsContent>

            <TabsContent value="versions" className="tab-panel">
              <div className="section-title"><div><span>GENERATION HISTORY</span><h2>AI 생성 버전</h2></div><Badge variant="outline">최근 {versions.length}개</Badge></div>
              <div className="version-list">
                {versions.length ? versions.map((version) => {
                  const labels = { plan: "전체 설계", episode: "회차 원고", rewrite: "원고 다듬기", analyze: "연속성 검사", ideas: "소재 제안" };
                  return <article className="version-row" key={version.id}><span className="version-icon"><Clock3 /></span><div><Badge variant="outline">{labels[version.action]}</Badge><h3>{version.inputSummary || current.title}</h3><p>{version.model} · {new Date(version.createdAt).toLocaleString("ko-KR")}</p></div><Button variant="outline" disabled={busy} onClick={() => restoreVersion(version)}><RotateCcw />복원</Button></article>;
                }) : <div className="version-empty"><Clock3 /><h3>아직 저장된 AI 버전이 없습니다</h3><p>AI로 설계하거나 원고를 생성하면 이전 결과가 자동으로 보관됩니다.</p></div>}
              </div>
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
        <DialogContent className="project-dialog sm:max-w-lg" onInteractOutside={(event) => { if (deleting) event.preventDefault(); }}>
          <DialogHeader><DialogTitle>이 작품을 삭제할까요?</DialogTitle><DialogDescription><strong>{current.title}</strong>의 작품 설정, 모든 회차 원고와 AI 생성 기록을 함께 삭제합니다. 삭제한 내용은 복구할 수 없습니다.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={deleting}>유지하기</Button><Button variant="destructive" onClick={deleteCurrentProject} disabled={deleting}>{deleting ? <LoaderCircle className="animate-spin" /> : <Trash2 />}{deleting ? "삭제 중…" : "작품 삭제"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reloadOpen} onOpenChange={(open) => { if (!reloading) setReloadOpen(open); }}>
        <DialogContent className="project-dialog sm:max-w-lg">
          <DialogHeader><DialogTitle>저장된 내용으로 다시 불러올까요?</DialogTitle><DialogDescription>저장하지 않은 원고와 아직 적용하지 않은 수정안은 사라집니다. 진행 중인 AI 작업은 취소됩니다.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="ghost" onClick={() => setReloadOpen(false)} disabled={reloading}>계속 작성하기</Button><Button onClick={reloadWorkspace} disabled={reloading || saving || deleting}>{reloading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}다시 불러오기</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(foreshadowDraft)} onOpenChange={open => { if (!open && !busy) setForeshadowDraft(null); }}>
        <DialogContent className="project-dialog character-editor-dialog sm:max-w-2xl" showCloseButton={!busy}>
          <form onSubmit={event => { event.preventDefault(); void saveForeshadow(); }}>
            <DialogHeader><DialogTitle>복선 편집</DialogTitle><DialogDescription>설치할 단서와 회수할 의미, 회차를 정하고 저장하세요.</DialogDescription></DialogHeader>
            {foreshadowDraft ? <fieldset className="dialog-fields" disabled={busy}>
              <label><span>복선 이름</span><Input required value={foreshadowDraft.label} onChange={event => setForeshadowDraft({ ...foreshadowDraft, label: event.target.value })} /></label>
              <div className="character-editor-grid">
                <label><span>설치 회차</span><Input type="number" min={1} max={current.targetEpisodes} required value={foreshadowDraft.seedEpisode} onChange={event => setForeshadowDraft({ ...foreshadowDraft, seedEpisode: Number(event.target.value) })} /></label>
                <label><span>회수 회차</span><Input type="number" min={foreshadowDraft.seedEpisode} max={current.targetEpisodes} required value={foreshadowDraft.payoffEpisode} onChange={event => setForeshadowDraft({ ...foreshadowDraft, payoffEpisode: Number(event.target.value) })} /></label>
              </div>
              <label><span>상태</span><NativeSelect value={foreshadowDraft.status} onChange={event => setForeshadowDraft({ ...foreshadowDraft, status: event.target.value as Foreshadow["status"] })}><NativeSelectOption value="planned">예정</NativeSelectOption><NativeSelectOption value="seeded">설치됨</NativeSelectOption><NativeSelectOption value="developing">발전 중</NativeSelectOption></NativeSelect></label>
              <label><span>설치 장면과 회수 의미</span><Textarea value={foreshadowDraft.note} onChange={event => setForeshadowDraft({ ...foreshadowDraft, note: event.target.value })} /></label>
            </fieldset> : null}
            <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => setForeshadowDraft(null)}>취소</Button><Button type="submit" disabled={busy}><Save />복선 저장</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {characterEditor ? <CharacterEditorDialog key={characterEditor.projectId + ":" + characterEditor.draft.id} draft={characterEditor.draft} originalName={characterEditor.original?.name} isNew={!characterEditor.original} busy={busy}
        onChange={draft => setCharacterEditor(editor => editor ? { ...editor, draft } : null)} onClose={() => setCharacterEditor(null)} onSave={saveCharacter} onDelete={deleteCharacter} /> : null}

      <Dialog open={dialogOpen} onOpenChange={open => { if (!busy) setDialogOpen(open); }}>
        <DialogContent className="project-dialog new-project-dialog sm:max-w-2xl" showCloseButton={!busy}>
          <form onSubmit={submitProject}>
            <DialogHeader><div className="dialog-icon"><BookOpenText /></div><DialogTitle>새 이야기의 씨앗</DialogTitle><DialogDescription>제목과 시놉시스를 바탕으로 AI가 인물, 세계관, 전체 회차와 복선을 새로 설계합니다. 회차가 많으면 몇 분 걸릴 수 있으며 진행 상황을 표시합니다.</DialogDescription></DialogHeader>
            <fieldset className="dialog-fields" disabled={busy}>
              <label><span>임시 제목</span><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="예: 달빛 아래 마지막 편집자" autoFocus /></label>
              <label><span>간단한 시놉시스</span><Textarea value={form.synopsis} onChange={(event) => setForm({ ...form, synopsis: event.target.value })} placeholder="주인공은 누구이며, 무엇을 원하고, 어떤 문제와 마주합니까?" className="min-h-32" /><small>{form.synopsis.length}자 · 5~20줄을 권장합니다</small></label>
              <div className="dialog-field-grid project-setup-grid">
                <label><span>장르</span><NativeSelect value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })}>{genres.map((genre) => <NativeSelectOption value={genre} key={genre}>{genre}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>작품 톤</span><NativeSelect value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })}>{tones.map((tone) => <NativeSelectOption value={tone} key={tone}>{tone}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>목표 회차</span><Input type="number" min={12} max={200} value={form.targetEpisodes} onChange={(event) => setForm({ ...form, targetEpisodes: Number(event.target.value) })} /></label>
                <label><span>회차당 목표 글자 수</span><Input type="number" inputMode="numeric" min={1} max={MAX_TARGET_CHARACTERS} step={1} value={form.targetCharacters ?? ""} placeholder={String(DEFAULT_TARGET_CHARACTERS)} onChange={event => setForm({ ...form, targetCharacters: event.target.value === "" ? undefined : Number(event.target.value) })} /><small>공백 포함 · 기본 5,000자. 모든 회차에 적용되며 나중에 각 회차에서 바꿀 수 있습니다.</small></label>
              </div>
            </fieldset>
            <DialogFooter><Button type="button" variant="ghost" disabled={busy} onClick={() => setDialogOpen(false)}>취소</Button><Button type="submit" className="magic-button" disabled={busy}><WandSparkles />{saving ? "설계하는 중…" : "전체 이야기 설계"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="manual-dialog sm:max-w-4xl">
          <DialogHeader>
            <div className="dialog-icon"><BookOpenText /></div>
            <DialogTitle>StoryWell 사용자매뉴얼</DialogTitle>
            <DialogDescription>작품 설계부터 원고 저장과 내보내기까지, 이 순서대로 사용해 보세요.</DialogDescription>
          </DialogHeader>
          <div className="manual-layout">
            <nav className="manual-toc" aria-label="매뉴얼 목차">
              <a href="#manual-start">1. 시작하기</a>
              <a href="#manual-plan">2. 전체 설계</a>
              <a href="#manual-write">3. 회차 집필</a>
              <a href="#manual-ai">4. AI 조력자</a>
              <a href="#manual-continuity">5. 복선과 연속성</a>
              <a href="#manual-save">6. 저장·내보내기</a>
              <a href="#manual-controls">7. 삭제·취소·다시 불러오기</a>
              <a href="#manual-tips">8. 작업 팁</a>
            </nav>
            <div className="manual-content">
              <section id="manual-start"><h3>1. 시작하기</h3><p><strong>새 작품 설계</strong>를 눌러 제목, 시놉시스, 장르, 톤, 목표 회차와 <strong>회차당 목표 글자 수</strong>를 입력합니다. 입력한 글자 수는 모든 회차의 초기 목표가 되며, 이후 회차별로 바꿀 수 있습니다. 생성 버튼을 누르면 실제 AI 설계가 시작됩니다. 인물·세계관을 먼저 만든 뒤 최대 20회차씩 나누어 구성하므로 몇 분 걸릴 수 있습니다. 상단에서 진행 상황을 확인하거나 취소할 수 있습니다. 실패하거나 취소해도 제목과 시놉시스는 보관함에 남아 다시 설계할 수 있습니다. 짧은 시놉시스에는 주인공, 원하는 것, 가장 큰 장애물을 담으면 더 선명한 설계가 만들어집니다.</p></section>
              <section id="manual-plan"><h3>2. 전체 설계 읽기</h3><p>첫 화면의 <strong>전체 설계</strong> 탭에서 로그라인, 핵심 질문, 세계관 규칙과 12단계 이야기 지도를 확인합니다. 지도에서 원하는 구간을 누르면 해당 회차가 선택됩니다.</p><p><strong>캐릭터</strong> 탭의 <strong>편집</strong> 버튼에서 이름, 역할, 인물 유형, 욕망, 두려움, 비밀, 말투, 현재 상태와 색상을 수정하고 <strong>인물 저장</strong>으로 확정합니다. <strong>인물 추가</strong>도 같은 입력창을 사용하며, 편집창의 <strong>인물 삭제</strong>는 확인 후 카드만 삭제합니다. 취소하면 입력 전 상태를 유지하고, 기존 원고의 이름과 문장은 자동 변경하지 않습니다.</p><p>캐릭터 탭에서는 욕망·두려움·비밀·말투를, <strong>회차</strong> 탭에서는 각 화의 사건과 감정, 마지막 훅을 살펴볼 수 있습니다.</p></section>
              <section id="manual-write"><h3>3. 회차 집필하기</h3><p><strong>집필</strong> 탭으로 이동한 뒤 왼쪽의 회차 번호를 고릅니다. 상단의 ‘이번 화 목표’와 ‘마지막 훅’을 참고해 가운데 원고 칸에 직접 작성하세요. 원고는 저장하기 전에도 화면에서 계속 편집할 수 있습니다.</p><p><strong>목표 글자 수</strong>에 각 회차의 분량을 입력하세요. 회차 목록에서도 한 장씩 설정할 수 있으며, 집필 화면에서 현재 글자 수와 달성률을 확인합니다. 공백 포함 1~20,000자이며 비워 두면 기본 5,000자를 사용합니다. <strong>저장</strong> 또는 <strong>원고 저장</strong>을 누르면 목표도 함께 저장됩니다. AI 집필은 해당 목표를 참고하며, 전체 설계를 다시 만들거나 복원해도 회차별 목표를 유지합니다.</p><p>원고가 마무리되면 <strong>완료 표시</strong>를 누르고 <strong>원고 저장</strong>으로 확정합니다. 저장하면 해당 회차의 글자 수와 상태가 작품에 반영됩니다.</p></section>
              <section id="manual-ai"><h3>4. AI 조력자 활용하기</h3><p>AI가 연결된 상태라면 <strong>AI로 전체 설계</strong>로 작품 구조를 다시 제안받거나, 집필 탭에서 <strong>AI로 이번 화 집필</strong>을 선택할 수 있습니다.</p><p>문단을 드래그한 뒤 수정 요청을 누르면 선택한 부분만 다듬습니다. 선택하지 않으면 회차 전체를 대상으로 합니다. 집필과 수정 중에는 생성 중인 문장이 화면에 나타납니다. 끝까지 완료된 결과만 저장됩니다. 제안은 비교 창에서 확인하며, <strong>수정안 적용</strong>을 눌렀을 때만 원고에 반영됩니다.</p></section>
              <section id="manual-continuity"><h3>5. 복선과 연속성 관리</h3><p><strong>복선</strong> 탭에서 설치 회차와 회수 회차를 확인하고, 필요한 복선을 추가합니다. 복선 등록 또는 카드의 편집 버튼에서 이름·설치 회차·회수 회차·상태·메모를 입력하고 저장합니다. <strong>AI 연속성 검사</strong>는 현재 원고와 설정을 비교해 시간선, 인물 설정, 미회수 단서를 점검합니다.</p><p>‘원고에서 확정된 기억’은 이후 집필 때 참조할 사실입니다. 중요한 설정은 직접 다시 확인하고, 작품의 기준과 다르면 원고 또는 설정을 수정하세요.</p></section>
              <section id="manual-save"><h3>6. 저장과 내보내기</h3><p>작업 중에는 상단 <strong>저장</strong> 버튼으로 작품 설정과 원고를 보관합니다. 상단 <strong>내보내기</strong>에서는 현재 회차 또는 전체 원고를 TXT로, 작품 설계를 포함한 원고를 Markdown으로, 전체 백업을 JSON으로 받을 수 있습니다.</p><p>외부에 공유하거나 큰 수정 전에는 JSON 백업을 한 번 내려받아 두는 것을 권합니다.</p></section>
              <section id="manual-controls"><h3>7. 삭제·취소·다시 불러오기</h3><p>삭제할 작품을 보관함에서 선택하고 <strong>작품 삭제</strong>를 누르세요. 확인창에서 삭제하면 해당 작품의 설정, 원고와 AI 기록이 함께 삭제됩니다. 샘플 작품은 삭제 대상이 아닙니다.</p><p>AI 작업 중에는 화면 위쪽의 <strong>작업 취소</strong>로 요청을 중단할 수 있습니다. 취소한 결과는 원고에 적용되지 않습니다. 다시 시도하려면 원하는 AI 작업 버튼을 누르세요.</p><p><strong>다시 불러오기</strong>는 AI 작업을 취소하고 마지막으로 저장된 작품을 불러옵니다. 저장하지 않은 변경사항이 있으면 먼저 확인하며, 불러오기에 실패하면 현재 원고를 유지합니다.</p></section>
              <section id="manual-tips"><h3>8. 매끄러운 작업을 위한 팁</h3><ul><li>소재 우물의 새 소재 버튼은 현재 작품으로 AI 제안을 만듭니다. 소재 카드의 화살표를 누르면 선택된 회차의 사건에 후보로 저장되어 집필 시 참고됩니다.</li><li>새 회차를 쓰기 전, 이전 화의 마지막 훅과 인물의 현재 상태를 먼저 확인하세요.</li><li>AI 결과는 초안으로 보고, 작품의 목소리와 설정에 맞게 직접 다듬으세요.</li><li>큰 변경 뒤에는 저장하고 연속성 검사를 실행해 설정 충돌을 일찍 찾으세요.</li></ul></section>
            </div>
          </div>
          <DialogFooter><Button onClick={() => setManualOpen(false)}><Check />매뉴얼 닫기</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(rewriteProposal)} onOpenChange={(open) => !open && setRewriteProposal(null)}>
        <DialogContent className="rewrite-dialog sm:max-w-5xl">
          <DialogHeader><DialogTitle>AI 정밀 편집 비교</DialogTitle><DialogDescription>{rewriteProposal?.wholeEpisode ? active.number + "화 전체 수정안" : "선택한 문단만 수정한 제안"}입니다. 원문은 그대로 보존되며, 적용을 눌러야 바뀝니다.</DialogDescription></DialogHeader>
          <div className="rewrite-compare">
            <section><span>원문</span><div>{rewriteProposal?.original}</div></section>
            <section><span>수정안</span><div>{rewriteProposal?.revised}</div></section>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setRewriteProposal(null)}>원문 유지</Button><Button onClick={applyRewrite} disabled={busy}><Check />수정안 적용</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
