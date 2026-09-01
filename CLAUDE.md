# roster-intelligence-bears — Claude working notes

Headless Next.js data service ("Bears Pulse" / "The Desk"). It has **no UI of its own**
and **no end-user auth**. The Roster app (`therostercollective.com`) is the only caller;
it owns the user session/roles and authenticates every request with a shared secret.

## Two-layer model (do not blur these)

| Layer | Cost | Source | Rule |
|---|---|---|---|
| **FACTS** | **$0** | Scraped official / beat transaction pages (`lib/facts.ts`) | Confirmed roster moves only. `official` source confirms alone; `wire` needs two distinct wires. Never fabricate a move. |
| **ARGUMENT** | **$0 via twscrape, else costs money** | X/Twitter recent search (`lib/x.ts`) | The fan/beat "argument" around the facts. Reads go through the twscrape sidecar first (free — `services/x-scrape/`); on any failure they fall back to the official X API, which stays metered and budget-gated. Writes are always the official API. |

`lib/llmExtract.ts` re-parses already-scraped trade sentences with Gemini
(`gemini-2.0-flash`, free tier, `GEMINI_API_KEY`). It adds **zero** X/API cost, fails
closed to the regex path, and must stay that way.

## Architecture map

- `lib/config.ts` — beat/national handles, blocklists, queries. "Two queries only. max_results 20. Never collect on page load."
- `lib/facts.ts` — FACT pipe: scrape → confirm → merge trade legs into ONE fact per counterparty team.
- `lib/x.ts` — X read: twscrape sidecar (`scrapeSearch` / `hasScrapeCreds`, primary/free) → official `twitter-api-v2` (`recentSearch`, `X_BEARER_TOKEN`, budget-gated fallback). Write = official only (4 OAuth1 vars).
- `lib/rank.ts` / `lib/filter.ts` — categorize + "Chicago Bears football, or nothing" filtering.
- `lib/synthesize.ts` — build the `PulsePayload` (facts, beat rail, fan argument, viral cards, creator prompts).
- `lib/spend.ts` — cost estimates + gates (`gateCollect`, `gateOfficialFallback`, `gateWrite`); `recordReads` (paid) vs `recordScrapeReads` ($0); `scrapeActive()`.
- `lib/kv.ts` — storage: Upstash Redis on Vercel (`KV_REST_API_*`), local `.data/*.json` fallback.
- `lib/store.ts` — `readPulse`/`writePulse`, `readQueue`/`writeQueue`.
- `lib/service-auth.ts` — `isServiceRequest` (shared `DESK_SERVICE_SECRET`), `isCronRequest` (`CRON_SECRET`).
- `services/x-scrape/` — standalone Python (FastAPI + twscrape) sidecar, deployed separately (Fly.io). Only called from `/api/collect`. Burner X accounts, ToS/ban risk — see its README.
- `app/api/collect` — the only route that reads/writes X: twscrape (or official fallback) + scrape facts → synthesize → write pulse + queue.
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

- Never add code that reads or writes X on page load, in `dev`, or in a loop —
  this includes the twscrape sidecar: it only answers `/search` calls from `/api/collect`.
- Collection happens **only** via `/api/collect` (cron or explicit Roster-app call).
- The twscrape path is free but still passes `gateCollect` — the 90-min throttle
  and `X_MAX_COLLECTS_PER_DAY` apply to it; only the USD budget is bypassed.
- Any new *official*-API X call must go through `lib/spend.ts` gates
  (`gateCollect` / `gateOfficialFallback` / `gateWrite`). Respect
  `X_MONTHLY_BUDGET_USD`, `X_MAX_READS_PER_DAY`, `X_MAX_POSTS_PER_DAY`.
- Keep `lib/llmExtract.ts` on the free Gemini tier and no-op without the key.

## Secrets

`.env.local` holds `DESK_SERVICE_SECRET`, `CRON_SECRET`, all five X API
credentials, and (optional) `X_SCRAPE_SERVICE_URL` / `X_SCRAPE_SERVICE_SECRET`
for the twscrape sidecar. The sidecar's own burner-account cookies live only in
its host's secrets (e.g. `fly secrets`), never in this repo. Never commit
`.env.local`, never echo its values, never paste a key into a commit message,
code comment, or PR description.

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
