import { env } from "@/lib/server/runtime";
import { privateSessionCookie, sameOriginMutation } from "@/lib/server/private-access";

export async function POST(request: Request) {
  if (!env.IS_VERCEL) return new Response(null, { status: 404 });
  if (!sameOriginMutation(request)) return Response.json({ error: "같은 작업실에서 로그아웃해 주세요." }, { status: 403 });
  return new Response(null, { status: 303, headers: { Location: new URL("/login", request.url).toString(), "Set-Cookie": privateSessionCookie("", 0), "Cache-Control": "no-store" } });
}
