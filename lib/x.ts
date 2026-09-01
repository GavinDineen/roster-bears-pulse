import { TwitterApi } from "twitter-api-v2";
import type { RawPost } from "./types";
import { isBeatHandle, isBearsFootballPost } from "./filter";
import { BEAT_QUERY_HANDLES, buildBeatQuery, pickBeatHalf } from "./config";

export function hasReadCreds(): boolean {
  return !!process.env.X_BEARER_TOKEN;
}

export function hasWriteCreds(): boolean {
  return !!(
    process.env.X_APP_KEY &&
    process.env.X_APP_SECRET &&
    process.env.X_ACCESS_TOKEN &&
    process.env.X_ACCESS_SECRET
  );
}

/**
 * Whether the twscrape sidecar is configured. When it is, it's the PRIMARY
 * read path (free) and the official API below is only the fallback.
 */
export function hasScrapeCreds(): boolean {
  return !!(
    process.env.X_SCRAPE_SERVICE_URL && process.env.X_SCRAPE_SERVICE_SECRET
  );
}

/** Whether an X recent-search read is possible at all (credentials present). */
export function canRead(): boolean {
  return hasReadCreds();
}

/** Whether an X post write is possible at all (credentials present). */
export function canWrite(): boolean {
  return hasWriteCreds();
}

function readClient(): TwitterApi {
  return new TwitterApi(process.env.X_BEARER_TOKEN as string);
}

function writeClient(): TwitterApi {
  return new TwitterApi({
    appKey: process.env.X_APP_KEY as string,
    appSecret: process.env.X_APP_SECRET as string,
    accessToken: process.env.X_ACCESS_TOKEN as string,
    accessSecret: process.env.X_ACCESS_SECRET as string,
  });
}

export interface SearchResult {
  posts: RawPost[]; // kept — passed the Bears-football filter
  fetched: number; // total posts returned by X (all billed, kept or not)
  dropped: number; // fetched - kept
}

/**
 * Apply the Bears-football filter and shape a SearchResult. Shared by the
 * official API path (recentSearch) and the twscrape path (scrapeSearch) so both
 * drop the same posts and count `fetched` the same way.
 */
function buildSearchResult(built: RawPost[]): SearchResult {
  const posts = built.filter((p) => isBearsFootballPost(p.text, p.authorHandle));
  return { posts, fetched: built.length, dropped: built.length - posts.length };
}

function clampMaxResults(maxResults: number): number {
  return Math.min(100, Math.max(10, Math.floor(maxResults)));
}

/**
 * One recent-search request. `maxResults` is clamped to the API's 10..100 range.
 * Every returned post is billed by the caller; posts that fail
 * isBearsFootballPost are dropped here and never refetched.
 */
export async function recentSearch(
  query: string,
  maxResults: number
): Promise<SearchResult> {
  const client = readClient();
  const res = await client.v2.search(query, {
    max_results: clampMaxResults(maxResults),
    "tweet.fields": ["public_metrics", "created_at", "author_id", "lang"],
    expansions: ["author_id"],
    "user.fields": ["username", "name"],
  });

  const users = new Map<string, { username: string; name: string }>();
  for (const u of res.includes?.users ?? []) {
    users.set(u.id, { username: u.username, name: u.name });
  }

  const built: RawPost[] = [];
  for (const t of res.tweets ?? []) {
    const u =
      users.get(t.author_id ?? "") ?? { username: "unknown", name: "Unknown" };
    const m = t.public_metrics ?? {
      like_count: 0,
      retweet_count: 0,
      reply_count: 0,
      quote_count: 0,
    };
    built.push({
      id: t.id,
      text: t.text,
      authorId: t.author_id ?? "",
      authorHandle: u.username,
      authorName: u.name,
      createdAt: t.created_at ?? new Date().toISOString(),
      likes: m.like_count ?? 0,
      retweets: m.retweet_count ?? 0,
      replies: m.reply_count ?? 0,
      quotes: m.quote_count ?? 0,
      impressions: (m as { impression_count?: number }).impression_count,
      isBeat: isBeatHandle(u.username),
      url: `https://x.com/${u.username}/status/${t.id}`,
    });
  }

  return buildSearchResult(built);
}

