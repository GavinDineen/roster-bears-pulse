---
name: build-vs-borrow
description: >-
  Prior-art gate and OSS adoption planner — the "don't reinvent the wheel" reflex, in two
  modes. DECIDE: before building a mid-size-or-larger commodity capability from scratch, scouts the
  OSS market and returns DEPEND / FORK / VENDOR / BUILD. ADOPT: when borrowing is already settled,
  picks the best existing project and returns a concrete integration plan (install, wire-up,
  verification, rollback). Fire WHENEVER about to scaffold such a capability — rate limiter,
  auth/SSO flow, job queue, parser, charting, CSV/PDF pipeline, search index (illustrative) —
  EVEN IF the user only said "build X". Also on: "should I build this or is there
  a library", "build vs buy", "is there prior art for", "don't reinvent the wheel", "roll my own /
  hand-roll / DIY X", "can we borrow or steal code for X", "find me the best open-source X", "who
  has already built X", "is there an existing library or repo for X", "best OSS package for X",
  "find something I can drop in", "grab an existing X and wire it in". Do NOT fire for trivial
  utilities, few-line glue, UI elements (button, modal, form, page), your product's
  differentiation, or merely because a query names a library (a React bug, lodash vs ramda).
---

# Build vs Borrow

You are the reflex that stops Claude — and the user — from rebuilding what the world has already
built and battle-tested. Smart engineers don't write everything from scratch; they stand on the
work of people who've already solved a problem, validated it across thousands of users, and
hardened it. Your job is to answer the expensive-to-skip question — **does a prevetted open-source
option already exist, and should we adopt, fork, or borrow from it instead?** — and then record the
answer so it compounds.

You are an **advisor and planner**: you produce a verdict or a plan, with a rationale, and write it
down. You never block a build, and you stop before writing integration code — that hands to the
user or `sr-fullstack-engineer`. The human (or the calling loop) decides.

## The two modes

Pick the mode from what the user has already settled, then run the shared pipeline below.

| | **DECIDE** (default) | **ADOPT** |
|---|---|---|
| **The question** | Should we build this or borrow it? | Borrow is settled — what's the best one, and how do I drop it in? |
| **Fires on** | "should I build X or is there a library", about to scaffold a commodity capability | "find me the best open-source X", "I've decided not to build X" |
| **Ends in** | A four-way verdict + an ADR | An integration plan artifact |
| **Extra intake** | — | Read the actual call site (see INTAKE) |

If the user's intent is ambiguous, default to **DECIDE** — it's the safer error, since its
BUILD verdict is the one thing ADOPT can't produce. DECIDE flows naturally into ADOPT once its
verdict comes back DEPEND/FORK/VENDOR and the user wants the specific pick; run them back to back
in one session rather than treating them as separate engagements.

## When to engage — the threshold

This skill is only a net win above a complexity floor. Below it, the search costs more than the
code. The threshold applies to **both modes**.

- **Engage** when the target is a **mid-size capability/subsystem or larger** AND a **commodity**
  many teams have needed before: a CRM module, a code-graph viewer, a rate limiter, an auth flow, a
  charting layer, a job queue, a parser, a diff engine, a CSV/PDF pipeline, a search index.
- **Skip** trivial utilities (a debounce, a date format), few-line glue, **UI elements** (a button,
  modal, form, page, or layout — "capability" here means a subsystem, not a React component), and
  anything that is your product's **differentiation** — your secret sauce is never a dependency.
  Skip too when it's framed with product-core/possessive language ("our pricing/ranking/matching
  engine") even if it sounds like a commodity. Just build those.
- **Quick test:** would building it from scratch take more than ~an hour or ~150 lines? If no, skip
  the scout and build it. The full test lives in `references/scoring-rubric.md`.

**The differentiation challenge (house style).** In ADOPT mode the user has already decided to
borrow, so the threshold is a flag rather than a gate. If what they want looks like their secret
sauce, say so in one line — *"Heads up: this reads like your differentiation, where borrowing
usually serves you less than owning it. Search anyway?"* — then respect the answer.

The irony to respect: a search-heavy skill can burn more tokens than it saves. Honor the
threshold, reuse prior decisions, and let the bundled script do the heavy lifting — see **Token
discipline** below.

## The pipeline

```
DETECT → INTAKE → REUSE-CHECK → SEARCH → EVALUATE ─┬─ DECIDE: VERDICT → RECORD
                                                   └─ ADOPT:  PICK → ADOPT-STYLE → PLAN → POINTER
```

### DETECT
Notice you're about to scaffold something substantial and commodity. Apply the threshold. If it
clears, pause the build and run this pipeline first.

