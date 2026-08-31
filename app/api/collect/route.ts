import { NextRequest, NextResponse } from "next/server";
import { QUERIES } from "@/lib/config";
import { currentCycle } from "@/lib/config";
import { gateCollect, recordReads, spendSummary, LIMITS } from "@/lib/spend";
import { canRead, recentSearch, searchBeatDesk } from "@/lib/x";
import { scorePost } from "@/lib/rank";
import { isBlockedFanAccount } from "@/lib/filter";
import { synthesize, draftFromFact } from "@/lib/synthesize";
import { getFacts } from "@/lib/facts";
import { getBoard } from "@/lib/board";
import { runEditor } from "@/lib/editor";
import { readPulse, writePulse, readQueue, writeQueue } from "@/lib/store";
import { fallbackPulse } from "@/lib/fallback";
import { isServiceRequest, isCronRequest } from "@/lib/service-auth";
import type { RawPost, PulsePayload } from "@/lib/types";
import type { QueuedTweet } from "@/lib/queue-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Collect runs for the Roster app (admin action) or Vercel Cron / GitHub Actions. */
function mayCollect(req: NextRequest): boolean {
  return isServiceRequest(req) || isCronRequest(req);
}

/** Attach the free board + cycle clock to a pulse. Never touches X or Gemini. */
async function withBoardAndCycle(pulse: PulsePayload): Promise<PulsePayload> {
  const [board, spend] = await Promise.all([getBoard(), spendSummary()]);
  return { ...pulse, board, cycle: currentCycle(spend.collectsToday) };
}

