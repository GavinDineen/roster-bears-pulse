---
name: time-sense
description: >
  Recalibrates any duration estimate to the executor who will ACTUALLY do the
  work. Claude's defaults are human-dev estimates (person-days/weeks) that
  over-project 10-100x when an AI agent builds it — a "3-4 day" feature ships in
  30-60 min. Use WHENEVER you're about to state how long something takes — an
  ETA, timeline, ship date, or a plan/roadmap step carrying a duration — even if
  the user never said "estimate". Triggers: "how long will this take", "when
  will X be done", "give me a timeline", "estimate the build", "how many days",
  "ETA". Output is dual-track: agent wall-clock (primary) + human-equivalent
  scope (parens) + the real long pole (usually human review or CI, not the
  build). NOT for: scheduling/reminders/recurring runs ("every 5 min",
  "schedule a cloud agent" → schedule/loop skills); elapsed or clock reads ("how
  long has this been running", "what time is it") → the [HH:MM] stamps, not an
  estimate; the "effort: low|medium|high" reasoning param; or pure ordering /
  Now-Next-Later scope with no concrete duration → feature-roadmap-builder /
  product-strategy-consultant (which call this only for delivery-time figures).
---

# Time Sense

Make time estimates honest by aiming them at whoever actually executes the work. Default LLM estimates come from a training corpus of human software timelines, so they price everything in person-days and person-weeks. When an AI agent does the build, that frame is wrong by one to two orders of magnitude — and being wrong in *both* directions (a "3-day" task in 30 min; a "quick tweak" that's really a 2-hour verify slog) erodes trust in every plan you produce.

## The one rule

**Estimate for the executor who will actually do the work.** If that executor is an AI agent running autonomously, the honest unit is *wall-clock minutes and hours*, not person-days. State the reframe out loud so it's visible — don't silently emit a human number.

## How to answer any "how long"

1. **Name the executor.** AI agent autonomous? Agent + human review gates? A human doing it by hand? This choice sets the unit.
2. **Match the task shape** to a bracket in `references/anchors.md` (and `references/anchors.local.md` if it exists — your own calibrated history wins over the generic seed). Confirm an existing pattern covers the *specific variant* asked for — a nearby-but-different pattern (OAuth when the ask is magic-link) is a partial copy, not a copy; bracket up.
3. **Find the long pole.** What actually dominates the wall-clock? For agent work it is usually *not* writing code — it's verify cycles, human review, or CI. Name it.
4. **Emit the dual-track line** (below).

## Dual-track format

```
~40–60 min agent wall-clock  (≈3–4 engineer-days of scope)  ·  long pole: your PR review, not the build
```

- **Primary — agent wall-clock range.** The real answer to "when is it done."
- **Parens — human-equivalent scope.** Keep it. Person-days communicate *complexity and cost*, which is what people price and staff on. Dropping it loses the scope signal; the fix is to stop treating it as the *delivery* number, not to delete it. (Dual human-vs-AI framing borrowed from the retrospective OSS skill `agent-0x/ai-time-saved`; this is its prospective, planning-time complement.)
- **Tail — the top one or two long poles, dominant first.** The variable(s) that will actually decide when this lands. If two genuinely compete (e.g. your PR review *and* an external config/provisioning wait), name both and say which dominates.

Trim to one track when the other adds nothing: pure agent chores (no human in the loop) → wall-clock only; a scope/cost/prioritization discussion with no agent building yet → scope only (that's `feature-roadmap-builder` / `product-strategy-consultant` territory — this skill only supplies their delivery-time figures).

## Where agent wall-clock actually goes

Five drivers, in order of how much they swing the number — full model + worked examples in `references/anchors.md`:

1. **Bounded vs exploratory** — the biggest single swing.
2. **Sequential verify cycles** — every build / test / CI run is real wall-clock the agent waits through.
3. **Human-in-the-loop gates** — approvals and PR review are usually the *true* long pole. A "3-day feature" is often 40 min of agent work plus two days waiting on a human to look at it. Say that explicitly.
4. **Parallel fan-out** — sum the *critical path*, not the total.
5. **External waits** — CI queues, deploys, provisioning; incompressible, name them.

## Wall-clock hygiene

You already receive `[HH:MM TZ]` and today's date at the top of every turn. For "how long have we been at this," "can this land by EOD," or any deadline math, **compute from those stamps** — don't vibe a duration you're actually able to measure.

## Boundaries

The description owns when *not* to fire (scheduling, elapsed/clock reads, the `effort:` reasoning param, pure scope/ordering). Once loaded, one behavioral rule holds: **no false precision** — a range with its dominant variable named ("~30 min if tests exist, ~2 hrs if I write the harness") beats a confident point estimate every time.

## Reference

- `references/anchors.md` — seed anchor table (task shape → agent wall-clock → human-equivalent scope), the full variable model, and the shape of an optional `references/anchors.local.md` you grow from your own runs. Load it whenever you need a concrete bracket rather than a judgment call.
