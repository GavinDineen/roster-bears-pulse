#!/usr/bin/env bash
# PreToolUse hook (Bash). PR-workflow branch protection.
# Enforces, but ONLY in repos that have opted in (a tracked CLAUDE.md at the repo
# root — i.e. repos you've set up for the PR workflow). Casual repos are untouched.
#   - Never push directly to a protected branch (main, master, or the repo's default branch)
#   - Never force-push, on ANY branch (irreversible; force-push needs explicit human authorization)
#   - Commits must happen on a feature branch, not a protected branch
# Generic across repos: detects the default branch via origin/HEAD, and honors a
# leading `cd <dir>` so `cd <repo> && git commit ...` is evaluated in the right repo.
# Blocks by exiting 2; stderr is shown to Claude as the reason.
set -euo pipefail

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -z "$CMD" ] && exit 0
case "$CMD" in *git*) ;; *) exit 0 ;; esac

# Determine the dir the git command will run in: honor a leading `cd <dir>`, else the reported cwd.
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // "."')"
TARGET="$CWD"
LEADING_CD="$(printf '%s' "$CMD" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^&;|]+).*/\1/p' | head -1 | sed -E 's/[[:space:]]+$//; s/^["'"'"']//; s/["'"'"']$//')"
[ -n "$LEADING_CD" ] && TARGET="$LEADING_CD"

# Must be a git repo.
git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0
# OPT-IN: only enforce in repos with a tracked CLAUDE.md (PR-workflow repos).
git -C "$TARGET" ls-files --error-unmatch CLAUDE.md >/dev/null 2>&1 || exit 0

deny() { echo "BLOCKED by block-main-push hook: $1" >&2; exit 2; }

# Protected = main, master, and the repo's actual default branch (via origin/HEAD).
DEFBRANCH="$(git -C "$TARGET" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@' || true)"
PROTECTED='main|master'
if [ -n "$DEFBRANCH" ] && [ "$DEFBRANCH" != "main" ] && [ "$DEFBRANCH" != "master" ]; then
  ESC="$(printf '%s' "$DEFBRANCH" | sed 's/[][\.*^$(){}+?|/]/\\&/g')"
  PROTECTED="${PROTECTED}|${ESC}"
fi
PROT="(${PROTECTED})"

# --- Pushes ---
if printf '%s' "$CMD" | grep -Eq '\bgit\b.*\bpush\b'; then
  if printf '%s' "$CMD" | grep -Eq "(origin[[:space:]]+|[:/])${PROT}([[:space:]]|$)"; then
    deny "pushing directly to a protected branch is not allowed. Open a PR instead."
  fi
  if printf '%s' "$CMD" | grep -Eq '(--force|--force-with-lease|[[:space:]]-f([[:space:]]|$))'; then
    deny "force-push is not allowed on any branch (irreversible; needs explicit human authorization)."
  fi
  # Only check the current branch for a BARE push (no explicit ref/refspec target);
  # an explicit `HEAD:feat/x` or `origin feat/x` is fine even while on a protected branch.
  HAS_TARGET=no
  printf '%s' "$CMD" | grep -Eq 'push[^|;&]*[[:alnum:]_./-]+:[[:alnum:]_./-]+' && HAS_TARGET=yes
  printf '%s' "$CMD" | grep -Eq 'push([[:space:]]+-{1,2}[[:alnum:]-]+)*[[:space:]]+[[:alnum:]_.-]+[[:space:]]+[[:alnum:]_./-]+' && HAS_TARGET=yes
  if [ "$HAS_TARGET" = no ]; then
    CUR="$(git -C "$TARGET" branch --show-current 2>/dev/null || echo '')"
    if printf '%s' "$CUR" | grep -Eq "^${PROT}$"; then
      deny "current branch is '$CUR' (protected). Create a feature branch before pushing (git checkout -b feat/...)."
    fi
  fi
fi

# --- Commits on protected branches ---
if printf '%s' "$CMD" | grep -Eq '\bgit\b.*\bcommit\b'; then
  CUR="$(git -C "$TARGET" branch --show-current 2>/dev/null || echo '')"
  if printf '%s' "$CUR" | grep -Eq "^${PROT}$"; then
    deny "you are on '$CUR' (protected). Commit on a feature branch, never on a protected/default branch."
  fi
fi

exit 0
