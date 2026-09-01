#!/usr/bin/env bash
# PreToolUse hook (Bash). Blocks `git commit -m/--message` when the message
# contains an UNESCAPED backtick. Global + low-friction: zsh (the Bash tool's
# shell) command-substitutes a bare backtick BEFORE git ever sees the message,
# silently mangling it. This fires only on inline-message commits with a bare
# backtick — `git commit -F <file>` (the fix) is never touched, and correctly
# backslash-escaped backticks are allowed.
# Blocks by exiting 2; stderr is shown to Claude as the reason.
set -euo pipefail

INPUT="$(cat)"
CMD="$(printf '%s' "$INPUT" | jq -r '.tool_input.command // empty')"
[ -z "$CMD" ] && exit 0

# Only inspect git commits.
printf '%s' "$CMD" | grep -Eq '\bgit\b.*\bcommit\b' || exit 0

# Only when an INLINE message flag is present: -m, -am (short cluster ending m),
# or --message[=]. `git commit -F file` has none of these -> never blocked.
printf '%s' "$CMD" | grep -Eq '(^|[[:space:]])-[A-Za-z]*m([[:space:]]|$)|--message([=[:space:]]|$)' || exit 0

# Allow correctly-escaped backticks: strip every \` pair, then see if a bare ` remains.
STRIPPED="$(printf '%s' "$CMD" | sed 's/\\`//g')"
printf '%s' "$STRIPPED" | grep -q '`' || exit 0

echo "BLOCKED by block-backtick-commit hook: your 'git commit -m' message contains an unescaped backtick. zsh (the Bash tool's shell) will command-substitute it before git sees it, silently corrupting the message. Fix: write the message to a file and use 'git commit -F <file>' (backtick-safe). (You may instead backslash-escape every backtick, but -F is cleaner.)" >&2
exit 2
