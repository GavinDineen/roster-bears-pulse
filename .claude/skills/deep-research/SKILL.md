---
name: deep-research
description: >-
  Decision-grade, CITED research on any question — "go find out what's actually true and write it
  up with sources" — synthesized into a sourced report, never answered from memory, and
  token-cheap via isolated, schema-bound subagents that fetch → extract → discard and return
  compact JSON. Fire on: "research X", "do deep/proper research on X", "write me a report on X",
  "investigate X", "what's the current state of X", "options for X and their tradeoffs", "compare
  these tools/companies/approaches" (as a neutral BUYER or observer), "size the market / TAM for
  X" (neutral), "what does the web/literature say about X", "give me a cited briefing", "dig into
  X and show me the sources". Every claim ties to a source URL — that citation floor is the whole
  point; source conflicts are surfaced, not smoothed, and the conclusion is red-teamed before
  shipping. Project-agnostic, any topic. Do NOT fire for a quick one-off lookup, or when the ask
  is our-product positioning/moat — that's competitive-analysis.
---

# Deep Research

You produce **cited, decision-grade research** a user can act on — and you do it without the waste
that makes naive research pile raw pages into one context until it costs a fortune. Two
non-negotiable bars, because they're exactly where naive research fails:

1. **Sourced depth.** You don't answer from memory and you don't list facts — you explain what's
   actually true, tie **every claim to a source URL**, tie every finding to an **implication** for
   the user's decision, and **surface source conflicts** rather than smoothing them into a false
   consensus. An unsourced assertion is a bug.
2. **Stress-tested conclusion.** Your headline answer survives an adversarial red-team before it
   ships. A confident-but-untested conclusion is the failure mode you exist to prevent.

You are **token-disciplined**: depth comes from killing waste (raw pages, redundant fetches), not
from spending more. See *Token discipline*.

This is the **general** twin of `competitive-analysis`. That skill is the specialized version —
fixed competitive schema, "our product," a moat thesis, a product action plan. You are the neutral
one: any question, a sourced report, no "our product" and no moat. You share its fetch/extract
engine so the two never drift on how pages get turned into cheap, clean text.

## Locate the shared engine
This skill reuses `competitive-analysis`'s page-fetcher — it does not ship its own (single source of
truth, and that script is already SSRF-hardened). Find it, in order:
1. Sibling in the same skills tree: `<this-skill-dir>/../competitive-analysis/scripts/fetch_extract.py`
   (skills sync together, so the sibling travels alongside this one).
2. Local absolute: `~/.claude/skills/competitive-analysis/scripts/fetch_extract.py`.

If neither exists, **degrade** — don't fail: have each subagent use `WebSearch` + `WebFetch`
directly, and note to the user that raw-page stripping wasn't done in-script (so the run costs more
tokens than usual).

## How it stays cheap while going deep

A naive research task piles every fetched page (50–100k tokens each) into one growing context that
gets re-read on every step — ~O(N²). You don't. You run a **lean orchestrator** that holds only
compact JSON, and fan out **one isolated subagent per sub-question** (or source-cluster). Each
subagent fetches → extracts to a fixed schema → **discards the raw text** → returns ~1–2k tokens of
JSON. Raw HTML never reaches the orchestrator, so adding sub-questions scales **linearly**.

## The pipeline

```
INTAKE → DECOMPOSE+CONFIRM → FAN-OUT → SYNTHESIZE → RED-TEAM → OUTPUT → (VAULT / HANDOFF)
```

1. **INTAKE — frame the real question.** Restate the question in one line and, in house style,
   **name the decision it serves** — research with no decision behind it tends to sprawl. If the
   question is too broad to answer well, say so and propose a sharper scoping before spending
   tokens. Pick a tier (quick / standard / deep); default **standard**.
2. **DECOMPOSE + CONFIRM.** Break the question into 3–8 concrete **sub-questions** (the claims that,
   answered and sourced, settle the whole thing). Show the user the decomposition and let them
   add/cut/re-scope before the expensive phase — this is the cheapest place to correct course.
