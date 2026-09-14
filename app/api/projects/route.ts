import { env } from "@/lib/server/runtime";
import { getContentTargetError } from "@/lib/episode-target";
import { getContentCharacterError } from "@/lib/character-editor";
import { getReferenceError } from "@/lib/story-references";

function ownerId(request: Request) {
  return request.headers.get("oai-authenticated-user-id") ?? "private-owner";
}

function database() {
  const database = env.DB;
  if (!database) throw new Error("작품 저장소가 아직 준비되지 않았습니다.");
  return database;
}

function parseProject(row: Record<string, unknown>) {
  return {
    id: row.id,
    title: row.title,
    synopsis: row.synopsis,
    genre: row.genre,
    tone: row.tone,
    targetEpisodes: row.target_episodes,
    status: row.status,
    content: JSON.parse(String(row.content)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "저장소에 연결하지 못했습니다.";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const result = await database().prepare(
      "SELECT id, title, synopsis, genre, tone, target_episodes, status, content, created_at, updated_at FROM story_projects WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 50"
    )
      .bind(ownerId(request))
      .all<Record<string, unknown>>();
    return Response.json({ projects: result.results.map(parseProject) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const characterError = getReferenceError(payload.content) ?? getContentCharacterError(payload.content);
    if (characterError) return Response.json({ error: characterError }, { status: 400 });
    const targetError = getContentTargetError(payload.content);
    if (targetError) return Response.json({ error: targetError }, { status: 400 });
    const title = String(payload.title ?? "").trim();
    const synopsis = String(payload.synopsis ?? "").trim();
    if (!title || !synopsis) {
      return Response.json({ error: "제목과 시놉시스는 필수입니다." }, { status: 400 });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const project = {
      id,
      title,
      synopsis,
      genre: String(payload.genre ?? "장르 미정"),
      tone: String(payload.tone ?? "균형감 있는"),
      targetEpisodes: Math.max(12, Math.min(200, Number(payload.targetEpisodes) || 80)),
      status: String(payload.status ?? "설계 중"),
      content: payload.content ?? {},
      createdAt: now,
      updatedAt: now,
    };

    await database().prepare(
      "INSERT INTO story_projects (id, owner_id, title, synopsis, genre, tone, target_episodes, status, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
      .bind(
        id,
        ownerId(request),
        project.title,
        project.synopsis,
        project.genre,
        project.tone,
        project.targetEpisodes,
        project.status,
        JSON.stringify(project.content),
        now,
        now
      )
      .run();

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
