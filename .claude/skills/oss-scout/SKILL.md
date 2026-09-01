---
name: oss-scout
description: >-
  Hunts GitHub, package registries (npm/PyPI), Claude skill/plugin/MCP
  directories, and Hugging Face for the best existing open-source base
  before anything gets built from scratch — then gates by license
  (commercial-safe first), scores candidates on momentum, maintenance, and
  stack fit, and delivers a ranked shortlist with an ADOPT / FORK / MINE /
  BUILD decision memo. Persists findings locally, and optionally into a
  notes vault if you keep one (run report + candidate notes + radar index). Use this
  skill whenever the user is about to build a new feature, product, component,
  tool, script, contract, or skill; asks to find a library, package, repo,
  boilerplate, starter, template, plugin, skill, or MCP server; asks "has
  someone already built this", "what's the best OSS for X", or "build vs
  adopt"; wants to avoid reinventing the wheel; or wants to discover trending
  or high-value open-source projects worth tracking. Trigger even without
  the words "open source" — any non-trivial greenfield build intent
  qualifies.
---

# OSS Scout

The default assumption: someone has already built 80% of what you're about to
build. This skill's job is to prove or disprove that in minutes — before a
single line of greenfield code gets written. A BUILD verdict is allowed, but
it must be *earned* by showing the shortlist and explaining why nothing on it
wins.

One run produces exactly one deliverable: a **ranked shortlist + decision
memo**, persisted locally and to the vault. No automation or scheduling lives
in this skill — routines that wrap it handle cadence.

## The five phases

Run these in order. A full run should take roughly 5–10 minutes of agent
time. If the user explicitly asks for a "quick scan," stop after Phase 2 and
deliver the shortlist table only.

### Phase 0 — Frame the hunt (~30 seconds)

Before searching, write down three things. They control everything
downstream:

1. **Capability statement** — one sentence: "I need `<capability>` that does
   `<core behavior>` for `<context>`." Derive it from the conversation; if
   the request is too vague to write this sentence, ask one clarifying
   question and no more.
2. **Intent class** — `PRODUCT` or `LEARNING`.
   - `PRODUCT`: the resulting code ships in or touches a commercial product
     (a monetized app, client work, or anything PHI-adjacent). This
     activates the copyleft block in Phase 2.
   - `LEARNING`: pattern-mining, inspiration, internal tooling, personal
     experiments. Copyleft candidates are allowed but flagged.
   - Infer from context; when genuinely ambiguous, default to `PRODUCT` —
     the stricter gate — and say so in the memo.
3. **Stack context** — inspect the active project (package.json,
   pyproject.toml, foundry.toml, go.mod, etc.) to determine the real stack
   for this run. Default when no project is active: TypeScript / React /
   Supabase / Postgres. Chain work implies Solidity/Foundry on Base; ML work
   implies Python. Stack fit in Phase 2 is scored against *this run's*
   stack, not a fixed one.

### Phase 1 — Hunt

Search the sources relevant to the capability. GitHub is always in scope;
add the others when they fit:

| Source | When to include |
|---|---|
| GitHub repos, code, topics | Always |
| Curated awesome-lists for the domain | Always — humans pre-filtered these; mine them first |
| npm / PyPI registries | Capability is a library/package in JS/TS or Python |
| Claude skills, plugins, MCP servers | Capability is agent tooling, workflow, or integration |
| Hugging Face models/datasets/spaces | Capability involves ML models or training data |

Read `references/source-playbooks.md` for the exact search commands, the
connectivity fallback chain (GitHub MCP → `gh` CLI → unauthenticated REST →
deps.dev metadata API → web search), and query-crafting guidance. Collect **8–15 raw candidates**
across sources. Cast wide here; the gate and rubric do the narrowing.

### Phase 2 — Gate, then score

Read `references/scoring-rubric.md` before scoring — it contains the license
compatibility matrix, the point allocations, and the verdict logic. In
summary:

**Gate first (binary, before any points):**
- License unidentifiable → cannot be ADOPTed or FORKed; park in
  "reference-only."
- Intent is `PRODUCT` and license is copyleft (GPL, AGPL, SSPL, BUSL,
  Commons Clause) → blocked from ADOPT/FORK; may appear only in a separate
  "pattern reference — counsel review before deriving" section of the memo.
- Repo archived or dead (no commits 18+ months and unresponsive issues) →
  score capped; check the fork network, because an active fork is often the
  real candidate.

**Then score survivors out of 100:**

| Criterion | Weight | What it measures |
|---|---|---|
| License fit | 35 | Commercial safety and derivation freedom |
| Community & momentum | 25 | Star velocity, download trend, ecosystem adoption, recency of buzz |
| Maintenance & activity | 22 | Commit recency, release cadence, issue responsiveness, bus factor |
| Stack fit | 18 | Match to this run's stack, integration surface, types, docs |

