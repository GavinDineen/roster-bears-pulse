# roster-intelligence-bears — Claude working notes

Headless Next.js data service ("Bears Pulse" / "The Desk"). It has **no UI of its own**
and **no end-user auth**. The Roster app (`therostercollective.com`) is the only caller;
it owns the user session/roles and authenticates every request with a shared secret.

## Two-layer model (do not blur these)

| Layer | Cost | Source | Rule |
|---|---|---|---|
| **FACTS** | **$0** | Scraped official / beat transaction pages (`lib/facts.ts`) | Confirmed roster moves only. `official` source confirms alone; `wire` needs two distinct wires. Never fabricate a move. |
| **ARGUMENT** | **costs money** (X API) | X/Twitter recent search (`lib/x.ts`) | The fan/beat "argument" around the facts. Every read and write is metered and budget-gated. |

`lib/llmExtract.ts` re-parses already-scraped trade sentences with Gemini
(`gemini-2.0-flash`, free tier, `GEMINI_API_KEY`). It adds **zero** X/API cost, fails
closed to the regex path, and must stay that way.

## Architecture map

- `lib/config.ts` — beat/national handles, blocklists, queries. "Two queries only. max_results 20. Never collect on page load."
- `lib/facts.ts` — FACT pipe: scrape → confirm → merge trade legs into ONE fact per counterparty team.
- `lib/x.ts` — X read (`X_BEARER_TOKEN`) and write (4 OAuth1 vars) clients.
- `lib/rank.ts` / `lib/filter.ts` — categorize + "Chicago Bears football, or nothing" filtering.
- `lib/synthesize.ts` — build the `PulsePayload` (facts, beat rail, fan argument, viral cards, creator prompts).
- `lib/spend.ts` — cost estimates + monthly/daily gates (`gateCollect`, `gateWrite`).
- `lib/kv.ts` — storage: Upstash Redis on Vercel (`KV_REST_API_*`), local `.data/*.json` fallback.
- `lib/store.ts` — `readPulse`/`writePulse`, `readQueue`/`writeQueue`.
- `lib/service-auth.ts` — `isServiceRequest` (shared `DESK_SERVICE_SECRET`), `isCronRequest` (`CRON_SECRET`).
- `app/api/collect` — the only route that spends: scrape facts + X read → synthesize → write pulse + queue.
- `app/api/cron` — Vercel Cron (daily `0 13 * * *`) → forwards to `/api/collect`.
- `app/api/pulse|queue|spend` — read-only, service-auth'd, never trigger a collect.
- `app/api/tweet` — POST `{id, action}` from the Roster app; budget-gated write.

## Stack — and what this repo is NOT

Next 15 App Router · React 19 · TypeScript · Vercel · Upstash Redis · `twitter-api-v2`.

**There is no Supabase, no SQL database, and no schema migrations in this repo.**
The Supabase session lives in the *other* app. Therefore **do not use**:
`/create-migration`, `/deploy-edge-function`, `migration-safety-reviewer`,
`supabase-rls-test-harness`, or the `supabase-security-reviewer` agent here.

## Quality gates (run before every commit / PR)

```bash
npx tsc --noEmit      # types
npm run lint          # next lint
npm run build         # next build must pass
```

There is **no automated test suite yet**. When changing `lib/facts.ts`,
`lib/llmExtract.ts`, `lib/rank.ts`, or `lib/filter.ts`, add targeted tests or at
minimum a scripted before/after check against real scraped input — trade-leg
direction bugs (the Clark Phillips III case) are the recurring failure mode.

## Cost discipline (hard constraint)

- Never add code that reads or writes X on page load, in `dev`, or in a loop.
- Collection happens **only** via `/api/collect` (cron or explicit Roster-app call).
- Any new X call must go through `lib/spend.ts` gates. Respect `X_MONTHLY_BUDGET_USD`,
  `X_MAX_READS_PER_DAY`, `X_MAX_POSTS_PER_DAY`.
- Keep `lib/llmExtract.ts` on the free Gemini tier and no-op without the key.

## Secrets

`.env.local` holds `DESK_SERVICE_SECRET`, `CRON_SECRET`, and all five X API
credentials. Never commit it, never echo its values, never paste a key into a
commit message, code comment, or PR description.

## Git / PR workflow (solo, PR-gated)

This repo opts into `dev-loop` branch protection (that is what this tracked
`CLAUDE.md` signals). Therefore:

- Never commit or push to `main`. Work on a `feat/…` or `fix/…` branch.
- Open a PR. **The human merges** — do not enable auto-merge, do not merge for me.
- `/ship` and `cracked-dev` may branch → implement → run gates → push → open PR,
  then stop and hand back.

## Autonomous work (`cracked-dev`)

- `/cracked-dev plan` (dry-run ranking) and `/cracked-dev <one task>` are fine to run
  anytime.
- Do **not** start the unbounded full-auto loop without asking first — X/LLM budget
  and Claude usage both need a human in the loop on this project.
- Cross-session state lives in `.cracked-dev/state.md` (committed).