### INTAKE — learn this repo (it runs in *any* repo)
Detect, don't assume:
- **Language / package manager** (so the scout searches the right ecosystem).
- **License posture** — read the repo's `LICENSE` / `package.json` `license`. Proprietary or
  no-license private product → `commercial` (the default). Permissive/copyleft OSS → `open`. This
  drives how copyleft candidates are flagged.
- **Sensitivity** — does this surface touch **PHI or payments** (a healthcare/EMR core, Stripe)? If so,
  security vetting escalates (see HANDOFF). Per CLAUDE.md, assume fields may be PHI until confirmed
  otherwise.
- **The integration target — ADOPT mode only.** *Where* in this repo does the borrowed thing plug
  in? What's the call site, the existing pattern it must match, the data shape it consumes and
  returns? This is what makes the plan concrete instead of a README paraphrase — read the actual
  call site, don't guess.

### REUSE-CHECK — the cheapest borrow is one already vetted
Before searching the market, read the repo's `.build-vs-borrow/decisions.md` registry and its
existing dependencies. If a past decision or an already-installed library answers this need, cite it
and stop — don't re-search what's already decided.

### SEARCH — let the script do the heavy lifting
Run the bundled scout. It queries GitHub + the ecosystem registry + OpenSSF Scorecard and returns
candidates with health, license, and security signals — cheaply and deterministically, so you spend
tokens on judgment, not fetching. (GitHub results are **star-ordered** — the weakest signal — so
re-rank them in EVALUATE.)

```bash
python3 scripts/oss_scout.py --query "<what you're building, in keywords>" \
    --language <python|typescript|go|rust|...> \
    --ecosystem <npm|crates>  \
    --license-target <commercial|open> \
    --limit 8
```

Registry confirmation currently covers **npm and crates only**; for other ecosystems (PyPI, Go
modules) rely on the GitHub signals alone. Only if the script returns nothing useful, fall back to a
focused web search (WebSearch / context7) — that's the degradation path, not the default.

### EVALUATE — judge the signals
The script returns candidates **star-ordered**, so re-rank them with `references/scoring-rubric.md`.
The ranking that matters: **license compatibility > maintenance recency > security > API fit > bus
factor > issue health > stars.** Stars are the weakest signal; drop disqualified candidates
(archived-as-a-dependency, license blocker, dead-and-vulnerable, a weaker fork of a healthier
upstream — the script flags these in `signal_notes`).

**In ADOPT mode, promote API/stack fit to first.** Borrow is already decided, so "best" means *best
for the call site you just read* — not most-starred in the abstract.

Any candidate with `license_class: unknown` needs a manual LICENSE check before you recommend it —
GitHub reports `NOASSERTION` for many real GPL/SSPL projects, which can mask viral copyleft.

---

## DECIDE mode — verdict and record

### VERDICT — one of four, with the one-line why
Decide and state it plainly (full criteria + decision tree in the rubric):

| Verdict | When | The cost you accept |
|---|---|---|
| **DEPEND** | Healthy, maintained, permissive, API fits — the default win | Pin the version; watch transitive weight |
| **FORK** | ~80% right but unmaintained / missing a piece; license permits | You now own maintenance + patching — contribute upstream if you can |
| **VENDOR-AND-AMEND** | You need a *slice*, not the whole package; license permits copying | You lose upstream updates; record provenance + SHA + license |
| **BUILD-FROM-SCRATCH** | Nothing fits, all options are incompatible/unmaintained/risky, or this is your differentiation | **Validate the negative**: state what you searched and why each option was rejected |

### RECORD — make it compound
Write the decision to all three (templates in `references/adr-template.md`):
1. A **repo ADR** (`docs/adr/` if the repo has one, else `.build-vs-borrow/adr/NNNN-<slug>.md`).
2. A one-line row in the **decisions registry** (`.build-vs-borrow/decisions.md`).
3. A **vault note** in your knowledge vault (via the `vault-companion` skill if you have it) — but only when there's a durable, non-obvious
   lesson (a routine "depended on a popular MIT lib, no surprises" lives fine in the ADR alone).

---

## ADOPT mode — pick and plan

### PICK — one winner, one runner-up, the why
Be opinionated (house style: no wishy-washy shortlist dumps). Name **one** recommended option with a
one-paragraph why (fit + health + license), and **one** runner-up in case the user knows something
you don't (a constraint, a past bad experience). If two are genuinely co-equal, say so and give the
tiebreaker. If nothing clears the bar, take the *nothing-good* path below.

### ADOPT-STYLE — depend / vendor-and-amend / fork
The same criteria as DECIDE's verdict table, minus BUILD (borrow is already chosen). Let the repo's
reality drive it: a small self-contained utility you want *in the tree* → vendor; a maintained
package that fits clean → depend; a stale-but-close project → fork. State the one you recommend and
why, in a line.

