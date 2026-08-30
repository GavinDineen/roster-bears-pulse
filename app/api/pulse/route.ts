import { NextResponse } from "next/server";
import { readPulse } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only. The client polls this every 20s. Never triggers a collect.
export async function GET() {
  const pulse = await readPulse();
  return NextResponse.json(pulse);
}