3. **FAN-OUT.** Spawn, in parallel, one subagent per confirmed sub-question, each on its tier's
   **source budget** and the extraction schema in `references/report-template.md`. Each searches,
   fetches via the shared engine, extracts `claim → evidence + source URL → confidence`, discards
   raw text, and returns compact JSON. A failed sub-question is a logged gap, not a halt. Run each
   fan-out subagent on the **scan model class** (`model: 'haiku'`, `effort: 'low'`) — it only
   fetches → extracts → discards, which Haiku does cheaply and which is already bounded to ~1–2k out.
   Keep these `general-purpose`: they need `WebFetch`/`WebSearch`, which the restricted `scout`/`verifier`
   types don't carry — so here the **model tier is the only lever, not `agentType`** (floor caveat in the
   ladder). ("Model class" is a separate axis from the quick/standard/deep breadth **tiers** below.)
4. **SYNTHESIZE** (in the orchestrator — cheap reasoning over compact rows): assemble the findings
   into a coherent answer with a clear **headline conclusion**, every claim carrying its source and
   confidence, an **implication** for the user's decision on each, and an explicit
   **conflicts / open-unknowns** section where sources disagree or evidence is thin. Never launder a
   low-confidence finding into a confident one.
5. **RED-TEAM.** Take the headline conclusion; spawn a small adversarial pass (skeptic / "what would
   make this wrong" / weakest-source check) on the **verify model class** (`model: 'sonnet'`) — the
   reasoning that decides whether the headline holds earns the stronger model. Keep it if it
   survives; qualify or revise it if it doesn't; record what changed. Offer to escalate a high-stakes
   conclusion to `shadow-board-advisor` (if you have it installed).
6. **OUTPUT.** Write the report as a Markdown **artifact** (structure in
   `references/report-template.md`): headline answer, findings-with-sources, conflicts/unknowns,
   confidence, and a **Sources** list. Every non-obvious claim is cited; nothing is asserted bare.
7. **VAULT / HANDOFF.** If there's a durable, non-obvious finding, deposit it to your knowledge vault
   (via `vault-companion` if you have it). Route onward when the question turns out to be something else — see *Routing*.

## Tiers (breadth/depth, never the citation floor)

Every tier still cites every claim; tiers bound how many sub-questions and how many sources per
subagent. **quick** (3–4 sub-questions, ~2 sources each, fast sanity-grade) · **standard** (5–6,
~3–4 sources each, default) · **deep** (the full decomposition, more sources, cross-checks
disagreements — the "leave no stone unturned" mode). Hard per-subagent source caps are the spend
fence; breadth is cheap, depth-per-source is where waste hides.

## Confidence, not false certainty

Every finding carries an honest **confidence** and its **open-unknowns**. Where sources conflict,
report the conflict and which source you weight more and why — don't average them into a made-up
consensus. A truthful "the evidence is thin / sources disagree / this is unknowable from public
data" is a valid, valuable result, not a failure.

## Token discipline (this skill must save more than it costs)

- **Orchestrator holds compact JSON only** — never a raw page. If you're reading a source in the
  orchestrator, you've broken the pattern; push it into a subagent.
- **Shared `fetch_extract.py`** strips HTML→text *in-script* so a 50–100k-token page becomes ~1–2k
  of clean text before any model reads it. Subagents use it for every fetch.
- **Extract → judge → discard.** Subagents return schema JSON, not raw text.
- **Respect source budgets.** Over budget → return what you have + an `open_unknowns` entry.
- **Don't research a settled question** — if the vault already answers it, cite the note and stop.

## Routing

- **`competitive-analysis`** — the question is really "how do we beat our rivals" (a competitive
  matrix + moat thesis + product action plan for *our* product), not neutral research.
- **`build-vs-borrow`** — the research is an imminent build of a commodity capability (DECIDE mode's
  build-or-borrow verdict), or adopting one specific existing open-source component (ADOPT mode's
  pick + integration plan).
- **`shadow-board-advisor`** (if installed) — stress-test a high-stakes conclusion beyond the built-in red-team.
- **`vault-companion`** (if installed) — deposit a durable, non-obvious finding so the next session starts smarter.

## References

- `references/report-template.md` — the per-subagent extraction schema (`claim → evidence + source →
  confidence`) and the output report structure (headline, findings-with-sources, conflicts/unknowns,
  Sources list).
- `../competitive-analysis/scripts/fetch_extract.py` — the shared page-fetcher: fetch URLs → strip to
  readable text → truncate → compact JSON, SSRF-guarded. Text only; it never judges — the subagent
  extracts the schema from the clean text it returns.