async function runCollect(req: NextRequest): Promise<NextResponse> {
  if (!mayCollect(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // ---- spend gate ----
  // ok:false -> fully blocked (budget/collect-cap/throttle), return cached pulse as-is.
  // ok:true, skipX:true -> proceed with facts+board only; no X, no Gemini this cycle.
  const gate = await gateCollect();
  if (!gate.ok) {
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        reason: gate.reason,
        pulse: await readPulse(),
        spend: await spendSummary(),
      },
      { status: 200 },
    );
  }

  // ---- FACTS: $0 X, fetched on collect, 3h cache, failure → last good ----
  const factsBundle = await getFacts();

  // ---- facts+board only: soft cap / read cap already hit, or X unconfigured ----
  if (gate.skipX || !canRead()) {
    const cached = await readPulse();
    const merged = await withBoardAndCycle({
      ...cached,
      facts: factsBundle.facts.filter((f) => f.confidence !== "note"),
    });
    await writePulse(merged);
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        reason: gate.skipX ? gate.reason : "X unavailable (no X_BEARER_TOKEN) — facts+board refreshed, argument layer is cached",
        pulse: merged,
        spend: await spendSummary(),
      },
      { status: 200 },
    );
  }

  // ---- ARGUMENT: exactly 2 X queries, max_results 20 ----
  const runBeat = LIMITS.queryCount() >= 2;
  const perQuery = LIMITS.maxResultsPerQuery();
  let fetched = 0;
  let dropped = 0;
  let beatHalf: "full" | "even" | "odd" | "n/a" = "n/a";
  let raw: RawPost[] = [];
  let xError: string | null = null;

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
    xError = (e as Error).message;
  }

  // X read failed → keep the cached pulse's argument layer, but still refresh facts+board
  if (xError && raw.length === 0) {
    const cached = await readPulse();
    const merged = await withBoardAndCycle({
      ...cached,
      facts: factsBundle.facts.filter((f) => f.confidence !== "note"),
    });
    await writePulse(merged);
    return NextResponse.json(
      {
        ok: false,
        blocked: true,
        reason: `X unavailable (${xError}) — facts+board refreshed, argument layer is cached`,
        pulse: merged,
        spend: await spendSummary(),
      },
      { status: 200 },
    );
  }

  // dedupe by id
  const seen = new Set<string>();
  raw = raw.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));

  // bill for every post X returned (dropped still billed, never refetched) —
  // the blocklist below is a display filter, not a re-fetch, so it never
  // touches billing. Also counts this collect against X_MAX_COLLECTS_PER_DAY.
  await recordReads(fetched);

  // fan-noise blocklist: affiliate/listicle spam never reaches Fight or
  // Traveling fastest, no matter how much engagement it drew.
  const preBlock = raw.length;
  raw = raw.filter((p) => !isBlockedFanAccount(p.authorHandle, p.text));
  const blocklistDropped = preBlock - raw.length;

  console.log(
    `[collect] facts=${factsBundle.facts.length}(cache=${factsBundle.fromCache}) ` +
      `x.fetched=${fetched} x.kept=${raw.length} x.dropped=${dropped} ` +
      `blocklist=${blocklistDropped} beatHalf=${beatHalf}`,
  );

  const scored = raw.map(scorePost);
  const hasAnything =
    factsBundle.facts.some((f) => f.confidence !== "note") || scored.length > 0;

  let pulse = hasAnything
    ? synthesize({
        facts: factsBundle.facts,
        factSources: factsBundle.sources,
        factsFetchedAt: factsBundle.fetchedAt,
        factsFromCache: factsBundle.fromCache,
        mergeLog: factsBundle.mergeLog,
        posts: scored,
        xMeta: { fetched, kept: scored.length, dropped, beatHalf, blocklistDropped },
      })
    : fallbackPulse();

  // ---- THE EDITOR: one Gemini call, full collects only, after data is in ----
  // Desk never depends on this — any failure/absence leaves `pulse` exactly
  // as the deterministic synthesize() above produced it.
  const editorResult = await runEditor({
    facts: pulse.facts,
    beat: pulse.beat,
    fanArgument: pulse.fanArgument,
    assignmentBase: pulse.creatorPrompts[0] ?? "",
  });
  if (editorResult) {
    pulse = {
      ...pulse,
      facts: pulse.facts.map((f, i) => {
        const fix = editorResult.factLegFixes.get(i);
        if (!fix) return f;
        const outStr = fix.filter((l) => l.direction === "out").map((l) => l.status).join(" and ");
        const inStr = fix.filter((l) => l.direction === "in").map((l) => l.status).join(" and ");
        return { ...f, legs: fix, detail: outStr && inStr ? `Bears trade ${outStr} to the ${f.counterpartyTeam}, get ${inStr}.` : f.detail };
      }),
      beat: pulse.beat.map((b, i) => {
        const rewrite = editorResult.beatRewrites.get(i);
        return rewrite ? { ...b, text: rewrite } : b;
      }),
      fanArgument: pulse.fanArgument.map((c, i) => {
        const rewrite = editorResult.clusterRewrites.get(i);
        return rewrite ? { ...c, label: rewrite.label, tension: rewrite.tension } : c;
      }),
      creatorPrompts: editorResult.assignmentSentence
        ? [editorResult.assignmentSentence, ...pulse.creatorPrompts.slice(1)]
        : pulse.creatorPrompts,
    };
  }

  pulse = await withBoardAndCycle(pulse);
  await writePulse(pulse);

  // ---- tweet queue: draft ONLY from confirmed facts, never fan posts ----
  const queue = await readQueue();
  const existing = new Set(queue.tweets.map((t) => t.text));
  let draftsQueued = 0;
  const confirmed = factsBundle.facts.filter((f) => f.confidence === "confirmed").slice(0, 3);
  for (const f of confirmed) {
    const text = draftFromFact(f);
    if (existing.has(text)) continue;
    const qt: QueuedTweet = {
      id: `qt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      reason: `Confirmed fact — ${f.source}`,
      sourceGravity: 0,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    queue.tweets.unshift(qt);
    existing.add(text);
    draftsQueued += 1;
  }
  await writeQueue(queue);

  return NextResponse.json({
    ok: true,
    facts: pulse.facts.length,
    factCounts: pulse.admin.factCounts,
    mergeLog: pulse.admin.mergeLog,
    fetched,
    kept: scored.length,
    dropped,
    blocklistDropped,
    beatHalf,
    draftsQueued,
    edited: !!editorResult,
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
