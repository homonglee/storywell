import { env } from "@/lib/server/runtime";
import { validProgressId } from "@/lib/server/ai-progress";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!validProgressId(id)) return Response.json({ error: "잘못된 작업 ID입니다." }, { status: 400 });
  const owner = request.headers.get("oai-authenticated-user-id") ?? "private-owner";
  const row = await env.DB?.prepare("SELECT payload FROM story_ai_progress WHERE id = ? AND owner_id = ? AND updated_at >= ?")
    .bind(id, owner, new Date(Date.now() - 86400000).toISOString()).first<{ payload: string }>();
  if (!row) return Response.json({ error: "진행 정보를 기다리고 있습니다." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(JSON.parse(row.payload), { headers: { "Cache-Control": "no-store" } });
}
