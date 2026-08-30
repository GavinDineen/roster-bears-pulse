import { NextResponse } from "next/server";
import { spendSummary } from "@/lib/spend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only. The client polls this every 20s.
export async function GET() {
  const summary = await spendSummary();
  return NextResponse.json(summary);
}
