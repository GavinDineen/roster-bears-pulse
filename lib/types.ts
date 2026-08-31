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

/**
 * One asset in a trade — a player or a pick — with which way it moved.
 * Lets the Wire card show a per-leg status column ("Dexter traded / Phillips
 * acquired") instead of collapsing a multi-asset deal into a single name.
 */
export interface FactLeg {
  label: string; // e.g. "DT Gervon Dexter Sr." or "2027 5th-round pick"
  kind: "player" | "pick";
  direction: "out" | "in"; // "out" = left the Bears, "in" = Bears received
  status: string; // e.g. "Dexter traded", "Phillips acquired"
}

export interface Fact {
  type: FactType;
  player: string | null; // primary named leg (first player leg), or null
  legs?: FactLeg[]; // every leg of the event — always populated by promote()
  counterpartyTeam?: string | null; // trade: the other team in the deal
  detail: string;
  source: string; // primary source label
  url: string; // primary source url
  at: string; // ISO — the trade/move date, set once per merged event
  quote: string; // primary exact sentence, ≤200 chars, from the best source
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
  text: string; // verbatim, links + photo-credit captions stripped only
  createdAt: string;
  url: string; // link to the original X post
}

export interface FanCluster {
  label: string; // 3–6 words
  tension: string; // one line, both sides if they exist
  authors: number; // unique authors
  tweets: { handle: string; text: string; url: string }[]; // ≤ 2, verbatim
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
  x: {
    fetched: number;
    kept: number;
    dropped: number;
    beatHalf: string;
    blocklistDropped: number; // fan-spam accounts/phrases dropped this collect
  };
  factsFetchedAt: string;
  factsFromCache: boolean;
  // "facts collapsed from N → 1" — one entry per multi-source event merged
  mergeLog: { key: string; from: number; to: number }[];
}

// ---- the payload ----

export interface PulsePayload {
  generatedAt: string;
  source: "live" | "cached-context";
  headerLine: string;
  headline: string;
  summary: string;
  facts: Fact[]; // confirmed + disputed only, one card per event
  beat: BeatItem[];
  fanArgument: FanCluster[];
  players: PlayerTile[];
  creatorPrompts: string[]; // ≤ 2 — also the sticky assignment strip
  // Retired: pairing a Bears-side confirmed fact with an off-topic fan/media
  // post from the other side of a trade misrepresented them as one event.
  // Kept only for payload-shape compatibility with the Roster app; always [].
  mediaVsFan: PairedQuote[];
  viral: ViralCard[];
  admin: AdminMeta; // the Roster app strips this for non-admins
}
