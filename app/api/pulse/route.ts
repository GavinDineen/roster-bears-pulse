import { NextRequest, NextResponse } from "next/server";
import { readPulse } from "@/lib/store";
import { isServiceRequest } from "@/lib/service-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full pulse for the Roster app. The Roster app strips operator fields per role
// before it reaches a member. Never triggers a collect.
export async function GET(req: NextRequest) {
  if (!isServiceRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await readPulse());
}
