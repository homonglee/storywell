export type AIResult = { result?: unknown; model?: string; error?: string; code?: string };
export type AIProgress = { type: "progress" | "delta" | "preview"; message?: string; text?: string; completed?: number; total?: number };

async function requestAIStream(payload: Record<string, unknown>, signal: AbortSignal, onProgress?: (event: AIProgress) => void): Promise<AIResult> {
  signal.throwIfAborted();
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(payload), signal,
  });
  const streamType = response.headers.get("content-type") ?? "";
  if (!streamType.includes("application/x-ndjson") && !streamType.includes("text/event-stream")) {
    let data: AIResult;
    try { data = await response.json() as AIResult; } catch {
      throw new Error("AI 응답 연결이 끊겼습니다. 기존 내용을 유지합니다. 잠시 후 다시 시도해 주세요.");
    }
    signal.throwIfAborted();
    if (!response.ok) throw new Error(data.error ?? "AI 생성에 실패했습니다.");
    return data;
  }
  if (!response.body) throw new Error("AI 응답 연결을 열지 못했습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AIResult | undefined;
  const consume = (line: string) => {
    if (!line.trim() || line.startsWith(":")) return;
    if (streamType.includes("text/event-stream") && !line.startsWith("data:")) return;
    const event = JSON.parse(line.startsWith("data:") ? line.slice(5).trim() : line);
    signal.throwIfAborted();
    if (event.type === "error") throw new Error(event.error ?? "AI 생성에 실패했습니다.");
    if (event.type === "result") result = event.data;
    if (event.type === "progress" || event.type === "delta") onProgress?.(event);
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); }
      if (done) break;
    }
    consume(buffer);
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  signal.throwIfAborted();
  if (!result) throw new Error("AI 연결이 완료 전에 끊겼습니다. 기존 내용을 유지합니다.");
  return result;
}

export function isAIAbort(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export async function requestAI(payload: Record<string, unknown>, signal: AbortSignal, onProgress?: (event: AIProgress) => void): Promise<AIResult> {
  signal.throwIfAborted();
  const progressId = crypto.randomUUID();
  const polling = new AbortController();
  const pollSignal = AbortSignal.any([signal, polling.signal]);
  let pollingNow = false;
  const timer = setInterval(() => {
    if (pollingNow || pollSignal.aborted) return;
    pollingNow = true;
    void fetch("/api/ai/progress?id=" + progressId, { signal: pollSignal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) return;
        const state = await response.json() as { message?: string; preview?: string };
        if (pollSignal.aborted) return;
        if (state.message) onProgress?.({ type: "progress", message: state.message });
        if (state.preview) onProgress?.({ type: "preview", text: state.preview });
      }).catch(() => undefined).finally(() => { pollingNow = false; });
  }, 2000);
  try { return await requestAIStream({ ...payload, progressId }, signal, onProgress); }
  finally { clearInterval(timer); polling.abort(); }
}
