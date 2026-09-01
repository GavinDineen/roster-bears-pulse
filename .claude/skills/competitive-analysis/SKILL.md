---
name: competitive-analysis
description: >-
  Run a deep, decision-grade competitive AND market analysis FOR OUR product, ending in a
  competitive matrix, a moat thesis, and a sequenced action plan — token-cheap via isolated,
  schema-bound research subagents. Fire on: "run a competitive analysis", "analyze our
  competitors", "competitor research/teardown", "who are we really up against", "who else is out
  there/doing this", "size up the competition/the market for our product", "competitive
  landscape", "where can we win vs <competitor>", "what's our moat / is this defensible / how do
  we make this hard to copy", "how do we differentiate/stand out", "build a battlecard", "is there
  white space in this category" — also when the user names a competitor or category AND wants the
  field mapped before deciding what to build. Project-agnostic (loads product context from the
  vault Project note at intake). "Competitive" means business rivals and the market — NOT
  competitive programming/contests, sports, or one-off pricing questions. For neutral research
  with no our-product angle, use deep-research instead.
---

# Competitive Analysis

You produce competitive and market analysis that a founder can *act on the same day* — and you do
it without the waste that makes most competitive research cost 1–2M tokens and 25 minutes. Two
non-negotiable quality bars, because they're exactly where naive analyses fail:

1. **Depth + real market understanding.** You don't list facts; you explain the *game*. The output
   carries a point-of-view **market thesis** and ties every finding to an implication for our
   product. If a section reads like a generic category description, it isn't done.
2. **Stress-tested recommendations.** Every top recommendation survives an adversarial red-team
   before it ships. A confident-but-untested strategy is the failure mode you exist to prevent.

And you are **token-disciplined**: depth comes from killing waste (raw pages, redundant fetches),
not from spending more. See *Token discipline* — it's the whole reason this skill exists.

## How it stays cheap while going deep

A naive analysis piles every fetched page (50–100k tokens each) into one growing context that gets
re-read on every step — ~O(N²). You don't. You run a **lean orchestrator** that holds only compact
JSON, and fan out **one isolated subagent per competitor** (and per market dimension). Each subagent
fetches → extracts to a fixed schema → **discards the raw text** → returns ~1–2k tokens of JSON. Raw
HTML never reaches the orchestrator. Adding competitors then scales **linearly**, so "as many as
possible" is affordable. Full mechanics: `references/orchestration.md`.

## The pipeline

```
INTAKE → DISCOVER+CONFIRM → FAN-OUT → SYNTHESIZE → RED-TEAM → OUTPUT+DOSSIER → HANDOFF
```

1. **INTAKE — learn the product (it runs for any product).** Confirm *which* product, then read its
   product context (from your notes if you keep any — e.g. a `Projects/<product>` note) for
   positioning, ICP, and known competitors. If thin or absent, ask 2–3 intake questions. Pick a
   tier (quick / standard / deep);
   default **standard**.
2. **DISCOVER + CONFIRM.** A discovery subagent finds the full competitive set (direct / adjacent /
   **emerging** / aspirational) and classifies it. Show the user the set — especially emerging
   entrants they may not know — and let them add/cut before the expensive phase.
3. **FAN-OUT.** Spawn, in parallel, one subagent per confirmed competitor + the market subagent(s),
   each on its tier's **source budget** and the schema in `references/schema.md`. Collect compact
   JSON; a failed competitor is a logged gap, not a halt.
4. **SYNTHESIZE** (in the orchestrator — it's cheap reasoning over compact rows): the competitive
   **matrix**, the **market thesis** (the point of view), the **moat thesis** (what *we* can defend),
   and **recommendations** (typed, horizon-tagged Now/Next/Later, each tied to a threat or white
   space with expected impact + confidence).
5. **RED-TEAM.** Take the top 3 recommendations; spawn a small panel per recommendation, each a
   distinct adversarial lens (competitor counter-move / skeptical investor / resource-constraint /
   "why this fails"). Keep only survivors; revise or drop the rest; record what changed. Offer to
   escalate a high-stakes survivor to `shadow-board-advisor` (if you have it installed).
6. **OUTPUT + DOSSIER.** Write the decision-grade report (Markdown artifact) and update the
   incremental **competitor dossier in your knowledge vault** (via `vault-companion` if you have it). Templates:
   `references/output-template.md`.
7. **HANDOFF.** Route the action plan onward (see *Routing* below). The analysis is an input to the
   product flywheel, not a dead-end doc.

## Tiers (breadth/depth, never schema)

Every tier fills the full schema; tiers bound how many competitors and how many sources per
subagent. **quick** (3–5 direct, ~150k) · **standard** (6–10, ~300–500k, default) · **deep** (the
full set incl. emerging, reviews + funding + roadmap signals, ~800k+ — the "as many competitors and
dimensions as possible" mode). Hard per-subagent source caps are the spend fence; breadth is cheap,
depth-per-source is where waste hides. Details in `references/orchestration.md`.

## Confidence-driven refresh (no fixed cadence)

Don't recommend "re-run in N weeks." Every finding carries an honest **confidence** and
**open-unknowns**; the dossier records per-competitor **watch-triggers** (they ship a new
product/feature, raise a round, change pricing, or a new entrant appears). Low confidence → re-check
sooner; high confidence → re-run only when a trigger fires. The report states *"refresh when X."*

## Token discipline (this skill must save more than it costs)

- **Orchestrator holds compact JSON only** — never a raw page. If you're reading a competitor's site
  in the orchestrator, you've broken the pattern; push it into a subagent.
- **`scripts/fetch_extract.py`** strips HTML→text *in-script* so a 50–100k-token page becomes ~1–2k
  of clean text before any model reads it. Subagents use it for page fetches.
- **Extract → judge → discard.** Subagents return schema JSON, not raw text.
- **Respect source budgets.** Over budget → return what you have + an `open_unknowns` entry.
- **Re-runs are incremental** — read the dossier first; re-research only fired watch-triggers, lowest
  -confidence areas, and new entrants. Carry the rest forward.

## Routing

This is the **external-market input** to the product flywheel — it feeds, it doesn't replace:
- **`feature-roadmap-builder`** — the primary handoff: turn the Now/Next/Later plan into a scored roadmap.
- **`product-strategy-consultant`** — one thorny positioning/pricing decision the analysis surfaced.
- **`shadow-board-advisor`** (if installed) — stress-test a high-stakes survivor beyond the built-in red-team.
- **`build-vs-borrow`** — when a recommended feature is a commodity capability, before building it.
- **`deep-research`** — if the question turns out to be general (non-competitive) research, hand back.

## References

- `references/schema.md` — the exhaustive per-competitor + market schemas (the depth bar: evidence + implication + confidence on every field).
- `references/orchestration.md` — the fan-out engine: O(N) discipline, tiers & budgets, the phases (discover → fan-out → synthesize → red-team → refresh), the red-team panel, the subagent prompt template.
- `references/output-template.md` — the report, the timestamped vault dossier (watch-triggers, "what changed"), and the flywheel handoff.
- `scripts/fetch_extract.py` — fetch URLs → strip to readable text → truncate → compact JSON. Keeps raw HTML out of context. Text only; it never judges.
