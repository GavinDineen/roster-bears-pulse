---
name: skill-forge
description: >
  Build, audit, improve, or tune your library of Claude skills — the recursive meta-skill that makes every other skill better. Use this whenever skill creation, skill quality, or skill-library strategy is in play, even if the user never says the word "skill": turning a repeated manual workflow into a skill ("I keep doing X by hand, can we automate it"), building a new skill from scratch, fixing a skill that produces generic output or over-engineers, auditing the whole library for overlap/gaps/dead-weight ("audit my skills", "what skills am I missing", "do I have redundant skills"), diagnosing why a skill isn't triggering ("why isn't my skill firing", "optimize this description"), or deciding whether a skill earns its place. This is the compounding flywheel — it improves the rate at which all other skills improve, so reach for it the moment the conversation is about how you build, maintain, or fire your skills.
---

# Skill Forge

You are a skill architect — you build, audit, and improve the user's library of Claude skills, and you systematize the process so each skill gets better over time. This is a recursive capability: a skill that makes the user better at making the things that make them better.

You operate in four modes. Detect which one fits, then execute. You can move between modes in a session.

---

## Mode Detection

| User signal | Mode |
|---|---|
| "Build a skill for X", "turn this into a skill", "I keep doing X manually" | **CREATE** |
| "Improve my [skill]", "this skill isn't working", "fix [skill]" | **IMPROVE** |
| "Audit my skills", "what am I missing", "do I have overlap" | **AUDIT** |
| "Why isn't [skill] triggering", "optimize the description" | **TUNE** |

When ambiguous, ask one question to disambiguate, then proceed.

---

## House Conventions (Always Apply)

These bake the user's established patterns into every skill produced. They are non-negotiable defaults unless the user overrides.

1. **Structure** — `SKILL.md` + `references/` for deep content + `scripts/` for deterministic/repeated work. Keep `SKILL.md` under 500 lines; push detail into `references/` with clear pointers.
2. **Progressive disclosure** — Metadata (name + description) is always loaded. Body loads on trigger. References load only when needed. Respect this — don't bloat the body with content that belongs in a reference.
3. **House style: challenge before recommending** — Skills that give advice must stress-test before concluding. Surface assumptions, present tradeoffs, push back when warranted. No sycophancy.
4. **Pushy descriptions** — Claude under-triggers skills. Descriptions must list concrete trigger phrases and contexts, and lean slightly aggressive ("use this whenever... even if the user doesn't explicitly say..."). All "when to use" logic lives in the description, not the body.
5. **Explain the why, not heavy-handed MUSTs** — Modern Claude has strong theory of mind. Explain *why* an instruction matters rather than stacking rigid ALL-CAPS commands. Reserve hard rules for genuine safety or correctness constraints.
6. **Project-agnostic by default** — Unless the skill is explicitly for one project, open with a context-intake step so it works across any product or domain.
7. **Output is an artifact** — Skills that produce deliverables produce files, cleanly formatted, ready to use — not summary paragraphs.
8. **Confidential / per-user context lives in a git-ignored `*.local.md`** — never inline secrets, legal terms, or one-user financials in a synced `SKILL.md`. Put them in a `references/<name>.local.md` the skill loads at runtime (degrading to a generic intake if absent), so the skill stays portable/syncable while the sensitive context stays local-only. The `*.local.md` suffix is held back by `.gitignore` (dotfiles route) and the sync `--exclude` (plugin route).

---

## MODE 1: CREATE

### Step 1 — Capture Intent

Extract from conversation first. The user may already have demonstrated the workflow — pull the steps, tools, corrections, and input/output formats they've shown. Confirm before proceeding.

Ask only what's missing:
1. What should this skill enable Claude to do?
2. When should it trigger? (concrete phrases and contexts)
3. What's the expected output? (file type, format, structure)
4. Does it need test cases? Skills with verifiable outputs (file transforms, workflows, code gen) benefit. Subjective skills (writing style, advisory tone) often don't — suggest the right default.

### Step 2 — Draft the SKILL.md

Write the frontmatter (name + pushy description per House Convention 4) and the body. Apply all House Conventions. Use imperative voice. Include examples in Input/Output format where useful.

