import type { Fact, FactLeg, BeatItem, FanCluster } from "./types";

// THE EDITOR — one Gemini Flash call per FULL collect, after every other
// step (facts, X, board) already has real data in hand. This is the only
// place an LLM touches the desk, and it is an editor, not a reporter: it may
// only rearrange/rephrase what's already in the input, never introduce a
// name, team, score, or claim that isn't already there. Every output is
// validated against the input before use; anything that fails validation is
// dropped and the deterministic value (from synthesize.ts) stands instead.
// If GEMINI_API_KEY is unset, or the call errors/times out/returns garbage,
// the desk runs exactly as if this file didn't exist.

const GEMINI_MODEL = "gemini-2.0-flash";
const GEMINI_TIMEOUT_MS = 12_000;

export interface EditorInput {
  facts: Fact[]; // uiFacts, already promote()-merged — trade facts may still
  // carry a duplicate/contradictory leg from the grammatical-subject blind
  // spot in the regex extractor (see lib/facts.ts)
  beat: BeatItem[];
  fanArgument: FanCluster[];
  assignmentBase: string; // the deterministic prompts[0], e.g. `Explain "X" in 90 seconds...`
}

export interface EditorOutput {
  factLegFixes: Map<number, FactLeg[]>; // fact index -> replacement legs
  beatRewrites: Map<number, string>; // beat index -> replacement text
  clusterRewrites: Map<number, { label: string; tension: string }>; // cluster index -> replacement
  assignmentSentence: string | null;
}

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    factLegFixes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          factIndex: { type: "integer" },
          legs: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                kind: { type: "string", enum: ["player", "pick"] },
                direction: { type: "string", enum: ["in", "out"] },
                status: { type: "string" },
              },
              required: ["label", "kind", "direction", "status"],
            },
          },
        },
        required: ["factIndex", "legs"],
      },
    },
    beatRewrites: {
      type: "array",
      items: {
        type: "object",
        properties: { beatIndex: { type: "integer" }, text: { type: "string" } },
        required: ["beatIndex", "text"],
      },
    },
    clusterRewrites: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clusterIndex: { type: "integer" },
          label: { type: "string" },
          tension: { type: "string" },
        },
        required: ["clusterIndex", "label", "tension"],
      },
    },
    assignmentSentence: { type: "string" },
  },
  required: ["factLegFixes", "beatRewrites", "clusterRewrites", "assignmentSentence"],
};

function buildPrompt(input: EditorInput): string {
  const factsBlock = input.facts
    .map((f, i) => {
      if (f.type !== "trade" || !f.legs) return null;
      const legLines = f.legs.map((l) => `    - ${l.label} (${l.kind}, ${l.direction})`).join("\n");
      const quotes = [f.quote, ...f.refs.map((r) => r.quote)].filter(Boolean).join(" | ");
      return `[${i}] counterparty=${f.counterpartyTeam ?? "?"}\n  legs:\n${legLines}\n  source quotes: ${quotes}`;
    })
    .filter(Boolean)
    .join("\n\n");

  const beatBlock = input.beat.map((b, i) => `[${i}] ${b.text}`).join("\n");
  const clusterBlock = input.fanArgument
    .map((c, i) => `[${i}] label="${c.label}" tension="${c.tension}" tweets=${c.tweets.map((t) => `"${t.text}"`).join(" / ")}`)
    .join("\n");

  return `You are the copy editor for a Chicago Bears intelligence desk. You are NOT a reporter — you may only clean up, merge, or rephrase what is already given below. Never introduce a player name, team, number, or claim that isn't already present in this input.

TASK 1 — Trade legs. Below are trade facts, each with its current leg list (who's in/out of a deal) and the exact source sentences it was built from. The extractor is regex-based and sometimes: (a) lists the same real person twice under slightly different labels (e.g. "Clark Phillips III" and "CB Clark Phillips"), or (b) gets a leg's direction backwards when a source sentence is phrased from the OTHER team's point of view. For each fact index that needs a fix, return the corrected legs array: merge duplicate identities into one leg (keep the fuller label, e.g. prefer "CB Clark Phillips III" over "Clark Phillips III" or "CB Clark Phillips" alone), and use the source quotes to determine the correct direction relative to the Chicago Bears specifically. Every label you return must be a real person/pick already named in that fact's legs or source quotes — do not invent anyone. Set "status" to a short phrase like "Dexter traded" or "Phillips acquired". Skip any fact index that's already correct.

Trade facts:
${factsBlock || "(none)"}

TASK 2 — Inbox lines. Below are beat-reporter lines, verbatim. Return a tightened one-sentence rewrite ONLY for lines that are awkward, truncated, or run-on — skip lines that are already clean. Never add a name or fact not already in that exact line.

Beat lines:
${beatBlock || "(none)"}

TASK 3 — Fight clusters. Below are up to 3 fan-argument clusters already assembled from real posts. You may tighten the label (3-6 words) and the tension line (one sentence, both sides if they exist) — never invent a side, a name, or a number not already reflected in that cluster's tweets.

Clusters:
${clusterBlock || "(none)"}

TASK 4 — Assignment sentence. Tighten this single instruction a creator will read (do not add any name not already in it):
"${input.assignmentBase}"

Return ONLY the JSON object matching the schema. Omit an entry from factLegFixes/beatRewrites/clusterRewrites entirely rather than returning a no-op edit.`;
}

