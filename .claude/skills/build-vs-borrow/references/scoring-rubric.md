# Build-vs-Borrow Scoring Rubric

The evaluation framework the skill applies to each candidate the scout returns. Load this when you're past the search step and need to score candidates and reach a verdict. The script gathers signals; **this is how you read them.**

---

## The threshold test (run BEFORE searching)

The skill must not cost more than it saves. Before invoking the scout, sanity-check that borrowing can plausibly win:

> **Engage when** the thing you're about to build is a *mid-size component or larger* AND it's a **commodity** (many people have needed it) — e.g. a code-graph viewer, a rate limiter, an auth flow, a CSV/PDF pipeline, a CRM module, a diffing engine, a job queue, a charting layer.
>
> **Skip when** it's a trivial utility (a debounce, a date format, a one-off glue function), a **few-line** change, or something *intrinsic to your product's differentiation* — your secret sauce is never a dependency. Searching costs more than writing those.

If unsure, estimate: *would building this from scratch take more than ~an hour / ~150 lines?* If no, skip the scout and just build it.

---

## Signals and how to weigh them

Stars are the **weakest** signal — they measure popularity at some past moment, not present health or fitness for *your* repo. Weight in this order:

| Rank | Signal | What it tells you | Where it comes from |
|---|---|---|---|
| 1 | **License compatibility** | Can you legally use it at all? | `license_spdx` → `license_flag` |
| 2 | **Maintenance recency** | Is it alive? | `days_since_push`, `archived` |
| 3 | **Security / supply-chain** | Will it hurt you? | `scorecard`, known CVEs |
| 4 | **API / scope fit** | Does it solve *your* problem, or 10× more? | `description`, docs (judge) |
| 5 | **Bus factor / governance** | One-person project or a team/foundation? | owner, contributor count (judge) |
| 6 | **Issue health** | Backlog rotting? | `open_issues` (context-dependent) |
| 7 | **Popularity** | Weak corroboration only | `stars`, `downloads` |

**Hard disqualifiers** (drop the candidate regardless of stars):
- `archived: true` — for a *live dependency*. (Archived code can still be a fine *vendor-and-amend* source if license permits — note the distinction.)
- `license_flag: "blocker"` for the consuming repo's posture.
- Last push > ~2 years ago with open security issues.
- A `fork` when the upstream is healthier — prefer upstream.

---

## License policy

The scout classifies SPDX ids into four buckets and flags them against the **consuming repo's** posture (`--license-target`, default `commercial`).

| Bucket | Examples | `commercial` repo (default, e.g. a proprietary SaaS) | `open` repo |
|---|---|---|---|
| **permissive** | MIT, Apache-2.0, BSD, ISC, 0BSD, Unlicense | ✅ ok | ✅ ok |
| **weak-copyleft** | LGPL, MPL-2.0, EPL, CDDL | ⚠️ review (ok if used as a *separate dynamically-linked dependency*, not vendored/modified) | ✅ ok |
| **strong-copyleft** | GPL-2/3, AGPL-3, SSPL, EUPL | ⛔ blocker — viral; can force you to open-source your product | ⚠️ review |
| **unknown / none** | NOASSERTION, no LICENSE file, custom | ⚠️ review — *no license = all rights reserved; you may not copy it at all* | ⚠️ review |

**Default posture is `commercial`** because most proprietary projects can't absorb copyleft obligations, and healthcare/PHI repos carry extra constraints. Detect the repo's real stance each run:
1. Read the repo's own `LICENSE` / `package.json` `license` field.
2. If it's a proprietary/no-license private product (the common case here) → `commercial`.
3. Only pass `--license-target open` when the consuming repo is itself permissive/copyleft-licensed open source.

**AGPL is the trap.** A 40k-star AGPL library is *worse than useless* in a proprietary SaaS — adopting it can legally compel you to release your own source. Flag it loudly; never silently recommend it.

---

## Security tiering (matches the locked decision)

| Repo sensitivity | Vetting depth |
|---|---|
| **Any repo** | Always pull the lightweight signals: OpenSSF Scorecard, `archived`/recency, open-issue ratio, and a quick check for known CVEs (mention `npm audit` / `pip-audit` / `osv-scanner` as the install-time gate). |
| **PHI or payments repo** (a healthcare/EMR core; anything touching Stripe/health data) | **Before recommending adopt/vendor**, hand the candidate to the `sr-security-auditor` skill for a deep audit. Treat a new dependency in a PHI surface as a new attack surface — per CLAUDE.md, assume fields may be PHI. A borrowed dep that logs or transmits data is a compliance event waiting to happen. |

Pulling code in is a supply-chain decision, not just a coding one. The convenience of `npm install` hides transitive risk — note transitive dependency count when it's large.

---

## The verdict — four outcomes

Decide among these and state **which** plus the one-line why. This is the deliverable.

### 1. DEPEND — use it as a versioned dependency, unmodified
**When:** healthy, well-maintained, permissive license, API fits, active community, you won't need to fork its internals.
**This is the default win** — it's the cheapest path and you inherit upstream's future fixes.
**Watch:** pin the version; note transitive-dep weight; for PHI, audit first.

### 2. FORK — clone, maintain your own line, ideally contribute back
**When:** the project is ~80% right but unmaintained or missing something you need, license permits, and the delta is worth owning. Or you need guarantees upstream won't provide.
**Cost:** you now own maintenance + security patching of the fork. Only fork when the borrowed value clearly exceeds that ongoing cost. Prefer contributing the change upstream first.

### 3. VENDOR-AND-AMEND — copy specific code in and adapt it
**When:** you need a *piece* (an algorithm, a component, a parser), not the whole package; or the package is too heavy to depend on for the slice you need; license **permits copying** (permissive, or you comply with attribution/copyleft terms).
**Cost:** you lose upstream updates for that code; record provenance + license + commit SHA in the ADR so the borrow is auditable. **Never vendor strong-copyleft into a proprietary repo.**

### 4. BUILD-FROM-SCRATCH — write it yourself
**When:** nothing suitable exists, OR everything that exists is license-incompatible / unmaintained / wrong-shaped / a security risk, OR this *is* your differentiation and owning it is strategic, OR the genuine fit is so small that wiring up a dependency costs more than the code.
**Required:** *validate the negative* — briefly state what you searched (query, ecosystem, top candidates seen) and **why each was rejected**, so the decision is defensible and the next session doesn't re-search. "I looked, here's what's out there, here's why I'm still building it."

---

## Decision flow

```
threshold test ──no──> just build it (don't even scout)
      │ yes
      ▼
   run scout ──> any candidates? ──no──> validate-the-negative ──> BUILD
      │ yes
      ▼
  drop disqualified (archived-as-dep, license blocker, dead+vulnerable, weaker fork)
      │
      ▼
  any survivors fit the need? ──no──> BUILD (record why each was rejected)
      │ yes
      ▼
  need the whole thing & it's healthy & permissive? ──yes──> DEPEND
      │ no
      ▼
  need only a slice / package too heavy? ──yes──> VENDOR-AND-AMEND (license permitting)
      │ no
      ▼
  ~80% right but unmaintained / missing piece? ──yes──> FORK (contribute back if you can)
```

For PHI/payments repos, route any DEPEND/VENDOR/FORK survivor through `sr-security-auditor` **before** finalizing the verdict.

---

## Reuse the registry first

Before searching the open market, check the repo's **own** decisions registry (`.build-vs-borrow/decisions.md`) and existing dependencies — the cheapest borrow is one you (or a past session) already vetted, or a library already in `package.json` that covers the need. Don't re-search what's already decided.
