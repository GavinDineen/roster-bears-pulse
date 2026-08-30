import { NextResponse } from "next/server";
import { readQueue } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only. The client polls this every 20s.
export async function GET() {
  const queue = await readQueue();
  return NextResponse.json(queue);
}
