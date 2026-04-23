export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function buildSessionCookie(token: string, secure: boolean): string {
  const parts = [`${SESSION_COOKIE_NAME}=${token}`, "HttpOnly"];
  if (secure) parts.push("Secure");
  parts.push("SameSite=Lax", "Path=/", `Max-Age=${SESSION_MAX_AGE_SECONDS}`);
  return parts.join("; ");
}

export function buildClearedSessionCookie(secure: boolean): string {
  const parts = [`${SESSION_COOKIE_NAME}=`, "HttpOnly"];
  if (secure) parts.push("Secure");
  parts.push("SameSite=Lax", "Path=/", "Max-Age=0");
  return parts.join("; ");
}

export function readSessionCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE_NAME) {
      return rest.join("=") || null;
    }
  }
  return null;
}
