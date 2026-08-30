import crypto from "crypto";
import type { NextRequest } from "next/server";

// This app is a headless data service. The Roster app (therostercollective.com)
// is the only caller and authenticates every request with the shared
// DESK_SERVICE_SECRET. Vercel Cron calls /api/cron with CRON_SECRET.
// There is no end-user auth here — the Roster app owns the Supabase session and
// decides, per role, what each user may do before it ever calls this service.

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function bearer(req: NextRequest): string | null {
  const m = /^Bearer (.+)$/.exec(req.headers.get("authorization") || "");
  return m ? m[1] : null;
}

/** True when the caller presented the shared DESK_SERVICE_SECRET. */
export function isServiceRequest(req: NextRequest): boolean {
  const secret = process.env.DESK_SERVICE_SECRET;
  const token = bearer(req);
  return !!secret && !!token && safeEqual(token, secret);
}

/** True when Vercel Cron presented CRON_SECRET (header or ?secret=). */
export function isCronRequest(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const token = bearer(req);
  if (token && safeEqual(token, secret)) return true;
  const qs = new URL(req.url).searchParams.get("secret");
  return !!qs && safeEqual(qs, secret);
}
