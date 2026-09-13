import { env } from "cloudflare:workers";
import { getContentTargetError } from "@/lib/episode-target";

function ownerId(request: Request) {
  return request.headers.get("oai-authenticated-user-id") ?? "private-owner";
}

function database() {
  const database = env.DB;
  if (!database) throw new Error("작품 저장소가 아직 준비되지 않았습니다.");
  return database;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const payload = (await request.json()) as Record<string, unknown>;
    const targetError = getContentTargetError(payload.content);
    if (targetError) return Response.json({ error: targetError }, { status: 400 });
    const now = new Date().toISOString();
    const result = await database().prepare(
      "UPDATE story_projects SET title = ?, synopsis = ?, genre = ?, tone = ?, target_episodes = ?, status = ?, content = ?, updated_at = ? WHERE id = ? AND owner_id = ?"
    )
      .bind(
        String(payload.title ?? "제목 없음"),
        String(payload.synopsis ?? ""),
        String(payload.genre ?? "장르 미정"),
        String(payload.tone ?? "균형감 있는"),
        Math.max(12, Math.min(200, Number(payload.targetEpisodes) || 80)),
        String(payload.status ?? "설계 중"),
        JSON.stringify(payload.content ?? {}),
        now,
        id,
        ownerId(request)
      )
      .run();

    if (!result.meta.changes) {
      return Response.json({ error: "작품을 찾지 못했습니다." }, { status: 404 });
    }
    return Response.json({ ok: true, updatedAt: now });
  } catch (error) {
    const message = error instanceof Error ? error.message : "저장하지 못했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const db = database();
    const owner = ownerId(request);
    const results = await db.batch([
      db.prepare("DELETE FROM story_generations WHERE project_id = ? AND owner_id = ? AND EXISTS (SELECT 1 FROM story_projects WHERE id = ? AND owner_id = ?)")
        .bind(id, owner, id, owner),
      db.prepare("DELETE FROM story_projects WHERE id = ? AND owner_id = ?").bind(id, owner),
    ]);
    if (!results[1].meta.changes) {
      return Response.json({ error: "작품을 찾지 못했습니다." }, { status: 404 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "삭제하지 못했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
