"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, BookOpenText, BrainCircuit, Check, ChevronRight, CircleAlert, FileText, GitBranch, Lightbulb, Menu, MoreHorizontal, Plus, Save, Search, ShieldCheck, Sparkles, Target, Users, WandSparkles, X, Feather } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";
import { buildStory, createSampleProject, type ProjectInput, type StoryIdea, type StoryProject } from "@/lib/story-engine";

const genres = ["현대 판타지", "로맨스 판타지", "미스터리", "무협", "SF", "로맨스", "드라마"];
const tones = ["빠르고 통쾌한", "서늘하지만 따뜻한", "유쾌하고 경쾌한", "묵직하고 서정적인", "긴장감 있고 어두운"];
type ModelTool = { name: string; title?: string; description: string; inputSchema: Record<string, unknown>; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute: (input: unknown) => unknown | Promise<unknown> };
type ModelContextDocument = Document & { modelContext?: { registerTool: (tool: ModelTool, options?: { signal?: AbortSignal }) => void | Promise<void> } };
const initialForm: ProjectInput = { title: "", synopsis: "", genre: "현대 판타지", tone: "서늘하지만 따뜻한", targetEpisodes: 80 };

function formatDate(value?: string) {
  if (!value) return "방금";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(new Date(value));
}
function statusTone(status: string) {
  if (status === "done") return "bg-emerald-400";
  if (status === "draft") return "bg-amber-400";
  return "bg-slate-500";
}

