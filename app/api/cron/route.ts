import { NextRequest, NextResponse } from "next/server";
import { isCronRequest } from "@/lib/service-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// This route awaits the full /api/collect run (which may make a cold
// twscrape-sidecar call), so it needs the same headroom.
export const maxDuration = 60;

/**
 * Scheduled collect entry point (vercel.json cron, once daily).
 * Requires CRON_SECRET, then forwards to /api/collect with DESK_SERVICE_SECRET.
 */
export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const serviceSecret = process.env.DESK_SERVICE_SECRET;
  if (!serviceSecret) {
    return NextResponse.json(
      { ok: false, error: "DESK_SERVICE_SECRET not configured" },
      { status: 500 }
    );
  }

  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/api/collect`, {
    method: "POST",
    headers: { authorization: `Bearer ${serviceSecret}` },
  });
  const data = await res.json().catch(() => ({}));

  return NextResponse.json({ ok: res.ok, forwarded: data });
}