Verify the license by reading the actual LICENSE file in the repo, not just
the API metadata field — the API field is null or wrong often enough to
matter, and monorepos can carry per-package licenses that differ from the
repo license.

### Phase 3 — Deep-dive the top 1–2

The memo's credibility comes from having actually read the winner. For the
top one or two candidates:

- Pack the repo for reading with Repomix (`npx repomix --remote owner/repo
  --compress`) or a shallow clone (`git clone --depth 1`); for a lighter
  pass, fetch the README plus the 3–5 files that implement the core
  capability.
- Confirm: the repo's live status first (archived/read-only banners never
  surface in metadata mirrors — read the actual repo page), then the
  LICENSE file, the architecture (how would this integrate or be forked?),
  test coverage signal, and the pulse of recent issues/PRs (are maintainers
  responsive? are there landmines?).
- Optionally enrich with OpenSSF Scorecard
  (`curl -s https://api.scorecard.dev/projects/github.com/{owner}/{repo}`)
  — treat it as a hygiene signal, not proof of code quality; the research
  literature shows high scores don't reliably predict fewer
  vulnerabilities.

### Phase 4 — Write the decision memo

One verdict, argued. The four verdicts:

- **ADOPT** — use as a dependency, as-is. Typically: score ≥75, clean
  license, low integration effort.
- **FORK** — clone and customize; the base is right but needs meaningful
  changes, or the project is dead but the code is good and a fork rescues
  it. Requires a clean license.
- **MINE** — borrow the architecture and patterns, write the code fresh.
  The right verdict when the best candidates are copyleft-blocked, when fit
  is poor but the *approach* is proven, or when only the design is needed.
- **BUILD** — nothing suitable exists. Must be justified against the
  shortlist: name the closest candidate and state specifically why it
  loses. "Core differentiator worth owning" is a valid reason; "didn't
  look hard enough" is not.

Verdicts compose when the capability decomposes. When no single candidate
covers the whole capability, the memo may pair verdicts per component —
e.g., FORK the write-trail base and ADOPT a read-logging extension beside
it. Headline the primary verdict and make each component's verdict
explicit; a forced single winner that covers half the capability is a worse
memo than an honest composition.

Use the memo template in `references/output-templates.md`. Every memo
includes a **provenance ledger** (URL + commit SHA + license + retrieval
date for anything that may be adopted, forked, or mined) — this is what
makes attribution and compliance traceable later.

### Phase 5 — Persist (never skip)

Findings that aren't saved are findings that get re-researched in three
weeks. Two destinations, both from `references/output-templates.md`:

1. **Local**: save the memo to `docs/oss-scout/YYYY-MM-DD-<slug>.md` inside
   the active project (create the directory if needed). No active project →
   current working directory.
2. **Notes vault** (optional — only if you keep one): set its root via
   `$CLAUDE_VAULT_DIR` (skip this step entirely if unset) and maintain three
   linked layers under `<vault>/OSS Radar/`:
   - the **run report** (the memo) in `Runs/`,
   - a **candidate note** per shortlisted repo in `Candidates/` — create
     on first sighting, *update* on later sightings (bump `last_seen`,
     `score`, append a sighting line) so recurring candidates accumulate
     history instead of duplicating,
   - the **radar index** at the folder root, appended with this
     run and any new candidates.
   Cross-link all three to each other and to the active project's note when
   one exists.

If the vault is unreachable (e.g., running in claude.ai without filesystem
access to the Mac), save locally, emit the vault notes as fenced markdown
blocks in the reply so they can be pasted in, and say plainly that the vault
write was skipped.

## Guardrails

- **Counsel flag**: any copyleft-derived work heading toward a product, and
  any ADOPT/FORK whose license carries conditions beyond attribution, gets
  an explicit `⚑ legal review` line in the memo — get legal sign-off before
  shipping derived or public work.
- **PHI-adjacent code**: anything ADOPTed or FORKed into a PHI-touching or
  payments path routes through the `sr-security-auditor` skill
  before merge. Say so in the memo's integration sketch.
- **No fabricated candidates**: every repo, package, or model named in the
  memo must have been actually retrieved during the run. If a source
  couldn't be reached, name the gap rather than filling it from memory.
- **Momentum ≠ quality**: trending is a discovery signal and a scoring
  input, not a verdict by itself. A 3-week-old repo with 4k stars still
  needs the license check and the deep-dive.

## Plays well with

`product-idea-generator` and `feature-roadmap-builder` upstream (they decide
*what* to build; oss-scout decides *whether to build it at all*);
`cracked-dev` downstream (the memo's integration sketch converts directly
into its first tickets); `vault-companion` (if you have it) for vault conventions;
`Context7` for pulling a chosen library's docs after an ADOPT verdict.
