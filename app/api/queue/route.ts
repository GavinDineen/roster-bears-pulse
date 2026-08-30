import { NextRequest, NextResponse } from "next/server";
import { readQueue } from "@/lib/store";
import { sessionFromRequest, isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin only.
export async function GET(req: NextRequest) {
  if (!isAdmin(sessionFromRequest(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await readQueue());
}
