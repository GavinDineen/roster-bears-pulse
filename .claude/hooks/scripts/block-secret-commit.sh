#!/usr/bin/env bash
# PreToolUse hook (Bash). RATCHET: scan what's about to be committed for
# high-signal live secrets and block. Global (committing secrets is always bad)
# and low-friction (only fires when a real secret pattern is staged).
# Reports WHICH pattern matched + file — never echoes the secret value.
# Blocks by exiting 2; stderr is shown to Claude.
set -euo pipefail

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -z "$CMD" ] && exit 0
# Only inspect git commits.
printf '%s' "$CMD" | grep -Eq '\bgit\b.*\bcommit\b' || exit 0

# Resolve the repo dir (cd-aware), like the other dev-loop hooks.
CWD="$(printf '%s' "$INPUT" | jq -r '.cwd // "."')"
TARGET="$CWD"
LEADING_CD="$(printf '%s' "$CMD" | sed -nE 's/^[[:space:]]*cd[[:space:]]+([^&;|]+).*/\1/p' | head -1 | sed -E 's/[[:space:]]+$//; s/^["'"'"']//; s/["'"'"']$//')"
[ -n "$LEADING_CD" ] && TARGET="$LEADING_CD"
git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

# Collect the added lines about to be committed (staged; also unstaged-tracked if -a/--all).
DIFF="$(git -C "$TARGET" diff --cached --no-color -U0 2>/dev/null | grep '^+' || true)"
if printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])-[a-zA-Z]*a|--all'; then
  DIFF="$DIFF
$(git -C "$TARGET" diff --no-color -U0 2>/dev/null | grep '^+' || true)"
fi
[ -z "$DIFF" ] && exit 0

# High-signal secret patterns (name|regex). Low false-positive on real code.
declare -a NAMES=(
  "Stripe live secret key"
  "Stripe live restricted key"
  "AWS access key id"
  "GitHub personal token"
  "Google API key"
  "Slack token"
  "Private key block"
)
declare -a REGEXES=(
  'sk_live_[0-9a-zA-Z]{20,}'
  'rk_live_[0-9a-zA-Z]{20,}'
  'AKIA[0-9A-Z]{16}'
  'gh[pousr]_[0-9A-Za-z]{36,}'
  'AIza[0-9A-Za-z_-]{35}'
  'xox[baprs]-[0-9A-Za-z-]{10,}'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)

HITS=""
for i in "${!REGEXES[@]}"; do
  if printf '%s' "$DIFF" | grep -Eq -e "${REGEXES[$i]}"; then
    HITS="${HITS:+$HITS, }${NAMES[$i]}"
  fi
done

if [ -n "$HITS" ]; then
  echo "BLOCKED by block-secret-commit hook: the staged changes appear to contain a live secret ($HITS). Remove it, move the value to an env var / secret manager, and rotate the exposed credential. (Secret value not shown.)" >&2
  exit 2
fi
exit 0
