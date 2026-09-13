import type { Character, StoryProject } from "@/lib/story-engine";

export function createCharacterDraft(): Character {
  return { id: "character-" + crypto.randomUUID(), name: "", role: "조연", archetype: "", desire: "", fear: "", secret: "", voice: "", state: "", color: "#8ec5a4" };
}

export function getContentCharacterError(content: unknown): string | null {
  if (!content || typeof content !== "object") return null;
  const characters = (content as { characters?: unknown }).characters;
  if (!Array.isArray(characters)) return null;
  for (const character of characters) {
    if (!character || typeof character !== "object" || typeof character.name !== "string" || !character.name.trim()) {
      return "인물 이름을 입력해 주세요.";
    }
  }
  return null;
}

export function saveCharacterInProject(project: StoryProject, draft: Character, isNew: boolean): StoryProject {
  const error = getContentCharacterError({ characters: [draft] });
  if (error) throw new Error(error);
  const exists = project.content.characters.some(character => character.id === draft.id);
  if (isNew && exists) throw new Error("이미 추가된 인물입니다.");
  if (!isNew && !exists) throw new Error("편집할 인물을 찾지 못했습니다. 작품을 다시 불러와 주세요.");
  const character = { ...draft, name: draft.name.trim() };
  return { ...project, content: { ...project.content,
    characters: isNew ? [...project.content.characters, character] : project.content.characters.map(item => item.id === character.id ? character : item),
  } };
}

export function removeCharacterFromProject(project: StoryProject, id: string): StoryProject {
  if (!project.content.characters.some(character => character.id === id)) throw new Error("삭제할 인물을 찾지 못했습니다.");
  return { ...project, content: { ...project.content, characters: project.content.characters.filter(character => character.id !== id) } };
}
