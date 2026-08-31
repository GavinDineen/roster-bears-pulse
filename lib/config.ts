// Two queries only. max_results stays 20. Never collect on page load.

// ---- Beat desk (isBeat = true) — local Halas Hall media corps + team accounts.
// Authority over virality: these are always kept regardless of engagement.
export const BEAT_HANDLES = [
  "BradBiggs",
  "ChiTribeKane",
  "DanWiederer",
  "kfishbain",
  "AdamJahns",
  "patrickfinley",
  "JasonLieser",
  "MarkPotash",
  "CourtneyRCronin",
  "AdamHoge",
  "TheCarm",
  "NicholasMoreano",
  "Sean_Hammond",
  "Hub_Arkush",
  "Schrock_And_Awe",
  "AlexShapiroNBCS",
  "AlyssaBarbieri",
  "TheBearsWire",
  "wiltfongjr",
  "jacobinfante24",
  "BearsOnMaven",
  "CEmma670",
  "MarkGroteSports",
  "LarryMayer",
  "BearsPR",
  "ChicagoBears",
  "JasmineNBaker",
  "DevanKaney",
  "CassieCarlsonTV",
];

// ---- National insiders — recognised for classification only.
// NEVER placed in a search query, and NOT auto-accepted: their posts must pass
// the Bears-football filter to appear.
export const NATIONAL_HANDLES = [
  "RapSheet",
  "AdamSchefter",
  "TomPelissero",
  "MikeGarafolo",
  "FieldYates",
  "JosinaAnderson",
];

// ---- Handles actually searched in Query 2 (curated subset of the beat desk).
export const BEAT_QUERY_HANDLES = [
  "BradBiggs",
  "ChiTribeKane",
  "DanWiederer",
  "kfishbain",
  "AdamJahns",
  "patrickfinley",
  "JasonLieser",
  "CourtneyRCronin",
  "AdamHoge",
  "TheCarm",
  "NicholasMoreano",
  "Sean_Hammond",
  "Schrock_And_Awe",
  "AlyssaBarbieri",
  "TheBearsWire",
  "wiltfongjr",
  "jacobinfante24",
  "CEmma670",
  "LarryMayer",
  "BearsPR",
];

// OPTIONAL HINT ONLY — not a whitelist, not a gate. Player tiles come from
// facts + roster-verb names in beat posts, never from this list.
export const PLAYERS = [
  "Caleb Williams",
  "DJ Moore",
  "Rome Odunze",
  "Luther Burden",
  "Colston Loveland",
  "Cole Kmet",
  "D'Andre Swift",
  "Tyson Bagent",
  "Roschon Johnson",
  "Montez Sweat",
  "Gervon Dexter",
  "Jaylon Johnson",
  "Tremaine Edmunds",
  "T.J. Edwards",
  "Kyler Gordon",
  "Jaquan Brisker",
  "Tyrique Stevenson",
  "Darnell Wright",
  "Braxton Jones",
  "Kevin Byard",
  "Ben Johnson",
  "Ryan Poles",
];

// ---- Fan-noise blocklist ---------------------------------------------------
// Affiliate/listicle/aggregator accounts that farm engagement off Bears news
// without adding anything — never a source, never allowed into Fight or
// Traveling-fastest, however much engagement they draw.
export const FAN_BLOCKLIST_HANDLES = [
  "ChatSports",
  "ChartSports",
  "CommishExempt",
];

// Phrase patterns that mark a post as aggregator/listicle spam regardless of
// which handle posted it (these accounts get cloned and renamed constantly).
export const FAN_BLOCKLIST_PHRASES = [
  /more chicago bears news/i,
  /\bmore watch\b/i,
  /commish exempt/i,
];

// Photo-agency captions that end up glued to headlines when a post embeds a
// wire photo. Stripped from any surfaced text (beat rail, fight tweets),
// never treated as part of the sentence.
export const PHOTO_CREDIT_PATTERNS = [
  /\bimagn\b/gi,
  /\breuters connect\b/gi,
  /\bvia reuters\b/gi,
  /\bgetty images?\b/gi,
  /\bap photo\b/gi,
  /\bassociated press photo\b/gi,
  /\busa today sports\b/gi,
  /photo credit:?[^.]*/gi,
];

// Known photographer bylines that show up glued to the front of a headline.
export const PHOTO_CREDIT_BYLINES = [
  "Katie Stratman",
  "Joseph Maiorana",
  "Denny Simmons",
];

