import { env } from "@/lib/server/runtime";
import { getReferenceError, MAX_REFERENCE_FILE_BYTES, MAX_REFERENCE_TEXT, type StoryReference } from "@/lib/story-references";
import { AIError } from "@/lib/server/response-reader";
import { boundedBody, fetchReferencePage, referenceFileKey, referenceFileType, ReferenceImportError, summarizeReference } from "@/lib/server/reference-import";

export const maxDuration = 180;

export async function POST(request: Request) {
  const owner = request.headers.get("oai-authenticated-user-id");
  if (!owner) return Response.json({ error: "로그인 후 다시 시도해 주세요." }, { status: 401 });
  if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "잘못된 요청 경로입니다." }, { status: 403 });
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(160000)]);
  try {
    const bytes = await boundedBody(request.body, MAX_REFERENCE_FILE_BYTES + 65536);
    const body = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
    const category = body.get("category");
    if (category !== "material" && category !== "style") throw new ReferenceImportError("참고 목적을 선택해 주세요.");
    const title = String(body.get("title") ?? "").trim();
    const guidance = String(body.get("guidance") ?? "").trim();
    if (title.length > 120 || guidance.length > 1000) throw new ReferenceImportError("이름은 120자, 특징 메모는 1,000자 이내로 입력해 주세요.");
    const model = String(body.get("model") ?? "");
    const file = body.get("file");
    const id = crypto.randomUUID();
    let reference: StoryReference;
    if (file instanceof File) {
      if (!env.BUCKET) throw new ReferenceImportError("파일 보관함이 아직 준비되지 않았습니다. 본문을 붙여넣어 주세요.", 503);
      const data = new Uint8Array(await file.arrayBuffer());
      const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "_").slice(0, 200);
      const type = referenceFileType(name, data);
      const decoded = type.startsWith("text/") ? new TextDecoder().decode(data).trim() : null;
      if (decoded === "") throw new ReferenceImportError("본문이 비어 있는 파일입니다.");
      const content = decoded && decoded.length <= MAX_REFERENCE_TEXT ? decoded : await summarizeReference(decoded ?? { bytes: data, type, name }, category, guidance, model, signal);
      reference = { id, title: title || name.slice(0, 120), category, guidance, source: "file", content, enabled: true, createdAt: new Date().toISOString(), file: { id, name, type, size: data.length } };
      const problem = getReferenceError({ references: [reference] }); if (problem) throw new ReferenceImportError(problem);
      signal.throwIfAborted();
      await env.BUCKET.put(await referenceFileKey(owner, id), data, { httpMetadata: { contentType: type }, customMetadata: { name } });
    } else {
      const page = await fetchReferencePage(String(body.get("url") ?? ""), signal);
      const content = await summarizeReference(page.content, category, guidance, model, signal);
      reference = { id, title: title || (page.title || new URL(page.url).hostname).slice(0, 120), category, guidance, source: "url", content, enabled: true, createdAt: new Date().toISOString(), url: page.url };
      const problem = getReferenceError({ references: [reference] }); if (problem) throw new ReferenceImportError(problem);
    }
    return Response.json({ reference }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error instanceof ReferenceImportError || error instanceof AIError ? error.status : signal.aborted ? 504 : 502;
    console.error("storywell_reference_import_failed", { status, type: error instanceof Error ? error.name : "unknown" });
    return Response.json({ error: signal.aborted ? "자료 분석 대기 시간이 지났습니다. 더 짧은 자료로 다시 시도해 주세요." : error instanceof ReferenceImportError || error instanceof AIError ? error.message : "자료를 읽지 못했습니다. 본문을 붙여넣거나 다른 파일로 다시 시도해 주세요." }, { status });
  }
}
