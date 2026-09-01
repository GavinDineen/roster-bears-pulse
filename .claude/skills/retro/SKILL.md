---
name: retro
description: Capture-loop — at the end of meaningful work, distill what was learned into durable upgrades (memory facts, ratchet guards, workflow/skill updates) so the next session starts smarter. Run before ending a substantive session, or when the user says "retro"/"capture lessons".
disable-model-invocation: true
---

# /retro — bank this session's lessons

The "self-learning" engine: turn ephemeral session experience into durable artifacts so the setup improves over time instead of relearning the same things. Be selective — capture what was **non-obvious and reusable**, not a session transcript.

## 1. Review the session
Skim what actually happened: the task, failures hit and their root causes, fixes that worked, user corrections/preferences, and decisions made. Identify only the items that will matter again.

## 2. Distill into the right artifact (do all that apply)
For each durable lesson, route it:

- **A fact / preference / project reality** → write it to the **knowledge vault** if one is configured (a PARA Obsidian vault named in CLAUDE.md, e.g. `~/vault`): one note per fact in the right PARA folder (`Projects/<project>/`, `Areas/`, `Resources/`), YAML frontmatter (`type: user|feedback|project|reference`; for feedback/project add **Why:** and **How to apply:**), `[[wikilinks]]` to related notes, and a link from the relevant `_index.md`/`Home.md`. The vault is the **portable source of truth** — prefer it so lessons travel across machines. If NO vault is configured, fall back to the harness memory system (`MEMORY.md` index + one file per fact). **Dedup first** — update an existing note rather than duplicating; a note proven wrong gets a dated correction or `status: superseded` with a pointer to its replacement, and is **deleted only with the user's explicit go-ahead** (never silently — this matches the vault's "archive over delete, never delete without confirmation" rule).
- **A recurring bug class or mistake** → propose a **ratchet guard** so it can't recur: a lint rule, a `block-*` hook, or a regression test. Name the concrete guard; offer to implement it.
- **A workflow lesson** (a better/worse way to do a task) → update the relevant **CLAUDE.md** or **skill** so the procedure itself improves.
- **A new repeatable procedure** → propose a new **skill**.

## 3. Record the retro marker (so the SessionStart nudge resets)
The marker is per-repo and the nudge only fires inside a work tree, so from a non-repo cwd there is
nothing to reset — report that instead of a marker you never wrote. When a session's work spanned
several repos, record it in each one.
```bash
# --absolute-git-dir so the path never resolves relative to the current cwd.
if GITDIR="$(git rev-parse --absolute-git-dir 2>/dev/null)"; then
  SHA="$(git rev-parse HEAD)" && printf '%s\n' "$SHA" > "$GITDIR/claude-last-retro" \
    && echo "✓ retro marker recorded (${SHA:0:7})"
else
  echo "⚠ not in a git repo — no marker written (nothing to reset here)"
fi
```

## 4. Report
List exactly what was captured (files written/updated) and any guards/skills you're proposing for next time. Keep it to the durable items.

## Rules
- Quality over volume: a few high-signal captures beat a dump. If nothing durable was learned, say so and just update the marker.
- Never store secrets, or anything already obvious from the code/git history (capture what was *non-obvious*).
- Respect the human-in-the-loop posture: propose ratchet guards and skills; implement them only with the user's go-ahead.
