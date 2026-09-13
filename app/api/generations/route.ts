import { env } from "@/lib/server/runtime";

function ownerId(request: Request) {
  return request.headers.get("oai-authenticated-user-id") ?? "private-owner";
}

export async function GET(request: Request) {
  const database = env.DB;
  if (!database) {
    return Response.json({ error: "버전 저장소가 준비되지 않았습니다." }, { status: 503 });
  }
  const projectId = new URL(request.url).searchParams.get("projectId")?.trim();
  if (!projectId) {
    return Response.json({ error: "작품 ID가 필요합니다." }, { status: 400 });
  }
  try {
    const result = await database
      .prepare("SELECT id, action, model, input_summary, output, created_at FROM story_generations WHERE owner_id = ? AND project_id = ? ORDER BY created_at DESC LIMIT 30")
      .bind(ownerId(request), projectId)
      .all<Record<string, unknown>>();
    return Response.json({
      versions: result.results.map((row) => ({
        id: row.id,
        action: row.action,
        model: row.model,
        inputSummary: row.input_summary,
        output: row.output,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "버전 기록을 불러오지 못했습니다.";
    return Response.json({ error: message }, { status: 500 });
  }
}
