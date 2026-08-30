import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled collect entry point (vercel.json cron, every 3 hours).
 *
 * Disabled while X_ALLOW_UNAUTH_COLLECT=true — in that mode collect is driven
 * only by the "Collect now" button, so the cron must not also spend.
 * When enabled, requires the CRON_SECRET bearer token and forwards to /api/collect.
 */
export async function GET(req: NextRequest) {
  if ((process.env.X_ALLOW_UNAUTH_COLLECT || "true") === "true") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "cron is disabled while X_ALLOW_UNAUTH_COLLECT=true (use the Collect now button)",
      },
      { status: 409 }
    );
  }

  const secret = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") || "";
  if (!secret || header !== `Bearer ${secret}`) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/api/collect`, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}` },
  });
  const data = await res.json().catch(() => ({}));

  return NextResponse.json({ ok: res.ok, forwarded: data });
}
