import type { Episode, StoryProject } from "@/lib/story-engine";

export const DEFAULT_TARGET_CHARACTERS = 5000;
export const MAX_TARGET_CHARACTERS = 20000;

export function isValidTargetCharacters(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= MAX_TARGET_CHARACTERS;
}

export function getTargetCharacters(episode?: { targetCharacters?: unknown }): number {
  return isValidTargetCharacters(episode?.targetCharacters) ? episode.targetCharacters : DEFAULT_TARGET_CHARACTERS;
}

export function getEpisodeTargetError(episode?: { number?: unknown; targetCharacters?: unknown }): string | null {
  if (episode?.targetCharacters === undefined || isValidTargetCharacters(episode.targetCharacters)) return null;
  return String(episode.number ?? "") + "화 목표 글자 수는 1~20,000 사이의 정수로 입력해 주세요.";
}

export function getContentTargetError(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const episodes = (content as { episodes?: unknown }).episodes;
  if (!Array.isArray(episodes)) return null;
  for (const episode of episodes) {
    if (!episode || typeof episode !== "object") continue;
    const error = getEpisodeTargetError(episode);
    if (error) return error;
  }
  return null;
}

export function withEpisodeTargets(episodes: Episode[], previous: Episode[]): Episode[] {
  const targets = new Map(previous.map(episode => [episode.number, getTargetCharacters(episode)]));
  return episodes.map(episode => ({ ...episode, targetCharacters: targets.get(episode.number) ?? DEFAULT_TARGET_CHARACTERS }));
}

export function setEpisodeTarget(project: StoryProject, number: number, value: number | undefined): StoryProject {
  return { ...project, content: { ...project.content,
    episodes: project.content.episodes.map(episode => episode.number === number ? { ...episode, targetCharacters: value } : episode),
  } };
}

export function episodeOutputTokenBudget(episode?: { targetCharacters?: unknown }): number {
  return Math.max(9000, getTargetCharacters(episode) * 2 + 1000);
}
