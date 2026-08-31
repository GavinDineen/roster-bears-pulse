// Standalone verification for the Dexter/Phillips one-trade non-negotiable.
// Not part of the app build — run with `npx tsx scripts/test-trade-merge.ts`.
import { buildTradeFact, type RawFact } from "../lib/facts";

function mk(partial: Partial<RawFact> & Pick<RawFact, "player" | "direction" | "quote" | "kind">): RawFact {
  return {
    type: "trade",
    legKind: "player",
    counterpartyTeam: "Falcons",
    at: "2026-08-30T00:00:00.000Z",
    source: "Chicago Bears",
    url: "https://www.chicagobears.com/news/",
    ...partial,
  };
}

// Reproduces the live bug: one well-formed sentence names both legs
// correctly, but a second wire sentence (phrased from the grammatical
// subject's point of view) flips Phillips to "out" under a fuller label.
const group: RawFact[] = [
  mk({
    player: "Gervon Dexter Sr",
    direction: "out",
    quote: "The Chicago Bears have agreed to acquire a 2027 fifth-round pick and defensive back Clark Phillips III in a trade with the Atlanta Falcons in exchange for defensive lineman Gervon Dexter Sr., pending.",
    kind: "official",
  }),
  mk({
    player: "Clark Phillips III",
    direction: "in",
    quote: "The Chicago Bears have agreed to acquire a 2027 fifth-round pick and defensive back Clark Phillips III in a trade with the Atlanta Falcons in exchange for defensive lineman Gervon Dexter Sr., pending.",
    kind: "official",
  }),
  mk({
    player: "2027 fifth-round pick",
    legKind: "pick",
    direction: "in",
    quote: "The Chicago Bears have agreed to acquire a 2027 fifth-round pick and defensive back Clark Phillips III in a trade with the Atlanta Falcons in exchange for defensive lineman Gervon Dexter Sr., pending.",
    kind: "official",
  }),
  // The buggy wire mention: names Phillips with a position prefix, in the
  // WRONG direction (grammatical-subject blind spot).
  mk({
    player: "CB Clark Phillips",
    direction: "out",
    quote: "Falcons send CB Clark Phillips to Chicago in deal involving Gervon Dexter Sr.",
    kind: "wire",
  }),
];

const fact = buildTradeFact(group);

console.log("legs:", JSON.stringify(fact.legs, null, 2));
console.log("detail:", fact.detail);

const phillipsLegs = fact.legs!.filter((l) => l.label.toLowerCase().includes("phillips"));
if (phillipsLegs.length !== 1) {
  console.error(`FAIL: expected exactly 1 Phillips leg, got ${phillipsLegs.length}`);
  process.exit(1);
}
if (phillipsLegs[0].direction !== "in") {
  console.error(`FAIL: Phillips leg direction should be "in", got "${phillipsLegs[0].direction}"`);
  process.exit(1);
}
// "Bears trade X to the Falcons for Phillips" is correct (Phillips incoming);
// only fail if Phillips shows up on the OUTGOING side of the sentence, e.g.
// "Bears trade ... and Phillips to the Falcons" or "Bears trade Phillips".
const outgoingClause = fact.detail.split(/\bfor\b/i)[0];
if (/phillips/i.test(outgoingClause)) {
  console.error(`FAIL: detail wrongly claims Bears traded Phillips away: "${fact.detail}"`);
  process.exit(1);
}
console.log("PASS: Dexter+Phillips resolve to one trade fact, Phillips correctly incoming.");
