# Orchestration Playbook — the fan-out engine

Load this to run the analysis. This is *how* it stays fast and cheap while going deep: an orchestrator that holds only compact JSON, fanning out isolated subagents that fetch → extract → discard and return schema objects (see `references/schema.md`). It never carries raw pages.

## Table of contents
- The O(N) discipline (why this is cheap)
- Tiers & budgets
- Phase 1 — Discover & confirm the competitive set
- Phase 2 — Fan out (one subagent per competitor + market)
- Phase 3 — Synthesize (matrix → market thesis → moat thesis → recommendations)
- Phase 4 — Red-team the top recommendations
- Phase 5 — Confidence-driven refresh schedule
- Subagent prompt template

---

## The O(N) discipline (why this is cheap)

The old 1–2M-token analysis grew ~quadratically: every fetched page sat in one context and got re-read on every later step. Here, the orchestrator's context stays nearly flat:

- **Raw pages live and die inside a subagent.** Each subagent uses `scripts/fetch_extract.py` (strips HTML→text in-script) and/or WebSearch, reasons over it, and returns **only** its schema object (~1–2k tokens). The 50–100k-token pages never reach the orchestrator.
- **One competitor = one subagent.** Adding competitors scales cost *linearly*, not quadratically. "As many as possible" is therefore affordable — the budget is the only ceiling.
- **The orchestrator only ever holds:** the confirmed competitor list, the returned JSON objects, and the synthesis it writes. If you find the orchestrator reading a competitor's webpage directly, you've broken the pattern.

This is the same insight that took `cracked-dev` from O(N²) to O(N) — externalize the heavy reads into disposable contexts.

---

## Tiers & budgets

Pick from the user's request; default **standard**. Tiers scale *breadth* (how many competitors) and *depth* (sources per subagent), never the schema — every run fills the full schema, tiers just bound the evidence-gathering.

| Tier | Competitors | Sources / subagent | Market dims | Rough budget | When |
|---|---|---|---|---|---|
| **quick** | top 3–5 direct | ≤3 fetches + 1 search | merged into 1 agent | ~150k | gut-check, "who's ahead right now" |
| **standard** (default) | 6–10 (direct + adjacent) | ≤5 fetches + 2 searches | 1 market agent | ~300–500k | a real planning input |
| **deep** | the full set incl. emerging/aspirational | ≤8 fetches + reviews + funding + roadmap-signal searches | split into 3–4 market agents | ~800k+ | "as many competitors and dimensions as possible"; quarterly / high-stakes |

Hard caps are the spend fence — if a subagent wants more sources than its budget, it returns what it has plus an `open_unknowns` entry, rather than blowing the budget. Breadth (more competitors) is cheap; depth-per-source is where waste hides, so cap the latter.

---

## Phase 1 — Discover & confirm the competitive set

1. **Load product context.** Read your product context if you keep notes (e.g. a `Projects/<product>` note) for positioning, ICP, and any known competitors. If none exists or it's thin, ask the user 2–3 intake questions. Never assume which product — confirm it.
2. **Discover.** Spawn one discovery subagent: given our product + known competitors, search for the full competitive set and classify each as `direct | adjacent | emerging | aspirational`. It returns a candidate list with one-liners + why-included — no deep analysis yet.
3. **Confirm with the user.** Present the candidate set (especially *emerging* entrants they may not know). Let them add/cut before the expensive phase. This 30-second gate prevents analyzing the wrong set deeply.

---

## Phase 2 — Fan out

Spawn **in parallel**: one subagent per confirmed competitor (per-competitor schema) + the market subagent(s) (market schema). Each gets the prompt template below with its tier's source budget. Collect the returned JSON objects. Drop any that failed (record it) and proceed — a missing competitor is a logged gap, not a halt.

Keep the orchestrator lean: store the JSON array, nothing else.

---

## Phase 3 — Synthesize

