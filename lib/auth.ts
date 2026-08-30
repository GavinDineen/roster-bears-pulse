import crypto from "crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";

export type Role = "member" | "admin";

export const SESSION_COOKIE = "rd_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

function secret(): string {
  return (
    process.env.AUTH_SECRET ||
    process.env.ADMIN_PASSWORD ||
    "insecure-dev-secret-set-AUTH_SECRET"
  );
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** admin password wins over member; returns the highest role the password unlocks */
export function roleForPassword(password: string): Role | null {
  const admin = process.env.ADMIN_PASSWORD;
  const member = process.env.MEMBER_PASSWORD;
  if (admin && safeEqual(password, admin)) return "admin";
  if (member && safeEqual(password, member)) return "member";
  return null;
}

export function createToken(role: Role): string {
  const payload = JSON.stringify({ role, exp: Date.now() + MAX_AGE_SECONDS * 1000 });
  const body = b64url(payload);
  const sig = b64url(crypto.createHmac("sha256", secret()).update(body).digest());
  return `${body}.${sig}`;
}

export function readToken(token: string | undefined | null): { role: Role } | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  const expected = b64url(
    crypto.createHmac("sha256", secret()).update(body).digest()
  );
  if (sig.length !== expected.length || !safeEqual(sig, expected)) return null;
  try {
    const { role, exp } = JSON.parse(Buffer.from(body, "base64url").toString());
    if (typeof exp !== "number" || exp < Date.now()) return null;
    if (role !== "member" && role !== "admin") return null;
    return { role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAge = MAX_AGE_SECONDS) {
  return {
    httpOnly: true as const,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** For server components / route handlers using next/headers. */
export async function getSession(): Promise<{ role: Role } | null> {
  const store = await cookies();
  return readToken(store.get(SESSION_COOKIE)?.value);
}

/** For route handlers that receive the request object. */
export function sessionFromRequest(req: NextRequest): { role: Role } | null {
  return readToken(req.cookies.get(SESSION_COOKIE)?.value);
}

export function isAdmin(session: { role: Role } | null): boolean {
  return session?.role === "admin";
}
