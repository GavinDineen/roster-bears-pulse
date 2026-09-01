# Eval Loop Reference

Full mechanics of the proven test → grade → benchmark → optimize loop. Load when running rigorous evals in Claude Code or Cowork. In claude.ai, most of this is skipped (no subagents) — run tests yourself one at a time and gather qualitative feedback inline.

---

## Workspace Layout

Put results in `<skill-name>-workspace/` as a sibling to the skill directory. Organize by iteration, then by test case. Create directories as you go — don't scaffold everything upfront.

```
<skill-name>-workspace/
├── skill-snapshot/          # (IMPROVE mode only) baseline copy before edits
├── iteration-1/
│   ├── eval-<descriptive-name>/
│   │   ├── with_skill/outputs/
│   │   ├── without_skill/outputs/   # CREATE mode baseline
│   │   │   (or old_skill/outputs/   # IMPROVE mode baseline)
│   │   ├── eval_metadata.json
│   │   ├── timing.json
│   │   └── grading.json
│   ├── benchmark.json
│   └── benchmark.md
└── iteration-2/ ...
```

---

## Step 1: Spawn All Runs in the Same Turn

For each test case, spawn two subagents in the same turn — one with the skill, one baseline. Don't spawn with-skill runs first and circle back for baselines; launch everything at once so it finishes together.

**With-skill run prompt:**
```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<id>/with_skill/outputs/
- Outputs to save: <what the user cares about>
```

**Baseline run:**
- CREATE mode: no skill at all. Same prompt, no skill path. Save to `without_skill/outputs/`.
- IMPROVE mode: point at the snapshot. Save to `old_skill/outputs/`.

Write `eval_metadata.json` per case (assertions can start empty):
```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

---

## Step 2: Draft Assertions While Runs Are In Progress

Don't idle. Draft objectively-verifiable assertions with descriptive names that read clearly in the viewer. For subjective skills (writing, design), skip assertions — those need human judgment. Update `eval_metadata.json` once drafted.

---

## Step 3: Capture Timing As Runs Complete

Each subagent completion notification contains `total_tokens` and `duration_ms`. This is the ONLY place this data appears — save it immediately to `timing.json` in the run directory:
```json
{ "total_tokens": 84852, "duration_ms": 23332, "total_duration_seconds": 23.3 }
```
Process each notification as it arrives; don't try to batch.

---

## Step 4: Grade, Aggregate, Launch Viewer

1. **Grade** — evaluate each assertion against outputs. Save to `grading.json` per run. The expectations array must use fields `text`, `passed`, `evidence` (exact names — the viewer depends on them). For programmatically checkable assertions, write and run a script rather than eyeballing.

2. **Aggregate:**
   ```bash
   python -m scripts.aggregate_benchmark <workspace>/iteration-N --skill-name <name>
   ```
   Produces `benchmark.json` / `benchmark.md` with pass_rate, time, tokens (mean ± stddev + delta). Put each with_skill version before its baseline.

3. **Analyst pass** — read the data for patterns the aggregate hides: non-discriminating assertions (always pass regardless of skill), high-variance evals (possibly flaky), time/token tradeoffs.

4. **Launch viewer:**
   ```bash
   nohup python <skill-creator-path>/eval-viewer/generate_review.py \
     <workspace>/iteration-N \
     --skill-name "my-skill" \
     --benchmark <workspace>/iteration-N/benchmark.json \
     > /dev/null 2>&1 &
   ```
   Iteration 2+: also pass `--previous-workspace <workspace>/iteration-<N-1>`.
   Cowork/headless: use `--static <output_path>` to write standalone HTML instead of starting a server.

Use `generate_review.py` — don't write custom HTML.

---

## Step 5: Read Feedback, Improve

Read `feedback.json`. Empty feedback = the user was fine with it. Focus on cases with specific complaints.

**Improvement principles:**
- **Generalize from feedback** — skills run across many prompts. Don't overfit to the test examples. If an issue is stubborn, try a different metaphor or working pattern rather than piling on constraints.
- **Keep it lean** — remove instructions that aren't pulling weight. Read transcripts; cut what makes the model waste time.
- **Explain the why** — terse/frustrated feedback still encodes a real need. Understand it and transmit that understanding into the instructions. ALL-CAPS MUSTs and rigid structures are a yellow flag — reframe with reasoning instead.
- **Bundle repeated work** — if every run independently wrote the same helper script, write it once into `scripts/`.

Kill the viewer when done: `kill $VIEWER_PID 2>/dev/null`

---

## Description Optimization Loop

The frontmatter description is the sole trigger mechanism. After building/improving, optimize it.

**Generate ~20 trigger eval queries** (8–10 should-trigger, 8–10 should-not-trigger). Realistic, concrete, with file paths / company names / backstory / typos. The valuable negatives are near-misses sharing keywords but needing something else.

**Run the loop (Claude Code):**
```bash
python -m scripts.run_loop \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```
Splits 60/40 train/held-out, evaluates current description (3 runs per query for reliable trigger rate), proposes improvements, re-tests, iterates up to 5×. Returns `best_description` selected by test score (not train) to avoid overfitting. Apply it to the frontmatter; show before/after.

---

## Adversarial Multi-Lens Review

The default pre-ship check for any skill that ships a bundled script or is meant to be wired into / consulted by other skills (SKILL.md CREATE Step 4). Independent reviewers each take one lens, then a synthesis pass dedups and severity-ranks — distinct lenses surface distinct failure classes a single read-through misses.

Clean Workflow shape in Claude Code: `parallel` reviewers (one per lens) → one synthesis agent. Route each lens to its own `opts.phase` so they group cleanly in the progress view, and give each reviewer a findings schema (`{lens, severity, finding, fix}`) so the synthesizer gets structured input rather than prose.

- **Collision** — read the other skills' descriptions; flag trigger overlap where a sibling should win.
- **Triggering** — build a small should-fire / should-not-fire set (per the Description Optimization Loop above) and include framework-noun over-fire cases.
- **Script-correctness** — actually run the bundled script against odd / empty / error inputs (null fields, non-dict bodies, empty results), not just the happy path.
- **House-convention** — check the anatomy, the user's CLAUDE.md, and internal consistency across `SKILL.md` / `references/` / `scripts/`.

Synthesis returns must-fix / should-fix / optional. Apply must-fix, re-verify, then ship.

---

## Blind Comparison (Optional, Advanced)

For "is the new version actually better?" — give two outputs to an independent agent without revealing which is which, let it judge, then analyze why the winner won. Requires subagents. The human review loop is usually sufficient; most cases don't need this.
