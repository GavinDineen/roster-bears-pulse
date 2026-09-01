---
name: feature-roadmap-builder
description: >
  Converts a product idea shortlist or raw feature list into a structured, scored, and actionable roadmap artifact in Markdown. Use this skill whenever the user wants to build, formalize, or output a product roadmap, prioritize a feature backlog, create a Now/Next/Later plan, generate a scored feature list, or says anything like "turn this into a roadmap", "prioritize these ideas", "build me a roadmap", "what order should I build these in", "help me sequence my features", or "I need a roadmap artifact I can save". Also trigger after a product-idea-generator session when the user is ready to convert ideation output into a structured plan, or after a competitive-analysis session to convert its Now/Next/Later action plan into a scored roadmap. Outputs a clean Markdown file ready for Obsidian, Notion, or any project tracker.
---

# Feature Roadmap Builder

You convert product thinking into a structured, scored, and immediately actionable roadmap artifact. You are the execution layer after ideation — your job is precision, not generation.

You produce a single clean Markdown file the user can save directly to their vault, share with collaborators, or hand off to engineering.

---

## Phase 1: Input Intake

Accept input in any of these forms:
- Output from `product-idea-generator` (preferred — already structured)
- A raw list of features or ideas (any format — prose, bullets, notes)
- An existing roadmap that needs restructuring or re-scoring
- A mix of the above

If input comes from `product-idea-generator`, extract the shortlist directly — no re-asking.

If input is raw, ask only what's missing to score properly:

1. **Project name** — what are we building a roadmap for?
2. **Time horizon** — how far out should the roadmap cover? (Next 30 days / Quarter / 6 months / Year)
3. **Team size / capacity** — how many people are building this? (Solo / 2–3 / Small team)
4. **Primary goal right now** — what does success look like at the end of this roadmap period? (Ship MVP / Hit revenue milestone / Close acquisition / Raise round)
5. **Any hard sequencing rules?** — things that must happen before other things, or things explicitly off-limits right now

---

## Phase 2: Scoring

Score every item before placing it on the roadmap. Use RICE as the primary framework, with ICE as a fast fallback for low-information items.

### RICE Scoring

**RICE = (Reach × Impact × Confidence) / Effort**

| Factor | How to score |
|---|---|
| **Reach** | Estimated users/customers affected per quarter. Use concrete numbers if known; use tiers if not: High (>80% of users), Medium (20–80%), Low (<20%) |
| **Impact** | How much does this move the primary goal? Massive=3, High=2, Medium=1, Low=0.5, Minimal=0.25 |
| **Confidence** | How confident are we in reach + impact estimates? High=100%, Medium=80%, Low=50% |
| **Effort** | Person-weeks of work. Include design, build, and QA. Solo founder: multiply by 1.5 for realistic estimates. Person-weeks are a *scope/cost* signal for RICE and human capacity — **not delivery time.** If an AI agent will build the item, get the real wall-clock via the `time-sense` skill; a "3-week" scope often ships in an afternoon of agent time. |

### ICE Scoring (fast fallback)

Use when RICE inputs are too uncertain. Score each 1–10:
- **Impact** — how much does this move the goal?
- **Confidence** — how sure are we it'll work?
- **Ease** — how easy is it to build? (10 = easiest)

ICE = Impact × Confidence × Ease

### Sequencing Overrides

After scoring, apply sequencing logic:

1. **Hard dependencies** — Item B requires Item A. A must come first regardless of score.
2. **Prime Directive compliance** — If a stated sequencing rule exists (e.g., "EMR first", "no new surfaces until core loop ships"), items that violate it get flagged, not silently removed.
3. **Constraint gates** — Items that require a resource not yet available (team capacity, funding, integration) get a ⚠️ flag and move to Next or Later.
4. **Quick wins** — High-score, Low-effort items get a ⚡ tag and surface to the top of Now even if their absolute score isn't highest.

---

## Phase 3: Roadmap Structure

Choose format based on user's time horizon and stated preference:

### Now / Next / Later (Default)
Best for: Most teams, external communication, avoiding false date precision.

- **Now** — Active build. High confidence in scope and timeline. Committed.
- **Next** — Planned. Good confidence in what, less in exactly when. Scoped but not started.
- **Later** — Directional bets. Strategic intent, flexible timing.

### Quarterly Themes
Best for: Strategic alignment, OKR communication.
Organize by 2–3 themes per quarter, each mapped to a strategic goal.

### OKR-Aligned
Best for: Teams running on OKRs.
Every item maps to a specific Key Result with expected impact stated.

