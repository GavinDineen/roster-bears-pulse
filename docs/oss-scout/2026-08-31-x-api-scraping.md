# OSS Scout — X.com (Twitter) API scraping / reading

**Date:** 2026-08-31
**Capability:** A way to read X/Twitter data — recent search, user timelines, tweet
details — for a headless Next.js/TypeScript data service, ideally without paying
the official X API.
**Intent class:** PRODUCT (feeds "Bears Pulse" / The Roster Collective, a commercial product) → copyleft ADOPT/FORK block is active.
**Run stack:** TypeScript · Next 15 App Router · Node · Vercel serverless · cron-triggered. Currently uses `twitter-api-v2` (plhery) with a paid bearer token, metered + budget-gated per `lib/spend.ts`.

---

## Headline verdict: **MINE the patterns, keep the status quo** (do not swap the official API for a scraper right now)

The official metered path in `lib/x.ts` is a *deliberate* design choice (CLAUDE.md
"ARGUMENT costs money", auditable, ToS-clean, no account-ban risk). Every
credible OSS alternative that does **authenticated recent search** — the exact
thing `lib/x.ts` does — requires a logged-in burner account cookie, which means:
X ToS violation, account-ban roulette, and a silent dependency that breaks the
"never fabricate a move / everything auditable" posture. None of the strong
candidates run cleanly in Vercel serverless either.

**If** cost pressure ever forces the switch, the drop-in with the least pain is
**Rettiwt-API** (TS-native, actively maintained) and the architecture worth
copying is **twscrape**'s (account pool + rate-limit ledger). Both are called out below.

---

## Shortlist

