// LLM-based structured extraction for trade sentences.
//
// Why this exists: the old regex parser (parseTradeSentence / extractTradeLegsFallback)
// has no concept of grammatical subject — it can't tell "Bears trade X to the Falcons"
// from "The Falcons acquire X from the Bears." Both mention the same teams and the same
// verbs, but the direction of the asset flips depending on who the sentence's subject is.
// That's the root cause of the Clark Phillips III bug (a leg tagged both "in" and "out").
//
// This step re-parses the SAME already-scraped sentence with a small structured-output
// LLM call instead of a regex. It adds zero new network/X-API cost (no new posts are
// fetched — this only reprocesses text extractSource() already pulled down for free).
// It fails closed: any missing key, network error, timeout, or malformed response returns
// null, and the caller falls back to the existing regex path unchanged.
//
// Provider: Google Gemini (gemini-2.0-flash) via the free Google AI Studio tier — no
// credit card required, generous free daily quota, native JSON-schema mode. Requires
// the GEMINI_API_KEY env var; if unset, this is a no-op (regex-only behavior, same as today).

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_TIMEOUT_MS = 8000;

export interface LLMTradeLeg {
  label: string; // player name (with position prefix if known) or pick description
  kind: "player" | "pick";
  direction: "in" | "out"; // relative to the Chicago Bears
}

export interface LLMTradeExtraction {
  isTrade: boolean; // false if the sentence doesn't actually describe a trade transaction
  team: string | null; // the Bears' counterparty, short form (e.g. "Falcons"), or null if unclear
  legs: LLMTradeLeg[];
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    isTrade: { type: "boolean" },
    team: { type: "string", nullable: true },
    legs: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          kind: { type: "string", enum: ["player", "pick"] },
          direction: { type: "string", enum: ["in", "out"] },
        },
        required: ["label", "kind", "direction"],
      },
    },
  },
  required: ["isTrade", "team", "legs"],
};

const PROMPT_PREFIX = `You are extracting structured trade data from a single sentence about the Chicago Bears NFL team.

Read the sentence and determine:
1. "isTrade": true only if the sentence actually describes an executed or reported trade transaction (not speculation, not a generic recap, not an unrelated mention).
2. "team": the Bears' trade counterparty as a short team name (e.g. "Falcons", "Vikings", "Packers", "Lions", "Chiefs"). Use null if no specific counterparty team is identifiable.
3. "legs": every player or draft pick that changes hands in this trade. For each one, set "direction" to "out" if it is leaving the Bears (going to the counterparty) or "in" if it is arriving at the Bears (coming from the counterparty). Always resolve direction relative to the Bears specifically — never relative to whichever team happens to be the grammatical subject of the sentence. Example: "The Falcons acquired DT Gervon Dexter Sr. from Chicago in exchange for CB Clark Phillips III." must resolve, from the Bears' perspective, as: Dexter is "out" (he is the one leaving the Bears, even though "the Falcons" is the subject of "acquired") and Phillips is "in" (he is the one arriving at the Bears in the exchange).
4. Use "pick" for draft picks (e.g. "a 2027 fourth-round pick") and "player" for everyone else. Keep player labels close to how they appear in the sentence (position abbreviation prefix is fine if present, e.g. "CB Jaylon Jones").
5. If the sentence is not a trade, return isTrade: false, team: null, legs: [].

Return ONLY the JSON object matching the schema. Sentence:
`;

let warnedMissingKey = false;

export async function extractTradeLegsLLM(sentence: string): Promise<LLMTradeExtraction | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    if (!warnedMissingKey) {
      console.warn("[llmExtract] GEMINI_API_KEY not set — falling back to regex trade parsing.");
      warnedMissingKey = true;
    }
    return null;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GEMINI_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        signal: ctrl.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROMPT_PREFIX + sentence }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
          },
        }),
      }
    );

    if (!res.ok) {
      console.warn(`[llmExtract] Gemini HTTP ${res.status} — falling back to regex for this sentence.`);
      return null;
    }

    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    if (typeof parsed?.isTrade !== "boolean" || !Array.isArray(parsed?.legs)) return null;

    const legs: LLMTradeLeg[] = parsed.legs
      .filter(
        (l: any) =>
          l &&
          typeof l.label === "string" &&
          l.label.trim() &&
          (l.kind === "player" || l.kind === "pick") &&
          (l.direction === "in" || l.direction === "out")
      )
      .map((l: any) => ({ label: l.label.trim(), kind: l.kind, direction: l.direction }));

    return {
      isTrade: parsed.isTrade,
      team: typeof parsed.team === "string" && parsed.team.trim() ? parsed.team.trim() : null,
      legs,
    };
  } catch (err) {
    console.warn(`[llmExtract] extraction failed (${(err as Error).message}) — falling back to regex.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
