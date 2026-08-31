import { kvGetJSON, kvSetJSON } from "./kv";
import { extractTradeLegsLLM } from "./llmExtract";
import type { Fact, FactLeg, FactRef, FactSourceResult, FactType, FactConfidence } from "./types";

// FACT PIPE — $0 X. Scrapes official / beat transaction pages for confirmed
// roster moves. Fetch only on collect. 8s per source. Cache 3h. All fetches
// fail → last good cache.
//
// Trades: every leg of a deal (players + picks, either direction) is merged
// into ONE Fact keyed by the counterparty team — never one Fact per player.
// See buildTradeFact() / promote().

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
// Trade verbs split by direction so a merged deal can say "trade X to Team for
// Y" instead of collapsing every leg into the same "traded" word regardless of
// which way the asset actually moved.
const TRADE_OUT_VERB = "trad(?:e|ed|es)|deal(?:t|ing)?|sen[dt]|sending|ship(?:s|ped|ping)?";
const TRADE_IN_VERB = "acquir(?:e|ed|es|ing)|receiv(?:e|ed|es|ing)";

// trade FIRST — a Dexter-style deal is a trade, never a cut.
const VERB_TYPE: { src: string; type: FactType }[] = [
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

const POS_ABBR = "QB|RB|FB|WR|TE|OL|OT|OG|IOL|C|DL|DT|DE|EDGE|LB|OLB|ILB|CB|S|FS|SS|K|P|LS";
const NAME_WITH_POS_RE_G = new RegExp(`\\b(?:(${POS_ABBR})\\s+)?(${NAME_SRC})\\b`, "g");

const NON_PERSON =
  /\b(bears|chicago|packers|vikings|lions|detroit|green bay|minnesota|atlanta|falcons|carolina|panthers|halas hall|halas|nfl|nfc|afc|espn|cbs sports|cbs|tribune|bears wire|windy city|gridiron|soldier field|practice squad|injured reserve|reserve\/injured|active roster|roster|sunday|monday|tuesday|wednesday|thursday|friday|saturday|august|september|training camp|free agency|the athletic|super bowl|week \d)\b/i;

const BEARS_CTX = /\b(bears|chicago|halas|poles|dexter|caleb)\b/i;

// Only trust sentences that read like a transaction announcement — not feature
// copy, commercials, or "welcomes to high school".
const ANNOUNCEMENT =
  /^(the\s+)?(chicago\s+)?bears\b|\b(announce[ds]?\b|roster moves?\b|transaction|per (a )?source|officially (waiv|trad|releas|sign|plac|acquir)|reportedly (waiv|trad|releas|sign|plac|acquir))|\b(TRADE|TRADED|SIGNED|WAIVED|CUT|RELEASED|CLAIMED|IR|ACQUIRED)\s*:/i;

const INSTITUTION = /\b(high school|university|college|academy|institute|hospital)\b/i;

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec";
const DATE_RE = new RegExp(`\\b(${MONTHS})[a-z]*\\.?\\s+(\\d{1,2})(?:,?\\s+(20\\d\\d))?`, "i");

// ---- NFL team recognition (trade counterparty) -----------------------------

const TEAM_ALIASES: [RegExp, string][] = [
  [/packers|green bay/i, "Packers"],
  [/vikings|minnesota/i, "Vikings"],
  [/\blions\b|detroit/i, "Lions"],
  [/cowboys/i, "Cowboys"],
  [/eagles/i, "Eagles"],
  [/giants/i, "Giants"],
  [/commanders/i, "Commanders"],
  [/49ers|niners/i, "49ers"],
  [/seahawks/i, "Seahawks"],
  [/\brams\b/i, "Rams"],
  [/cardinals/i, "Cardinals"],
  [/falcons|atlanta/i, "Falcons"],
  [/panthers/i, "Panthers"],
  [/saints/i, "Saints"],
  [/buccaneers|\bbucs\b/i, "Buccaneers"],
  [/bengals/i, "Bengals"],
  [/browns/i, "Browns"],
  [/ravens/i, "Ravens"],
  [/steelers/i, "Steelers"],
  [/\bbills\b/i, "Bills"],
  [/dolphins/i, "Dolphins"],
  [/patriots/i, "Patriots"],
  [/\bjets\b/i, "Jets"],
  [/titans/i, "Titans"],
  [/\bcolts\b/i, "Colts"],
  [/texans/i, "Texans"],
  [/jaguars|\bjags\b/i, "Jaguars"],
  [/broncos/i, "Broncos"],
  [/chiefs/i, "Chiefs"],
  [/raiders/i, "Raiders"],
  [/chargers/i, "Chargers"],
];

const TEAM_TOKEN =
  "(?:Packers|Green Bay|Vikings|Minnesota|Lions|Detroit|Cowboys|Eagles|Giants|Commanders|49ers|Niners|Seahawks|Rams|Cardinals|Falcons|Atlanta|Panthers|Saints|Buccaneers|Bucs|Bengals|Browns|Ravens|Steelers|Bills|Dolphins|Patriots|Jets|Titans|Colts|Texans|Jaguars|Jags|Broncos|Chiefs|Raiders|Chargers)";

function canonicalTeam(raw: string): string | null {
  for (const [re, name] of TEAM_ALIASES) if (re.test(raw)) return name;
  return null;
}

const ANY_TEAM_RE = new RegExp(`\\b(?:the\\s+)?(${TEAM_TOKEN})\\b`, "i");

/** First non-Bears team mentioned anywhere in the sentence, if any. */
function sentenceTeamOf(sentence: string): string | null {
  const m = sentence.match(ANY_TEAM_RE);
  return m ? canonicalTeam(m[1]) : null;
}

const PREP_TEAM_RE = new RegExp(`\\b(to|from)\\s+(?:the\\s+)?(${TEAM_TOKEN})\\b`, "i");
const TRADE_VERB_RE = new RegExp(`\\b(?:${TRADE_OUT_VERB}|${TRADE_IN_VERB})(?![a-z])`, "i");

// ---- draft-pick recognition -------------------------------------------------

const ORDINAL_WORDS = "first|second|third|fourth|fifth|sixth|seventh";
const ORDINAL_NUMS = "1st|2nd|3rd|4th|5th|6th|7th";
const ORD_MAP: Record<string, string> = {
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  sixth: "6th",
  seventh: "7th",
};
function normOrdinal(o: string): string {
  return ORD_MAP[o.toLowerCase()] || o.toLowerCase();
}

const PICK_RE = new RegExp(
  `\\b(20\\d{2})\\s+(${ORDINAL_WORDS}|${ORDINAL_NUMS})(?:-round|\\s+round)?(?:\\s+(?:pick|selection))?\\b`,
  "gi",
);
const PICK_RE_REV = new RegExp(
  `\\b(${ORDINAL_WORDS}|${ORDINAL_NUMS})(?:-round|\\s+round)?\\s+(?:pick|selection)\\b(?:[^.]{0,20}?\\bin\\s+(20\\d{2}))?`,
  "gi",
);

function findPicks(segment: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of segment.matchAll(PICK_RE)) {
    const label = `${m[1]} ${normOrdinal(m[2])}-round pick`;
    if (seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  if (out.length === 0) {
    for (const m of segment.matchAll(PICK_RE_REV)) {
      const year = m[2] ? `${m[2]} ` : "";
      const label = `${year}${normOrdinal(m[1])}-round pick`;
      if (seen.has(label)) continue;
      seen.add(label);
      out.push(label);
    }
  }
  return out;
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
    .replace(/\b(TRADE|TRADED|SIGNED|WAIVED|CUT|RELEASED|CLAIMED|IR|PLACED ON IR|ACQUIRED)\s*:/g, ". $1: ")
    .replace(/\s+/g, " ")
    .trim();
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?:])\s+(?=["'#A-Z])|(?<=\d{4})\s+(?=[A-Z])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 16 && s.length <= 320);
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

/** Strip a leading position abbreviation ("DT ") to get a display-friendly name. */
function stripPos(raw: string): string {
  return raw.replace(new RegExp(`^(?:${POS_ABBR})\\s+`), "");
}

/** Last name, ignoring a leading position abbreviation and trailing suffix. */
function shortLabel(raw: string): string {
  const noPos = stripPos(raw);
  const parts = noPos.split(" ").filter((w) => !/^(Jr\.?|Sr\.?|II|III|IV)$/i.test(w));
  return parts[parts.length - 1] || noPos;
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
 * Non-trade moves (waiver/cut/sign/ir) in a sentence. Each name is attributed
 * to the nearest roster verb that appears before it (≤ 70 chars), so "signed A
 * and waived B" yields sign A, waiver B.
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

// ---- trade-specific extraction ---------------------------------------------

interface TradeLegRaw {
  label: string;
  kind: "player" | "pick";
}

interface TradeParse {
  team: string;
  outgoing: TradeLegRaw[];
  incoming: TradeLegRaw[];
}

function findNames(segment: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of segment.matchAll(NAME_WITH_POS_RE_G)) {
    const name = cleanName(m[2]);
    if (!name) continue;
    const label = m[1] ? `${m[1].toUpperCase()} ${name}` : name;
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * Structural parse of a single trade sentence: "[verb] [legs] to/from [TEAM]
 * [in exchange for / for] [legs]". Position of "to" vs "from" tells us which
 * side is outgoing. Returns null when the sentence doesn't have a clean
 * "[prep] TEAM" anchor — caller falls back to the looser per-name pass.
 */
function parseTradeSentence(sentence: string): TradeParse | null {
  const prep = sentence.match(PREP_TEAM_RE);
  if (!prep || prep.index == null) return null;
  const team = canonicalTeam(prep[2]);
  if (!team) return null;

  const verbM = sentence.match(TRADE_VERB_RE);
  const verbEnd = verbM && verbM.index != null ? verbM.index + verbM[0].length : 0;
  const prepIdx = prep.index;
  const prepEnd = prepIdx + prep[0].length;
  if (verbEnd > prepIdx) return null;

  const segA = sentence.slice(verbEnd, prepIdx);
  const segB = sentence
    .slice(prepEnd)
    .replace(/^\s*(in exchange for|in return for|,?\s*for|,?\s*and)\b/i, "");

  const aNames = findNames(segA).map((label) => ({ label, kind: "player" as const }));
  const aPicks = findPicks(segA).map((label) => ({ label, kind: "pick" as const }));
  const bNames = findNames(segB).map((label) => ({ label, kind: "player" as const }));
  const bPicks = findPicks(segB).map((label) => ({ label, kind: "pick" as const }));

  const segALegs = [...aNames, ...aPicks];
  const segBLegs = [...bNames, ...bPicks];
  if (segALegs.length === 0 && segBLegs.length === 0) return null;

  const prepWord = prep[1].toLowerCase();
  return prepWord === "to"
    ? { team, outgoing: segALegs, incoming: segBLegs }
    : { team, outgoing: segBLegs, incoming: segALegs };
}

/**
 * Looser fallback when no clean "[prep] TEAM" anchor is found (e.g. a
 * secondary source describes only one side of the deal). Widened to 160
 * chars — trade sentences run long — and tags each name with a direction so
 * the detail sentence never says "traded" for a leg the Bears received.
 */
function extractTradeLegsFallback(sentence: string): { player: string; direction: "in" | "out" }[] {
  const verbHits: { idx: number; direction: "in" | "out" }[] = [];
  for (const m of sentence.matchAll(new RegExp(`\\b(?:${TRADE_OUT_VERB})(?![a-z])`, "gi"))) {
    if (m.index != null) verbHits.push({ idx: m.index, direction: "out" });
  }
  for (const m of sentence.matchAll(new RegExp(`\\b(?:${TRADE_IN_VERB})(?![a-z])`, "gi"))) {
    if (m.index != null) verbHits.push({ idx: m.index, direction: "in" });
  }
  if (verbHits.length === 0) return [];
  verbHits.sort((a, b) => a.idx - b.idx);

  const out: { player: string; direction: "in" | "out" }[] = [];
  const seen = new Set<string>();
  for (const nm of sentence.matchAll(NAME_RE_G)) {
    if (nm.index == null) continue;
    const name = cleanName(nm[1]);
    if (!name) continue;
    let owner: "in" | "out" | null = null;
    for (const v of verbHits) {
      if (v.idx < nm.index && nm.index - v.idx <= 160) owner = v.direction;
      if (v.idx >= nm.index) break;
    }
    if (!owner) continue;
    const key = nameKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ player: name, direction: owner });
  }
  return out;
}

function parseSeenDate(sentence: string): string {
  const m = sentence.match(DATE_RE);
  if (!m) return new Date().toISOString();
  const monthIdx = MONTHS.split("|").indexOf(m[1].slice(0, 3).toLowerCase());
  const year = m[3] ? Number(m[3]) : new Date().getFullYear();
  const d = new Date(Date.UTC(year, monthIdx < 0 ? new Date().getMonth() : monthIdx, Number(m[2])));
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
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
  player: string; // person label (with position prefix, for trades) or pick label
  legKind: "player" | "pick"; // trade only — everything else is "player"
  direction?: "in" | "out"; // trade only
  counterpartyTeam?: string | null; // trade only
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
      if (!ANNOUNCEMENT.test(s)) continue;

      if (TRADE_VERB_RE.test(s)) {
        // ---- trade sentence: LLM structured extraction first, regex fallback second ----
        // The regex path (sentenceTeamOf/parseTradeSentence/extractTradeLegsFallback) has
        // no concept of grammatical subject, so it cannot tell a Bears-perspective sentence
        // from an opponent-perspective one — that's what produced the Clark Phillips III
        // duplicate-leg bug. The LLM call re-reads the same already-scraped sentence and
        // resolves direction relative to the Bears explicitly. If it's unconfigured or
        // fails for any reason, behavior falls back to the original regex path unchanged.
        let team: string | null = null;
        let legs: { label: string; kind: "player" | "pick"; direction: "in" | "out" }[] = [];

        const llm = await extractTradeLegsLLM(s);
        if (llm) {
          if (!llm.isTrade) continue; // LLM determined this sentence isn't actually a trade
          team = llm.team;
          legs = llm.legs;
        } else {
          team = sentenceTeamOf(s);
          const structural = team ? parseTradeSentence(s) : null;
          if (structural) {
            for (const l of structural.outgoing) legs.push({ ...l, direction: "out" });
            for (const l of structural.incoming) legs.push({ ...l, direction: "in" });
          } else {
            for (const mv of extractTradeLegsFallback(s)) {
              legs.push({ label: mv.player, kind: "player", direction: mv.direction });
            }
          }
        }

        for (const leg of legs) {
          const key = `${nameKey(leg.label)}|trade|${team ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          raw.push({
            type: "trade",
            player: leg.label,
            legKind: leg.kind,
            direction: leg.direction,
            counterpartyTeam: team,
            quote: cleanQuote(s),
            at,
            source: src.label,
            url: src.url,
            kind: src.kind,
          });
        }
        continue;
      }

      for (const mv of extractMoves(s)) {
        const key = `${nameKey(mv.player)}|${mv.type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        raw.push({
          type: mv.type,
          player: mv.player,
          legKind: "player",
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

function confidenceOf(group: RawFact[]): FactConfidence {
  const official = group.filter((g) => g.kind === "official");
  const distinctWires = new Set(group.filter((g) => g.kind === "wire").map((g) => g.source));
  return official.length >= 1 || distinctWires.size >= 2 ? "confirmed" : "note";
}

function bestQuote(group: RawFact[]): RawFact {
  const official = group.filter((g) => g.kind === "official");
  const pool = official.length ? official : group;
  // longest sentence is the one most likely to name every leg of the deal
  return [...pool].sort((a, b) => b.quote.length - a.quote.length)[0];
}

function modeDate(group: RawFact[]): string {
  const counts = new Map<string, number>();
  for (const r of group) counts.set(r.at, (counts.get(r.at) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || (b[0] > a[0] ? 1 : -1))[0][0];
}

function hasPosPrefix(label: string): boolean {
  return new RegExp(`^(?:${POS_ABBR})\\s+`).test(label);
}

/** Dedup key for a trade leg — a position prefix ("DT ") doesn't make it a
 * different leg than a mention of the same player without one. */
function legKeyOf(r: RawFact): string {
  return `${nameKey(stripPos(r.player))}|${r.legKind}`;
}

function mkLeg(r: RawFact, direction: "in" | "out"): FactLeg {
  const kind = r.legKind === "pick" ? "pick" : "player";
  const verbWord =
    kind === "pick"
      ? direction === "out"
        ? "sent"
        : "received"
      : direction === "out"
        ? "traded"
        : "acquired";
  return {
    label: r.player,
    kind,
    direction,
    status: `${kind === "pick" ? r.player : shortLabel(r.player)} ${verbWord}`,
  };
}

function buildTradeDetail(outLegs: FactLeg[], inLegs: FactLeg[], team: string): string {
  const outStr = outLegs.map((l) => l.label).join(" and ");
  const inStr = inLegs.map((l) => l.label).join(" and ");
  if (outStr && inStr) return `Bears trade ${outStr} to the ${team} for ${inStr}.`;
  if (outStr) return `Bears trade ${outStr} to the ${team}.`;
  if (inStr) return `Bears acquire ${inStr} from the ${team}.`;
  return `Bears complete a trade with the ${team}.`;
}

/** Merge every leg of one deal (same counterparty team) into a single Fact. */
function buildTradeFact(group: RawFact[]): Fact {
  const team = group[0].counterpartyTeam as string;

  const outgoing = new Map<string, RawFact>();
  const incoming = new Map<string, RawFact>();
  for (const r of group) {
    const bucket = r.direction === "in" ? incoming : outgoing;
    const key = legKeyOf(r);
    const existing = bucket.get(key);
    // prefer a mention that carries a position abbreviation ("DT ") — more
    // informative for the Wire card, and keeps one leg from looking like two.
    if (!existing || (!hasPosPrefix(existing.player) && hasPosPrefix(r.player))) {
      bucket.set(key, r);
    }
  }

  const outLegs = [...outgoing.values()].map((r) => mkLeg(r, "out"));
  const inLegs = [...incoming.values()].map((r) => mkLeg(r, "in"));
  const legs = [...outLegs, ...inLegs];

  const primary = bestQuote(group);
  const namedLeg = legs.find((l) => l.kind === "player");

  return {
    type: "trade",
    player: namedLeg ? namedLeg.label : null,
    legs,
    counterpartyTeam: team,
    detail: buildTradeDetail(outLegs, inLegs, team),
    source: primary.source,
    url: primary.url,
    at: modeDate(group),
    quote: primary.quote,
    confidence: confidenceOf(group),
    refs: dedupeRefs(group),
  };
}

/** Non-trade fact, or a trade leg whose sentence never named a counterparty. */
function buildSoloFact(group: RawFact[]): Fact {
  const primary = bestQuote(group);
  const newestAt = group.map((g) => g.at).sort().reverse()[0];

  let detail: string;
  let legs: FactLeg[];
  if (primary.type === "trade") {
    const direction = primary.direction ?? "out";
    detail =
      direction === "out"
        ? `Bears trade ${primary.player}${primary.counterpartyTeam ? ` to the ${primary.counterpartyTeam}` : ""}.`
        : `Bears acquire ${primary.player}${primary.counterpartyTeam ? ` from the ${primary.counterpartyTeam}` : ""}.`;
    legs = [mkLeg(primary, direction)];
  } else {
    detail = `Bears ${VERB_LABEL[primary.type]} ${primary.player}`;
    legs = [
      {
        label: primary.player,
        kind: "player",
        direction: "out",
        status: `${shortLabel(primary.player)} ${VERB_LABEL[primary.type]}`,
      },
    ];
  }

  return {
    type: primary.type,
    player: primary.player,
    legs,
    counterpartyTeam: primary.counterpartyTeam ?? null,
    detail,
    source: primary.source,
    url: primary.url,
    at: newestAt,
    quote: primary.quote,
    confidence: confidenceOf(group),
    refs: dedupeRefs(group),
  };
}

function promote(all: RawFact[]): { facts: Fact[]; mergeLog: { key: string; from: number; to: number }[] } {
  const mergeLog: { key: string; from: number; to: number }[] = [];
  const facts: Fact[] = [];

  // ---- trades with a known counterparty: one Fact per deal, every leg merged ----
  const tradeWithTeam = all.filter((r) => r.type === "trade" && r.counterpartyTeam);
  const tradeGroups = new Map<string, RawFact[]>();
  for (const r of tradeWithTeam) {
    const key = `trade:${r.counterpartyTeam}`;
    const list = tradeGroups.get(key) ?? [];
    list.push(r);
    tradeGroups.set(key, list);
  }
  for (const [key, group] of tradeGroups) {
    facts.push(buildTradeFact(group));
    // "facts collapsed from N -> 1" counts distinct legs (Dexter, Phillips,
    // the 5th = 3), not raw corroborating sentence hits across sources.
    const distinctLegs = new Set(group.map((r) => legKeyOf(r))).size;
    if (distinctLegs > 1) {
      mergeLog.push({ key: key.replace(/^trade:/, "") + " trade", from: distinctLegs, to: 1 });
    }
  }

  // ---- trade legs with no detected counterparty: fall back to per-player ----
  const tradeNoTeam = all.filter((r) => r.type === "trade" && !r.counterpartyTeam);
  const soloTradeGroups = new Map<string, RawFact[]>();
  for (const r of tradeNoTeam) {
    const key = `${nameKey(r.player)}|trade`;
    const list = soloTradeGroups.get(key) ?? [];
    list.push(r);
    soloTradeGroups.set(key, list);
  }
  for (const group of soloTradeGroups.values()) facts.push(buildSoloFact(group));

  // ---- everything else: unchanged per-player-per-type grouping ----
  const other = all.filter((r) => r.type !== "trade");
  const groups = new Map<string, RawFact[]>();
  for (const r of other) {
    const k = `${nameKey(r.player)}|${r.type}`;
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  for (const group of groups.values()) facts.push(buildSoloFact(group));

  // ---- disputes: same player, conflicting types with support → all disputed ----
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
      for (const stale of list.slice(1)) {
        const idx = facts.indexOf(stale);
        if (idx >= 0) facts.splice(idx, 1);
      }
    }
  }

  // newest confirmed first
  facts.sort((a, b) => (b.at > a.at ? 1 : b.at < a.at ? -1 : 0));
  return { facts, mergeLog };
}

// ---- public -------------------------------------------------------------

export interface FactsBundle {
  facts: Fact[];
  sources: FactSourceResult[];
  fetchedAt: string;
  fromCache: boolean;
  mergeLog: { key: string; from: number; to: number }[];
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

  const { facts, mergeLog } = promote(allRaw);
  const bundle: FactsBundle = {
    facts,
    sources,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
    mergeLog,
  };
  await kvSetJSON(CACHE_KEY, { bundle, storedAt: Date.now() } as CachedFacts);
  return bundle;
}