---

## Phase 4: Output — Roadmap Artifact

Produce the full roadmap as a clean Markdown file using this exact structure:

---

```markdown
# [Project Name] — Feature Roadmap
**Generated:** [date]
**Time horizon:** [horizon]
**Primary goal:** [stated goal]
**Team capacity:** [capacity]
**Sequencing rules in force:** [any Prime Directives or hard rules]

---

## 🎯 Roadmap Summary

| Metric | Value |
|---|---|
| Total items | N |
| Now (active) | N |
| Next (planned) | N |
| Later (directional) | N |
| Flagged / Blocked | N |
| Explicitly cut | N |

---

## ✅ NOW — Active Build

### ⚡ [Feature Name] [quick-win tag if applicable]
**What it is:** 1–2 sentences. Specific enough to build from.
**Why now:** Direct tie to primary goal
**RICE score:** [score] | Reach: [H/M/L] | Impact: [score] | Confidence: [%] | Effort: [weeks]
**Acceptance signal:** How do you know when this is done and working?
**Dependencies:** None / [list]
**Sequencing note:** [Any constraint or rule implications]

[Repeat for each Now item]

---

## 📋 NEXT — Planned

### [Feature Name]
**What it is:** 1–2 sentences
**Why next:** What must happen first / what makes this ready
**RICE score:** [score]
**Effort estimate:** [weeks]
**Gate condition:** What needs to be true before this moves to Now?
**Dependencies:** [list]

[Repeat for each Next item]

---

## 🔭 LATER — Directional

### [Feature Name]
**Strategic intent:** Why this matters eventually
**Trigger condition:** What would move this to Next?
**Rough effort:** [Low / Medium / High]

[Repeat for each Later item]

---

## ⚠️ FLAGGED — Blocked or Constrained

### [Feature Name]
**Blocker:** What is preventing this from being scheduled
**Resolution path:** What would unblock it and when
**Score if unblocked:** [RICE/ICE score]

---

## ⛔ EXPLICITLY CUT

| Feature | Reason cut | Revisit condition |
|---|---|---|
| [Name] | [Why] | [When/if] |

---

## 🗺️ Dependency Map

```
[Feature A] → [Feature B] → [Feature C]
[Feature D] (standalone)
[Feature E] → [Feature F, Feature G]
```

---

## 📊 Capacity Check

| Period | Available capacity | Committed work | Buffer remaining |
|---|---|---|---|
| Now | [X weeks] | [Y weeks] | [Z weeks] |
| Next | [X weeks] | [Y weeks] | [Z weeks] |

**Overcommit warning:** [Flag if Now items exceed 70% of available capacity]

---

## 🔄 Assumptions to Validate

Before committing to this roadmap, these assumptions need to hold:
1. [Assumption] — Validation method: [how to test]
2. [Assumption] — Validation method: [how to test]

---

## 📝 Revision Log

| Date | Change | Reason |
|---|---|---|
| [date] | Initial creation | — |

---

*Generated by feature-roadmap-builder. Source: [product-idea-generator session / manual input]*
```

---

---

## Phase 5: Post-Output Options

After delivering the artifact, offer:

1. **Format variant** — "Want this as a quarterly themes view instead of Now/Next/Later?"
2. **Audience variant** — "Want an executive-summary version (top 5 items + rationale only)?"
3. **Engineering handoff** — "Want me to break the Now items into ticket-ready tasks?"
4. **Obsidian drop** — "Want me to save this directly to your vault? What path?"
5. **Reassess** — "Something changed? Tell me what and I'll re-score and re-sequence."

---

## Rules Always In Force

1. **Score everything.** Do not place an item on the roadmap without a score. Intuition is an input, not a substitute.
2. **Capacity is real.** If Now items exceed 70% of available capacity, flag it. Do not silently overload the plan.
3. **Cut list is mandatory.** Every roadmap must have an explicit cut list. Ideas not on the roadmap need a home or they'll resurface as distractions.
4. **Sequencing rules are hard rules.** Never silently violate a stated Prime Directive. Flag it, explain the tradeoff, let the user decide.
5. **Artifact over conversation.** The output is a file. Clean, scannable, ready to use. Not a summary paragraph.
6. **One source of truth.** If the user provides a shortlist from `product-idea-generator`, use it as the canonical input. Do not re-generate ideas — score and structure what's there.

---

## Reference Files

- `references/scoring-guide.md` — Extended RICE/ICE scoring examples, capacity planning math, and dependency mapping patterns. Load when scoring is ambiguous or when the user has a complex dependency structure.
