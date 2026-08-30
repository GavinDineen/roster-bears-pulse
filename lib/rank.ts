import type { Category, RawPost, ScoredPost } from "./types";
import { PLAYERS } from "./config";

const RULES: { category: Category; test: RegExp }[] = [
  {
    category: "roster-move",
    test: /\b(sign(ed|ing)?|waiv(e|ed)|claim(ed)?|cut|released?|trade(d)?|practice squad|53[- ]man|roster spot|activate(d)?|placed on IR|waiver)\b/i,
  },
  {
    category: "injury",
    test: /\b(injur(y|ed)|hurt|questionable|doubtful|out for|MRI|strain(ed)?|sprain(ed)?|concussion|limited|DNP|ruled out|day[- ]to[- ]day)\b/i,
  },
  {
    category: "presser",
    test: /\b(presser|press conference|told reporters|per |tells |on why|said (he|the|they)|spoke (to|with) the media)\b/i,
  },
  {
    category: "practice",
    test: /\b(practice|OTA|minicamp|training camp|walkthrough|padded|reps|drill work|joint practice)\b/i,
  },
  {
    category: "analysis",
    test: /\b(film|tape|all[- ]22|breakdown|scheme|grade(d)?|PFF|projection|snap count|advanced stats|film room)\b/i,
  },
  {
    category: "rumor",
    test: /\b(rumor|hearing|buzz|could be|might|linked to|trade market|speculat(e|ion)|sources say)\b/i,
  },
  {
    category: "rival",
    test: /\b(Packers|Green Bay|Vikings|Minnesota|Lions|Detroit|NFC North)\b/i,
  },
  {
    category: "hype",
    test: /\b(let'?s go|LFG|fired up|can'?t wait|bear down|so hyped|this team is|🔥|💪)\b/i,
  },
];

export function categorize(text: string): Category {
  for (const r of RULES) if (r.test.test(text)) return r.category;
  return "other";
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\'-]/g, "\\$&");
}

/**
 * OPTIONAL HINT ONLY. Full-name matches against the loose PLAYERS list — never a
 * whitelist, never a gate for tiles. Used only to enrich clustering tokens.
 */
export function playerHints(text: string): string[] {
  const hits = new Set<string>();
  for (const p of PLAYERS) {
    if (new RegExp(`\\b${esc(p)}\\b`, "i").test(text)) hits.add(p);
  }
  return [...hits];
}

const ROSTER_VERB =
  "traded|trade|acquired|acquire|dealt|waived|waive|claimed|released|release|cut|signed|sign|re-signed|placed";
const PNAME =
  "[A-Z][a-z'’.-]+(?:\\s[A-Z][a-z'’.-]+){1,2}(?:\\s(?:Jr\\.?|Sr\\.?|II|III|IV))?";
const NON_PERSON_HINT =
  /\b(bears|chicago|packers|vikings|lions|halas|nfl|nfc|espn|cbs|tribune|wire|gridiron|city|field|squad|reserve|roster|sunday|monday|tuesday|wednesday|thursday|friday|saturday|week)\b/i;

/**
 * Names sitting next to a roster verb ("waived X", "X was traded"). This is how
 * player tiles are seeded from beat text — not from a hardcoded roster.
 */
export function extractRosterNames(text: string): string[] {
  const out = new Set<string>();
  const t = text.replace(/\s+/g, " ");
  const re1 = new RegExp(`\\b(?:${ROSTER_VERB})\\b[^.]{0,30}?\\b(${PNAME})\\b`, "gi");
  const re2 = new RegExp(
    `\\b(${PNAME})\\b[^.]{0,30}?\\b(?:was|were|has been|is|gets?|got)\\b[^.]{0,15}?\\b(?:${ROSTER_VERB})\\b`,
    "gi",
  );
  for (const re of [re1, re2]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      const name = m[1].trim().replace(/[.,;:]$/, "");
      if (!NON_PERSON_HINT.test(name) && new RegExp(`^${PNAME}$`).test(name)) out.add(name);
    }
  }
  return [...out];
}

export function gravity(post: RawPost): number {
  const engagement =
    post.likes + post.retweets * 3 + post.replies * 2 + post.quotes * 2;
  const ageHours = Math.max(
    1,
    (Date.now() - new Date(post.createdAt).getTime()) / 3_600_000
  );
  const recency = 1 / Math.pow(ageHours / 6 + 1, 1.2);
  const beatBoost = post.isBeat ? 1.6 : 1;
  return Math.round(Math.log10(engagement + 10) * 34 * recency * beatBoost);
}

export function scorePost(post: RawPost): ScoredPost {
  return {
    ...post,
    category: categorize(post.text),
    gravity: gravity(post),
    // hint set for clustering — roster-verb names first, loose name list second
    players: [
      ...new Set([...extractRosterNames(post.text), ...playerHints(post.text)]),
    ],
  };
}

const URL_RE = /(https?:\/\/\S+|\bwww\.\S+|\b[a-z0-9-]+\.(com|net|org|io|co|gg|tv|ly)\/\S*)/i;

export function containsUrl(text: string): boolean {
  return URL_RE.test(text);
}

export function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\bwww\.\S+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