From the compact objects only:
1. **Competitive matrix** — competitors × dimensions grid.
2. **Market thesis** — the point of view (see depth bar in `references/schema.md`). If it reads like a generic category description, it's not done — push to "what's the real game and where is it going."
3. **Moat thesis** — what *we* can make defensible, grounded in `moat_defensibility` + `white_space`.
4. **Recommendations** — concrete, typed, horizon-tagged (now/next/later), each tied to a threat or white-space and carrying expected impact + confidence.

Do this in the orchestrator (it's reasoning over compact data, cheap). Don't spawn a subagent for synthesis — synthesis needs the whole picture.

---

## Phase 4 — Red-team the top recommendations (the stress test)

This is the fix for "recommendations weren't stress-tested enough." Take the **top 3** recommendations (highest expected impact). For each, spawn a small panel of adversarial subagents, **each a distinct lens** (diversity beats redundancy):

- **Competitor counter-move** — if we do this, how does the strongest competitor respond, and do we still win?
- **Skeptical investor** — is this a real moat/wedge or a feature any competitor copies in a quarter?
- **Resource/constraint** — can we actually build/ship/sell this given our size and stack? What's the hidden cost?
- **"Why this fails"** — steelman the case against; what has to be true for it to flop?

A recommendation **survives** only if it withstands the panel (majority not-refuted). Survivors stay; the rest get revised (narrowed/sequenced differently) or dropped with a one-line reason. State, in the report, what the red-team changed — that visible scar tissue is what makes the plan trustworthy. For a truly high-stakes call, offer to escalate the survivor to `shadow-board-advisor` (if you have it installed) for a full panel.

---

## Phase 5 — Confidence-driven refresh schedule

No fixed cadence. Compute the refresh signal from the analysis's own confidence + the unknowns:

- **Per competitor:** aggregate `overall_confidence` + count of `open_unknowns`. Low confidence / many unknowns → **re-check sooner** (the analysis is shaky there). High confidence → **don't re-run on a clock**; re-run only on a **watch-trigger**.
- **Watch-triggers** (event-based, recorded in the dossier per competitor): the named competitor ships a **new product or major feature**; a **funding/M&A** event; a **new entrant** appears in the category; a pricing change; or our own pivot invalidates the prior frame.
- **Output:** the report and dossier state *"refresh competitor X when [trigger]; overall re-baseline when [market condition]"* — not "in 6 weeks." This matches how competitive reality actually moves: in jumps, not on a schedule.

---

## Subagent prompt template

Each competitor subagent gets a prompt of this shape (fill the brackets). Critically, the
orchestrator must **resolve `fetch_extract.py` to an absolute path and interpolate it** into the
template — a subagent's working directory isn't guaranteed to be the skill dir, and a bare
relative path that fails to resolve silently degrades the subagent to raw fetches, defeating the
token lever that is the whole point.

```
You are researching ONE competitor for a competitive analysis: [Competitor, url].
Our product (for relevance): [one-line + ICP from the vault Project note].

Budget: at most [N] page fetches and [M] web searches. Respect it — if you'd exceed it,
stop and record what you still don't know in open_unknowns.

Method (this keeps tokens low):
- Use the fetch helper at [ABSOLUTE path to fetch_extract.py — the orchestrator fills this in;
  a subagent's cwd is not guaranteed to be the skill dir, so a bare relative path may not resolve]
  to pull pages (homepage, /pricing, /about, key product pages, changelog) — it returns clean
  truncated text, so you never read raw HTML.
- Use WebSearch for reviews/sentiment (G2, Capterra, Reddit, HN, app stores), funding/traction
  (Crunchbase, press), and roadmap signals (job posts, blog, changelog).
- Extract → judge → DISCARD. Do not paste raw page text into your answer.

Return ONLY a JSON object matching the per-competitor schema in references/schema.md —
every field with a fact carries evidence (url) + confidence; end with implications_for_us
(the so-what for our product) and open_unknowns. No prose outside the JSON.
```

The market subagent is the same shape against the market schema. The discovery subagent returns a classified candidate list, no deep fields.
