import {
  BEAT_HANDLES,
  NATIONAL_HANDLES,
  FAN_BLOCKLIST_HANDLES,
  FAN_BLOCKLIST_PHRASES,
  PHOTO_CREDIT_PATTERNS,
  PHOTO_CREDIT_BYLINES,
} from "./config";

// Chicago Bears football, or nothing.

const BEARS_NAME = /(#dabears|chicago bears|\bhalas\b)/i;
const BEARS_WORD = /\bbears\b/i;

// Football context tokens (the enumerated set + close inflections).
const FOOTBALL =
  /\b(nfl|roster|cut|cuts|waived?|waivers?|trade[ds]?|camp|preseason|53)\b/i;

// Bears people who carry a post even without the word "Bears".
const KEY_PEOPLE =
  /\b(caleb williams|williams|gervon dexter|dexter|tyson bagent|bagent|rome odunze|odunze|luther burden|burden|ryan poles|poles|ben johnson)\b/i;

// Any Chicago reference (used to reject other-team posts).
const CHI_REF = /(chicago|\bbears\b|#dabears|\bhalas\b|\bpoles\b|\bcaleb\b|\bdexter\b)/i;

const MARKET =
  /\b(stock|stocks|nasdaq|dow jones|\bdow\b|s&p|futures|bitcoin|crypto|bear market|bull market|bearish|the bears are)\b/i;

const ANIMAL = /\b(zoo|grizzly|grizzlies|polar bear|hibernat\w*|wildlife)\b/i;

const OTHER_TEAM =
  /\b(packers|green bay|vikings|minnesota|lions|detroit|cowboys|eagles|giants|commanders|49ers|niners|seahawks|rams|cardinals|falcons|panthers|saints|buccaneers|bengals|browns|ravens|steelers|bills|dolphins|patriots|jets|titans|colts|texans|jaguars|broncos|chiefs|raiders|chargers)\b/i;

export function isBeatHandle(handle: string): boolean {
  const h = (handle || "").toLowerCase();
  return BEAT_HANDLES.some((b) => b.toLowerCase() === h);
}

export function isNationalHandle(handle: string): boolean {
  const h = (handle || "").toLowerCase();
  return NATIONAL_HANDLES.some((b) => b.toLowerCase() === h);
}

/** True only if a post is about Chicago Bears football. */
export function isBearsFootballPost(text: string, handle: string): boolean {
  // Authority: the local beat desk is always kept.
  if (isBeatHandle(handle)) return true;

  const t = text || "";
  const hasFootball = FOOTBALL.test(t) || KEY_PEOPLE.test(t);

  // ---- hard rejects ----
  if (MARKET.test(t) && !hasFootball && !BEARS_NAME.test(t)) return false;
  if (ANIMAL.test(t) && !hasFootball && !BEARS_NAME.test(t) && !BEARS_WORD.test(t))
    return false;
  if (OTHER_TEAM.test(t) && !CHI_REF.test(t)) return false;

  // ---- accepts ----
  if (BEARS_NAME.test(t)) return true;
  if (BEARS_WORD.test(t) && hasFootball) return true;
  if (KEY_PEOPLE.test(t) && FOOTBALL.test(t)) return true;

  return false;
}

// ---- fan-noise blocklist ---------------------------------------------------
// Applied once, right after a collect fetches posts and before scoring/
// clustering. Never a re-fetch, never a second X query — just a drop.

export function isBlockedFanAccount(handle: string, text: string): boolean {
  const h = (handle || "").toLowerCase();
  if (FAN_BLOCKLIST_HANDLES.some((b) => b.toLowerCase() === h)) return true;
  return FAN_BLOCKLIST_PHRASES.some((re) => re.test(text || ""));
}

// A post that only shouts a headcount with nobody named carries no signal —
// "cut 12 players" with no names attached shouldn't seed a Fight cluster or a
// creator prompt.
const HEADCOUNT_ONLY = /\bcut\s+\d+\s+players?\b/i;

export function isHeadcountOnlyNoise(text: string, namedPlayers: string[]): boolean {
  return HEADCOUNT_ONLY.test(text || "") && namedPlayers.length === 0;
}

// ---- photo-credit / caption junk -------------------------------------------
// Wire-photo captions ("IMAGN", "via Reuters", a photographer byline glued to
// the front of a headline) are not part of the sentence. Strip them from any
// text the desk surfaces verbatim.

export function stripPhotoCredit(text: string): string {
  let t = text || "";
  for (const name of PHOTO_CREDIT_BYLINES) {
    t = t.replace(new RegExp(`\\s*[-–—|/]?\\s*${name}\\s*[-–—|/]?\\s*`, "gi"), " ");
  }
  for (const re of PHOTO_CREDIT_PATTERNS) {
    t = t.replace(re, " ");
  }
  return t
    .replace(/\(\s*\)/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if, once credit junk is stripped, nothing beat-worthy is left. */
export function isCreditOnlyPost(rawText: string): boolean {
  return stripPhotoCredit(rawText).length < 12;
}