| # | Repo | Lang | Stars | License | Last commit | Score | Note |
|---|---|---|---|---|---|---|---|
| 1 | [Rishikant181/Rettiwt-API](https://github.com/Rishikant181/Rettiwt-API) | TS | 889 | MIT | 2026-08-31 | **82** | Only TS-native option that's actively maintained. Search needs user-auth cookie; guest mode = timelines/user/tweet only. |
| 2 | [vladkens/twscrape](https://github.com/vladkens/twscrape) | Python | 2.7k | MIT | 2026-08-28 | **81** | Best-in-class for scale: multi-account rotation + built-in rate-limit handling. Python — needs a sidecar, no Vercel fit. |
| 3 | [the-convocation/twitter-scraper](https://github.com/the-convocation/twitter-scraper) | TS | 640 | MIT | 2026-04-01 | **74** | Port of n0madic/twitter-scraper; base of the elizaOS `agent-twitter-client` lineage. Maintenance slowing (5mo, 51 open issues, "getTweets not working" open). |
| 4 | [d60/twikit](https://github.com/d60/twikit) | Python | 4.6k | MIT | 2026-03-10 | **70** | Most-starred "no API key" lib. Full read+write via internal API. Release cadence stalled (last release Feb 2025), 160 open issues. Python. |
| 5 | [trevorhobenshield/twitter-api-client](https://github.com/trevorhobenshield/twitter-api-client) | Python | 1.9k | MIT | 2024-04 | **~40** | v1/v2/GraphQL reimpl. **Gate: no commits 18+ months** → ADOPT blocked. Great reference for GraphQL endpoint shapes. |
| 6 | [n0madic/twitter-scraper](https://github.com/n0madic/twitter-scraper) | Go | 970 | MIT | 2026-08 | n/a | Go. The upstream that #3 ports. Fine if you had a Go service; you don't. |
| 7 | [mahrtayyab/tweety](https://github.com/mahrtayyab/tweety) | Python | 671 | **none found** | 2026-08 | gate | No LICENSE file → ineligible for ADOPT/FORK. Reference-only. |

### Pattern reference — ⚑ counsel review before deriving (copyleft / dead)

- [JustAnotherArchivist/snscrape](https://github.com/JustAnotherArchivist/snscrape) — Python, 5.4k★, **GPL-3.0**, last commit **Nov 2023 (dead)**. The historical gold standard; X's 2023 auth-wall killed guest scraping and the project never recovered. Study, don't derive.
- [zedeus/nitter](https://github.com/zedeus/nitter) — Nim, 14k★, **AGPL-3.0**, **archived**. The reference implementation of the guest-token GraphQL approach. Blocked + dead.

### Third-party paid API alternatives (not OSS, but relevant to the buy path)

- [Xquik-dev/x-twitter-scraper](https://github.com/Xquik-dev/x-twitter-scraper), apidojo/twitterapi.io, scrapfly, apify twitter-scraper — hosted "X API alternative" services. These move the ToS/ban risk onto a vendor and give you REST + webhooks. If the driver is "official API too expensive," price these against `X_MONTHLY_BUDGET_USD` before writing any scraper code.

---

## Deep-dive: the two that matter

### Rettiwt-API (Rishikant181) — the TS drop-in
- **License:** MIT (verified in repo).
- **Maintenance:** commits the day of this scan, CI just added Node 24 support, issues answered within days. Solo maintainer (bus factor 1) but genuinely active. ~12k npm downloads/month.
- **How it works:** HTTP calls to X's internal GraphQL/v1.1 endpoints — **no headless browser**, so it *can* run in a Node serverless function.
- **The catch:** "Guest" auth covers Tweet Details, User Details, **User Timeline** only. **Tweet Search / Tweet Stream require "User" auth** — a real logged-in account's `ct0`/`auth_token` cookie. That's the exact capability `lib/x.ts` needs, so adopting this for search = running a burner account against X ToS.
- **Where it'd fit without the risk:** if you ever want *specific beat-writer timelines* as a FACT/rail input (guest auth, read-only, low volume), this is a clean, typed way to pull `getUserTimeline`.

### twscrape (vladkens) — the architecture to MINE
- **License:** MIT (verified).
- **Maintenance:** best in class here — monthly releases, commits within days, 316 forks, 141k downloads/month.
- **What's worth copying (not the code — it's Python):**
  - An **account pool** with per-account cookie storage and automatic cycling.
  - A **rate-limit ledger** that tracks each endpoint's remaining quota per account and sleeps/switches instead of getting the account flagged.
  - Clean separation of "raw API response" → "typed model" with the GraphQL query IDs isolated in one file (they change often and break everything).
- This is the same discipline `lib/spend.ts` already applies to dollars; twscrape applies it to per-account request budgets. If a scraper ever ships here, that ledger pattern is mandatory.

---

## Why BUILD/adopt-a-scraper loses right now

| Closest candidate | Why it loses for `lib/x.ts`'s search use case |
|---|---|
| Rettiwt-API | Search needs a logged-in account cookie → ToS violation + ban risk + a fragile secret to rotate. |
| twscrape | Python; no Vercel serverless story; same account-cookie requirement. |
| the-convocation | Maintenance decaying; search reliability issues open right now; same auth-wall constraint. |

X closed anonymous/guest access to search and most read endpoints in mid-2023.
Every "free" library today works by driving **logged-in accounts** against the
internal API. That trades a metered, contractual dollar cost for an unmetered,
unpredictable *account* cost (rate-limit lockouts, shadow bans, full bans) plus
an operational burden (account warup, cookie rotation, captcha solving). For a
product that must be *auditable* and *never fabricate*, the paid official API is
the right call until the monthly bill actually becomes the binding constraint.

---

## Recommendation

1. **No code change now.** Keep `twitter-api-v2` + the `lib/spend.ts` gates.
2. **If** the X bill becomes the constraint, evaluate in this order:
   a. Hosted X-API-alternative vendors (Xquik / twitterapi.io / Apify) — priced against current budget. Least engineering, risk is contractual not operational.
   b. Rettiwt-API in **guest mode** for read-only beat-writer *timelines* only (not search) as a supplementary FACT/rail signal — low volume, no account needed.
   c. Only as a last resort: a scraper with a twscrape-style account pool + rate-limit ledger, isolated behind the same gate interface as `lib/x.ts`, run from a dedicated worker (not a Vercel function). ⚑ security-auditor review before merge (handles credentials).
3. Regardless: `trevorhobenshield/twitter-api-client` and `nitter` are the two best references for *how* X's internal endpoints are shaped if you ever need to debug the official client.

---

## Provenance ledger

| Repo | URL | License | Retrieved |
|---|---|---|---|
| Rettiwt-API | https://github.com/Rishikant181/Rettiwt-API | MIT | 2026-08-31 |
| twscrape | https://github.com/vladkens/twscrape | MIT | 2026-08-31 |
| the-convocation/twitter-scraper | https://github.com/the-convocation/twitter-scraper | MIT | 2026-08-31 |
| twikit | https://github.com/d60/twikit | MIT | 2026-08-31 |
| twitter-api-client | https://github.com/trevorhobenshield/twitter-api-client | MIT | 2026-08-31 |
| snscrape | https://github.com/JustAnotherArchivist/snscrape | GPL-3.0 | 2026-08-31 |
| nitter | https://github.com/zedeus/nitter | AGPL-3.0 (archived) | 2026-08-31 |
| tweety | https://github.com/mahrtayyab/tweety | none found | 2026-08-31 |

_Commit SHAs not pinned — no ADOPT/FORK verdict issued, so nothing is being copied._
