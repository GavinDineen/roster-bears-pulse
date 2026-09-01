---
name: spike
description: Run a throwaway experiment in an isolated git worktree so trunk is never at risk — for trying a risky refactor, a new library, or comparing approaches. Use when the user says "spike", "experiment", "prototype", or "try X without breaking anything".
disable-model-invocation: true
---

# /spike — safe, disposable experimentation

Innovate boldly without endangering the trunk. Every spike lives in its own git **worktree** (a separate working dir on a throwaway branch), so the main checkout is untouched and the experiment is trivially discardable.

The experiment goal comes from the user's args (e.g. `/spike try react-query for the dashboard`). If absent, ask.

## 1. Create an isolated worktree
```bash
DEF="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"; DEF="${DEF:-main}"
SLUG="$(echo '<short-desc>' | tr ' ' '-' | tr -cd 'a-z0-9-')"
git worktree add -b "spike/$SLUG" "../spike-$SLUG" "origin/$DEF"
cd "../spike-$SLUG"
```
All work happens here. Trunk and your main checkout never change.

## 2. Run the experiment
Build the smallest thing that answers the question. Install deps, prototype, measure. Note what you learned — that's the real output of a spike, more than the code.

## 3. Decide — promote or discard
- **Promote** (it worked): capture the lessons with `/retro`, then either open a clean PR from here via `/ship`, or re-implement the validated approach properly on a fresh feature branch (spikes are often throwaway-quality).
- **Discard** (it didn't): record the negative result with `/retro` (a known dead-end is valuable), then clean up:
```bash
cd -            # back to main checkout
git worktree remove "../spike-$SLUG" --force
git branch -D "spike/$SLUG" 2>/dev/null || true
```

## When the solution space is wide: parallel approaches
For a hard design choice, don't iterate one guess — explore several in parallel and pick the best:
- Spawn N independent attempts from different angles (e.g. minimal-change, performance-first, simplest-API), each in its own worktree or subagent.
- Judge them against explicit criteria (correctness, simplicity, perf, risk).
- Synthesize the winner, grafting the best ideas from the runners-up.
This beats one-attempt-iterated when you genuinely don't know the right shape yet.

## Rules
- A spike is for learning, not shipping. Validated ideas get re-implemented properly through `/ship`.
- Always `git worktree remove` when done — don't leave orphaned worktrees.
- Never run spikes against the trunk branch directly.
