import { kvGetJSON, kvSetJSON } from "./kv";

// Official X cost estimates.
export const COST = {
  read: 0.005, // per post returned
  write: 0.015, // per post
  writeWithUrl: 0.2, // per post that contains a URL
} as const;

export interface SpendData {
  month: string; // YYYY-MM
  day: string; // YYYY-MM-DD
  monthSpendUsd: number;
  readsToday: number;
  postsToday: number;
  readsCostToday: number;
  lastCollectAt: string | null;
  updatedAt: string;
}

export interface Gate {
  ok: boolean;
  reason: string;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v === undefined || v === "" ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const LIMITS = {
  monthlyBudgetUsd: () => num("X_MONTHLY_BUDGET_USD", 25),
  maxReadsPerDay: () => num("X_MAX_READS_PER_DAY", 400),
  maxPostsPerDay: () => num("X_MAX_POSTS_PER_DAY", 5),
  collectEveryMinutes: () => num("X_COLLECT_EVERY_MINUTES", 180),
  maxResultsPerQuery: () => num("X_MAX_RESULTS_PER_QUERY", 20),
  queryCount: () => num("X_QUERY_COUNT", 2),
  viralThreshold: () => num("VIRAL_THRESHOLD", 80),
};

function periodKeys(now = new Date()) {
  const iso = now.toISOString();
  return { month: iso.slice(0, 7), day: iso.slice(0, 10) };
}

function fresh(now = new Date()): SpendData {
  const { month, day } = periodKeys(now);
  return {
    month,
    day,
    monthSpendUsd: 0,
    readsToday: 0,
    postsToday: 0,
    readsCostToday: 0,
    lastCollectAt: null,
    updatedAt: now.toISOString(),
  };
}

export async function saveSpend(data: SpendData): Promise<void> {
  data.updatedAt = new Date().toISOString();
  await kvSetJSON("spend", data);
}

export async function loadSpend(): Promise<SpendData> {
  const data = await kvGetJSON<SpendData | null>("spend", null);
  if (!data) {
    const d = fresh();
    await saveSpend(d);
    return d;
  }

  const { month, day } = periodKeys();
  let changed = false;
  if (data.month !== month) {
    data.month = month;
    data.monthSpendUsd = 0;
    changed = true;
  }
  if (data.day !== day) {
    data.day = day;
    data.readsToday = 0;
    data.postsToday = 0;
    data.readsCostToday = 0;
    changed = true;
  }
  if (changed) await saveSpend(data);
  return data;
}

/**
 * Must pass before any X read (collect). Checks the monthly budget, the daily
 * read cap, the projected cost of the next collect, and the collect throttle.
 */
export async function gateCollect(): Promise<Gate> {
  const s = await loadSpend();
  const budget = LIMITS.monthlyBudgetUsd();

  if (s.monthSpendUsd >= budget) {
    return {
      ok: false,
      reason: `Monthly budget reached ($${s.monthSpendUsd.toFixed(2)} / $${budget.toFixed(2)})`,
    };
  }

  if (s.readsToday >= LIMITS.maxReadsPerDay()) {
    return {
      ok: false,
      reason: `Daily read cap reached (${s.readsToday} / ${LIMITS.maxReadsPerDay()})`,
    };
  }

  const projected =
    LIMITS.maxResultsPerQuery() *
    Math.min(2, LIMITS.queryCount()) *
    COST.read;
  if (s.monthSpendUsd + projected > budget) {
    return { ok: false, reason: "Next collect would exceed the monthly budget" };
  }

  if (s.lastCollectAt) {
    const mins = (Date.now() - new Date(s.lastCollectAt).getTime()) / 60_000;
    const every = LIMITS.collectEveryMinutes();
    if (mins < every) {
      return {
        ok: false,
        reason: `Throttled — ${Math.ceil(every - mins)} min until the next collect is allowed`,
      };
    }
  }

  return { ok: true, reason: "ok" };
}

/** Must pass before any X write (post). */
export async function gateWrite(hasUrl: boolean): Promise<Gate> {
  const s = await loadSpend();
  const budget = LIMITS.monthlyBudgetUsd();
  const allowUrl = (process.env.ALLOW_URL_IN_TWEETS || "false") === "true";

  if (hasUrl && !allowUrl) {
    return {
      ok: false,
      reason: "Tweet contains a URL and ALLOW_URL_IN_TWEETS is false",
    };
  }

  if (s.postsToday >= LIMITS.maxPostsPerDay()) {
    return {
      ok: false,
      reason: `Daily post cap reached (${s.postsToday} / ${LIMITS.maxPostsPerDay()})`,
    };
  }

  const cost = hasUrl ? COST.writeWithUrl : COST.write;
  if (s.monthSpendUsd + cost > budget) {
    return { ok: false, reason: "Post would exceed the monthly budget" };
  }

  return { ok: true, reason: "ok" };
}

/** Record `count` posts returned from a read. Also stamps lastCollectAt. */
export async function recordReads(count: number): Promise<SpendData> {
  const s = await loadSpend();
  const cost = count * COST.read;
  s.readsToday += count;
  s.readsCostToday += cost;
  s.monthSpendUsd += cost;
  s.lastCollectAt = new Date().toISOString();
  await saveSpend(s);
  return s;
}

export async function recordWrite(hasUrl: boolean): Promise<SpendData> {
  const s = await loadSpend();
  s.postsToday += 1;
  s.monthSpendUsd += hasUrl ? COST.writeWithUrl : COST.write;
  await saveSpend(s);
  return s;
}

export async function spendSummary() {
  const s = await loadSpend();
  const budget = LIMITS.monthlyBudgetUsd();
  return {
    month: s.month,
    day: s.day,
    monthSpendUsd: Number(s.monthSpendUsd.toFixed(4)),
    monthlyBudgetUsd: budget,
    remainingUsd: Number(Math.max(0, budget - s.monthSpendUsd).toFixed(4)),
    readsToday: s.readsToday,
    maxReadsPerDay: LIMITS.maxReadsPerDay(),
    readsCostToday: Number(s.readsCostToday.toFixed(4)),
    postsToday: s.postsToday,
    maxPostsPerDay: LIMITS.maxPostsPerDay(),
    lastCollectAt: s.lastCollectAt,
    collectEveryMinutes: LIMITS.collectEveryMinutes(),
    costModel: COST,
    updatedAt: s.updatedAt,
  };
}
