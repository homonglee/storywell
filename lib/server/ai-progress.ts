import { env } from "cloudflare:workers";

export function validProgressId(id: unknown): id is string {
  return typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(id);
}
export async function createProgressReporter(request: Request, id: unknown) {
  if (!validProgressId(id) || !env.DB) return { update: (_event: Record<string, unknown>) => {}, finish: async () => {} };
  const owner = request.headers.get("oai-authenticated-user-id") ?? "private-owner";
  let state: Record<string, unknown> = { message: "AI 요청을 준비합니다.", preview: "", status: "running" };
  let queue = Promise.resolve();
  let dirty = false;
  const write = () => {
    if (!dirty) return queue;
    dirty = false;
    const snapshot = JSON.stringify(state);
    queue = queue.then(async () => {
      await env.DB!.prepare("UPDATE story_ai_progress SET payload = ?, updated_at = ? WHERE id = ? AND owner_id = ?")
        .bind(snapshot, new Date().toISOString(), id, owner).run();
    }).catch(() => undefined);
    return queue;
  };
  try {
    await env.DB.prepare("DELETE FROM story_ai_progress WHERE owner_id = ? AND updated_at < ?").bind(owner, new Date(Date.now() - 86400000).toISOString()).run();
    await env.DB.prepare("INSERT INTO story_ai_progress (id, owner_id, payload, updated_at) VALUES (?, ?, ?, ?)").bind(id, owner, JSON.stringify(state), new Date().toISOString()).run();
  } catch {
    // Progress is supplementary; a monitoring failure must not discard a valid AI result.
    return { update: (_event: Record<string, unknown>) => {}, finish: async () => {} };
  }
  const timer = setInterval(() => { void write(); }, 2000);
  return {
    update(event: Record<string, unknown>) {
      if (event.type === "progress") state = { ...state, ...event };
      if (event.type === "delta" && typeof event.text === "string") state = { ...state, preview: (String(state.preview ?? "") + event.text).slice(-1200), message: "원고를 생성하고 있습니다." };
      if (event.type === "result") state = { ...state, status: "completed", message: "AI 생성 완료 · 결과를 저장합니다." };
      if (event.type === "error") state = { ...state, status: "failed", message: event.error, preview: "" };
      dirty = true;
    },
    async finish() { clearInterval(timer); await write(); },
  };
}