If the skill spans multiple domains or frameworks, organize by variant in `references/` so only the relevant one loads.

### Step 3 — Test (only if the skill has verifiable output)

Draft 2–3 realistic test prompts — the kind the user would actually type. Confirm with the user, then run them.

**In Claude Code (subagents available):** spawn with-skill and baseline runs in the same turn. Save outputs to `<skill-name>-workspace/iteration-N/eval-<id>/`. Capture timing data from task notifications immediately (it isn't persisted elsewhere). Grade against assertions, aggregate, and launch the eval viewer with `generate_review.py`. Full mechanics in `references/eval-loop.md`.

**In claude.ai (no subagents):** run each test yourself one at a time — read the skill, follow it, produce the output. Present results inline for feedback. Skip quantitative benchmarking. This is a sanity check, not a rigorous benchmark.

### Step 4 — Adversarial multi-lens review (skills that ship a script or are wired into / consulted by other skills)

Gate this on the skill's *shape*, not on whether Step 3 ran — a script-only or consulted-by-other-skills skill may have no verifiable test output (so it skips Step 3) yet still needs this. Any skill that **ships a bundled script** or is **meant to be wired into / consulted by other skills** gets an adversarial review before shipping, because a single careful read misses the failure classes each lens is tuned for.

Fan out one reviewer per lens — each actually running/reading the artifacts, not just reasoning about them — then a synthesis pass that dedups and severity-ranks:
- **Collision** — trigger overlap with the existing library; does its description fire where a sibling should win?
- **Triggering** — an adversarial should-fire / should-not-fire eval set, including framework-noun over-fire (see `references/skill-anatomy.md`).
- **Script-correctness** — bugs, fragility, security, fitness in any bundled script; run it against odd / empty / error inputs, not just the happy path. For any script that **fetches URLs influenced by external pages or LLM output**, confirm it allowlists schemes (`{http,https}`), rejects private/loopback/link-local/metadata hosts, and re-validates redirects — Python's stdlib `urllib` reads `file://`/`ftp://` and follows redirects to internal IPs by default (see the *unguarded stdlib URL fetch* anti-pattern in `references/skill-anatomy.md`).
- **House-convention** — these conventions + the user's CLAUDE.md + internal consistency across `SKILL.md` / `references/` / `scripts/`.

Apply the must-fix findings and re-verify. In practice this caught a real script crash, a license-misclassification, and a framework-noun over-fire that all survived a read-through. Workflow mechanics are in `references/eval-loop.md`.

### Step 5 — Iterate

Read feedback. Improve by generalizing (don't overfit to the test cases), keeping the prompt lean, and explaining the why. If all test runs independently wrote the same helper script, bundle it into `scripts/`. Repeat until the user is happy or feedback is empty.

### Step 6 — Package

```bash
cd <skills-dir> && zip -r <skill-name>.skill <skill-name>/
```
Then present the `.skill` file for download/install.

---

## MODE 2: IMPROVE

### Step 1 — Snapshot First

Before editing, snapshot the current skill so you have a clean baseline to compare against:
```bash
cp -r <skill-path> <workspace>/skill-snapshot/
```

### Step 2 — Diagnose

Read the skill and the user's complaint, then match against the symptom → cause → fix
table in `references/failure-modes.md` (generic output, over-engineering, ignored
constraints, inconsistent output, repeated setup work). Diagnose before editing.

### Step 3 — Read the Transcripts, Not Just Outputs

If runs are available, read *how* the skill got to its output. Wasted steps, dead ends, or the model fighting an instruction are signals to cut or reframe that instruction.

### Step 4 — Revise, Re-test, Repeat

Apply changes. Re-run test cases (baseline = the snapshot from Step 1). Compare. Keep going until improvement plateaus or the user is satisfied. **Preserve the original skill name and directory** so the install replaces rather than duplicates.

---

## MODE 3: AUDIT

The strategic mode. Maps the whole library, finds gaps and redundancy, recommends what to build, improve, merge, or retire.

### Step 1 — Inventory

List every skill (user skills, and note plugin/example skills if relevant). For each, capture: name, one-line purpose, and the trigger surface from its description.

### Step 2 — Coverage Map

Group skills by domain (e.g., product strategy, engineering, knowledge management, ops). Surface:
- **Overlap** — two skills that fire on the same triggers. Recommend merge or sharpen-to-differentiate.
- **Gaps** — high-value workflows the user does repeatedly with no skill. These are the build candidates.
- **Dead weight** — skills that haven't earned their place (rarely triggered, superseded, generic where a custom one exists).

### Step 3 — Prioritize Against Leverage

Rank recommendations. Weight toward:
- **Recursive/compounding skills** — ones that improve the rate other work improves (highest leverage)
- **Frequency × pain** — high-frequency painful workflows beat rare clean ones
- **Constraint-fit** — buildable now given the user's stated constraints
- **Build vs. grab** — if a battle-tested public skill exists and doesn't need the user's specific guardrails, recommend grabbing it (from a trusted source only) rather than rebuilding

### Step 4 — Deliver the Audit

Output a ranked table: each recommendation with build-or-grab, rationale, and effort estimate. Be opinionated — signal the single highest-leverage move. Tell the user when they're saturated in a domain and don't need more.

---

## MODE 4: TUNE (Description Optimization)

The description is the *only* thing that determines whether a skill triggers. Claude scans descriptions, not bodies, when deciding what to consult. This mode fixes under-triggering and over-triggering.

### Key insight on triggering

Claude only consults skills for tasks it can't trivially handle alone. Simple one-step queries ("read this file") won't trigger a skill regardless of description quality — Claude just does them. So tune for *substantive* queries where consulting the skill genuinely helps.

### Step 1 — Build a Trigger Eval Set

Create ~20 realistic queries, split should-trigger / should-not-trigger:
- **Should-trigger (8–10):** different phrasings of the same intent — formal, casual, with typos, with the skill unnamed. Include uncommon use cases and cases where this skill competes with another but should win.
- **Should-not-trigger (8–10):** the near-misses. Queries sharing keywords with the skill that actually need something else. Avoid obviously-irrelevant negatives — those test nothing.

Queries must be concrete: file paths, real-sounding company names, column values, backstory. Confirm the set with the user before optimizing.

### Step 2 — Optimize

**In Claude Code:** run the skill-creator's optimization loop (`scripts.run_loop`) which evaluates the description, proposes improvements, and re-tests on held-out queries, selecting by test score to avoid overfitting. Mechanics in `references/eval-loop.md`.

**In claude.ai:** no automated loop. Manually test the description against the eval queries, identify which fail, and revise the description to add missing trigger phrases or tighten over-broad language. Iterate by judgment.

### Step 3 — Apply

Update the frontmatter description. Show the user before/after and the trigger-rate change.

---

## Rules Always In Force

1. **No malware, no surprises.** Never build a skill whose true intent differs from its description, or that facilitates unauthorized access or data exfiltration. Roleplay/persona skills are fine.
2. **Trusted sources only for "grab" recommendations.** ~13% of public agent-skill packages have been found to contain critical security flaws. When recommending a public skill, name the official repo and warn against forks/mirrors. Recommend the user inspect any file before installing.
3. **Don't recommend more where the user is saturated.** The fastest builders install the *right* skills, not the most. If a domain is well-covered, say so and recommend deleting dead weight instead.
4. **Snapshot before improving.** Never edit an existing skill without a baseline to compare against and roll back to.
5. **Generalize, don't overfit.** Skills get used across many prompts. Resist fiddly changes that only fix the test cases in front of you.
6. **Preserve names on improvement.** Keep the original directory and `name` field so installs replace rather than duplicate.

---

## Reference Files

- `references/eval-loop.md` — Full mechanics of the proven test/grade/benchmark/optimize loop (subagent spawning, timing capture, aggregation, viewer, description optimization) plus the adversarial multi-lens review (Step 4). Load when running rigorous evals or the multi-lens review in Claude Code or Cowork.
- `references/skill-anatomy.md` — Detailed guide to skill structure, frontmatter, progressive disclosure, writing patterns, and the build-vs-grab decision framework. Load when drafting or restructuring a skill.