/**
 * Query 2 — the local beat desk in ONE search. If X rejects the full handle
 * list as too long (HTTP 400), fall back to half the list, alternating even/odd
 * each collect. `beatHalf` reports which slice ran.
 */
export async function searchBeatDesk(
  maxResults: number
): Promise<SearchResult & { beatHalf: "full" | "even" | "odd" }> {
  try {
    const r = await recentSearch(buildBeatQuery(BEAT_QUERY_HANDLES), maxResults);
    return { ...r, beatHalf: "full" };
  } catch (e) {
    if ((e as { code?: number }).code !== 400) throw e;
    const half = pickBeatHalf();
    const handles = BEAT_QUERY_HANDLES.filter((_, i) =>
      half === "even" ? i % 2 === 0 : i % 2 === 1
    );
    const r = await recentSearch(buildBeatQuery(handles), maxResults);
    return { ...r, beatHalf: half };
  }
}

// ---- twscrape sidecar (PRIMARY read path) ---------------------------------
// Free reads via the twscrape HTTP sidecar (services/x-scrape). On ANY failure
// the collect route falls back to recentSearch/searchBeatDesk above, which stay
// budget-gated by lib/spend.ts. The sidecar is only ever called from
// /api/collect — never on page load, never in dev, never in a loop.

class ScrapeQueryTooLongError extends Error {
  constructor() {
    super("scrape service: query_too_long");
    this.name = "ScrapeQueryTooLongError";
  }
}

interface ScrapeTweet {
  id: string;
  text: string;
  authorId: string;
  authorHandle: string;
  authorName: string;
  createdAt: string;
  likes: number;
  retweets: number;
  replies: number;
  quotes: number;
  impressions?: number | null;
  url?: string;
}

/** One search via the twscrape sidecar. Throws on any non-2xx or transport error. */
export async function scrapeSearch(
  query: string,
  maxResults: number
): Promise<SearchResult> {
  const base = (process.env.X_SCRAPE_SERVICE_URL as string).replace(/\/+$/, "");
  const res = await fetch(`${base}/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.X_SCRAPE_SERVICE_SECRET as string}`,
    },
    body: JSON.stringify({
      query,
      limit: clampMaxResults(maxResults),
      kind: "latest",
    }),
    signal: AbortSignal.timeout(20_000),
  });

  if (res.status === 422) throw new ScrapeQueryTooLongError();
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`scrape service HTTP ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}`);
  }

  const data = (await res.json()) as { tweets?: ScrapeTweet[] };
  const built: RawPost[] = (data.tweets ?? []).map((t) => ({
    id: t.id,
    text: t.text,
    authorId: t.authorId ?? "",
    authorHandle: t.authorHandle || "unknown",
    authorName: t.authorName || t.authorHandle || "Unknown",
    createdAt: t.createdAt || new Date().toISOString(),
    likes: t.likes ?? 0,
    retweets: t.retweets ?? 0,
    replies: t.replies ?? 0,
    quotes: t.quotes ?? 0,
    impressions: t.impressions ?? undefined,
    isBeat: isBeatHandle(t.authorHandle),
    url: t.url || `https://x.com/${t.authorHandle}/status/${t.id}`,
  }));

  return buildSearchResult(built);
}

/** Query 2 via the twscrape sidecar — mirrors searchBeatDesk's half-list fallback. */
export async function scrapeSearchBeatDesk(
  maxResults: number
): Promise<SearchResult & { beatHalf: "full" | "even" | "odd" }> {
  try {
    const r = await scrapeSearch(buildBeatQuery(BEAT_QUERY_HANDLES), maxResults);
    return { ...r, beatHalf: "full" };
  } catch (e) {
    if (!(e instanceof ScrapeQueryTooLongError)) throw e;
    const half = pickBeatHalf();
    const handles = BEAT_QUERY_HANDLES.filter((_, i) =>
      half === "even" ? i % 2 === 0 : i % 2 === 1
    );
    const r = await scrapeSearch(buildBeatQuery(handles), maxResults);
    return { ...r, beatHalf: half };
  }
}

export async function postTweet(text: string): Promise<{ id: string }> {
  const client = writeClient();
  const res = await client.v2.tweet(text);
  return { id: res.data.id };
}
