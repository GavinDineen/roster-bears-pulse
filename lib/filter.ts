import { BEAT_HANDLES, NATIONAL_HANDLES } from "./config";

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
