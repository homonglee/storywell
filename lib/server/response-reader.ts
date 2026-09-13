import { createOpenAIResponse } from "@/lib/server/openai";

export class AIError extends Error {
  constructor(message: string, public code = "AI_FAILED", public status = 502) { super(message); }
}

export function providerError(status: number, data: Record<string, unknown>): AIError {
  const detail = (data.error ?? data) as Record<string, unknown>;
  const code = String(detail.code ?? "AI_PROVIDER_ERROR");
  if (code === "insufficient_quota") return new AIError("OpenAI API 크레딧 또는 지출 한도에 도달했습니다. API 결제 설정을 확인해 주세요.", code, 429);
  if (status === 429) return new AIError("AI 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.", code, 429);
  if (status === 401) return new AIError("AI 인증에 실패했습니다. 등록된 API 키를 확인해 주세요.", code, 503);
  if (status === 403 || code === "model_not_found") return new AIError("선택한 AI 모델에 접근할 수 없습니다. 다른 모델을 선택해 주세요.", code, 400);
  return new AIError(String(detail.message ?? "AI 서비스가 요청을 처리하지 못했습니다.").slice(0, 400), code, status >= 400 && status < 600 ? status : 502);
}

export function responseText(response: Record<string, unknown>): string {
  if (response.status === "incomplete") throw new AIError("AI 출력이 분량 한도에서 중단됐습니다. 결과를 저장하지 않았습니다. 목표 분량을 줄이거나 다시 시도해 주세요.", "AI_INCOMPLETE");
  if (response.status === "failed" || response.error) throw providerError(502, response);
  if (response.status && response.status !== "completed") throw new AIError("완료되지 않은 AI 응답입니다.", "AI_INCOMPLETE");
  const parts: string[] = [];
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const part of item?.content ?? []) {
      if (part.type === "refusal") throw new AIError("AI가 이 요청의 생성을 거절했습니다. 요청 내용을 조정해 주세요.", "AI_REFUSAL", 422);
      if (part.type === "output_text" && typeof part.text === "string") parts.push(part.text);
    }
  }
  const text = typeof response.output_text === "string" ? response.output_text : parts.join("");
  if (!text.trim()) throw new AIError("AI가 빈 결과를 반환했습니다. 기존 내용을 유지합니다.", "AI_EMPTY");
  return text;
}

export async function readAIResponse(body: Record<string, unknown>, signal: AbortSignal, onDelta: (text: string) => void) {
  const response = await createOpenAIResponse({ ...body, stream: true }, signal);
  if (!response.ok) {
    let data: Record<string, unknown> = {};
    try { data = await response.json() as Record<string, unknown>; } catch { /* Gateway may return HTML. */ }
    throw providerError(response.status, data);
  }
  // JSON responses remain supported for providers that do not stream.
  if (!response.headers?.get("content-type")?.includes("text/event-stream")) {
    const data = await response.json() as Record<string, unknown>;
    signal.throwIfAborted();
    return { text: responseText(data), response: data };
  }
  if (!response.body) throw new AIError("AI 응답 연결이 비어 있습니다.", "AI_DISCONNECTED");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed: Record<string, unknown> | undefined;
  const consume = (line: string) => {
    if (!line.startsWith("data:")) return;
    const raw = line.slice(5).trim();
    if (!raw || raw === "[DONE]") return;
    const event = JSON.parse(raw) as Record<string, unknown>;
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") onDelta(event.delta);
    if (event.type === "response.completed") completed = event.response as Record<string, unknown>;
    if (event.type === "response.incomplete") { responseText(event.response as Record<string, unknown>); throw new AIError("AI 응답이 중단됐습니다.", "AI_INCOMPLETE"); }
    if (event.type === "response.failed" || event.type === "error") throw providerError(502, (event.response ?? event) as Record<string, unknown>);
  };
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, newline).replace(/\r$/, "")); buffer = buffer.slice(newline + 1); }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  if (!completed) throw new AIError("AI 응답 연결이 완료 전에 끊겼습니다. 기존 내용을 유지합니다.", "AI_DISCONNECTED");
  return { text: responseText(completed), response: completed };
}
