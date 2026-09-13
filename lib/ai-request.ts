export type AIResult = { result?: unknown; model?: string; error?: string };

export async function requestAI(payload: Record<string, unknown>, signal: AbortSignal): Promise<AIResult> {
  signal.throwIfAborted();
  const response = await fetch("/api/ai/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json() as AIResult;
  // A response that finishes after cancellation must never update the manuscript.
  signal.throwIfAborted();
  if (!response.ok) throw new Error(data.error ?? "AI 생성에 실패했습니다.");
  return data;
}

export function isAIAbort(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
