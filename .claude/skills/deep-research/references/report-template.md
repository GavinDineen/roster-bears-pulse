# deep-research — schema & report template

Two things live here: the **compact JSON schema** each fan-out subagent returns (so raw pages never
reach the orchestrator), and the **Markdown report structure** the orchestrator writes at the end.

---

## Per-subagent extraction schema (what FAN-OUT returns)

Each sub-question subagent searches, fetches via the shared `fetch_extract.py`, extracts, discards
raw text, and returns **only** this JSON (~1–2k tokens). No raw HTML, no long quotes.

```json
{
  "sub_question": "the one concrete question this subagent owned",
  "findings": [
    {
      "claim": "a single, checkable statement of what's true",
      "evidence": "the specific fact/number/quote that supports it (short)",
      "source_url": "https://…            // REQUIRED — a claim with no source is dropped",
      "source_type": "primary | vendor | news | analyst | forum | wiki | other",
      "date": "YYYY-MM or 'undated'",
      "confidence": "high | medium | low",
      "implication": "why this matters for the user's decision (one line)"
    }
  ],
  "conflicts": [
    { "about": "what the sources disagree on", "positions": ["A per src1", "B per src2"] }
  ],
  "open_unknowns": ["what this subagent could NOT source, or ran out of budget on"]
}
```

Rules the subagent follows:
- **Every `claim` needs a real `source_url`.** No source → don't report the claim. This is the floor.
- Prefer **primary** sources (the vendor's own docs/pricing, the paper, the filing) over secondary.
  When only secondary exists, mark `source_type` honestly and lower `confidence`.
- Note the **date** — stale evidence is a real risk for "current state" questions.
- Stay within the tier's source budget; over budget → stop and add to `open_unknowns`, don't overrun.

---

## Output report structure (what the orchestrator writes)

A Markdown artifact. Lead with the answer; make every non-obvious claim clickable to its source.

```markdown
# Research: <the question, restated>

**Decision this serves:** <the call the user is trying to make>  ·  **Tier:** <quick|standard|deep>

## Headline answer
<2–4 sentences. The actual conclusion, up front, with an overall confidence. Survived red-team.>

## Findings
### <sub-question 1>
- <claim> — <evidence> [(source)](url) · *conf: high* · **so what:** <implication>
- …
### <sub-question 2>
- …

## Where the sources disagree
<Each conflict: what's contested, the positions, and which you weight more and why. Do NOT average
into a fake consensus.>

## Open unknowns & confidence
<What couldn't be sourced, what's stale, what would change the answer. The honest edges.>

## Red-team note
<What the adversarial pass challenged in the headline, and what changed (or why it held).>

## Sources
1. <title> — <url> — <source_type>, <date>
2. …
```

Keep it tight. The value is a sourced, honest answer to the decision — not length. If the evidence
is thin, say so in the headline; a truthful "unknowable from public data" beats a confident guess.