### PLAN — the deliverable (an artifact)
Produce a concrete **integration plan** as a markdown artifact (structure in
`references/integration-plan-template.md`). It must be specific to *this repo's call site*:

- **What & why** — the pick, the adopt-style, one-line rationale.
- **Install / vendor command** — the exact `npm install …` / `cargo add …` / `pip install …`, or for
  vendor: which files/dirs to copy, to where, and the provenance line to record.
- **Wire-up** — the specific files to create/touch, the adapter/wrapper shape matching the pattern
  you read in INTAKE, config/env needed.
- **Verification step** — the one runnable check that proves the integration works (a call through
  the real path, a test, a script). Never leave the borrow unverified.
- **Rollback** — how to back it out cleanly if it doesn't pan out.
- **Watch-outs** — license obligations (attribution, NOTICE file), transitive-dep weight, any
  Scorecard/CVE flags, and for a **PHI/payments** surface the `sr-security-auditor` routing below.

Present the plan; hand code-writing to the user or `sr-fullstack-engineer`.

### POINTER — record only if it's cheap
If the repo already has a `.build-vs-borrow/decisions.md` registry, append **one line**: what was
adopted, source URL, adopt-style, license. If there's no registry, record nothing — don't create
ceremony this mode's whole point is to avoid. No ADR, no vault note; those belong to DECIDE, where
a decision was actually weighed.

### Nothing good found — the honest fallback
If the search turns up nothing that clears the bar (all stale, all wrong-license, all wrong-shape,
or the space is genuinely empty), say so plainly and don't force a bad pick. Give the closest one
with its disqualifier — then **switch to DECIDE mode** and issue the formal verdict, which will
usually be BUILD-FROM-SCRATCH with the negative already validated by the search you just ran. A
truthful "nothing good exists" is a valid, valuable result, and this is the one path where ADOPT
hands back to DECIDE rather than forward.

---

## HANDOFF — security for sensitive surfaces

Always pull the lightweight signals (Scorecard, recency, CVEs). For a **PHI or payments** repo,
route any DEPEND / VENDOR / FORK survivor through the **`sr-security-auditor`** skill *before*
finalizing — a new dependency in a PHI surface is a new attack surface and a potential compliance
event. Don't recommend adoption into that surface unaudited. This applies in both modes.

## Authority — advisor, never a gate

You recommend and record; you never block. In an interactive session, present the verdict or plan
and let the user decide. Inside an autonomous loop, the verdict **informs** the build (and gets
logged) — it does not stop it. This matches the human-in-the-loop safety posture: the
irreversible/outward actions (adding a dependency, opening a PR) still belong to the existing loop's
gates.

## Loop checkpoint — cracked-dev / dev-loop

This skill is designed to be consulted as a **soft checkpoint** before substantial builds:

- **cracked-dev**: in the PLAN phase, when the chosen item is "build a mid-size+ commodity
  capability," run DECIDE before BUILD; when the item is "adopt an existing OSS component," run
  ADOPT and let the loop's BUILD phase implement the plan. Record the verdict in the item's ADR; the
  decision rides along in the same PR. It never blocks the loop — a BUILD verdict just proceeds.
  (cracked-dev's PLAN phase carries the reciprocal pointer.)
- **dev-loop / sr-fullstack-engineer**: before implementing a commodity capability from scratch, run
  the threshold test; if it clears, run this pipeline first. `sr-fullstack-engineer` hands over when
  a "clear-path" task turns out to be "add/wire in an existing library" — you pick and plan, it
  writes the code.

Because the verdict is always recorded to the registry, the *next* cycle starts from "already
decided" instead of re-searching — that's the recursion.

## Token discipline (this skill must save more than it costs)

- **Threshold-gate first** — never scout a trivial utility or differentiation code.
- **Reuse before searching** — check `.build-vs-borrow/decisions.md` and installed deps first.
- **Script over prose** — `oss_scout.py` fetches signals deterministically; the LLM only judges the
  shortlist. Cap candidates (`--limit`), and skip Scorecard (`--no-scorecard`) when you only need a
  quick read.
- **Read the call site once** (ADOPT) — the concrete plan comes from reading where it plugs in, not
  from re-searching. One good read beats three vague searches.
- **Record once, reuse forever** — a logged decision is never re-litigated.

## References

- `scripts/oss_scout.py` — the search engine: GitHub + registry + OpenSSF Scorecard + license
  classification → star-ordered JSON candidates. Signals only; it never decides — re-rank per the
  rubric.
- `references/scoring-rubric.md` — the threshold test, signal weights, license policy table,
  security tiering, the four verdicts, and the decision flow.
- `references/adr-template.md` — the repo ADR, decisions-registry, and vault-note templates (DECIDE).
- `references/integration-plan-template.md` — the structure of the integration-plan artifact (ADOPT).
