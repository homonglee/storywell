import { env } from "@/lib/server/runtime";
import { createPrivateSession, privateSessionCookie, sameOriginMutation, validPrivatePassword } from "@/lib/server/private-access";

export async function POST(request: Request) {
  if (!env.IS_VERCEL) return new Response(null, { status: 404 });
  if (!sameOriginMutation(request)) return Response.json({ error: "같은 작업실에서 로그인해 주세요." }, { status: 403 });
  const password = process.env.STORYWELL_ACCESS_PASSWORD;
  if (!password || password.length < 16) return Response.json({ error: "작업실 비밀번호를 설정해 주세요." }, { status: 503 });
  if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return new Response(null, { status: 415 });
  if (Number(request.headers.get("content-length")) > 8192) return new Response(null, { status: 413 });
  const body = await request.text();
  if (body.length > 8192) return new Response(null, { status: 413 });
  const form = new URLSearchParams(body);
  const correctPassword = await validPrivatePassword(form.get("password"), password);
  if (form.get("username") !== "storywell" || !correctPassword) {
    return new Response(null, { status: 303, headers: { Location: new URL("/login?error=invalid", request.url).toString(), "Cache-Control": "no-store" } });
  }
  const token = await createPrivateSession(password);
  return new Response(null, { status: 303, headers: { Location: new URL("/", request.url).toString(), "Set-Cookie": privateSessionCookie(token), "Cache-Control": "no-store" } });
}
