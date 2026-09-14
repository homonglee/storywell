import { env } from "@/lib/server/runtime";
import { referenceFileKey } from "@/lib/server/reference-import";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await context.params;
  if (!/^[a-f0-9-]{36}$/.test(id)) return Response.json({ error: "잘못된 파일 주소입니다." }, { status: 400 });
  try {
    if (!env.BUCKET) return Response.json({ error: "파일 보관함이 준비되지 않았습니다." }, { status: 503 });
    const file = await env.BUCKET.get(await referenceFileKey(owner, id));
    if (!file) return Response.json({ error: "파일을 찾지 못했습니다." }, { status: 404 });
    const name = encodeURIComponent(file.customMetadata?.name ?? "reference").replace(/'/g, "%27");
    return new Response(file.body, { headers: { "Content-Type": file.httpMetadata?.contentType ?? "application/octet-stream", "Content-Disposition": "attachment; filename*=UTF-8''" + name, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch { return Response.json({ error: "원본 파일을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, { status: 503 }); }
}
