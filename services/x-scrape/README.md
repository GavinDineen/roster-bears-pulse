# x-scrape — twscrape HTTP sidecar

The **primary** X-read path for The Desk. `lib/x.ts` calls `POST /search` here
first; on any error it falls back to the official `twitter-api-v2` path under the
existing `lib/spend.ts` budget gates.

This service is a thin wrapper around [vladkens/twscrape](https://github.com/vladkens/twscrape):
an account pool in SQLite, automatic account rotation on rate-limit, parsed
tweet models. It only answers requests — it never polls X on its own.

> ⚑ **ToS / ban risk.** twscrape drives logged-in X accounts against X's
> internal API. X's Terms of Service discourage this and the accounts you add
> here can be rate-limited or permanently banned. **Use burner accounts you are
> willing to lose.** Never add a personal or brand account.

## Endpoints

| Method | Path | Body / result |
|---|---|---|
| `POST` | `/search` | `{ "query": str, "limit": 10-100, "kind": "latest"\|"top" }` → `{ tweets: [...], count, product }` |
| `GET` | `/health` | `{ ok, accounts_total, accounts_active }` |

Every request needs `Authorization: Bearer $X_SCRAPE_SERVICE_SECRET`.

`/search` status codes the caller acts on: `422 {"error":"query_too_long"}`
(split the query — `lib/x.ts` retries with half the beat list), `502
{"error":"scrape_failed"}`, `503 {"error":"no_account"}`. Any non-2xx makes
`lib/x.ts` fall back to the official API.

## Environment

| Var | Required | Notes |
|---|---|---|
| `X_SCRAPE_SERVICE_SECRET` | yes | Shared bearer secret. Must match the Vercel env of the same name. |
| `X_SCRAPE_COOKIES` | one of these two | Newline-separated `name│auth_token=…; ct0=…`. Separator is `│` or `\|`. Recommended — activates immediately, most stable. |
| `X_SCRAPE_ACCOUNTS` | one of these two | Newline-separated `username:password:email:email_password`. Login flow; needs IMAP access to the email for the verification code. |
| `TWS_DB` | no | SQLite path. Defaults to `/data/accounts.db` (the Fly volume). |

Accounts are added to the pool on boot and persisted in `TWS_DB`; re-adding an
existing `name`/`username` is a no-op. To get cookies, log the burner account in
on a throwaway browser profile, then either use
[unjar](https://github.com/vladkens/unjar) (`unjar x.com -f header`) or copy
`auth_token` and `ct0` from DevTools → Application → Cookies.

## Local run

```bash
cd services/x-scrape
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
export X_SCRAPE_SERVICE_SECRET=dev
export X_SCRAPE_COOKIES=$'burner1│auth_token=xxxx; ct0=yyyy'
export TWS_DB=./accounts.db
uvicorn main:app --port 8080

curl -s -XPOST localhost:8080/search \
  -H 'authorization: Bearer dev' -H 'content-type: application/json' \
  -d '{"query":"\"Chicago Bears\" -is:retweet lang:en","limit":20}' | jq '.count'
```

## Deploy (Render — free, no card)

1. Push this branch. In the [Render dashboard](https://dashboard.render.com):
   **New → Blueprint**, pick this repo. Render reads `render.yaml` at the repo
   root and creates the `bears-x-scrape` web service (Docker, root dir
   `services/x-scrape`, free plan).
2. On the service's **Environment** tab set:
   - `X_SCRAPE_SERVICE_SECRET` — a long random string.
   - `X_SCRAPE_COOKIES` — `burner1│auth_token=…; ct0=…` (one line per account).
3. **Leave Health Check Path empty.** The free tier's 0.1 vCPU can't answer a
   health probe mid-search, so a configured health check makes Render
   restart-loop the service. `render.yaml` omits it for this reason; if you
   create the service by hand, clear the field under Settings → Health Check Path.
4. First deploy runs automatically. **Logs** should show
   `[accounts] pool ready: 1/1 active`.
4. In the Vercel project for this repo set `X_SCRAPE_SERVICE_URL` to the
   `https://bears-x-scrape.onrender.com` URL and `X_SCRAPE_SERVICE_SECRET` to
   the same value as step 2.
5. Add a GitHub Actions **variable** (repo → Settings → Secrets and variables →
   Actions → Variables) `X_SCRAPE_SERVICE_URL` = that same URL, so
   `desk-collect.yml` wakes the service before each collect.

The account DB is rebuilt from `X_SCRAPE_COOKIES` on every boot, so the free
plan's lack of a persistent disk is fine — you only lose twscrape's per-account
rate-limit lock history across restarts. Free services sleep after ~15 min idle;
the collect workflow's wake step covers the scheduled runs, and a cold "Collect
now" from the Roster app just falls back to the official API for that one cycle.

## Deploy (Fly.io)

```bash
fly launch --no-deploy                       # creates the app from fly.toml
fly volumes create xscrape_data --size 1 --region ord
fly secrets set X_SCRAPE_SERVICE_SECRET='…' \
               X_SCRAPE_COOKIES=$'burner1│auth_token=…; ct0=…\nburner2│auth_token=…; ct0=…'
fly deploy
fly logs                                     # confirm "[accounts] pool ready: N/N active"
```

Then set `X_SCRAPE_SERVICE_URL` (the `https://<app>.fly.dev` origin) and
`X_SCRAPE_SERVICE_SECRET` in the Vercel project for this repo. Unset either one
and the desk silently reverts to the official API path.

## Rotating a banned account

```bash
fly ssh console -C "python -c \"import asyncio,twscrape; \
  asyncio.run(twscrape.API('/data/accounts.db').pool.delete_accounts('burner1'))\""
fly secrets set X_SCRAPE_COOKIES=$'burner2│auth_token=…; ct0=…\nburner3│auth_token=…; ct0=…'
fly deploy
```

A healthy pool has ≥2 active accounts so rotation has somewhere to go.
