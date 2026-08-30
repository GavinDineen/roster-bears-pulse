import { kvGetJSON, kvSetJSON } from "./kv";
import type { Fact, FactRef, FactSourceResult, FactType } from "./types";

// FACT PIPE — $0 X. Scrapes official / beat transaction pages for confirmed
// roster moves. Fetch only on collect. 8s per source. Cache 3h. All fetches
// fail → last good cache.

const CACHE_KEY = "facts";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const FACT_MAX_AGE_MS = 72 * 60 * 60 * 1000; // ignore moves older than 3 days

type SourceKind = "official" | "wire";

// "official" (Bears / NFL.com / CBS transactions) confirms on its own.
// "wire" (Bears Wire / WCG / Tribune) needs two distinct wires to confirm.
const SOURCES: { url: string; label: string; kind: SourceKind }[] = [
  { url: "https://www.chicagobears.com/news/", label: "Chicago Bears", kind: "official" },
  { url: "https://www.chicagobears.com/team/transactions/", label: "Chicago Bears", kind: "official" },
  {
    url: "https://www.cbssports.com/nfl/teams/CHI/chicago-bears/transactions/",
    label: "CBS Sports",
    kind: "official",
  },
  { url: "https://www.nfl.com/teams/chicago-bears/", label: "NFL.com", kind: "official" },
  {
    url: "https://bearswire.usatoday.com/story/sports/nfl/bears/2026/08/30/bears-53-man-roster-live-updates-cuts-moves/91536935007/",
    label: "Bears Wire",
    kind: "wire",
  },
  {
    url: "https://www.windycitygridiron.com/chicago-bears-news/121341/chicago-bears-2026-53-man-roster-transaction-cut-down-tracker-nfl",
    label: "Windy City Gridiron",
    kind: "wire",
  },
  { url: "https://www.chicagotribune.com/sports/nfl/chicago-bears/", label: "Chicago Tribune", kind: "wire" },
];

// ---- move verbs -----------------------------------------------------------
// trade FIRST — a Dexter-style deal is a trade, never a cut.
const VERB_TYPE: { src: string; type: FactType }[] = [
  {
    src: "trad(?:e|ed|es)|acquir(?:e|ed|es)|deal(?:t|ing)?|receiv(?:e|ed|es)|sent\\s+(?:\\w+\\s+){0,3}to\\b",
    type: "trade",
  },
  {
    src: "plac(?:e|ed)\\b[^.]{0,40}?\\b(?:injured reserve|reserve\\/injured|the ir\\b|\\bir\\b)|to injured reserve|reverted to injured reserve",
    type: "ir",
  },
  { src: "waiv(?:e|ed|es)|claimed\\s+(?:\\w+\\s+){0,4}off waivers|off waivers", type: "waiver" },
  {
    src: "releas(?:e|ed|es)|\\bcut(?:s|\\sdown)?\\b|let go|terminated the contract of",
    type: "cut",
  },
  { src: "sign(?:s|ed)?|re-sign(?:s|ed)?|agreed to terms with|inked", type: "sign" },
];

const VERB_LABEL: Record<FactType, string> = {
  trade: "traded",
  waiver: "waived",
  cut: "released",
  sign: "signed",
  ir: "placed on injured reserve",
  note: "roster note",
};

const NAME_SRC =
  "[A-Z][a-z'’.-]+(?:\\s[A-Z][a-z'’.-]+){1,2}(?:\\s(?:Jr\\.?|Sr\\.?|II|III|IV))?";
const NAME_RE_G = new RegExp(`\\b(${NAME_SRC})\\b`, "g");

const NON_PERSON =
  /\b(bears|chicago|packers|vikings|lions|detroit|green bay|minnesota|atlanta|falcons|carolina|panthers|halas hall|halas|nfl|nfc|afc|espn|cbs sports|cbs|tribune|bears wire|windy city|gridiron|soldier field|practice squad|injured reserve|reserve\/injured|active roster|roster|sunday|monday|tuesday|wednesday|thursday|friday|saturday|august|september|training camp|free agency|the athletic|super bowl|week \d)\b/i;

const BEARS_CTX = /\b(bears|chicago|halas|poles|dexter|caleb)\b/i;

// Only trust sentences that read like a transaction announcement — not feature
// copy, commercials, or "welcomes to high school".
const ANNOUNCEMENT =
  /^(the\s+)?(chicago\s+)?bears\b|\b(announce[ds]?\b|roster moves?\b|transaction|per (a )?source|officially (waiv|trad|releas|sign|plac)|reportedly (waiv|trad|releas|sign|plac))|\b(TRADE|TRADED|SIGNED|WAIVED|CUT|RELEASED|CLAIMED|IR)\s*:/i;

