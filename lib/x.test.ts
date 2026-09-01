import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { scrapeSearch, scrapeSearchBeatDesk, hasScrapeCreds } from "./x";

// scrapeSearch / scrapeSearchBeatDesk are the primary (free) X-read path. They
// talk to the twscrape sidecar over HTTP; here fetch is mocked. The route falls
// back to the official twitter-api-v2 path on any throw from these.

const SIDECAR = "https://x-scrape.internal";

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(handler);
  vi.stubGlobal("fetch", fn as unknown as typeof fetch);
  return fn;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// A tweet that clears isBearsFootballPost (mentions "Chicago Bears") and one
// that does not (random fan, no football context).
const bearsTweet = {
  id: "111",
  text: "The Chicago Bears waived a WR today.",
  authorId: "a1",
  authorHandle: "SomeFan",
  authorName: "Some Fan",
  createdAt: "2026-08-31T12:00:00.000Z",
  likes: 5,
  retweets: 1,
  replies: 2,
  quotes: 0,
  impressions: 900,
  url: "https://x.com/SomeFan/status/111",
};
const offTopicTweet = {
  id: "222",
  text: "pizza night with the family",
  authorId: "a2",
  authorHandle: "RandomPerson",
  authorName: "Random Person",
  createdAt: "2026-08-31T12:05:00.000Z",
  likes: 0,
  retweets: 0,
  replies: 0,
  quotes: 0,
  url: "https://x.com/RandomPerson/status/222",
};

beforeEach(() => {
  vi.stubEnv("X_SCRAPE_SERVICE_URL", SIDECAR);
  vi.stubEnv("X_SCRAPE_SERVICE_SECRET", "dev-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("hasScrapeCreds", () => {
  it("is true only when both URL and secret are set", () => {
    expect(hasScrapeCreds()).toBe(true);
    vi.stubEnv("X_SCRAPE_SERVICE_SECRET", "");
    expect(hasScrapeCreds()).toBe(false);
  });
});

describe("scrapeSearch", () => {
  it("maps sidecar tweets to RawPost and applies the Bears-football filter", async () => {
    const fn = mockFetch(() =>
      jsonResponse({ tweets: [bearsTweet, offTopicTweet], count: 2 }),
    );

    const r = await scrapeSearch("Chicago Bears -is:retweet lang:en", 20);

    expect(r.fetched).toBe(2); // both counted
    expect(r.dropped).toBe(1); // off-topic filtered out
    expect(r.posts).toHaveLength(1);
    expect(r.posts[0]).toMatchObject({
      id: "111",
      authorHandle: "SomeFan",
      likes: 5,
      impressions: 900,
      url: "https://x.com/SomeFan/status/111",
    });

    const [url, init] = fn.mock.calls[0];
    expect(url).toBe(`${SIDECAR}/search`);
    expect((init!.headers as Record<string, string>).authorization).toBe("Bearer dev-secret");
    expect(JSON.parse(init!.body as string)).toMatchObject({
      query: "Chicago Bears -is:retweet lang:en",
      limit: 20,
      kind: "latest",
    });
  });

  it("clamps limit into the 10..100 range", async () => {
    const fn = mockFetch(() => jsonResponse({ tweets: [] }));
    await scrapeSearch("q", 5);
    await scrapeSearch("q", 5000);
    expect(JSON.parse(fn.mock.calls[0][1]!.body as string).limit).toBe(10);
    expect(JSON.parse(fn.mock.calls[1][1]!.body as string).limit).toBe(100);
  });

  it("throws on a non-2xx sidecar response (so the route can fall back)", async () => {
    mockFetch(() => jsonResponse({ error: "scrape_failed" }, 502));
    await expect(scrapeSearch("q", 20)).rejects.toThrow(/HTTP 502/);
  });

  it("derives a post URL when the sidecar omits it", async () => {
    mockFetch(() =>
      jsonResponse({ tweets: [{ ...bearsTweet, url: undefined }] }),
    );
    const r = await scrapeSearch("q", 20);
    expect(r.posts[0].url).toBe("https://x.com/SomeFan/status/111");
  });
});

describe("scrapeSearchBeatDesk", () => {
  it("retries with half the beat list when the sidecar returns 422 query_too_long", async () => {
    let call = 0;
    mockFetch(() => {
      call += 1;
      if (call === 1) return jsonResponse({ error: "query_too_long" }, 422);
      return jsonResponse({ tweets: [bearsTweet] });
    });

    const r = await scrapeSearchBeatDesk(20);
    expect(call).toBe(2);
    expect(["even", "odd"]).toContain(r.beatHalf);
    expect(r.posts).toHaveLength(1);
  });

  it("returns beatHalf 'full' on the happy path", async () => {
    mockFetch(() => jsonResponse({ tweets: [] }));
    const r = await scrapeSearchBeatDesk(20);
    expect(r.beatHalf).toBe("full");
  });

  it("propagates a non-422 failure instead of retrying", async () => {
    const fn = mockFetch(() => jsonResponse({ error: "boom" }, 500));
    await expect(scrapeSearchBeatDesk(20)).rejects.toThrow(/HTTP 500/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
