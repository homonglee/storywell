import { createSampleProject, type StoryContent, type StoryProject, type StoryMemory } from "@/lib/story-engine";
import { withEpisodeTargets } from "@/lib/episode-target";

export function isTemplateContent(content: StoryContent) {
  return content.episodes?.[0]?.title === "문이 열린 밤" && content.characters?.some(item => ["lead", "ally", "rival", "antagonist"].includes(item.id));
}

export function planningProject(project: StoryProject): StoryProject {
  if (!isTemplateContent(project.content)) return project;
  const sample = createSampleProject().content;
  const base = project.content;
  const sameCharacter = (character: StoryContent["characters"][number]) => sample.characters.some(seed =>
    (["name", "role", "archetype", "desire", "fear", "secret", "voice", "state"] as const).every(key => character[key] === seed[key]));
  // Omit only unchanged demo material from the AI context. Never mutate stored drafts.
  return { ...project, content: { ...base,
    logline: "", theme: base.theme === sample.theme ? "" : base.theme,
    worldRule: base.worldRule === sample.worldRule && !base.worldRuleLocked ? "" : base.worldRule,
    centralQuestion: base.centralQuestion === sample.centralQuestion ? "" : base.centralQuestion,
    endingPromise: base.endingPromise === sample.endingPromise ? "" : base.endingPromise,
    characters: base.characters.filter(character => !sameCharacter(character)),
    episodes: [], foreshadows: base.foreshadows.filter(item => !sample.foreshadows.some(seed => seed.label === item.label && seed.note === item.note)),
    ideas: [], manuscript: base.manuscript === sample.manuscript ? "" : base.manuscript,
    episodeDrafts: Object.fromEntries(Object.entries(base.episodeDrafts ?? {}).filter(([,draft]) => draft.body !== sample.manuscript)),
    memories: (base.memories ?? []).filter(item => !sample.memories?.some(seed => seed.fact === item.fact)),
    currentSummary: base.currentSummary === sample.currentSummary ? "" : base.currentSummary,
  } };
}

export function mergeAIPlan(base: StoryContent, result: Partial<StoryContent>): StoryContent {
  if (!result.episodes?.length || !result.characters?.length) throw new Error("AI가 완전한 이야기 구조를 반환하지 못했습니다.");
  const palette = ["#f6b44b", "#73c5d8", "#c796ff", "#ff7b72", "#8ec5a4", "#ef91ba"];
  return { ...base, ...result, worldRule: base.worldRuleLocked ? base.worldRule : result.worldRule ?? base.worldRule,
    characters: result.characters.map((character, index) => {
      const previous = base.characters.find(item => item.name === character.name);
      return { ...character, id: previous?.id ?? "character-" + crypto.randomUUID(), color: previous?.color ?? palette[index % palette.length] };
    }),
    episodes: withEpisodeTargets(result.episodes, base.episodes).map(episode => {
      const draft = base.episodeDrafts?.[String(episode.number)];
      const body = draft?.body ?? (episode.number === 1 ? base.manuscript : "");
      return { ...episode, status: body ? draft?.status ?? "draft" : "planned", words: body?.length ?? 0 };
    }),
    foreshadows: (result.foreshadows ?? []).map(item => ({ ...item, id: "foreshadow-" + crypto.randomUUID() })),
    ideas: result.ideas ?? [], manuscript: base.manuscript, episodeDrafts: base.episodeDrafts,
    memories: base.memories, issues: base.issues, currentSummary: base.currentSummary,
  };
}

export function mergeMemories(previous: StoryMemory[], incoming: StoryMemory[]) {
  const merged = [...previous];
  for (const memory of incoming) {
    const index = merged.findIndex(item => item.category === memory.category && item.subject === memory.subject && item.fact === memory.fact);
    if (index < 0) merged.push(memory);
    else if (!merged[index].locked) merged[index] = memory;
  }
  return merged;
}
