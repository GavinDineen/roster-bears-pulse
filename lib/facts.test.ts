import { describe, it, expect } from "vitest";
import {
  promote,
  buildTradeFact,
  legKeyOf,
  type RawFact,
  type SourceKind,
} from "./facts";

// The trade-leg direction / merge path is the recurring failure mode on this
// desk (the "Clark Phillips III" bug: one real player rendered as both an
// outgoing and an incoming leg, or a two-player deal rendered as two facts).
// These lock the deterministic pipeline — promote() / buildTradeFact() — so a
// regression goes red before it ships, independent of the optional Gemini
// editor pass in lib/editor.ts.

const clock = Date.parse("2026-08-30T12:00:00.000Z");
function mkRaw(over: Partial<RawFact> = {}): RawFact {
  return {
    type: "trade",
    player: "Gervon Dexter Sr.",
    legKind: "player",
    direction: "out",
    counterpartyTeam: "Falcons",
    quote: "The Bears traded DT Gervon Dexter Sr. to the Falcons.",
    at: new Date(clock).toISOString(),
    source: "Chicago Bears",
    url: "https://www.chicagobears.com/news/",
    kind: "official" as SourceKind,
    ...over,
  };
}

describe("promote() — trades", () => {
  it("merges every leg of one deal into a single fact keyed by counterparty", () => {
    const raw: RawFact[] = [
      mkRaw({ player: "Gervon Dexter Sr.", direction: "out" }),
      mkRaw({
        player: "CB Clark Phillips III",
        direction: "in",
        quote: "The Falcons sent CB Clark Phillips III to Chicago in the deal.",
      }),
      mkRaw({
        player: "2027 5th-round pick",
        legKind: "pick",
        direction: "in",
        quote: "Chicago also acquired a 2027 5th-round pick from Atlanta.",
      }),
    ];

    const { facts } = promote(raw);
    const trades = facts.filter((f) => f.type === "trade");

    expect(trades).toHaveLength(1);
    const [t] = trades;
    expect(t.counterpartyTeam).toBe("Falcons");
    expect(t.legs).toHaveLength(3);

    const dir = (label: string) =>
      t.legs?.find((l) => l.label.includes(label))?.direction;
    expect(dir("Dexter")).toBe("out");
    expect(dir("Phillips")).toBe("in");
    expect(dir("5th-round")).toBe("in");

    expect(t.legs?.find((l) => l.label.includes("5th-round"))?.kind).toBe("pick");
  });

  it("records the N→1 collapse in mergeLog when a deal has multiple distinct legs", () => {
    const { mergeLog } = promote([
      mkRaw({ player: "Gervon Dexter Sr.", direction: "out" }),
      mkRaw({ player: "CB Clark Phillips III", direction: "in" }),
    ]);
    expect(mergeLog.some((m) => m.key.includes("Falcons") && m.to === 1)).toBe(true);
  });

  it("does not spawn a second fact for a team-less mention of a player already covered by a trade", () => {
    const raw: RawFact[] = [
      mkRaw({ player: "Gervon Dexter Sr.", direction: "out", counterpartyTeam: "Falcons" }),
      // a wire that names the player but not the counterparty
      mkRaw({
        player: "Gervon Dexter Sr.",
        direction: "out",
        counterpartyTeam: null,
        source: "Bears Wire",
        kind: "wire",
        quote: "Dexter is on the move, per multiple reports.",
      }),
    ];
    const { facts } = promote(raw);
    expect(facts.filter((f) => f.type === "trade")).toHaveLength(1);
    // the team-less sentence becomes corroboration
    expect(facts[0].refs.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps non-trade moves as their own solo facts", () => {
    const { facts } = promote([
      mkRaw({
        type: "cut",
        player: "Roschon Johnson",
        legKind: "player",
        direction: undefined,
        counterpartyTeam: undefined,
        quote: "The Bears released RB Roschon Johnson.",
      }),
    ]);
    const cut = facts.find((f) => f.type === "cut");
    expect(cut).toBeDefined();
    expect(cut?.detail.toLowerCase()).toContain("roschon johnson");
  });
});

describe("buildTradeFact() — direction-conflict resolution", () => {
  it("collapses a player tagged BOTH in and out into one direction (official wins over wire)", () => {
    const group: RawFact[] = [
      // grammatical-subject blind spot: a wire phrased the deal from Atlanta's
      // POV and tagged Phillips as outgoing from the Bears
      mkRaw({
        player: "Clark Phillips III",
        direction: "out",
        source: "Windy City Gridiron",
        kind: "wire",
        quote: "Atlanta traded away Clark Phillips III.",
      }),
      // the official transaction line has him arriving in Chicago
      mkRaw({
        player: "CB Clark Phillips III",
        direction: "in",
        kind: "official",
        quote: "The Bears acquired CB Clark Phillips III from the Falcons.",
      }),
    ];

    const fact = buildTradeFact(group);
    const phillips = fact.legs?.filter((l) => l.label.includes("Phillips")) ?? [];
    expect(phillips).toHaveLength(1);
    expect(phillips[0].direction).toBe("in");
  });

  it("prefers the direction with more corroborating mentions", () => {
    const group: RawFact[] = [
      mkRaw({ player: "Player X", direction: "in", kind: "wire", source: "A" }),
      mkRaw({ player: "Player X", direction: "in", kind: "wire", source: "B" }),
      mkRaw({ player: "Player X", direction: "out", kind: "wire", source: "C" }),
    ];
    const fact = buildTradeFact(group);
    const legs = fact.legs?.filter((l) => l.label.includes("Player X")) ?? [];
    expect(legs).toHaveLength(1);
    expect(legs[0].direction).toBe("in");
  });

  it("builds a readable two-sided detail sentence", () => {
    const fact = buildTradeFact([
      mkRaw({ player: "Gervon Dexter Sr.", direction: "out" }),
      mkRaw({ player: "CB Clark Phillips III", direction: "in" }),
    ]);
    expect(fact.detail).toMatch(/Bears trade .*Dexter.* to the Falcons for .*Phillips/);
  });
});

describe("legKeyOf()", () => {
  it("ignores a position prefix and suffix punctuation when identifying a leg", () => {
    const a = legKeyOf(mkRaw({ player: "DT Gervon Dexter Sr.", legKind: "player" }));
    const b = legKeyOf(mkRaw({ player: "Gervon Dexter Sr", legKind: "player" }));
    expect(a).toBe(b);
  });

  it("distinguishes a player leg from a pick leg", () => {
    const player = legKeyOf(mkRaw({ player: "2027 5th-round pick", legKind: "player" }));
    const pick = legKeyOf(mkRaw({ player: "2027 5th-round pick", legKind: "pick" }));
    expect(player).not.toBe(pick);
  });
});
