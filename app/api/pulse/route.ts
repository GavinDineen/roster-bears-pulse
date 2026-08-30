import { NextRequest, NextResponse } from "next/server";
import { readPulse } from "@/lib/store";
import { sessionFromRequest } from "@/lib/auth";
import type { PulsePayload } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Members get the pulse with operator/meta fields stripped.
function memberView(p: PulsePayload) {
  const { postsAnalyzed, source, ...rest } = p;
  void postsAnalyzed;
  void source;
  return rest;
}

// Read-only. Polled every 20s by logged-in views. Never triggers a collect.
export async function GET(req: NextRequest) {
  const session = sessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const pulse = await readPulse();
  return NextResponse.json(
    session.role === "admin" ? pulse : memberView(pulse)
  );
}
