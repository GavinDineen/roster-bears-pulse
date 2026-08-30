import { NextRequest, NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/store";
import { gateWrite, recordWrite } from "@/lib/spend";
import { canWrite, postTweet } from "@/lib/x";
import { containsUrl } from "@/lib/rank";
import { sessionFromRequest, isAdmin } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { id, action: "post" | "skip" } — admin session only.
export async function POST(req: NextRequest) {
  if (!isAdmin(sessionFromRequest(req))) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: "post" | "skip";
  };
  const { id } = body;
  const action = body.action ?? "post";

  if (!id) {
    return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  }

  const queue = await readQueue();
  const tweet = queue.tweets.find((t) => t.id === id);
  if (!tweet) {
    return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  }
  if (tweet.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: `already ${tweet.status}` },
      { status: 409 }
    );
  }

  if (action === "skip") {
    tweet.status = "skipped";
    tweet.skippedReason = "manual skip";
    await writeQueue(queue);
    return NextResponse.json({ ok: true, tweet });
  }

  // ---- post path ----
  const hasUrl = containsUrl(tweet.text);
  if (hasUrl) {
    // Belt and suspenders: drafts should never contain URLs. Skip, don't pay $0.20.
    tweet.status = "skipped";
    tweet.skippedReason = "contains a URL";
    await writeQueue(queue);
    return NextResponse.json(
      { ok: false, error: "tweet contains a URL — skipped", tweet },
      { status: 422 }
    );
  }

  const gate = await gateWrite(false);
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: gate.reason, tweet },
      { status: 429 }
    );
  }

  if (!canWrite()) {
    return NextResponse.json(
      { ok: false, error: "no X write credentials configured", tweet },
      { status: 400 }
    );
  }

  try {
    const res = await postTweet(tweet.text);
    await recordWrite(false);
    tweet.status = "posted";
    tweet.postedId = res.id;
    tweet.postedAt = new Date().toISOString();
    await writeQueue(queue);
    return NextResponse.json({ ok: true, tweet });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `post failed: ${(e as Error).message}`, tweet },
      { status: 502 }
    );
  }
}
