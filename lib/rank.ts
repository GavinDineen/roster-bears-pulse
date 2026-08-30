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

export function playerMentions(text: string): string[] {
  const hits = new Set<string>();
  for (const p of PLAYERS) {
    const full = new RegExp(`\\b${esc(p)}\\b`, "i");
    const parts = p.split(" ");
    const last = parts[parts.length - 1];
    const lastRe = new RegExp(`\\b${esc(last)}\\b`, "i");
    // Full name always counts; bare last name counts only if it's distinctive (>3 chars).
    if (full.test(text) || (last.length > 3 && lastRe.test(text))) hits.add(p);
  }
  return [...hits];
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
    players: playerMentions(post.text),
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
