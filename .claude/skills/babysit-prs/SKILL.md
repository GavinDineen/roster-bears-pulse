---
name: babysit-prs
description: One poll of open PRs' CI state, with a crisp report and the next action. Designed to be driven by /loop (e.g. "/loop 10m /babysit-prs") to watch PRs over time. Reports merges, surfaces failing checks with the root-cause fix, and notes what's still pending.
disable-model-invocation: true
---

# /babysit-prs — one CI poll, then report

Built to run repeatedly under `/loop`. Each invocation does **one** cheap poll and reports — `/loop` handles the cadence and sleeping, so keep each run tight and low-token.

## Do exactly this

1. List open PRs authored by the user:
   ```bash
   gh pr list --author "@me" --state open --json number,title,headRefName,statusCheckRollup
   ```
   If none, report "No open PRs — nothing to babysit" and stop (let the loop sleep).

2. For each PR, classify its checks:
   - **All green** → if it has auto-merge enabled it'll merge itself; report "✅ #N green, auto-merging". If not, suggest `gh pr merge <N> --auto --squash`.
   - **Pending / in-flight** → report "⏳ #N: <checks still running>". Take no action — let the loop poll again later.
   - **Failing (settled)** → report "❌ #N: <failing check names>". Then read the failure: `gh pr checks <N>` and the failing run's logs. Diagnose the **root cause** and state the precise fix.

3. For a settled failure, if the user is present/this is an active session, offer to apply the fix via the `/ship` step-6 flow (fix root cause → push → re-check). If a Vercel build failed on a missing env var, surface it — never hardcode.

4. **Circuit breaker:** if the same check on the same PR has failed across 3 consecutive polls with the same error, stop acting and surface to the human — do not keep retrying.

## Keep it cheap
- One `gh pr list` call per poll; only fetch logs for PRs that are actually failing.
- Don't re-read files or re-explain context that hasn't changed between polls — just the delta.
- This skill reports and recommends; it does not silently push unattended. Pushing a fix is an explicit action taken with you in the loop.
