import "server-only";
import { env } from "cloudflare:workers";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";

export function openAIStatus() {
  return {
    configured: Boolean(env.OPENAI_API_KEY),
    model: env.OPENAI_MODEL ?? "gpt-5.6-terra",
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
