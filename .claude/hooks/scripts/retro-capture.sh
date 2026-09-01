#!/usr/bin/env bash
# Stop hook — end-of-session retro capture (the WRITE side of the compounding loop).
#
# When a session ends with un-captured work (uncommitted files, or commits since the last
# recorded retro), this emits a structured reminder to bank the session's lessons into the
# GIT-BACKED stores — never only in ephemeral ~/.claude — routed by kind:
#   • lessons / facts / decisions        → your knowledge vault / notes (via /dev-loop:retro)
#   • a better/worse way to do a task     → a skill upgrade via skill-forge (in the marketplace)
#   • a recurring bug class               → a ratchet guard (lint rule / block-* hook / test)
#   • a durable global rule               → a claude-config CLAUDE.md ratchet
# The next session's SessionStart hook (session-context.sh) reads those back — closing the loop.
#
# POSTURE: assertive but NON-BLOCKING. It always exits 0 and never returns a Stop-blocking
# decision, honoring the human-in-the-loop, nudge-over-self-engaging-loops safety posture — a
# hard block could trap a session. Cheap, OFFLINE, read-only. Skips non-git dirs silently.
set -euo pipefail

INPUT="$(cat 2>/dev/null || true)"
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)"
[ -z "$CWD" ] && CWD="$PWD"

# stop_hook_active guards against a retro that itself triggers another Stop event looping.
ACTIVE="$(printf '%s' "$INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null || echo false)"
[ "$ACTIVE" = "true" ] && exit 0

git -C "$CWD" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

DIRTY="$(git -C "$CWD" status --porcelain 2>/dev/null | wc -l | tr -d ' ')"
# --absolute-git-dir so the marker path never resolves relative to the hook's own cwd
GITDIR="$(git -C "$CWD" rev-parse --absolute-git-dir 2>/dev/null || echo '')"
MARK="$GITDIR/claude-last-retro"
N=0
STALE=0
if [ -n "$GITDIR" ] && [ -f "$MARK" ]; then
  LAST="$(cat "$MARK" 2>/dev/null || echo '')"
  if [ -n "$LAST" ]; then
    # Verify the marker resolves BEFORE counting. A stale marker (rewritten/gc'd or cross-clone SHA)
    # makes `rev-list --count ${LAST}..HEAD` exit 128; `|| echo 0` would swallow that into N=0 and,
    # on a clean tree, silence the end-of-session nudge entirely — the loop looks closed when the
    # commit count was never actually computable. Track the unresolvable case so it still nudges.
    if git -C "$CWD" cat-file -e "${LAST}^{commit}" 2>/dev/null; then
      N="$(git -C "$CWD" rev-list --count "${LAST}..HEAD" 2>/dev/null || echo 0)"
    else
      STALE=1
    fi
  fi
fi

# Nothing un-captured AND the marker was resolvable → stay quiet (no nag when the loop is closed).
if [ "${DIRTY:-0}" -eq 0 ] && [ "${N:-0}" -eq 0 ] && [ "${STALE:-0}" -eq 0 ]; then
  exit 0
fi

if [ "${STALE:-0}" -eq 1 ]; then
  SINCE="unknown commit(s) since last retro — marker points at a missing commit (history rewritten?)"
else
  SINCE="${N:-0} commit(s) since last retro"
fi
printf '[retro] session ending with un-captured work: %s uncommitted file(s), %s.\n' "${DIRTY:-0}" "$SINCE"
printf '        Bank the durable lessons NOW (while context is fresh) into the git-backed stores:\n'
printf '          • run /dev-loop:retro — routes each lesson to where it compounds:\n'
printf '              – facts / decisions / project reality → your knowledge vault / notes\n'
printf '              – a better way to do a task           → a skill upgrade (skill-forge, in the marketplace)\n'
printf '              – a recurring bug class               → a ratchet guard (lint / block-* hook / test)\n'
printf '              – a durable global rule               → a claude-config CLAUDE.md ratchet\n'
printf '        Then the marker resets and next session (session-context.sh) reads it back. Nudge only — not blocking.\n'
exit 0
