import { NextRequest, NextResponse } from "next/server";
import {
  roleForPassword,
  createToken,
  sessionCookieOptions,
  SESSION_COOKIE,
  type Role,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { password, role? }
// Password determines access. The admin password also unlocks the member view.
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    password?: string;
    role?: Role;
  };

  if (typeof body.password !== "string" || !body.password) {
    return NextResponse.json({ ok: false, error: "password required" }, { status: 400 });
  }

  const unlocked = roleForPassword(body.password);
  if (!unlocked) {
    return NextResponse.json({ ok: false, error: "wrong password" }, { status: 401 });
  }

  // If they asked for member and hold the admin password, honour the request
  // (admin password unlocks member view); otherwise grant what they unlocked.
  const role: Role = body.role === "member" ? "member" : unlocked;

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(SESSION_COOKIE, createToken(role), sessionCookieOptions());
  return res;
}
