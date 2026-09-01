# Output Templates — report, dossier, handoff

Load this for Phase 3+ output. Three artifacts: the **report** (the decision-grade action weapon, written as a Markdown file), the **dossier** (the compounding vault memory), and the **handoff** to the product flywheel.

The cardinal rule, drawn from why past analyses failed: **the top of the report is ruthless and decision-grade; raw detail lives below or in the dossier.** A reader should get the thesis, the threats, and the action plan in the first screen. Every finding carries its "so-what"; every recommendation is sequenced and owned.

---

## 1. The report (Markdown artifact)

Write to a ready-to-use file (scratchpad or the product repo, per the user) and offer the path. Structure:

```markdown
# Competitive Analysis — <Product> vs <Category> — <YYYY-MM-DD>
**Tier:** quick|standard|deep · **Competitors analyzed:** N · **Overall confidence:** high|med|low

## TL;DR (the decision-grade top)
- **Market thesis:** <the real game + where it's going, 2–4 sentences — the point of view>
- **Our moat thesis:** <what we can make defensible that they can't easily copy>
- **Top 3 threats:** <competitor + why it matters to us>
- **Top 3 opportunities / white space:** <unmet need + why it's open + how we win>
- **Do now:** <the 1–3 highest-leverage actions, one line each>

## Action plan (Now / Next / Later)
| Horizon | Action | Type | Answers (threat/whitespace) | Expected impact | Confidence | Red-team verdict |
|---|---|---|---|---|---|---|
| Now | … | feature | … | … | high | survived (see below) |
| Next | … | positioning | … | … | med | revised: narrowed scope |
| Later | … | gtm | … | … | low | … |

## Red-team notes (what the stress test changed)
- <recommendation> — <which lens challenged it> → <kept / revised how / dropped why>

## Competitive matrix
| Dimension | Us | <Comp A> | <Comp B> | … |
|---|---|---|---|---|
| Positioning | … | … | … | |
| ICP / segment | … | … | … | |
| Pricing & packaging | … | … | … | |
| Core features | … | … | … | |
| Differentiators | … | … | … | |
| UX / quality | … | … | … | |
| GTM / distribution | … | … | … | |
| Tech / integrations | … | … | … | |
| Compliance / security | … | … | … | |
| Traction / funding | … | … | … | |
| Sentiment (loved/hated) | … | … | … | |
| Moat (defensible/copyable) | … | … | … | |

## Per-competitor detail
<one short block per competitor: one-liner, key moves, weaknesses, implications_for_us, confidence>

## Market & white space
<segments, trends, value shift, the white-space table with why_open>

## Refresh plan (confidence-driven — no fixed cadence)
- Re-baseline the whole analysis when: <market condition>.
- Per-competitor watch-triggers: <Comp A — when they ship X / raise / change pricing>; …
- Lowest-confidence areas to revisit first: <from open_unknowns>.

## Sources & confidence
<key sources; note where confidence is low and why>
```

If the run is decisive, lead with the action — context follows. Do not bury the "so-what."

---

## 2. The dossier (vault, compounding memory)

The dossier is what makes re-runs cheap and lets you see *what changed*. Write it to your knowledge vault — via the `vault-companion` skill if you have one (so its conventions/guardrails apply), otherwise write the note directly. Location: the product's vault Project area, e.g. a note `Competitive Dossier — <Product>` linked from `Projects/<Product>`.

It holds the latest per-competitor schema objects plus metadata that drives the refresh:

```markdown
# Competitive Dossier — <Product>
_Updated: YYYY-MM-DD · tier: … · overall confidence: …_

## Watch-triggers (what should prompt a re-run)
- <Comp A>: ships <feature class> | raises a round | changes pricing | <new entrant in segment X>
- Market: <structural condition that invalidates the current thesis>

## Per-competitor (latest, with last-checked + confidence)
### <Comp A>  — last checked YYYY-MM-DD — confidence: med
<compact schema digest: positioning, pricing, differentiators, weaknesses, moat, implications_for_us, open_unknowns>
...

## Change log
- YYYY-MM-DD: <what changed since the prior run — new entrant, competitor move, our pivot>
```

**On a re-run:** read the dossier first, then re-research only (a) competitors whose watch-triggers fired, (b) the lowest-confidence / most-unknown areas, and (c) discovery for new entrants. Everything else carries forward. Open the new report with a **"What changed since <date>"** section built from the diff. This is the Q4 behavior: confidence + events decide what to re-spend on, not a calendar.

---

## 3. Handoff to the product flywheel

The analysis is an *input*, not a dead-end doc. Close by routing:

- **`feature-roadmap-builder`** — hand it the Now/Next/Later action plan (the feature-type recommendations) to turn into a scored, sequenced roadmap. This is the primary handoff.
- **`product-strategy-consultant`** — for a single thorny positioning/pricing decision the analysis surfaced.
- **`shadow-board-advisor`** (if installed) — to stress-test a high-stakes survivor recommendation across a full panel (beyond the built-in red-team).
- **`build-vs-borrow`** — when a recommended feature is a commodity capability, check whether to adopt OSS before building it.

Name the handoff explicitly in the report's footer so the next step is obvious, e.g.: *"Next: run `feature-roadmap-builder` on the Now/Next/Later plan above."*
