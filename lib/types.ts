// ---- internal (X ingestion) ----

export type Category =
  | "roster-move"
  | "injury"
  | "practice"
  | "presser"
  | "rumor"
  | "analysis"
  | "hype"
  | "rival"
  | "other";

export interface RawPost {
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
  impressions?: number;
  isBeat: boolean;
  url: string;
}

export interface ScoredPost extends RawPost {
  category: Category;
  gravity: number;
  players: string[]; // hint only — NOT a whitelist, NOT a tile gate
}

// ---- FACTS layer (official / beat pages, $0 X) ----

export type FactType = "trade" | "waiver" | "cut" | "sign" | "ir" | "note";
export type FactConfidence = "confirmed" | "disputed" | "note";

export interface FactRef {
  source: string;
  url: string;
  quote: string; // exact sentence, ≤200 chars
}

export interface Fact {
  type: FactType;
  player: string | null;
  detail: string;
  source: string; // primary source label
  url: string; // primary source url
  at: string; // ISO — when the desk saw it
  quote: string; // primary exact sentence, ≤200 chars
  confidence: FactConfidence;
  refs: FactRef[]; // every corroborating sentence (incl. the primary)
}

export interface FactSourceResult {
  url: string;
  ok: boolean;
  parsed: number; // candidate move-sentences extracted
  error?: string;
}

// ---- ARGUMENT layer (X only) ----

export interface BeatItem {
  handle: string;
  name: string;
  text: string; // verbatim, links stripped only
  createdAt: string;
}

export interface FanCluster {
  label: string; // 3–6 words
  tension: string; // one line, both sides if they exist
  authors: number; // unique authors
  tweets: { handle: string; text: string }[]; // ≤ 2, verbatim
  badge: "UNVERIFIED" | "IN PLAY" | null;
}

export interface PlayerTile {
  name: string;
  status: FactType | "mentioned";
  detail: string;
}

export interface PairedQuote {
  event: string;
  beat: { handle: string; text: string };
  fan: { handle: string; text: string };
}

export interface ViralCard {
  handle: string;
  name: string;
  text: string;
  likes: number;
  retweets: number;
  label: "Fan post — not a source.";
  unverified: boolean; // claims a move not on the desk
}

// ---- admin-only ----

export interface AdminMeta {
  factSources: FactSourceResult[];
  factCounts: { confirmed: number; disputed: number; note: number };
  notes: Fact[]; // single-blog signals, hidden from members
  x: { fetched: number; kept: number; dropped: number; beatHalf: string };
  factsFetchedAt: string;
  factsFromCache: boolean;
}

// ---- the payload ----

export interface PulsePayload {
  generatedAt: string;
  source: "live" | "cached-context";
  headerLine: string;
  headline: string;
  summary: string;
  facts: Fact[]; // confirmed + disputed only
  beat: BeatItem[];
  fanArgument: FanCluster[];
  players: PlayerTile[];
  creatorPrompts: string[]; // ≤ 2
  mediaVsFan: PairedQuote[];
  viral: ViralCard[];
  admin: AdminMeta; // the Roster app strips this for non-admins
}
