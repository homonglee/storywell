import { openAIStatus } from "@/lib/server/openai";

export async function GET() {
  return Response.json(openAIStatus(), {
    headers: { "Cache-Control": "no-store" },
  });
}
