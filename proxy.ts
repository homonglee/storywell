import { env } from "@/lib/server/runtime";
import { NextResponse, type NextRequest } from "next/server";
import { validPrivateAccess, sameOriginMutation } from "@/lib/server/private-access";

export async function proxy(request: NextRequest) {
  if (!env.IS_VERCEL) return NextResponse.next();
  const password = process.env.STORYWELL_ACCESS_PASSWORD;
  if (!password || password.length < 16) {
    return new Response("<!doctype html><html lang='ko'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>StoryWell Ver2.0 설정</title><body style='font-family:system-ui;background:#10151f;color:#eee;padding:40px;max-width:680px;margin:auto'><h1>StoryWell Ver2.0</h1><p>배포는 준비되었으며 비공개 작업실 연결을 기다리고 있습니다.</p><p>Vercel 설정에서 작업실 비밀번호를 등록해 주세요. 연결을 마치면 작품 설계와 집필을 시작할 수 있습니다.</p></body></html>", { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  if (!await validPrivateAccess(request.headers.get("authorization"), password)) {
    return new Response("StoryWell 비공개 작업실입니다. 사용자 이름 storywell과 작업실 비밀번호로 로그인해 주세요.", { status: 401, headers: { "WWW-Authenticate": 'Basic realm="StoryWell", charset="UTF-8"', "Cache-Control": "no-store" } });
  }
  if (!sameOriginMutation(request)) return Response.json({ error: "같은 작업실에서 요청해 주세요." }, { status: 403 });
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith("oai-authenticated-user-")) headers.delete(name);
  headers.set("oai-authenticated-user-id", "private-owner");
  return NextResponse.next({ request: { headers } });
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
