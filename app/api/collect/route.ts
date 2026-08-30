import { NextRequest, NextResponse } from "next/server";
import { QUERIES } from "@/lib/config";
import {
  gateCollect,
  recordReads,
  spendSummary,
  LIMITS,
} from "@/lib/spend";
import { canRead, recentSearch, searchBeatDesk } from "@/lib/x";
import { scorePost, containsUrl, stripUrls } from "@/lib/rank";
import { synthesize } from "@/lib/synthesize";
import { readPulse, writePulse, readQueue, writeQueue } from "@/lib/store";
import { fallbackPulse } from "@/lib/fallback";
import { sessionFromRequest, isAdmin } from "@/lib/auth";
import type { RawPost, ScoredPost } from "@/lib/types";
import type { QueuedTweet } from "@/lib/queue-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cron calls in with the CRON_SECRET bearer token. */
function hasCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") || "";
  const qs = new URL(req.url).searchParams.get("secret");
  return header === `Bearer ${secret}` || qs === secret;
}

/** Collect runs only for an admin session or the cron secret. */
function mayCollect(req: NextRequest): boolean {
  return isAdmin(sessionFromRequest(req)) || hasCronSecret(req);
}

/** Build a linkless draft tweet from a viral post. */
function draftFromPost(p: ScoredPost): string {
  const body = stripUrls(p.text).slice(0, 180).trim();
  const lead = p.isBeat
    ? `Per ${p.authorName}:`
    : "Bears Twitter is buzzing:";
  let t = `${lead} ${body}`.replace(/\s+/g, " ").trim();
  if (t.length > 268) t = `${t.slice(0, 265)}…`;
  return t;
}

async function runCollect(req: NextRequest): Promise<NextResponse> {
  if (!mayCollect(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  // ---- spend gate: if blocked, return cached pulse and DO NOT retry ----
  const gate = await gateCollect();
  if (!gate.ok) {
    const cached = await readPulse();
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        reason: gate.reason,
        pulse: { ...cached, source: "cache" as const },
        spend: await spendSummary(),
      },
      { status: 200 }
    );
  }

  // ---- no credentials: serve fallback, no spend ----
  if (!canRead()) {
    const fb = fallbackPulse();
    await writePulse(fb);
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        reason: "No X_BEARER_TOKEN set — serving the static fallback pulse.",
        pulse: fb,
        spend: await spendSummary(),
      },
      { status: 200 }
    );
  }

  // ---- collect: exactly 2 queries (fan/team + beat desk), capped result count ----
  const runBeat = LIMITS.queryCount() >= 2;
  const perQuery = LIMITS.maxResultsPerQuery();
  let fetched = 0;
  let dropped = 0;
  let beatHalf: "full" | "even" | "odd" | "n/a" = "n/a";
  let raw: RawPost[] = [];
  try {
    const r1 = await recentSearch(QUERIES[0].query, perQuery);
    fetched += r1.fetched;
    dropped += r1.dropped;
    raw = raw.concat(r1.posts);

    if (runBeat) {
      const r2 = await searchBeatDesk(perQuery);
      fetched += r2.fetched;
      dropped += r2.dropped;
      beatHalf = r2.beatHalf;
      raw = raw.concat(r2.posts);
    }
  } catch (e) {
    const cached = await readPulse();
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        reason: `X read failed: ${(e as Error).message}`,
        pulse: { ...cached, source: "cache" as const },
        spend: await spendSummary(),
      },
      { status: 200 }
    );
  }

  console.log(
    `[collect] fetched=${fetched} kept=${raw.length} dropped=${dropped} beatHalf=${beatHalf}`
  );

  // dedupe by id
  const seen = new Set<string>();
  raw = raw.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

  // bill for every post X returned — dropped tweets are still billed, not refetched
  await recordReads(fetched);

  const scored = raw.map(scorePost);
  const pulse = scored.length ? synthesize(scored) : fallbackPulse();
  await writePulse(pulse);

  // ---- queue viral drafts (never auto-post) ----
  const threshold = LIMITS.viralThreshold();
  const queue = await readQueue();
  const existingTexts = new Set(queue.tweets.map((t) => t.text));
  let draftsQueued = 0;

  const viralPicks = scored
    .filter((p) => p.gravity >= threshold)
    .sort((a, b) => b.gravity - a.gravity)
    .slice(0, 5);

  for (const p of viralPicks) {
    const text = draftFromPost(p);
    if (containsUrl(text) || existingTexts.has(text)) continue; // never queue URLs
    const qt: QueuedTweet = {
      id: `qt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      reason: `Viral pickup — gravity ${p.gravity} from @${p.authorHandle}`,
      sourceGravity: p.gravity,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    queue.tweets.unshift(qt);
    existingTexts.add(text);
    draftsQueued += 1;
  }
  await writeQueue(queue);

  return NextResponse.json({
    ok: true,
    fetched,
    kept: raw.length,
    dropped,
    beatHalf,
    postsAnalyzed: raw.length,
    draftsQueued,
    autoTweet: false,
    pulse,
    spend: await spendSummary(),
  });
}

export async function POST(req: NextRequest) {
  return runCollect(req);
}

export async function GET(req: NextRequest) {
  return runCollect(req);
}
