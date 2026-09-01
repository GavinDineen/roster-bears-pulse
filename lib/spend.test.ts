import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// In-memory KV so the gate/record logic is exercised without touching
// .data/spend.json on disk.
const store = new Map<string, unknown>();
vi.mock("./kv", () => ({
  usingRedis: false,
  kvGetJSON: async <T>(key: string, fallback: T): Promise<T> =>
    store.has(key) ? (store.get(key) as T) : fallback,
  kvSetJSON: async (key: string, value: unknown): Promise<void> => {
    store.set(key, value);
  },
}));

import {
  gateCollect,
  gateOfficialFallback,
  recordScrapeReads,
  saveSpend,
  scrapeActive,
  type SpendData,
} from "./spend";

function seed(over: Partial<SpendData> = {}): Promise<void> {
  const now = new Date().toISOString();
  const { month, day } = { month: now.slice(0, 7), day: now.slice(0, 10) };
  return saveSpend({
    month,
    day,
    monthSpendUsd: 0,
    readsToday: 0,
    postsToday: 0,
    collectsToday: 0,
    readsCostToday: 0,
    lastCollectAt: null,
    updatedAt: now,
    ...over,
  });
}

beforeEach(() => {
  store.clear();
  vi.stubEnv("X_MONTHLY_BUDGET_USD", "25");
  vi.stubEnv("X_MAX_COLLECTS_PER_DAY", "4");
  vi.stubEnv("X_COLLECT_EVERY_MINUTES", "90");
  vi.stubEnv("X_SOFT_CAP_USD", "22");
});
afterEach(() => vi.unstubAllEnvs());

describe("scrape path (X_SCRAPE_SERVICE_URL + SECRET set)", () => {
  beforeEach(() => {
    vi.stubEnv("X_SCRAPE_SERVICE_URL", "https://x-scrape.internal");
    vi.stubEnv("X_SCRAPE_SERVICE_SECRET", "dev");
  });

  it("scrapeActive() reflects both vars", () => {
    expect(scrapeActive()).toBe(true);
    vi.stubEnv("X_SCRAPE_SERVICE_URL", "");
    expect(scrapeActive()).toBe(false);
  });

  it("gateCollect ignores an over-budget monthSpendUsd", async () => {
    await seed({ monthSpendUsd: 999 });
    const g = await gateCollect();
    expect(g).toMatchObject({ ok: true, skipX: false });
  });

  it("gateCollect still enforces the daily collect cap", async () => {
    await seed({ monthSpendUsd: 0, collectsToday: 4 });
    const g = await gateCollect();
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/collect cap/i);
  });

  it("gateCollect still enforces the 90-minute throttle", async () => {
    await seed({ lastCollectAt: new Date(Date.now() - 10 * 60_000).toISOString() });
    const g = await gateCollect();
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/throttled/i);
  });

  it("recordScrapeReads adds $0 but consumes a collect slot and starts the throttle", async () => {
    await seed();
    const s = await recordScrapeReads(40);
    expect(s.monthSpendUsd).toBe(0);
    expect(s.readsCostToday).toBe(0);
    expect(s.readsToday).toBe(40);
    expect(s.collectsToday).toBe(1);
    expect(s.lastCollectAt).not.toBeNull();
  });
});

describe("gateOfficialFallback (paid path re-check)", () => {
  it("blocks when the monthly budget is exhausted, even with scrape env set", async () => {
    vi.stubEnv("X_SCRAPE_SERVICE_URL", "https://x-scrape.internal");
    vi.stubEnv("X_SCRAPE_SERVICE_SECRET", "dev");
    await seed({ monthSpendUsd: 25 });
    const g = await gateOfficialFallback();
    expect(g.ok).toBe(false);
    expect(g.reason).toMatch(/budget/i);
  });

  it("comes back skipX at the soft cap", async () => {
    await seed({ monthSpendUsd: 22.5 });
    const g = await gateOfficialFallback();
    expect(g).toMatchObject({ ok: true, skipX: true });
  });
});

describe("official path unchanged when scrape env is absent", () => {
  it("gateCollect still returns skipX at the soft cap", async () => {
    await seed({ monthSpendUsd: 22.5 });
    const g = await gateCollect();
    expect(g).toMatchObject({ ok: true, skipX: true });
  });

  it("gateCollect fully blocks over budget", async () => {
    await seed({ monthSpendUsd: 25 });
    const g = await gateCollect();
    expect(g.ok).toBe(false);
  });
});
