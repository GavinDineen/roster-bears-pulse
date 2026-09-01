# The state file: `.cracked-dev/state.md`

This is cracked-dev's working memory — the engine behind "learns along the way." It lives at
`.cracked-dev/state.md` in the target repo and is **committed** (it travels across machines and
sessions, and is visible in PRs).

## Read-first / write-last protocol

- **Read first:** at Step 0 of every invocation, read this file before triaging. It tells you
  the ranked backlog, what's already done, and what you've ruled out. Never re-propose a
  ruled-out item; never redo a done item.
- **Write last:** at the LOG step of every cycle, append/update the file **on the current
  item's branch**, so the log entry rides along in that item's PR.
- **Accumulation model:** as PRs merge, entries accumulate on the default branch (`<default>`).
  A fresh session reading `<default>` sees everything that has merged.
  - *Tradeoff:* learnings on open (unmerged) branches aren't on `<default>` yet. Within a
    session you still see your own branches; across sessions, check open PRs (`gh pr list`)
    before assuming an item is untouched.
- **In full-auto:** the SCOUT subagent performs the read-first and the BUILDER subagent performs
  the write-last on its item branch (see *Execution model* in `SKILL.md`). The orchestrator
  itself neither reads nor writes this file — keeping its context flat is the whole point.

## First-run creation

If the file doesn't exist, create `.cracked-dev/` and write the template below. Then commit it
as part of the first item's branch (or, if running `plan` mode with no build, leave it staged
and mention it).

## Template

```markdown
# Cracked Dev — State Log

_Working memory for /cracked-dev. Read first, write last. Committed to the repo._

## Repo conventions (learned)
- Type-check: <command>
- Lint: <command>
- Tests: <command>
- Build: <command>
- Commit style: <e.g. conventional commits>
- PR / merge: <e.g. gh pr create --fill --base <default>; CodeRabbit gate; auto-merge>
- Other house rules: <from CLAUDE.md / CONTRIBUTING>

## Backlog (ranked)
| # | Item | Score | Lenses (U/F/I/R) | Notes |
|---|------|-------|------------------|-------|
| 1 | <item> | <0-50> | <e.g. 5/3/4/2> | <why> |

## In-progress
- <item> — branch `cracked-dev/<slug>` — PR <url> — status: <open/held-for-review/CI> — risk: <SAFE/RISKY>

## Done log
- YYYY-MM-DD — <item> — branch `cracked-dev/<slug>` — PR <url> — <merged/auto-merged/held> — <one-line result>

## Ruled out / won't do
- <item> — reason: <why this is not worth doing; don't re-propose>

## Next candidates
- <item> — <why it might matter next cycle>
```

## Entry conventions

- **Use absolute dates** (`2026-06-23`), never "today" / "yesterday".
- Keep entries terse but specific — enough that a cold session understands the state.
- When you rule something out, say *why*, so a future cycle doesn't reconsider it.
- Update **In-progress** when you hold a RISKY PR for review; move it to **Done log** once it
  merges (note "held" if a human merged it after review).
- Keep the **Backlog** ranked and pruned — delete items that are done or ruled out.
