# Anchors — agent wall-clock calibration

Load this when you need a concrete duration bracket instead of a judgment call. If `references/anchors.local.md` exists, it holds the user's own calibrated history — **prefer it over the seed table below**, and fall back to these seeds only for task shapes the local file doesn't cover.

These are seeds, not stopwatch science. They exist to drag the estimate out of the human person-week frame and into the right *order of magnitude*. Give a range, name the dominant variable, and let the local anchors sharpen it over time.

## Seed anchor table

Wall-clock assumes one AI agent working autonomously, patterns/tooling already present in the repo, and **no human review gate in the middle** (review is a separate long pole — see below). "Human-equiv scope" is what the same work would be quoted at for a human dev/team — a *scope and cost* signal, not a delivery time.

| Task shape | Agent wall-clock | Human-equiv scope |
|---|---|---|
| One-line / config / copy change, tests already green | 1–5 min | ~1 hr |
| Single-file bugfix with existing test coverage | 2–10 min | a few hrs |
| Small feature, established pattern to copy | 15–45 min | 1–2 days |
| Multi-file feature + new tests written | 30–90 min | 3–5 days |
| Cross-cutting refactor (many call sites, verify each) | 1–3 hrs | 1–2 weeks |
| Exploratory "find and fix why X happens" | 20 min – hours (unbounded) | unknown until scoped |
| New product surface / subsystem from scratch | 2–6 hrs of agent + review rounds | weeks |
| `/code-review ultra` (multi-agent cloud review) | ~15–20 min | — |
| Adversarial multi-lens skill review (4 lenses + synth) | ~10–25 min | — |

**Adjacent-row tiebreaker.** If a task fits two neighboring rows, take the higher bracket when new tests are written or more than 2 files change; otherwise the lower.

**Long poles — estimate and state these separately; they routinely dwarf the agent's own time. When two compete, name both and say which dominates (see the dual-track tail):**

| Long pole | Typical wall-clock | Note |
|---|---|---|
| Human PR review / approval gate | hours to days | Usually the real answer to "when does it ship." |
| CI pipeline run | queue + 3–20 min | Incompressible; multiply by the number of red-green pushes. |
| Deploy / provisioning / migration apply | minutes to hours | External wait; name it. |
| Waiting on a human decision / clarification | open-ended | The plan is blocked, not slow. |

## The variable model (why a shape lands where it does)

Adjust a bracket up or down by asking, in order of impact:

1. **Bounded or exploratory?** A specified change with a known target file stays at the low end. "Figure out the right approach" is open-ended — quote a range and flag it as scoping, not building.
2. **How many sequential verify cycles?** Each build/test/CI loop is real wall-clock. Fast unit tests → negligible. A 6-minute integration suite run three times → 18 min of pure waiting on top of the writing.
3. **Is there a human in the loop mid-task?** If yes, that gate is almost always the long pole. Separate it: `~40 min agent · then blocked on your review`.
4. **Can it fan out?** Independent subtasks across parallel agents collapse to the *critical path*, not the sum. A 5-file change done by 5 agents is ~1 file's time, plus a merge/verify pass.
5. **External waits?** CI queues, deploy windows, third-party provisioning. Incompressible — add them explicitly rather than folding them into the agent number.

## `anchors.local.md` — the shape (optional, user-grown, git-ignored)

Not created by default. When it exists, it overrides the seed table for matching task shapes. Keep it as a plain table of *your own* observed runs so estimates calibrate to this machine and these repos. Suggested columns:

```
| Task shape / label | Observed agent wall-clock | Notes (repo, date, what dominated) |
|---|---|---|
| supabase migration + RLS + tests | 35–50 min | verify loop dominates; 2 red-green rounds |
| new skill (SKILL.md + refs + review) | 30–45 min | long pole = multi-lens review, not writing |
```

Held back from sync/publish by the sync's `--exclude` on the `.local.md` suffix (CI rejects any committed `*.local.md`), per the house convention — so personal timing data never leaves the machine while the skill stays portable.

**Future — live anchors (planned follow-up).** A `scripts/anchors.sh` will summarize real durations already on disk at `~/.claude/jobs/*/state.json` (`intent` label, `createdAt` → `firstTerminalAt`) and `timeline.jsonl` (per-phase deltas) into this same table shape on demand. It runs only when an estimate is being made, so it adds zero per-run cost, and the data already exists — no new tracking. Until then, the seed table plus a hand-grown `anchors.local.md` do the job.
