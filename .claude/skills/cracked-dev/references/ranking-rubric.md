# Ranking rubric & risk classification

This file backs the **RANK** step and the **hybrid merge policy** in `SKILL.md`.

## Part 1 — Leverage scoring (the 4 lenses)

Score every triage candidate on each lens from **0–5**, then compute a weighted total. Higher
total = build it sooner. The weights bias toward unblocking work and fixing what's broken,
because those compound.

| Lens | What it measures | 0 | 5 | Weight |
|------|------------------|---|---|--------|
| **Unblocks / critical path** | How much *other* work this enables or unblocks | Blocks nothing | Unblocks many tasks / on the critical path | ×3 |
| **Fixes broken** | Severity of what's currently broken | Nothing broken | Build red, tests failing, or active security hole | ×3 |
| **Impact ÷ effort** | User/revenue/correctness value relative to cost to ship | High effort, low value | High value, low effort (quick win) | ×2 |
| **Risk / debt reduction** | How much future-biting risk or tech debt it removes | None | Removes a landmine that will hurt soon | ×2 |

**Weighted score** = `3·unblocks + 3·fixesBroken + 2·impactPerEffort + 2·riskDebt`
(max 50). Rank candidates by this score.

### Tie-breakers (in order)
1. **Smaller, more reversible change wins** — ship the safe quick win first.
2. **Fixes-broken beats new value** — a red build or failing test outranks a feature.
3. **Unblocks-others beats self-contained** — clear the path for future cycles.
4. **Lower blast radius wins** — fewer modules touched, fewer surprises.

### Recording it
In `plan` mode, present a short ranked table (item, the four sub-scores, total, one-line
rationale). In full-auto mode, you may keep scoring terse, but record the chosen item and its
score in the Backlog/Done sections of `.cracked-dev/state.md`.

## Part 2 — Risk classification (drives the merge gate)

After gates are green, classify the change. **If any RISKY trigger is present, treat the whole
change as RISKY** — hold the PR open for human review. Otherwise it's SAFE → auto-merge.

### SAFE (auto-merge `--auto --squash` when all gates green)
- Small, focused diff in application code.
- Tests added/updated and passing; type-check, lint, and build green.
- No items from the RISKY list below.
- Examples: bug fix with a regression test, a missing-test backfill, a localized refactor, a
  copy/UI tweak, a dependency patch bump with no breaking notes.

### RISKY (hold open, flag for review, log, move on)
- **Migrations / schema** — any DB migration or change to schema/data contracts.
- **Infra / IaC** — CI/CD config, Dockerfiles, deploy config, Terraform/infra, env wiring.
- **Auth / authz** — login, sessions, permissions, RLS policies, token handling.
- **Secrets / keys** — anything touching credentials, key management, or `.env` surfaces.
- **Public API / contract** — changes to a public endpoint, exported interface, or response
  shape other code or clients depend on.
- **Dependency risk** — major/minor bumps with breaking potential, or new dependencies.
- **Large / multi-module** — sweeping diffs, broad refactors, or anything touching many areas
  at once.
- **Anything you're unsure about** — when in doubt, classify RISKY.

When holding a RISKY PR, leave a clear note in the PR describing the risk and what to verify,
apply a review label if the repo uses one, and record it under In-progress / Next in the state
file so a later run doesn't redo it.
