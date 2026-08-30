import { NextRequest, NextResponse } from "next/server";
import { readQueue } from "@/lib/store";
import { isServiceRequest } from "@/lib/service-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isServiceRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await readQueue());
}