const INSTITUTION = /\b(high school|university|college|academy|institute|hospital)\b/i;

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const DATE_RE = new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2})(?:,?\\s+(20\\d\\d))?`, "i");

function parseSeenDate(sentence: string): string {
  const m = sentence.match(DATE_RE);
  if (!m) return new Date().toISOString();
  const monthIdx = MONTHS.split("|").indexOf(m[1].slice(0, 3).toLowerCase());
  const year = m[3] ? Number(m[3]) : new Date().getFullYear();
  const d = new Date(Date.UTC(year, monthIdx < 0 ? new Date().getMonth() : monthIdx, Number(m[2])));
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&#39;|&rsquo;|&apos;|&#8217;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;|&#8212;/g, "—")
    .replace(/&[a-z0-9#]+;/gi, " ");
}

function htmlToText(html: string): string {
  let text = "";

  for (const m of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const nodes = Array.isArray(parsed)
        ? parsed
        : [parsed, ...(Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [])];
      for (const n of nodes) {
        if (!n || typeof n !== "object") continue;
        for (const k of ["headline", "articleBody", "description", "name"]) {
          const v = (n as Record<string, unknown>)[k];
          if (typeof v === "string") text += " " + v + ". ";
        }
      }
    } catch {
      /* malformed ld+json */
    }
  }

  const stripped = html.replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ");
  for (const m of stripped.matchAll(
    /<(h1|h2|h3|h4|p|li|a|td|th|dd|dt|figcaption|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi,
  )) {
    text += " " + m[2].replace(/<[^>]+>/g, " ") + " . ";
  }

  // split "TRADE:" / "WAIVED:" / "SIGNED:" markers into their own sentences
  return decodeEntities(text)
    .replace(/\b(TRADE|TRADED|SIGNED|WAIVED|CUT|RELEASED|CLAIMED|IR|PLACED ON IR)\s*:/g, ". $1: ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?:])\s+(?=["'#A-Z])|(?<=\d{4})\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16 && s.length <= 300);
}

function cleanQuote(s: string): string {
  return s
    .replace(/\(\s*link\s*\)/gi, "")
    .replace(/\s*\.\s*$/g, ".")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function cleanName(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim().replace(/[.,;:]+$/, "");
  if (!t || NON_PERSON.test(t) || INSTITUTION.test(t)) return null;
  if (!new RegExp(`^${NAME_SRC}$`).test(t)) return null;
  return t;
}

interface Move {
  type: FactType;
  player: string;
}

/** Grouping key — suffixes and punctuation don't make it a different player. */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.']/g, "")
    .replace(/\s+(jr|sr|ii|iii|iv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * All moves in a sentence. Each name is attributed to the nearest roster verb
 * that appears before it (≤ 70 chars), so "signed A and B and waived C" yields
 * sign A, sign B, waiver C.
 */
function extractMoves(sentence: string): Move[] {
  if (!ANNOUNCEMENT.test(sentence)) return [];

  const verbHits: { idx: number; type: FactType }[] = [];
  for (const { src, type } of VERB_TYPE) {
    // trailing (?![a-z]) so "receive" ≠ "receivers", "sign" ≠ "signee/signings"
    for (const m of sentence.matchAll(new RegExp(`\\b(?:${src})(?![a-z])`, "gi"))) {
      if (m.index != null) verbHits.push({ idx: m.index, type });
    }
  }
  if (verbHits.length === 0) return [];
  verbHits.sort((a, b) => a.idx - b.idx);

  const out: Move[] = [];
  const seen = new Set<string>();
  for (const nm of sentence.matchAll(NAME_RE_G)) {
    if (nm.index == null) continue;
    const name = cleanName(nm[1]);
    if (!name) continue;
    let owner: FactType | null = null;
    for (const v of verbHits) {
      if (v.idx < nm.index && nm.index - v.idx <= 70) owner = v.type;
      if (v.idx >= nm.index) break;
    }
    if (!owner) continue;
    const key = `${name.toLowerCase()}|${owner}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: owner, player: name });
  }
  return out;
}

