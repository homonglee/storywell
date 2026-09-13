export async function validPrivateAccess(authorization: string | null, password: string | undefined) {
  if (!password || password.length < 16 || !authorization?.startsWith("Basic ")) return false;
  let decoded: string;
  try { decoded = new TextDecoder().decode(Uint8Array.from(atob(authorization.slice(6)), char => char.charCodeAt(0))); } catch { return false; }
  const colon = decoded.indexOf(":");
  if (colon < 0 || decoded.slice(0, colon) !== "storywell") return false;
  const supplied = decoded.slice(colon + 1);
  const digest = async (text: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  const [left, right] = await Promise.all([digest(supplied), digest(password)]);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}
export function sameOriginMutation(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  return request.headers.get("origin") === new URL(request.url).origin;
}
