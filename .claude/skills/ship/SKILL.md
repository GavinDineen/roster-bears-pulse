---
name: ship
description: Run the full autonomous dev loop for a task — branch, implement, security/CodeRabbit review, tests, typecheck, lint, commit, PR, auto-merge, watch CI. Use when the user says "ship <task>" or wants a change taken end-to-end to a merged PR.
disable-model-invocation: true
---

# /ship — end-to-end dev loop

Codifies a repo's PR workflow so it runs identically every time. **Token-efficient rule: run the mechanical git/gh steps via the bash blocks below without narrating or re-deriving them — spend reasoning only on implementing the task and fixing real failures.**

The task to ship comes from the user's args (e.g. `/ship add password reset`). If absent, ask what to ship.

## 0. Detect repo conventions (run once, reuse below)
Don't hardcode the branch or toolchain — detect them:
```bash
# Default/integration branch (fallback to main):
DEF="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"; DEF="${DEF:-$(git remote show origin 2>/dev/null | sed -n 's/.*HEAD branch: //p')}"; DEF="${DEF:-main}"
# Package manager (by lockfile):
if [ -f bun.lockb ] || [ -f bun.lock ]; then PM=bun; X="bunx"; R="bun run";
elif [ -f pnpm-lock.yaml ]; then PM=pnpm; X="pnpm dlx"; R="pnpm";
elif [ -f yarn.lock ]; then PM=yarn; X="yarn dlx"; R="yarn";
else PM=npm; X="npx"; R="npm run"; fi
echo "default-branch=$DEF  package-manager=$PM"
```
Use `$DEF`, `$R` (run scripts), `$X` (run bin) in the steps below. If a project ships a `CLAUDE.md`, honor any branch/toolchain/gate specifics it states over these defaults.

## 1. Branch
```bash
git pull origin "$DEF"
git checkout -b "feat/$(echo '<short-desc>' | tr ' ' '-' | tr -cd 'a-z0-9-')"
```

## 2. Implement
Implement the task. Keep edits scoped. If it touches a DB migration or a new table, use `/create-migration` so RLS is never missed. If it touches a Supabase edge function, deploy via `/deploy-edge-function`.

## 3. Quality gates (in order — STOP on a gate that can't pass)
1. **Security** — if the diff touches Supabase/auth/payments/migrations, spawn the `supabase-security-reviewer` subagent on the pending diff; fix every Critical.
2. **CodeRabbit** — if available, run `/coderabbit:review uncommitted`; fix all Critical, re-run until zero remain. (Otherwise rely on the PR-level CodeRabbit check.)
3. **Tests** — `$R test` — must pass. Add/adjust a test for changed behavior.
4. **Typecheck** — `$X tsc --noEmit` — fix errors. (Skip if the repo has no TypeScript.)
5. **Lint (scoped)** — run `$X eslint` on the files you changed; fix lint you INTRODUCED. Don't try to clear a pre-existing backlog.

## 4. Commit, push, PR, auto-merge
Conventional prefix (`feat|fix|chore`). Then:
```bash
git add -A
git commit -m "<type>: <description>"
git push origin HEAD
gh pr create --fill --base "$DEF"
gh pr merge --auto --squash
```

## 5. Check state before looping
```bash
gh pr view --json state,number,statusCheckRollup
```
- **MERGED** → done. Report the PR link and stop. Do not loop.
- **OPEN** → monitor CI: `gh pr checks <number> --watch`.

## 6. On a failing check
Read the **full** error (`gh pr checks <number>` then the failing run's logs). Fix the **root cause** — never paper over it. Push the fix. Re-check state (step 5).
- If a build fails on a missing env var, **surface it** — do not hardcode.
- **Circuit breaker:** if the same check fails 3 times with the same error, STOP and surface to the human.

## Hard rules
- Never push/commit directly to a protected branch; never force-push shared branches (a hook enforces this in repos with a committed CLAUDE.md).
- Never open a PR with unresolved CodeRabbit Criticals.
- Never commit `.env`/secrets (a hook enforces this).
- DB schema changes via migration files only; Supabase edge functions via `supabase functions deploy`.
