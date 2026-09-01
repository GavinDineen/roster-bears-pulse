#!/usr/bin/env bash
# PreToolUse hook (Edit|Write|MultiEdit). Enforces CLAUDE.md rule:
#   - Never commit .env, .env.local, or any secrets
# Blocks writes/edits to env files (example/sample/template variants are allowed).
# Exits 2 to block; stderr is shown to Claude as the reason.
set -euo pipefail

INPUT="$(cat)"
FP="$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty')"
[ -z "$FP" ] && exit 0

BASE="$(basename "$FP")"

# Allow safe, non-secret templates.
case "$BASE" in
  .env.example|.env.sample|.env.template|.env.*.example|.env.*.sample) exit 0 ;;
esac

# Block real env files: .env, .env.local, .env.production, .env.<anything>
if printf '%s' "$BASE" | grep -Eq '^\.env(\..+)?$'; then
  echo "BLOCKED by block-secret-writes hook: refusing to write '$FP'. Secret/env files must never be edited or committed (CLAUDE.md). If a Vercel build needs an env var, surface it — do not hardcode." >&2
  exit 2
fi

exit 0