const BEAT_SCOPE = "(Bears OR #DaBears OR Halas OR Poles OR Dexter OR 53)";

/** Query 2 for a given slice of the beat desk. */
export function buildBeatQuery(handles: string[]): string {
  const from = handles.map((h) => `from:${h}`).join(" OR ");
  return `(${from}) ${BEAT_SCOPE} -is:retweet`;
}

/**
 * Which half of BEAT_QUERY_HANDLES to search this run, if the full Query 2 is
 * rejected as too long. Stateless: flips every collect interval, so consecutive
 * (throttled) collects alternate even/odd.
 */
export function pickBeatHalf(): "even" | "odd" {
  const every = Math.max(1, Number(process.env.X_COLLECT_EVERY_MINUTES || 180));
  return Math.floor(Date.now() / 60_000 / every) % 2 === 0 ? "even" : "odd";
}

// ---- collect clock — 4 full collects/day, America/Chicago -----------------
// 06:30 · 12:00 · 17:15 · 22:00 CT. Vercel Hobby cron can't fire more than
// once/day, so a GitHub Actions schedule (.github/workflows/desk-collect.yml)
// drives these four; this is the shared source of truth both that workflow
// and the member-facing "cycle N/4 · NEXT" clock are built from.

export const CLOCK_TIMES_CT: [number, number][] = [
  [6, 30],
  [12, 0],
  [17, 15],
  [22, 0],
];

interface CivilDate {
  year: number;
  month: number; // 1-12
  day: number;
}

function chicagoCivilDate(instant: Date): CivilDate {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/** The UTC instant for a wall-clock hour:minute on `date` in America/Chicago (DST-safe). */
function ctWallClockToUtc(date: CivilDate, hour: number, minute: number): Date {
  const targetAsUtcMs = Date.UTC(date.year, date.month - 1, date.day, hour, minute);
  let guessMs = targetAsUtcMs;
  // Two passes converge even right around a DST transition.
  for (let i = 0; i < 2; i++) {
    const wallAtGuess = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guessMs));
    const get = (t: string) => Number(wallAtGuess.find((p) => p.type === t)?.value);
    const hh = get("hour") === 24 ? 0 : get("hour");
    const asUtcMs = Date.UTC(get("year"), get("month") - 1, get("day"), hh, get("minute"));
    guessMs += targetAsUtcMs - asUtcMs;
  }
  return new Date(guessMs);
}

/**
 * Where we are in today's 4-collect cycle. `n` is actual collects consumed
 * today (spend.ts's collectsToday — an admin "Collect now" counts the same
 * as a scheduled one); `nextAt` is the next of the 4 CT times, rolling to
 * tomorrow's 06:30 once all four have passed.
 */
export function currentCycle(collectsToday: number, now = new Date()): { n: number; of: number; nextAt: string } {
  const todayCT = chicagoCivilDate(now);
  const todaysTimes = CLOCK_TIMES_CT.map(([h, m]) => ctWallClockToUtc(todayCT, h, m));
  const next = todaysTimes.find((t) => t.getTime() > now.getTime());
  if (next) return { n: Math.min(collectsToday, 4), of: 4, nextAt: next.toISOString() };

  // All 4 have passed today — roll to tomorrow's 06:30 CT.
  const tomorrowCT = chicagoCivilDate(new Date(todaysTimes[0].getTime() + 24 * 60 * 60 * 1000));
  const [h0, m0] = CLOCK_TIMES_CT[0];
  return { n: Math.min(collectsToday, 4), of: 4, nextAt: ctWallClockToUtc(tomorrowCT, h0, m0).toISOString() };
}

// Query 1: fans / team, football-locked.
// Query 2: local beat desk only — ONE search.
export const QUERIES: { key: string; label: string; query: string }[] = [
  {
    key: "bears-team",
    label: "Bears / fans (football-locked)",
    query:
      '(#DaBears OR "Chicago Bears" OR "CHI Bears" OR #BearsDown) (NFL OR roster OR cut OR waived OR trade OR Williams OR Dexter OR Bagent OR Poles OR Johnson OR Halas OR 53) -is:retweet lang:en',
  },
  {
    key: "beat-desk",
    label: "Local beat desk",
    query: buildBeatQuery(BEAT_QUERY_HANDLES),
  },
];
