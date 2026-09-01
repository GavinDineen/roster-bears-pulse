# Output Templates — ADR, Registry, Vault Note

The build-vs-borrow verdict is recorded in three places so the decision compounds: a per-decision **ADR** in the repo, a one-line entry in the repo's **decisions registry**, and a **vault note** in the user's PARA vault. Load this when writing the output.

Keep all three terse. The goal is a future session (or a teammate) finding "we already decided this, here's why" in seconds — not prose.

---

## 1. Repo ADR

**Where:** prefer the repo's existing ADR convention if one exists (`docs/adr/`, `docs/decisions/`, `architecture/decisions/`). Otherwise create `.build-vs-borrow/adr/NNNN-<slug>.md`. Number sequentially.

**Filename:** `0007-charting-library.md`

```markdown
# ADR 0007 — <thing you were about to build>

- **Date:** <YYYY-MM-DD>
- **Status:** Decided
- **Verdict:** DEPEND | FORK | VENDOR-AND-AMEND | BUILD-FROM-SCRATCH
- **Repo license posture:** commercial | open
- **Decided by:** build-vs-borrow (advisor) — confirmed by <human/Claude>

## Need
<One or two sentences: what capability, why, the rough size/complexity that cleared the threshold test.>

## Options considered
| Candidate | Stars | Last push | License | Scorecard | Verdict signal |
|---|---|---|---|---|---|
| owner/repo-a | 4.2k | 12d | MIT | 8.1 | strong fit → chosen |
| owner/repo-b | 9.8k | 18mo | AGPL-3.0 | — | ⛔ license blocker |
| owner/repo-c | 600 | 40d | MIT | 4.0 | thin community, low scorecard |

## Decision
<The chosen path in one paragraph. If DEPEND: package + pinned version. If FORK: fork URL + the delta you own + upstream-contribution plan. If VENDOR: exact files/commit SHA copied + license-compliance note. If BUILD: the validate-the-negative — what you searched and why every option was rejected.>

## Security
<For PHI/payments: sr-security-auditor result + date. Otherwise: scorecard/CVE note and the install-time audit gate used.>

## Consequences / revisit triggers
<Maintenance burden taken on, transitive-dep weight, lock-in, and what would make us revisit (e.g. "if upstream archives", "if we need feature X they don't support").>
```

---

## 2. Decisions registry (the compounding index)

**Where:** `.build-vs-borrow/decisions.md` at repo root. One row per decision. This is the first thing the skill reads on a new run — so it reuses prior vetting instead of re-searching. Mirrors how `cracked-dev` externalizes memory to `.cracked-dev/state.md`.

```markdown
# Build-vs-Borrow Decisions — <repo name>

| Date | Need | Verdict | Choice | License | ADR |
|---|---|---|---|---|---|
| 2026-06-27 | charting layer | DEPEND | recharts@2.x | MIT | adr/0007 |
| 2026-06-20 | code-graph viewer | VENDOR | borrowed layout algo from owner/repo (MIT, sha abc123) | MIT | adr/0006 |
| 2026-06-14 | CRM core | BUILD | nothing fit — see ADR | — | adr/0005 |
```

*The Verdict column uses short tokens for terseness: `DEPEND` · `FORK` · `VENDOR` (= VENDOR-AND-AMEND) · `BUILD` (= BUILD-FROM-SCRATCH). Keep them consistent so the index stays greppable.*

When the registry already answers the current need, cite the row and stop — don't re-run the scout.

---

## 3. Vault note (cross-project second brain)

**Where:** your notes vault, if you keep one (skip this section otherwise). If you use the `vault-companion` skill, let it enforce the vault's capture guardrails and `[[wikilinks]]` conventions rather than writing the vault directly. Attach it to the relevant `Projects/<name>` note and link the decision.

The vault note is the *portable, cross-repo* memory; the repo ADR is the *local, with-the-code* memory. They're complementary — a verdict made in one repo ("recharts is our charting standard, MIT, vetted") informs the next project.

Suggested capture (if you use vault-companion, let it format the note to the vault's template):
- **What:** the need + the verdict (DEPEND/FORK/VENDOR/BUILD) + the chosen option.
- **Why it's durable:** the non-obvious reason — e.g. "rejected the 9k-star option because AGPL is incompatible with our proprietary EMR", or "built our own because every OSS option logged PHI client-side".
- **Surface:** `code`. **Links:** the repo, the ADR, and any sibling decision.

Only capture if there's a durable, non-obvious lesson — a routine "depended on a popular MIT lib, no surprises" decision lives fine in the repo ADR alone and doesn't need to clutter the vault.
