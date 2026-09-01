#!/usr/bin/env bash
# SessionStart hook — cheap, local, read-only situational awareness.
# The READ side of the compounding loop: a short git-state line + a "retro-due" nudge (only
# in a git work tree), then a lean read-back of durable memory so a session starts where the
# last left off — surfaced in ANY cwd (like the retired vault-readin.sh), git or not:
#   • the vault dashboard pointer + this repo's matching Project note (goal / decisions /
#     open questions), and
#   • the repo's .cracked-dev/state.md cross-session autonomous log (recent tail).
# No network calls. Degrades silently when the vault or state log is absent. Pairs with
# the /dev-loop:retro skill and the Stop hook (retro-capture.sh), which write the markers.
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)"
[ -z "$CWD" ] && CWD="$PWD"

# --- git situational awareness (only inside a work tree; the vault read-back below is not gated) ---
if git -C "$CWD" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BR="$(git -C "$CWD" branch --show-current 2>/dev/null || echo '?')"
  DIRTY="$(git -C "$CWD" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"

  # --absolute-git-dir so the marker path never resolves relative to the hook's own cwd
  GITDIR="$(git -C "$CWD" rev-parse --absolute-git-dir 2>/dev/null || echo '')"
  MARK="$GITDIR/claude-last-retro"
  NUDGE="no retro recorded yet — run /dev-loop:retro after meaningful work to start banking lessons"
  if [ -n "$GITDIR" ] && [ -f "$MARK" ]; then
    LAST="$(cat "$MARK" 2>/dev/null || echo '')"
    if [ -n "$LAST" ]; then
      # Verify the marker's commit resolves BEFORE counting. A marker holding a SHA that no longer
      # exists (history rewrite + gc, or a marker copied from another clone) makes
      # `rev-list --count ${LAST}..HEAD` exit 128; `|| echo 0` would swallow that into N=0 and print
      # the affirmative "up to date with retros" — telling you work is captured when the count never ran.
      if git -C "$CWD" cat-file -e "${LAST}^{commit}" 2>/dev/null; then
        N="$(git -C "$CWD" rev-list --count "${LAST}..HEAD" 2>/dev/null || echo 0)"
        if [ "${N:-0}" -gt 0 ]; then NUDGE="$N commit(s) since last retro — consider /dev-loop:retro before ending"; else NUDGE="up to date with retros"; fi
      else
        NUDGE="retro marker points at a missing commit (history rewrite?) — run /dev-loop:retro to reset it"
      fi
    fi
  fi

  echo "[dev-loop] branch: ${BR} | uncommitted files: ${DIRTY} | ${NUDGE}."

  # Git identity guard: an unset or machine-local user.email yields bogus commit
  # authors (e.g. you@host.local) that fail Vercel checks and show commits as
  # unverified across every repo. Warn once at session start; never block.
  EMAIL="$(git -C "$CWD" config user.email 2>/dev/null || true)"
  if [ -z "$EMAIL" ]; then
    echo "[dev-loop] ⚠ git user.email is unset — commits will use a bogus host address; Vercel + commit verification will fail. Fix: git config --global user.email you@your-github-email"
  elif printf '%s' "$EMAIL" | grep -Eiq '@[^@]*\.(local|lan|localdomain)$'; then
    echo "[dev-loop] ⚠ git user.email is '${EMAIL}' (machine-local, not GitHub-recognized) — Vercel + commit verification will fail. Fix: git config --global user.email you@your-github-email"
  fi
fi

# ---- vault read-back: this repo's Project note + dashboard pointer (the "start smarter" half) ----
# Honors CLAUDE_VAULT_DIR; defaults to the PARA vault at ~/obsidian. Read-only, offline.
# Runs in ANY cwd (git or not), matching the retired vault-readin.sh.
VAULT="${CLAUDE_VAULT_DIR:-$HOME/obsidian}"
if [ -d "$VAULT" ]; then
  [ -f "$VAULT/Now.md" ] && echo "[dev-loop] vault: dashboard $VAULT/Now.md (no fixed priority — see Prime Directive)."
  # Match the cwd basename to a Projects/*.md note by normalized (lowercase, alnum-only) name,
  # e.g. cwd "my-web-app" -> "My Web App.md".
  base="$(basename "$CWD")"
  key="$(printf '%s' "$base" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')"
  if [ -n "$key" ] && [ -d "$VAULT/Projects" ]; then
    for f in "$VAULT/Projects"/*.md; do
      [ -f "$f" ] || continue   # regular files only — a folder-note dir would break sed
      n="$(basename "$f" .md)"
      nk="$(printf '%s' "$n" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')"
      if [ "$nk" = "$key" ]; then
        echo "── vault · Projects/${n}.md (this repo) — goal · decisions · open questions ──"
        sed -n '1,48p' "$f" 2>/dev/null || true   # goal/state/decisions/open-questions/next-actions
        break
      fi
    done
  fi
fi

# ---- .cracked-dev/state.md read-back: the cross-session autonomous log for this repo ----
# The cracked-dev skill commits a running state log per repo; surfacing its tail lets a new
# session resume the recursive loop instead of relearning what the last one already did.
STATE="$CWD/.cracked-dev/state.md"
if [ -f "$STATE" ]; then
  echo "── .cracked-dev/state.md (recent cross-session log — last 20 lines) ──"
  tail -n 20 "$STATE" 2>/dev/null || true
fi
exit 0
