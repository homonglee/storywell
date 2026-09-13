import "server-only";
import { env } from "@/lib/server/runtime";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const SUPPORTED_OPENAI_MODELS = ["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna", "gpt-6-astra"] as const;

export function availableOpenAIModels(defaultModel?: string) {
  return Array.from(new Set([defaultModel ?? "gpt-5.6-terra", ...SUPPORTED_OPENAI_MODELS]));
}

export function selectOpenAIModel(requestedModel?: unknown) {
  const defaultModel = requireOpenAIConfig().model;
  if (requestedModel == null) return defaultModel;
  if (typeof requestedModel !== "string" || !availableOpenAIModels(defaultModel).includes(requestedModel)) {
    throw new Error("지원하지 않는 GPT 모델입니다.");
  }
  return requestedModel;
}

export function openAIStatus() {
  const model = env.OPENAI_MODEL ?? "gpt-5.6-terra";
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    model,
    models: availableOpenAIModels(model),
  };
}

export function requireOpenAIConfig() {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("AI_NOT_CONFIGURED");
  return {
    apiKey,
    model: env.OPENAI_MODEL ?? "gpt-5.6-terra",
  };
}

export async function createOpenAIResponse(body: Record<string, unknown>, signal: AbortSignal) {
  const { apiKey } = requireOpenAIConfig();
  return fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
}