async function fetchText(url: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("html") && !ct.includes("xml")) throw new Error(`non-html (${ct})`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

interface RawFact {
  type: FactType;
  player: string;
  quote: string;
  at: string;
  source: string;
  url: string;
  kind: SourceKind;
}

const SKIP_HTML = /(subscribe to continue|to read this article|metered paywall|paywall-)/i;

async function extractSource(src: {
  url: string;
  label: string;
  kind: SourceKind;
}): Promise<{ result: FactSourceResult; raw: RawFact[] }> {
  try {
    const html = await fetchText(src.url);
    if (SKIP_HTML.test(html.slice(0, 6000))) {
      return { result: { url: src.url, ok: true, parsed: 0, error: "paywalled" }, raw: [] };
    }
    const text = htmlToText(html);
    const raw: RawFact[] = [];
    const seen = new Set<string>();
    const cutoff = Date.now() - FACT_MAX_AGE_MS;
    let lastDate = new Date().toISOString(); // undated sentence inherits the last date seen

    for (const s of sentences(text)) {
      const d = s.match(DATE_RE);
      if (d) lastDate = parseSeenDate(s);
      if (!BEARS_CTX.test(s)) continue;

      const at = d ? parseSeenDate(s) : lastDate;
      if (new Date(at).getTime() < cutoff) continue; // stale move — skip

      for (const mv of extractMoves(s)) {
        const key = `${nameKey(mv.player)}|${mv.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        raw.push({
          type: mv.type,
          player: mv.player,
          quote: cleanQuote(s),
          at,
          source: src.label,
          url: src.url,
          kind: src.kind,
        });
      }
    }
    return { result: { url: src.url, ok: true, parsed: raw.length }, raw };
  } catch (e) {
    return {
      result: { url: src.url, ok: false, parsed: 0, error: (e as Error).message },
      raw: [],
    };
  }
}

// ---- promotion -----------------------------------------------------------

function dedupeRefs(items: { source: string; url: string; quote: string }[]): FactRef[] {
  const out: FactRef[] = [];
  const seen = new Set<string>();
  for (const r of items) {
    const k = `${r.source}|${r.quote}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ source: r.source, url: r.url, quote: r.quote });
  }
  return out;
}

function promote(all: RawFact[]): Fact[] {
  const groups = new Map<string, RawFact[]>();
  for (const r of all) {
    const k = `${nameKey(r.player)}|${r.type}`;
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }

  const facts: Fact[] = [];
  for (const group of groups.values()) {
    const official = group.filter((g) => g.kind === "official");
    const distinctWires = new Set(group.filter((g) => g.kind === "wire").map((g) => g.source));

    const confidence: Fact["confidence"] =
      official.length >= 1 || distinctWires.size >= 2 ? "confirmed" : "note";

    const primary = official[0] ?? group[0];
    const newestAt = group.map((g) => g.at).sort().reverse()[0];
    facts.push({
      type: primary.type,
      player: primary.player,
      detail: `Bears ${VERB_LABEL[primary.type]} ${primary.player}`,
      source: primary.source,
      url: primary.url,
      at: newestAt,
      quote: primary.quote,
      confidence,
      refs: dedupeRefs(group),
    });
  }

  // disputes: same player, conflicting types with support → all disputed
  const byPlayer = new Map<string, Fact[]>();
  for (const f of facts) {
    if (!f.player) continue;
    const list = byPlayer.get(nameKey(f.player)) ?? [];
    list.push(f);
    byPlayer.set(nameKey(f.player), list);
  }
  const TWO_DAYS = 2 * 24 * 60 * 60 * 1000;
  for (const list of byPlayer.values()) {
    if (list.length < 2 || new Set(list.map((f) => f.type)).size < 2) continue;
    // a real disagreement = conflicting move types within ~2 days of each other.
    // Further apart, it's just a sequence — keep the most recent, drop the rest.
    const times = list.map((f) => new Date(f.at).getTime());
    const spread = Math.max(...times) - Math.min(...times);
    if (spread <= TWO_DAYS) {
      const merged = dedupeRefs(list.flatMap((f) => f.refs));
      for (const f of list) {
        f.confidence = "disputed";
        f.refs = merged;
      }
    } else {
      list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      for (const stale of list.slice(1)) facts.splice(facts.indexOf(stale), 1);
    }
  }

  // newest confirmed first
  return facts.sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));
}

// ---- public -------------------------------------------------------------

export interface FactsBundle {
  facts: Fact[];
  sources: FactSourceResult[];
  fetchedAt: string;
  fromCache: boolean;
}

interface CachedFacts {
  bundle: FactsBundle;
  storedAt: number;
}

export async function getFacts(): Promise<FactsBundle> {
  const cached = await kvGetJSON<CachedFacts | null>(CACHE_KEY, null);
  if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
    return { ...cached.bundle, fromCache: true };
  }

  const settled = await Promise.all(SOURCES.map(extractSource));
  const sources = settled.map((s) => s.result);
  const allRaw = settled.flatMap((s) => s.raw);

  if (!sources.some((s) => s.ok) && cached) {
    return { ...cached.bundle, sources, fromCache: true };
  }

  const bundle: FactsBundle = {
    facts: promote(allRaw),
    sources,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };
  await kvSetJSON(CACHE_KEY, { bundle, storedAt: Date.now() } as CachedFacts);
  return bundle;
}
