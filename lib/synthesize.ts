import type {
  PulsePayload,
  ScoredPost,
  Fact,
  FactSourceResult,
  BeatItem,
  FanCluster,
  PlayerTile,
  PairedQuote,
  ViralCard,
} from "./types";
import { stripUrls, extractRosterNames } from "./rank";

const HEADER_LINE = "Facts from official/beat pages. X is the argument.";

function clean(text: string): string {
  return stripUrls(text).replace(/\s+/g, " ").trim();
}

function firstName(full: string): string {
  return full.split(" ")[0];
}

function lastName(full: string): string {
  const p = full.split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/i.test(w));
  return p[p.length - 1] || full;
}

// a fan post that asserts a roster move (verb + name)
const MOVE_ASSERTION =
  /\b(traded|trade|acquired|waived|waive|claimed|released|release|cut|signing|signed|to ir|injured reserve)\b/i;

function assertsMove(text: string): boolean {
  return MOVE_ASSERTION.test(text) && extractRosterNames(text).length > 0;
}

function assertedNames(text: string): string[] {
  return assertsMove(text) ? extractRosterNames(text) : [];
}

// ---- fan argument clustering ----------------------------------------------

const FIXED_TOKENS = ["trade", "53", "RB", "WR", "Poles", "Johnson", "waiver", "cut", "practice squad"];

function tokenLabel(token: string, players: string[]): string {
  const named = players.find((p) => lastName(p).toLowerCase() === token.toLowerCase());
  if (named) return `${lastName(named)} — the fight`;
  if (token === "53") return "The 53-man cut";
  if (token === "RB") return "Running back room";
  if (token === "WR") return "Receiver room";
  if (token === "Poles") return "Poles under fire";
  if (token === "trade") return "Trade fallout";
  if (token === "waiver" || token === "cut") return "Who got cut";
  if (token === "practice squad") return "Practice-squad math";
  return `${token} debate`;
}

const POS = /\b(good|great|love|smart|right call|win|steal|glad|finally|underrated)\b/i;
const NEG = /\b(bad|terrible|hate|dumb|wrong|mistake|overpaid|bust|panic|awful|joke|fleeced)\b/i;

function tensionLine(posts: ScoredPost[]): string {
  const pos = posts.some((p) => POS.test(p.text));
  const neg = posts.some((p) => NEG.test(p.text));
  if (pos && neg) return "Fans split — some call it the right move, others are furious.";
  if (neg) return "The room is mostly angry about it.";
  if (pos) return "The room mostly likes it.";
  return "Fans are chewing on it, no clear side yet.";
}

function buildFanArgument(
  fanPosts: ScoredPost[],
  confirmedFacts: Fact[],
  beatNames: string[],
): FanCluster[] {
  if (fanPosts.length === 0) return [];

  const factPlayers = confirmedFacts.map((f) => f.player).filter((p): p is string => !!p);
  const tokens = [
    ...new Set([
      ...factPlayers.map(lastName),
      ...beatNames.map(lastName),
      ...FIXED_TOKENS,
    ]),
  ];

  // assign each post to the tokens it matches
  const buckets = new Map<string, ScoredPost[]>();
  for (const post of fanPosts) {
    const low = post.text.toLowerCase();
    for (const tok of tokens) {
      const hit =
        tok.length <= 3
          ? new RegExp(`\\b${tok.toLowerCase()}\\b`).test(low)
          : low.includes(tok.toLowerCase());
      if (hit) {
        const list = buckets.get(tok) ?? [];
        list.push(post);
        buckets.set(tok, list);
      }
    }
  }

  const confirmedNames = new Set(factPlayers.map((p) => lastName(p).toLowerCase()));

  const clusters: FanCluster[] = [...buckets.entries()]
    .map(([tok, posts]) => {
      const authors = new Set(posts.map((p) => p.authorHandle)).size;
      const gravity = posts.reduce((s, p) => s + p.gravity, 0);
      const top = [...posts].sort((a, b) => b.gravity - a.gravity).slice(0, 2);

      // badge
      const anyAssertsMove = posts.some((p) => assertsMove(p.text));
      const asserted = new Set(
        posts.flatMap((p) => assertedNames(p.text).map((n) => lastName(n).toLowerCase())),
      );
      const matchesConfirmed =
        confirmedNames.has(tok.toLowerCase()) ||
        [...asserted].some((n) => confirmedNames.has(n));
      let badge: FanCluster["badge"] = null;
      if (matchesConfirmed) badge = "IN PLAY";
      else if (anyAssertsMove) badge = "UNVERIFIED";

      return {
        cluster: {
          label: tokenLabel(tok, [...factPlayers, ...beatNames]),
          tension: tensionLine(posts),
          authors,
          tweets: top.map((p) => ({ handle: p.authorHandle, text: clean(p.text) })),
          badge,
        } as FanCluster,
        authors,
        gravity,
      };
    })
    .filter((c) => c.authors >= 2)
    .sort((a, b) => b.authors - a.authors || b.gravity - a.gravity)
    .slice(0, 5)
    .map((c) => c.cluster);

  return clusters;
}

// ---- player tiles --------------------------------------------------------

function buildPlayerTiles(facts: Fact[], beatPosts: ScoredPost[]): PlayerTile[] {
  const tiles = new Map<string, PlayerTile>();

  for (const f of facts) {
    if (!f.player) continue;
    tiles.set(f.player.toLowerCase(), {
      name: f.player,
      status: f.type,
      detail: f.detail,
    });
  }

  // names in >= 2 beat posts this collect
  const beatCount = new Map<string, { name: string; n: number }>();
  for (const post of beatPosts) {
    for (const name of new Set(extractRosterNames(post.text))) {
      const e = beatCount.get(name.toLowerCase()) ?? { name, n: 0 };
      e.n += 1;
      beatCount.set(name.toLowerCase(), e);
    }
  }
  for (const { name, n } of beatCount.values()) {
    if (n >= 2 && !tiles.has(name.toLowerCase())) {
      tiles.set(name.toLowerCase(), {
        name,
        status: "mentioned",
        detail: `In ${n} beat posts this collect`,
      });
    }
  }

  return [...tiles.values()].slice(0, 8);
}

