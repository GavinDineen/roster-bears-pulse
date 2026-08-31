// Verifies the second observed bug: a team-less mention of a player already
// covered by a team-matched trade must corroborate that Fact, not spawn a
// second "Bears acquire X" Fact for the same event.
import { promote, type RawFact } from "../lib/facts";

function mk(p: Partial<RawFact> & Pick<RawFact, "player" | "quote" | "kind">): RawFact {
  return {
    type: "trade",
    legKind: "player",
    direction: "in",
    at: "2026-08-30T00:00:00.000Z",
    source: "Chicago Bears",
    url: "https://www.chicagobears.com/news/",
    ...p,
  } as RawFact;
}

const all: RawFact[] = [
  mk({
    player: "Gervon Dexter Sr",
    direction: "out",
    counterpartyTeam: "Falcons",
    quote: "The Chicago Bears have agreed to acquire a 2027 fifth-round pick and defensive back Clark Phillips III in a trade with the Atlanta Falcons in exchange for defensive lineman Gervon Dexter Sr., pending.",
    kind: "official",
  }),
  mk({
    player: "Clark Phillips III",
    direction: "in",
    counterpartyTeam: "Falcons",
    quote: "The Chicago Bears have agreed to acquire a 2027 fifth-round pick and defensive back Clark Phillips III in a trade with the Atlanta Falcons in exchange for defensive lineman Gervon Dexter Sr., pending.",
    kind: "official",
  }),
  // A DIFFERENT source names Phillips without naming the counterparty team —
  // this is the exact shape that produced a second "Bears acquire Clark
  // Phillips III." Fact with no "from the Falcons" suffix in production.
  mk({
    player: "Clark Phillips III",
    direction: "in",
    counterpartyTeam: null,
    quote: "Chicago Bears agree to acquire fifth-round pick and DB Clark Phillips III in trade with Atlanta Aug 30, 2026",
    kind: "official",
  }),
];

const { facts } = promote(all);
const tradeFacts = facts.filter((f) => f.type === "trade");
console.log(`trade facts: ${tradeFacts.length}`);
for (const f of tradeFacts) console.log(" -", f.detail, JSON.stringify(f.legs));

if (tradeFacts.length !== 1) {
  console.error(`FAIL: expected exactly 1 trade fact, got ${tradeFacts.length}`);
  process.exit(1);
}
console.log("PASS: team-less corroborating mention folded into the one trade fact.");
