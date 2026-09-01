# Output Templates

Three artifacts per run: the decision memo (which is also the run report),
one candidate note per shortlisted repo, and an update to the OSS Radar
index. Same memo content serves both the local copy and the vault copy.

## 1. Decision memo / run report

Filename: `YYYY-MM-DD <capability slug>.md` (vault) and
`docs/oss-scout/YYYY-MM-DD-<capability-slug>.md` (local project).

```markdown
---
tags: [oss-radar, run]
date: YYYY-MM-DD
intent: PRODUCT | LEARNING
project: <project name or none>
stack: <this run's stack>
verdict: ADOPT | FORK | MINE | BUILD
---

# OSS Scout — <capability statement>

## Verdict
**<VERDICT>: [[<winner note name>]]** — <one-line why>.
<⚑ counsel review: <reason>, if applicable>
<PHI path: route through sr-security-auditor before merge, if applicable>

## Shortlist
| # | Candidate | Score | License | Momentum | Maint. | Fit | Note |
|---|-----------|-------|---------|----------|--------|-----|------|
| 1 | [[name]] | 84 | MIT ·35 | 21 | 18 | 10 | <one-liner> |

## Deep-dive: <winner>
What it is, how it's built, and how it integrates or forks.
**Integration sketch (first 3 steps):**
1. …
2. …
3. …
**Risks:** <maintenance, coupling, license conditions, security surface>

## Runners-up
- [[name]] — <1–2 lines: why it lost>

## Excluded and why
- <name> — <gate reason: AGPL under PRODUCT / dead / no license / misfit>

## Pattern reference (⚑ counsel review before deriving)
<copyleft candidates worth studying, if any — omit section when empty>

## Provenance ledger
| Source | URL | Commit/version | License | Retrieved |
|--------|-----|----------------|---------|-----------|

## Search coverage
Sources hit: <GitHub, npm, …> · Queries run: <n> · Candidates gathered: <n>
Gaps: <any source that was unreachable this run>
```

## 2. Candidate note (create-or-update)

Filename: `<repo> (<owner>).md` in `Candidates/`. On **first sighting**,
create from this template. On **every later sighting**, do not duplicate:
update `last_seen`, `score`, `verdict_history`, and append one line to
Sightings. This is what turns repeated runs into accumulated intelligence.

```markdown
---
tags: [oss-radar, candidate]
repo: https://github.com/<owner>/<repo>
license: <SPDX>
score: <latest>
verdict_history: [<verdict@date>, …]
first_seen: YYYY-MM-DD
last_seen: YYYY-MM-DD
status: watching | adopted | forked | mined | passed
stack: [<tags>]
---

# <repo> (<owner>)

<2–3 sentences: what it is and why it's on the radar.>

**Strengths:** …
**Watch-outs:** <license conditions, bus factor, coupling>

## Sightings
- YYYY-MM-DD — scored <n> in [[<run note>]] (<verdict context>)
```

## 3. OSS Radar index (MOC)

Single file `OSS Radar.md` at the root of `<Resources>/OSS Radar/`. Create
once with the skeleton below; afterwards only append/update rows. Keep the
candidate table sorted by score, descending.

```markdown
---
tags: [oss-radar, moc]
---

# OSS Radar

Living map of scouted open-source candidates. Fed by the oss-scout skill.

## Top candidates
| Candidate | Score | License | Status | Last seen |
|-----------|-------|---------|--------|-----------|

## Run log
- YYYY-MM-DD — [[<run note>]] — <capability> → <verdict>
```

## Placement and linking rules

- Vault root: set via `$CLAUDE_VAULT_DIR` (skip this whole section if
  unset). Ensure this tree exists under the vault root, creating what's
  missing:
  ```
  <Resources>/OSS Radar/
  ├── OSS Radar.md
  ├── Runs/
  └── Candidates/
  ```
- Wikilinks are the product: run note ↔ candidate notes ↔ index, and run
  note → the active project's vault note when one exists. An unlinked note
  is invisible in the graph.
- Frontmatter keys above are Dataview-queryable on purpose — keep the key
  names stable across runs.
- **Vault unreachable** (no filesystem path to the Mac, e.g. claude.ai):
  save the local copy, emit each vault note as a fenced markdown block in
  the reply labeled with its intended path, and state explicitly that the
  vault write was skipped. Never silently drop persistence.
- **Local-only environments with no project either**: write everything to
  the working directory and say where.