// ---- media vs fan (confirmed events only) --------------------------------

function buildMediaVsFan(
  confirmedFacts: Fact[],
  beatPosts: ScoredPost[],
  fanPosts: ScoredPost[],
): PairedQuote[] {
  const out: PairedQuote[] = [];
  for (const f of confirmedFacts) {
    if (!f.player) continue;
    const last = lastName(f.player).toLowerCase();
    const b = beatPosts.find((p) => p.text.toLowerCase().includes(last));
    const fan = fanPosts.find((p) => p.text.toLowerCase().includes(last));
    if (b && fan) {
      out.push({
        event: f.detail,
        beat: { handle: b.authorHandle, text: clean(b.text) },
        fan: { handle: fan.authorHandle, text: clean(fan.text) },
      });
    }
  }
  return out;
}

// ---- creator prompts ----------------------------------------------------

function buildPrompts(confirmedFacts: Fact[]): string[] {
  if (confirmedFacts.length === 0) return ["Nothing confirmed. Don't tweet a rumor."];
  return confirmedFacts
    .slice(0, 2)
    .map(
      (f) =>
        `Explain "${f.detail}" in 90 seconds. Do not add names that are not on this desk.`,
    );
}

// ---- headline / summary -----------------------------------------------------

function buildHeadline(confirmedFacts: Fact[]): string {
  if (confirmedFacts.length === 0) return "No new official moves since last collect.";
  return confirmedFacts[0].detail;
}

function buildSummary(confirmedFacts: Fact[]): string {
  if (confirmedFacts.length === 0) return "Desk is waiting on official moves.";
  const parts = confirmedFacts.slice(0, 2).map((f) => f.quote.replace(/[.\s]+$/, ""));
  return parts.join(". ") + ".";
}

// ---- main -----------------------------------------------------------------

export interface SynthesizeInput {
  facts: Fact[];
  factSources: FactSourceResult[];
  factsFetchedAt: string;
  factsFromCache: boolean;
  posts: ScoredPost[]; // all kept X posts (fan + beat)
  xMeta: { fetched: number; kept: number; dropped: number; beatHalf: string };
}

export function synthesize(input: SynthesizeInput): PulsePayload {
  const { facts, factSources, factsFetchedAt, factsFromCache, posts, xMeta } = input;

  const now = new Date().toISOString();

  const beatPosts = posts.filter((p) => p.isBeat);
  const fanPosts = posts.filter((p) => !p.isBeat);

  const uiFacts = facts.filter((f) => f.confidence !== "note");
  const confirmedFacts = facts.filter((f) => f.confidence === "confirmed");
  const disputedFacts = facts.filter((f) => f.confidence === "disputed");
  const noteFacts = facts.filter((f) => f.confidence === "note");

  // beat rail — verbatim, newest first
  const beat: BeatItem[] = beatPosts
    .slice()
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 8)
    .map((p) => ({
      handle: p.authorHandle,
      name: p.authorName,
      text: clean(p.text),
      createdAt: p.createdAt,
    }));

  const beatNames = [...new Set(beatPosts.flatMap((p) => extractRosterNames(p.text)))];

  const players = buildPlayerTiles(uiFacts, beatPosts);
  const fanArgument = buildFanArgument(fanPosts, confirmedFacts, beatNames);
  const mediaVsFan = buildMediaVsFan(confirmedFacts, beatPosts, fanPosts);
  const creatorPrompts = buildPrompts(confirmedFacts);

  const confirmedNames = new Set(
    confirmedFacts.map((f) => (f.player ? lastName(f.player).toLowerCase() : "")),
  );
  const viral: ViralCard[] = fanPosts
    .slice()
    .sort((a, b) => b.gravity - a.gravity)
    .slice(0, 6)
    .map((p) => {
      const asserted = assertedNames(p.text).map((n) => lastName(n).toLowerCase());
      const unverified =
        asserted.length > 0 && !asserted.some((n) => confirmedNames.has(n));
      return {
        handle: p.authorHandle,
        name: p.authorName,
        text: clean(p.text),
        likes: p.likes,
        retweets: p.retweets,
        label: "Fan post — not a source." as const,
        unverified,
      };
    });

  const noNews = uiFacts.length === 0 && posts.length === 0;

  return {
    generatedAt: now,
    source: noNews ? "cached-context" : "live",
    headerLine: HEADER_LINE,
    headline: buildHeadline(confirmedFacts),
    summary: buildSummary(confirmedFacts),
    facts: uiFacts,
    beat,
    fanArgument,
    players,
    creatorPrompts,
    mediaVsFan,
    viral,
    admin: {
      factSources,
      factCounts: {
        confirmed: confirmedFacts.length,
        disputed: disputedFacts.length,
        note: noteFacts.length,
      },
      notes: noteFacts,
      x: xMeta,
      factsFetchedAt,
      factsFromCache,
    },
  };
}

// exported for the collect route's draft-from-confirmed-fact logic
export function draftFromFact(f: Fact): string {
  const via = f.source ? ` (via ${f.source})` : "";
  let t = `Confirmed: ${f.detail}.${via}`.replace(/\s+/g, " ").trim();
  if (t.length > 268) t = `${t.slice(0, 265)}…`;
  return t;
}
