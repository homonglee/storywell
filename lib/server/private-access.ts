export const SESSION_COOKIE = "__Host-storywell_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

export async function validPrivatePassword(supplied: unknown, password: string | undefined) {
  if (!password || password.length < 16 || typeof supplied !== "string" || supplied.length > 1024) return false;
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  const [left, right] = await Promise.all([digest(supplied), digest(password)]);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function sessionKey(password: string) {
  return crypto.subtle.importKey("raw", encoder.encode("storywell-session:v1:" + password), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createPrivateSession(password: string, now = Math.floor(Date.now() / 1000)) {
  if (password.length < 16) throw new Error("작업실 비밀번호를 설정해 주세요.");
  const payload = ["v1", now, now + SESSION_MAX_AGE, crypto.randomUUID()].join(".");
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", await sessionKey(password), encoder.encode(payload)));
  const hex = Array.from(signature, byte => byte.toString(16).padStart(2, "0")).join("");
  return payload + "." + hex;
}

export async function validPrivateSession(token: string | null, password: string | undefined, now = Math.floor(Date.now() / 1000)) {
  if (!password || password.length < 16 || !token || token.length > 256) return false;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "v1" || !/^\d{10}$/.test(parts[1]) || !/^\d{10}$/.test(parts[2]) || !/^[a-f0-9-]{36}$/.test(parts[3]) || !/^[a-f0-9]{64}$/.test(parts[4])) return false;
  const issued = Number(parts[1]), expires = Number(parts[2]);
  if (issued > now + 60 || expires <= now || expires - issued !== SESSION_MAX_AGE) return false;
  const signature = Uint8Array.from(parts[4].match(/../g)!, byte => parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", await sessionKey(password), signature, encoder.encode(parts.slice(0, 4).join(".")));
}

export function privateSessionFrom(request: Request) {
  const cookie = request.headers.get("cookie")?.split(";").map(value => value.trim()).find(value => value.startsWith(SESSION_COOKIE + "="));
  return cookie?.slice(SESSION_COOKIE.length + 1) ?? null;
}

export function privateSessionCookie(token: string, maxAge = SESSION_MAX_AGE) {
  return SESSION_COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
}

export function sameOriginMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  return request.headers.get("origin") === new URL(request.url).origin;
}
