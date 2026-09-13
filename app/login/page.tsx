import type { Metadata } from "next";
import { Feather, LockKeyhole } from "lucide-react";

export const metadata: Metadata = { title: "로그인 | StoryWell Ver2.0" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const invalid = (await searchParams).error === "invalid";
  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand"><span><Feather aria-hidden="true" /></span><strong>StoryWell <small>Ver2.0</small></strong></div>
        <div className="login-intro">
          <p className="login-eyebrow">나만의 웹소설 창작 스튜디오</p>
          <h1 id="login-title">작업실에 오신 것을 환영합니다</h1>
          <p>작업실 비밀번호를 입력하고<br />이야기를 이어서 써 내려가세요.</p>
        </div>
        <form action="/api/auth/login" method="post" className="login-form">
          <label htmlFor="login-username">사용자 이름</label>
          <input id="login-username" name="username" autoComplete="username" defaultValue="storywell" readOnly />
          <label htmlFor="login-password">작업실 비밀번호</label>
          <input id="login-password" name="password" type="password" autoComplete="current-password" required maxLength={1024} placeholder="설정한 작업실 비밀번호" aria-describedby={invalid ? "login-error" : "login-help"} aria-invalid={invalid || undefined} />
          {invalid ? <p id="login-error" className="login-error" role="alert">비밀번호가 일치하지 않습니다. 다시 입력해 주세요.</p> : null}
          <button type="submit"><LockKeyhole aria-hidden="true" />작업실 들어가기</button>
          <p id="login-help" className="login-help">로그인은 이 브라우저에서 7일 동안 유지됩니다.<br />공용 기기에서는 사용 후 로그아웃해 주세요.</p>
        </form>
      </section>
    </main>
  );
}
