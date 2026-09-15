import type { StoryContent } from "@/lib/story-engine";

export function getTotalManuscriptCharacters(
  content: Pick<StoryContent, "manuscript" | "episodeDrafts">,
): number {
  const drafts = Object.values(content.episodeDrafts ?? {});
  const draftedCharacters = drafts.reduce((total, draft) => total + draft.body.length, 0);
  const legacyFirstEpisodeCharacters = content.episodeDrafts?.["1"] ? 0 : (content.manuscript?.length ?? 0);
  return draftedCharacters + legacyFirstEpisodeCharacters;
}