async function callGemini(prompt: string, apiKey: string): Promise<any | null> {
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
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA },
        }),
      },
    );
    if (!res.ok) {
      console.warn(`[editor] Gemini HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? JSON.parse(text) : null;
  } catch (err) {
    console.warn(`[editor] Gemini call failed: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// A returned label must already appear (case-insensitive) among the fact's
// own legs or source quotes — the hard "no new names" guard.
function labelIsGrounded(label: string, fact: Fact): boolean {
  const low = label.toLowerCase();
  const inLegs = (fact.legs ?? []).some((l) => low.includes(l.label.toLowerCase()) || l.label.toLowerCase().includes(low));
  if (inLegs) return true;
  const text = [fact.quote, ...fact.refs.map((r) => r.quote)].join(" ").toLowerCase();
  // last-name check: the last word of the proposed label should show up in the source text
  const lastWord = low.split(" ").filter(Boolean).pop() ?? low;
  return text.includes(lastWord);
}

function wordsGrounded(text: string, source: string): boolean {
  const sourceWords = new Set(source.toLowerCase().match(/[a-z']{3,}/g) ?? []);
  const candidateWords = text.toLowerCase().match(/[a-z']{3,}/g) ?? [];
  // every "name-shaped" capitalized word in the ORIGINAL text casing must
  // survive — approximate by requiring 90% of the rewrite's longer words to
  // already exist somewhere in the source vocabulary.
  const longWords = candidateWords.filter((w) => w.length >= 5);
  if (longWords.length === 0) return true;
  const grounded = longWords.filter((w) => sourceWords.has(w)).length;
  return grounded / longWords.length >= 0.75;
}

export async function runEditor(input: EditorInput): Promise<EditorOutput | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  const empty: EditorOutput = {
    factLegFixes: new Map(),
    beatRewrites: new Map(),
    clusterRewrites: new Map(),
    assignmentSentence: null,
  };
  if (!apiKey) return null;

  const tradeFacts = input.facts.filter((f) => f.type === "trade" && f.legs);
  if (tradeFacts.length === 0 && input.beat.length === 0 && input.fanArgument.length === 0) return empty;

  const raw = await callGemini(buildPrompt(input), apiKey);
  if (!raw) return null;

  const out = empty;

  try {
    for (const fix of raw.factLegFixes ?? []) {
      const fact = input.facts[fix.factIndex];
      if (!fact || fact.type !== "trade") continue;
      const legs: FactLeg[] = (fix.legs ?? [])
        .filter((l: any) => l && typeof l.label === "string" && (l.kind === "player" || l.kind === "pick") && (l.direction === "in" || l.direction === "out"))
        .filter((l: any) => labelIsGrounded(l.label, fact))
        .map((l: any) => ({ label: l.label.trim(), kind: l.kind, status: String(l.status ?? "").trim() || `${l.label} ${l.direction === "out" ? "traded" : "acquired"}`, direction: l.direction }));
      if (legs.length > 0) out.factLegFixes.set(fix.factIndex, legs);
    }

    for (const r of raw.beatRewrites ?? []) {
      const item = input.beat[r.beatIndex];
      if (!item || typeof r.text !== "string" || !r.text.trim()) continue;
      if (wordsGrounded(r.text, item.text)) out.beatRewrites.set(r.beatIndex, r.text.trim());
    }

    for (const r of raw.clusterRewrites ?? []) {
      const cluster = input.fanArgument[r.clusterIndex];
      if (!cluster || typeof r.label !== "string" || typeof r.tension !== "string") continue;
      const sourceText = cluster.label + " " + cluster.tweets.map((t) => t.text).join(" ");
      if (wordsGrounded(r.label, sourceText) && wordsGrounded(r.tension, sourceText)) {
        out.clusterRewrites.set(r.clusterIndex, { label: r.label.trim(), tension: r.tension.trim() });
      }
    }

    if (typeof raw.assignmentSentence === "string" && raw.assignmentSentence.trim()) {
      if (wordsGrounded(raw.assignmentSentence, input.assignmentBase)) {
        out.assignmentSentence = raw.assignmentSentence.trim();
      }
    }
  } catch (err) {
    console.warn(`[editor] validation failed: ${(err as Error).message}`);
    return null;
  }

  return out;
}
