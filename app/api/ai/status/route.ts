import { env } from "cloudflare:workers";

export async function GET() {
  return Response.json({
    configured: Boolean(env.OPENAI_API_KEY),
    model: env.OPENAI_MODEL ?? "gpt-5.6-terra",
  });
}
