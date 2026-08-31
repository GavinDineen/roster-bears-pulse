import type { PulsePayload } from "./types";

/**
 * Used ONLY when both the FACTS layer and the X layer come back empty. No
 * fabricated moves, no invented player copy — just an honest "nothing live"
 * state, labeled as cached context.
 */
export function fallbackPulse(): PulsePayload {
  const now = new Date().toISOString();
  return {
    generatedAt: now,
    source: "cached-context",
    headerLine: "Facts from official/beat pages. X is the argument.",
    headline: "No new official moves since last collect.",
    summary: "Desk is waiting on official moves.",
    facts: [],
    beat: [],
    fanArgument: [],
    players: [],
    creatorPrompts: ["Nothing confirmed. Don't tweet a rumor."],
    mediaVsFan: [],
    viral: [],
    admin: {
      factSources: [],
      factCounts: { confirmed: 0, disputed: 0, note: 0 },
      notes: [],
      x: { fetched: 0, kept: 0, dropped: 0, beatHalf: "n/a", blocklistDropped: 0 },
      factsFetchedAt: now,
      factsFromCache: true,
      mergeLog: [],
    },
  };
}
