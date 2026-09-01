# Execution model — orchestrator + per-item subagents (full-auto only)

> Extracted from SKILL.md (2026-07-10) to keep the always-loaded body lean.
> **Read this before starting the full-auto loop** — it defines who runs each
> phase and why. `plan` and focused modes run inline and don't need it.


In full-auto mode you run as a **lean orchestrator**, not as the thing that does the building.
The phases above are the contract; *who* runs them is what makes the loop token-efficient.

**Why this exists.** A relentless loop run inline in a single conversation grows roughly
quadratically: every cycle re-processes all prior cycles' repo scans, test output, and audit
reports still sitting in context. Isolating each cycle's heavy reads into a subagent that
returns only a compact result keeps the orchestrator's context nearly flat — **O(N) instead of
O(N²)**. This works *because* memory is externalized to the committed `.cracked-dev/state.md`,
not the conversation: a fresh subagent reads state.md, never your transcript.

Per cycle, the orchestrator does only this:

1. **Dispatch a SCOUT subagent** → it runs TRIAGE + RANK (reading the repo, `.cracked-dev/state.md`,
   and open PRs via `gh pr list`) and **returns only** a compact ranked table: the top ~3
   candidates with their 4-lens scores and a one-line rationale each. It builds nothing. Dispatch it
   by **`agentType: 'verifier'`** on the **scan model class** (`model: 'haiku'`, `effort: 'low'`):
   `verifier` is read-only + `Bash` (needed for `gh pr list`) and drops the ~54K general-purpose tool
   floor to ~8K. (Not `scout` — that type has no `Bash`, so `gh pr list` would fail.)
2. **Pick the #1 item**, then check the stop conditions + cycle budget. If clear to proceed:
3. **Dispatch a BUILDER subagent** for that one item → it runs PLAN → BUILD → VERIFY →
   SELF-AUDIT → PR (+ merge policy) → LOG in its own isolated context. Its dispatch prompt must
   carry: the one item, the repo conventions + `<default>` branch learned in Step 0, the full
   phase contract and the **Hard fences** below, and the required return format. It **returns
   only** the compact delta: PR URL, SAFE/RISKY + the merge action taken, the one-line result it
   logged, and any new "next candidate" it surfaced. Dispatch the builder at **`model: 'sonnet'`,
   `effort: 'medium'`** by default; escalate to **`model: 'opus'`, `effort: 'high'`** for
   architecture-level or multi-module items (use the scout's complexity/blast-radius score to
   decide). Keep the builder **`general-purpose`** (only the model tier moves) — it spawns the
   `sr-security-auditor` sub-agent and may call MCP, so it can't run as a restricted `implementer`
   type (no Agent tool, no connectors). The SELF-AUDIT security gate keeps its own strong model — it
   routes through `sr-security-auditor` — regardless of the builder's tier; **never downshift the
   security review.**
4. **Record that one-line delta** and **loop.** Do *not* re-read the repo or the full state file
   in the orchestrator — trust the scout's next fresh read. Re-reading is exactly what
   reintroduces the quadratic growth you just removed.

**The builder is focused mode.** The clean way to dispatch step 3 is to have the subagent run
this skill in focused mode on the single item (`/cracked-dev <item>`) — same pipeline, isolated
context, fences intact.

**Cost of isolation — accept it knowingly.** Two spawns per cycle and no prompt-cache sharing
between subagents, so a *single* item in isolation costs slightly more than inline; the win is
cumulative across the loop. Therefore **`plan` and focused single-task modes run inline** (no
subagents): with no multi-cycle accumulation to amortize, inline is the cheaper choice there.