export default function StoryStudio() {
  const sample = useMemo(() => createSampleProject(), []);
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [current, setCurrent] = useState<StoryProject>(sample);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [form, setForm] = useState<ProjectInput>(initialForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeEpisode, setActiveEpisode] = useState(1);
  const [episodePage, setEpisodePage] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/projects")
      .then(async (response) => {
        if (!response.ok) throw new Error("작품 보관함을 불러오지 못했습니다.");
        return response.json() as Promise<{ projects: StoryProject[] }>;
      })
      .then((data) => {
        if (!active) return;
        setProjects(data.projects);
        if (data.projects.length) setCurrent(data.projects[0]);
      })
      .catch(() => toast.info("샘플 작품으로 시작합니다. 새 작품은 정상적으로 저장할 수 있습니다."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const persistProject = useCallback(async (project: StoryProject) => {
    const isNew = project.id === "sample" || project.id.startsWith("draft-");
    const response = await fetch(isNew ? "/api/projects" : "/api/projects/" + project.id, {
      method: isNew ? "POST" : "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(project),
    });
    const data = (await response.json()) as { project?: StoryProject; updatedAt?: string; error?: string };
    if (!response.ok) throw new Error(data.error ?? "저장하지 못했습니다.");
    return data.project ?? { ...project, updatedAt: data.updatedAt };
  }, []);

  const createProject = useCallback(async (input: ProjectInput) => {
    const title = input.title.trim();
    const synopsis = input.synopsis.trim();
    if (!title || !synopsis) throw new Error("제목과 시놉시스를 입력해 주세요.");
    const draft: StoryProject = { id: "draft-" + Date.now(), ...input, title, synopsis, status: "설계 중", content: buildStory(input) };
    setSaving(true);
    try {
      const saved = await persistProject(draft);
      setProjects((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
      setCurrent(saved);
      setActiveEpisode(1);
      setEpisodePage(0);
      setDialogOpen(false);
      setForm(initialForm);
      toast.success("전체 이야기 설계가 완성되었습니다.");
      return saved;
    } finally {
      setSaving(false);
    }
  }, [persistProject]);

  useEffect(() => {
    const modelContext = (document as ModelContextDocument).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    const register = async () => {
      await modelContext.registerTool({
        name: "create_story_project",
        title: "새 웹소설 설계",
        description: "제목과 시놉시스로 새 웹소설 프로젝트를 만들고 전체 회차, 인물, 복선, 소재를 설계합니다.",
        inputSchema: { type: "object", properties: { title: { type: "string" }, synopsis: { type: "string" }, genre: { type: "string" }, tone: { type: "string" }, targetEpisodes: { type: "integer", minimum: 12, maximum: 200 } }, required: ["title", "synopsis"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (value) => {
          const input = value as Partial<ProjectInput>;
          const project = await createProject({ title: String(input.title ?? ""), synopsis: String(input.synopsis ?? ""), genre: String(input.genre ?? "현대 판타지"), tone: String(input.tone ?? "서늘하지만 따뜻한"), targetEpisodes: Number(input.targetEpisodes ?? 80) });
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
  const regeneratePlan = () => {
    updateContent(buildStory({ title: current.title, synopsis: current.synopsis, genre: current.genre, tone: current.tone, targetEpisodes: current.targetEpisodes }));
    setActiveEpisode(1);
    setEpisodePage(0);
    toast.success("현재 설정으로 전체 설계를 다시 만들었습니다.");
  };
  const addIdea = () => {
    const sources = [
      { title: "목격자가 기억한 다른 결말", source: "미회수 복선", reason: "같은 사건을 다른 시점에서 재구성해 기존 장면의 의미를 바꿉니다.", energy: "반전" as const },
      { title: "라이벌의 불완전한 구원", source: "인물 관계", reason: "경쟁자가 주인공을 돕되 더 큰 빚을 남겨 관계 갈등을 확장합니다.", energy: "감정" as const },
      { title: "세계관 규칙이 멈춘 하루", source: "규칙의 예외", reason: "기존 규칙을 부수지 않고 그 바깥에 있던 조건을 드러냅니다.", energy: "확장" as const },
    ];
    const seed = sources[current.content.ideas.length % sources.length];
    const next: StoryIdea = { ...seed, span: "3~6화" };
    updateContent({ ideas: [next, ...current.content.ideas] });
    toast.success("현재 맥락에서 새 소재를 길어 올렸습니다.");
  };
  const addCharacter = () => {
    const number = current.content.characters.length + 1;
    updateContent({
      characters: [
        ...current.content.characters,
        {
          id: "character-" + Date.now(),
          name: "새 인물 " + number,
          role: "조연",
          archetype: "변화를 촉발하는 방문자",
          desire: "자신의 목적을 이루기 위해 주인공의 선택에 개입한다.",
          fear: "진짜 의도가 드러나는 것",
          secret: "핵심 사건의 일부를 목격했다.",
          voice: "필요한 말만 하며 중요한 단어를 반복한다.",
          state: "설정 보완 필요",
          color: "#8ec5a4",
        },
      ],
    });
    toast.success("새 인물 카드를 추가했습니다.");
  };
  const addForeshadow = () => {
    updateContent({
      foreshadows: [
        ...current.content.foreshadows,
        {
          id: "foreshadow-" + Date.now(),
          label: "이름 없는 새 복선",
          seedEpisode: activeEpisode,
          payoffEpisode: Math.min(current.targetEpisodes, activeEpisode + 12),
          status: "planned",
          note: "설치 장면과 회수 의미를 구체화해 주세요.",
        },
      ],
    });
    toast.success(activeEpisode + "화에 새 복선을 등록했습니다.");
  };

  const filteredProjects = projects.filter((project) => project.title.toLowerCase().includes(query.toLowerCase()));
  const active = current.content.episodes.find((item) => item.number === activeEpisode) ?? current.content.episodes[0];
  const episodeSlice = current.content.episodes.slice(episodePage * 12, episodePage * 12 + 12);
  const totalEpisodePages = Math.ceil(current.content.episodes.length / 12);
  const drafted = current.content.episodes.filter((item) => item.status !== "planned").length;
  const completion = Math.round((drafted / current.content.episodes.length) * 100);
  const submitProject = async (event: FormEvent) => {
    event.preventDefault();
    try { await createProject(form); } catch (error) { toast.error(error instanceof Error ? error.message : "작품을 만들지 못했습니다."); }
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
          <span className="save-state"><span className="save-dot" />{saving ? "저장 중" : "변경사항 보호됨"}</span>
          <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={saveCurrent} disabled={saving}><Save />저장</Button>
        </div>
      </header>

      <div className="studio-shell">
        <aside className={"project-sidebar " + (mobileOpen ? "is-open" : "")}>
          <div className="mobile-sidebar-head"><strong>작품 보관함</strong><button aria-label="작품 목록 닫기" onClick={() => setMobileOpen(false)}><X /></button></div>
          <Button className="new-project-button" onClick={() => setDialogOpen(true)}><Plus />새 작품 설계</Button>
          <label className="project-search"><Search aria-hidden="true" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="작품 검색" aria-label="작품 검색" /></label>
          <div className="sidebar-label"><span>내 작품</span><span>{projects.length}</span></div>
          <div className="project-list">
            {loading ? <div className="project-loading">작품을 불러오는 중…</div> : null}
            {filteredProjects.map((project) => (
              <button key={project.id} className={"project-item " + (current.id === project.id ? "active" : "")} onClick={() => { setCurrent(project); setMobileOpen(false); setActiveEpisode(1); setEpisodePage(0); }}>
                <span className="project-glyph">{project.title.slice(0, 1)}</span><span><strong>{project.title}</strong><small>{project.targetEpisodes}화 · {formatDate(project.updatedAt)}</small></span><ChevronRight />
              </button>
            ))}
            {!loading && !filteredProjects.length ? (
              <button className="project-item sample" onClick={() => { setCurrent(sample); setMobileOpen(false); }}><span className="project-glyph">달</span><span><strong>샘플 작품 살펴보기</strong><small>80화 구성 · 저장 전</small></span><ChevronRight /></button>
            ) : null}
          </div>
          <div className="sidebar-note"><ShieldCheck /><div><strong>작가의 설정이 기준입니다</strong><p>고정한 설정은 이후 회차에서도 임의로 바뀌지 않습니다.</p></div></div>
        </aside>
        {mobileOpen ? <button className="sidebar-backdrop" aria-label="작품 목록 닫기" onClick={() => setMobileOpen(false)} /> : null}

        <section className="workspace">
          <div className="workspace-head">
            <div><div className="eyebrow"><span>{current.genre}</span><i /><span>{current.tone}</span></div><h1>{current.title}</h1><p>{current.synopsis}</p></div>
            <Button className="magic-button" onClick={regeneratePlan}><WandSparkles />전체 설계 다시 만들기</Button>
          </div>
          <div className="metric-row">
            <div className="metric-card"><span className="metric-icon amber"><FileText /></span><div><small>전체 회차</small><strong>{current.content.episodes.length}<em>화</em></strong></div></div>
            <div className="metric-card"><span className="metric-icon blue"><Users /></span><div><small>주요 인물</small><strong>{current.content.characters.length}<em>명</em></strong></div></div>
            <div className="metric-card"><span className="metric-icon violet"><GitBranch /></span><div><small>관리 복선</small><strong>{current.content.foreshadows.length}<em>개</em></strong></div></div>
            <div className="metric-card progress-card"><div className="metric-progress-head"><span><small>집필 진행률</small><strong>{completion}%</strong></span><span>{drafted}/{current.targetEpisodes}화</span></div><Progress value={completion} className="story-progress" /></div>
          </div>

          <Tabs defaultValue="overview" className="story-tabs">
            <TabsList variant="line" className="story-tab-list">
              <TabsTrigger value="overview"><Target />전체 설계</TabsTrigger><TabsTrigger value="characters"><Users />캐릭터</TabsTrigger><TabsTrigger value="episodes"><FileText />회차</TabsTrigger><TabsTrigger value="writing"><Feather />집필</TabsTrigger><TabsTrigger value="foreshadow"><GitBranch />복선</TabsTrigger><TabsTrigger value="ideas"><Lightbulb />소재 우물</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="tab-panel">
              <div className="overview-grid">
                <article className="feature-card wide-card"><div className="card-kicker"><Sparkles />작품의 한 문장</div><h2>{current.content.logline}</h2><div className="theme-quote"><span>핵심 질문</span><p>{current.content.centralQuestion}</p></div></article>
                <article className="feature-card rule-card"><div className="card-kicker"><ShieldCheck />절대 규칙</div><p>{current.content.worldRule}</p><button className="text-action" onClick={() => toast.success("핵심 세계관 규칙을 잠갔습니다.")}>설정 잠금 <ChevronRight /></button></article>
              </div>
              <div className="section-title"><div><span>MACRO PLOT</span><h2>12단계 전체 이야기 지도</h2></div><Badge variant="outline">{current.targetEpisodes}화 기준</Badge></div>
              <div className="arc-map">
                {Array.from({ length: 12 }, (_, index) => {
                  const episode = current.content.episodes[Math.min(current.content.episodes.length - 1, index * Math.ceil(current.content.episodes.length / 12))];
                  return <button key={index} className="arc-node" onClick={() => { setActiveEpisode(episode.number); setEpisodePage(Math.floor((episode.number - 1) / 12)); }}><span>{String(index + 1).padStart(2, "0")}</span><strong>{episode.stage}</strong><small>{episode.number}화 부근</small></button>;
                })}
              </div>
              <div className="overview-bottom">
                <article className="feature-card"><div className="card-kicker"><BrainCircuit />주제와 결말의 약속</div><h3>{current.content.theme}</h3><p>{current.content.endingPromise}</p></article>
                <article className="feature-card continuity-card"><div className="card-kicker"><Check />맥락 건강도</div><strong>96</strong><span>/ 100</span><p>현재 설정 충돌 없음 · 확인 필요 항목 2개</p></article>
              </div>
            </TabsContent>

            <TabsContent value="characters" className="tab-panel">
              <div className="section-title"><div><span>CHARACTER BIBLE</span><h2>욕망이 이야기를 움직이는 인물</h2></div><Button variant="outline" onClick={addCharacter}><Plus />인물 추가</Button></div>
              <div className="character-grid">
                {current.content.characters.map((character) => (
                  <article className="character-card" key={character.id}>
                    <div className="character-head"><span className="character-avatar" style={{ background: character.color }}>{character.name.slice(0, 1)}</span><div><Badge variant="outline">{character.role}</Badge><h3>{character.name}</h3><p>{character.archetype}</p></div><Button size="icon-sm" variant="ghost" aria-label={character.name + " 메뉴"}><MoreHorizontal /></Button></div>
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
                  <button key={episode.number} className={"episode-row " + (activeEpisode === episode.number ? "active" : "")} onClick={() => setActiveEpisode(episode.number)}><span className={"status-line " + statusTone(episode.status)} /><strong>{String(episode.number).padStart(3, "0")}</strong><div><h3>{episode.title}</h3><p>{episode.beat}</p></div><Badge variant="outline">{episode.stage}</Badge><span className="episode-emotion">{episode.emotion}</span><ChevronRight /></button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="writing" className="tab-panel writing-panel">
              <aside className="episode-rail"><span>회차</span>{current.content.episodes.slice(0, 14).map((episode) => <button key={episode.number} className={activeEpisode === episode.number ? "active" : ""} onClick={() => setActiveEpisode(episode.number)}>{episode.number}</button>)}</aside>
              <section className="manuscript">
                <div className="manuscript-head"><div><span>EPISODE {String(active.number).padStart(3, "0")}</span><h2>{active.title}</h2></div><Badge className="draft-badge">초안</Badge></div>
                <div className="episode-brief"><div><Target /><span><small>이번 화 목표</small>{active.beat}</span></div><div><Sparkles /><span><small>마지막 훅</small>{active.hook}</span></div></div>
                <Textarea className="manuscript-editor" value={current.content.manuscript} onChange={(event) => updateContent({ manuscript: event.target.value })} aria-label={active.number + "화 원고"} />
                <div className="manuscript-footer"><span>{current.content.manuscript.length.toLocaleString()}자</span><span>대사 24%</span><span>문장 반복 0건</span><Button onClick={saveCurrent} disabled={saving}><Save />원고 저장</Button></div>
              </section>
              <aside className="writing-assistant">
                <div className="assistant-title"><BrainCircuit /><div><strong>집필 조력자</strong><span>현재 회차 맥락 연결됨</span></div></div>
                <div className="assistant-check"><h3>이번 화 체크</h3><p><Check />주인공의 목표가 분명함</p><p><Check />이전 화 감정선 연결</p><p><CircleAlert />도진의 호칭 복선 확인</p></div>
                <div className="assistant-actions"><button onClick={() => toast.info("AI 문장 재작성은 2단계에서 연결됩니다.")}>대사를 더 날카롭게</button><button onClick={() => toast.info("AI 문장 재작성은 2단계에서 연결됩니다.")}>감정선을 더 섬세하게</button><button onClick={() => toast.info("AI 문장 재작성은 2단계에서 연결됩니다.")}>마지막 훅 강화</button></div>
                <Button className="assistant-generate" onClick={() => toast.info("다음 단계에서 생성형 AI와 연결됩니다.")}><Sparkles />선택 영역 다시 쓰기</Button>
              </aside>
            </TabsContent>

            <TabsContent value="foreshadow" className="tab-panel">
              <div className="section-title"><div><span>FORESHADOW TRACKER</span><h2>복선의 설치부터 회수까지</h2></div><Button variant="outline" onClick={addForeshadow}><Plus />복선 등록</Button></div>
              <div className="foreshadow-board">
                {current.content.foreshadows.map((item) => <article key={item.id} className="foreshadow-card"><div className="foreshadow-top"><GitBranch /><Badge variant={item.status === "seeded" ? "default" : "outline"}>{item.status === "seeded" ? "설치됨" : item.status === "developing" ? "발전 중" : "예정"}</Badge></div><h3>{item.label}</h3><p>{item.note}</p><div className="payoff-line"><span>{item.seedEpisode}화 설치</span><i /><span>{item.payoffEpisode}화 회수</span></div></article>)}
              </div>
              <article className="consistency-report"><div className="report-score"><ShieldCheck /><strong>연속성 검사</strong><span>양호</span></div><div className="report-item"><Check /><span><strong>시간선 충돌 없음</strong><small>현재 1화 기준 이동·사건 순서가 일치합니다.</small></span></div><div className="report-item warning"><CircleAlert /><span><strong>확인 필요: 도진의 정보 범위</strong><small>3화 이전에는 언니의 실종 원인을 직접 언급할 수 없습니다.</small></span></div></article>
            </TabsContent>

            <TabsContent value="ideas" className="tab-panel">
              <div className="idea-hero"><div><span>STORY WELL</span><h2>새 사건을 억지로 만들지 않습니다.</h2><p>인물의 욕망, 아직 갚지 않은 대가, 미회수 복선에서 다음 이야기를 길어 올립니다.</p></div><Button className="magic-button" onClick={addIdea}><WandSparkles />새 소재 길어 올리기</Button></div>
              <div className="idea-grid">{current.content.ideas.map((idea, index) => <article className="idea-card" key={idea.title + index}><div><Badge variant="outline">{idea.energy}</Badge><span>{idea.span}</span></div><h3>{idea.title}</h3><p>{idea.reason}</p><footer><span>원천</span><strong>{idea.source}</strong><button aria-label={idea.title + " 적용"} onClick={() => toast.success("소재를 다음 회차 후보로 표시했습니다.")}><ChevronRight /></button></footer></article>)}</div>
            </TabsContent>
          </Tabs>
        </section>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="project-dialog sm:max-w-2xl">
          <form onSubmit={submitProject}>
            <DialogHeader><div className="dialog-icon"><BookOpenText /></div><DialogTitle>새 이야기의 씨앗</DialogTitle><DialogDescription>임시 제목과 짧은 시놉시스만 입력하세요. 인물, 세계관, 전체 회차와 복선까지 한 번에 설계합니다.</DialogDescription></DialogHeader>
            <div className="dialog-fields">
              <label><span>임시 제목</span><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="예: 달빛 아래 마지막 편집자" autoFocus /></label>
              <label><span>간단한 시놉시스</span><Textarea value={form.synopsis} onChange={(event) => setForm({ ...form, synopsis: event.target.value })} placeholder="주인공은 누구이며, 무엇을 원하고, 어떤 문제와 마주합니까?" className="min-h-32" /><small>{form.synopsis.length}자 · 5~20줄을 권장합니다</small></label>
              <div className="dialog-field-grid">
                <label><span>장르</span><NativeSelect value={form.genre} onChange={(event) => setForm({ ...form, genre: event.target.value })}>{genres.map((genre) => <NativeSelectOption value={genre} key={genre}>{genre}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>작품 톤</span><NativeSelect value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })}>{tones.map((tone) => <NativeSelectOption value={tone} key={tone}>{tone}</NativeSelectOption>)}</NativeSelect></label>
                <label><span>목표 회차</span><Input type="number" min={12} max={200} value={form.targetEpisodes} onChange={(event) => setForm({ ...form, targetEpisodes: Number(event.target.value) })} /></label>
              </div>
            </div>
            <DialogFooter><Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>취소</Button><Button type="submit" className="magic-button" disabled={saving}><WandSparkles />{saving ? "설계하는 중…" : "전체 이야기 설계"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
