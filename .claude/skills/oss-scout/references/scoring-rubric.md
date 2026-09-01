# Scoring Rubric

Gate first, then score out of 100, then map to a verdict. The rubric exists
so that two runs a month apart on the same capability produce comparable
numbers — score against the anchors below, not against vibes.

## The gate (binary, pre-score)

| Condition | Effect |
|---|---|
| License unidentifiable after reading the repo | Ineligible for ADOPT/FORK; "reference-only" section of memo |
| Intent = `PRODUCT` and license is GPL / AGPL / SSPL / BUSL / Commons Clause | Blocked from ADOPT/FORK; listed only under "Pattern reference — ⚑ counsel review before deriving" |
| Archived, or no commits in 18+ months with unresponsive issues | **ADOPT blocked.** Momentum and maintenance score in their bottom bands; license and stack fit score normally. FORK-rescue remains available (see verdict logic). Run the fork-network check — an active fork may be the real candidate and gets scored on its own merits |

Copyleft nuance under `PRODUCT`: LGPL and MPL-2.0 are *conditional*, not
blocked — LGPL permits dynamic linking, MPL's copyleft is file-scoped. Score
them at the conditional tier and flag ⚑ counsel review in the memo.
Under `LEARNING`, nothing is blocked; copyleft candidates score their tier
and carry a visible license flag so a later promotion to product use doesn't
happen silently.

## License fit — 35 points

| Tier | Licenses | Points |
|---|---|---|
| Clean permissive | MIT, Apache-2.0, BSD-2/3, ISC, Unlicense, CC0 | 32–35 |
| Conditional | MPL-2.0, LGPL | 20–24 |
| Copyleft (LEARNING only) | GPL-2.0/3.0 | 8–12 |
| Restrictive / source-available | AGPL, SSPL, BUSL, Commons Clause, custom AI-model licenses with use restrictions | 0–5 |
| Unknown | No license found | 0 |

Within the clean tier, give Apache-2.0 the top of the band when the domain
has patent exposure (ML, crypto, codecs) — its explicit patent grant is
worth real money there; MIT/BSD carry no such grant.

Mirror labels (`non-standard`, `unknown`) are not tiers — read the LICENSE
file before scoring. The PostgreSQL License, for example, is OSI-approved
permissive and belongs in the clean tier despite how mirrors label it.

## Community & momentum — 25 points

Anchor on velocity and trend, not absolute counts:

- 22–25: exceptional velocity (top-of-ecosystem star growth for its age,
  strong download trend, visible adoption by known projects)
- 15–21: healthy — steady growth, active discussions, real dependents
- 8–14: modest but alive — small community, some traction
- 0–7: stagnant or single-user

## Maintenance & activity — 22 points

- 19–22: commits within weeks, regular releases, issues get maintainer
  responses in days, 3+ meaningful contributors (bus factor)
- 12–18: commits within ~6 months, releases exist, issues eventually
  answered, 1–2 core maintainers
- 5–11: commits within 18 months, sparse releases, slow or no issue
  response
- 0–4: effectively unmaintained (interacts with the gate cap)

## Stack fit — 18 points

Scored against **this run's stack** from Phase 0:

- 15–18: native match (language + framework), typed API or types shipped,
  good docs, drop-in integration surface
- 9–14: same language, adjacent framework, or thin adapter needed
- 4–8: different stack but clean boundary (CLI, HTTP API, sidecar)
- 0–3: would require a rewrite to use — which usually means the real
  verdict is MINE

## Bands and verdict logic

| Total | Reading |
|---|---|
| 80–100 | Strong candidate — ADOPT/FORK territory |
| 60–79 | Viable — deep-dive decides |
| 40–59 | Pattern value only — MINE territory |
| <40 | Skip; list under excluded |

Verdict selection, applied to the deep-dived leader:

- **ADOPT** when score ≥75, license clean, and the integration sketch is
  ≤ a day of work. Prefer ADOPT over FORK when upstream is healthy — a fork
  you maintain is a liability you chose.
- **FORK** when score ≥65 with a clean license and meaningful customization
  is unavoidable — or via **fork-rescue**: the project is dead or archived
  but the license is clean, the deep-dive confirms the code is good, and
  the scope is small enough to own outright. Fork-rescue is exempt from the
  ≥65 threshold, because the dead-repo gate suppresses the score by design
  — the gate exists to block ADOPT, not rescue. In exchange, the memo must
  show the deep-dive evidence (code read, tests present, license file
  verified). Record the divergence intent in the memo either way.
- **MINE** when the leaders are copyleft-blocked, when stack fit is the
  weak axis, or when only the architecture is needed. For `PRODUCT` intent,
  mining a copyleft repo means studying the *approach* — flag ⚑ counsel
  review before any close derivation.
- **BUILD** when no survivor clears 50, or the capability is a deliberate
  core differentiator. The memo names the closest loser and the specific
  reason it loses. This keeps BUILD honest.

Tie-breakers, in order: license tier → maintenance → smaller integration
surface. When two candidates stay within 5 points after tie-breakers, say
so in the memo and state the deciding judgment call explicitly.
