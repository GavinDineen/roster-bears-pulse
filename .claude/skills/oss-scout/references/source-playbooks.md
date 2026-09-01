# Source Playbooks

How to actually hunt, per source, plus the connectivity fallback chain.
Everything here is free and requires no API keys except where noted.

## Connectivity fallback chain (GitHub)

Try in this order; drop down only when the layer above is unavailable:

1. **GitHub MCP server** — if connected, use its `search_repositories` /
   `search_code` / repo-metadata tools. Best rate limits and structured
   output.
2. **`gh` CLI** — present and authenticated in the Claude Code environment.
   The workhorse:
   ```bash
   gh search repos "<query>" --sort stars --limit 15 \
     --json fullName,description,stargazersCount,updatedAt,license,url,createdAt
   gh search repos --topic <topic> --sort stars --limit 15 --json fullName,description,stargazersCount,url
   gh search code "<distinctive pattern>" --limit 10 --json repository,path
   gh api repos/{owner}/{repo}                       # full metadata
   gh api repos/{owner}/{repo}/license --jq '.license.spdx_id, .html_url'
   gh api "repos/{owner}/{repo}/forks?sort=stargazers&per_page=5"   # fork-rescue check
   gh api "repos/{owner}/{repo}/releases?per_page=5" --jq '.[].published_at'
   ```
3. **Unauthenticated REST** — works anywhere with network, 60 req/hr, plenty
   for one run:
   ```bash
   curl -s "https://api.github.com/search/repositories?q=<query>+stars:%3E50&sort=stars&per_page=15"
   curl -s "https://api.github.com/repos/{owner}/{repo}"
   ```
4. **deps.dev metadata API** (Google Open Source Insights) — no auth,
   generous limits, and it survives shared-IP environments where GitHub's
   60/hr unauthenticated quota is often already spent by someone else:
   ```bash
   curl -s "https://api.deps.dev/v3/projects/github.com%2F{owner}%2F{repo}"
   # → starsCount, forksCount, openIssuesCount, license, description
   ```
   Respect its blind spots: no archived/read-only flag, no created date,
   and counts lag live GitHub slightly — so it feeds the shortlist, never
   the final verification. Its `license` field is a mirror label (see
   "License labels from mirrors" below).
5. **Web search + fetch** — last resort and a *supplement* at every layer:
   blog posts, comparison articles, and "X vs Y" threads surface candidates
   that keyword search misses. Fetching a repo's own GitHub page (HTML) is
   the metadata of last resort — it shows stars, the detected license,
   language breakdown, and, crucially, the archived banner that mirrors
   never carry. One caution on comparison articles: a vendor's "best
   frameworks" guide that ranks its own product #1 is candidate
   *discovery*, never ranking *evidence*.

## License labels from mirrors

Metadata mirrors (deps.dev, package registries) normalize licenses and emit
`non-standard` for anything outside their SPDX shortlist — including
perfectly permissive, OSI-approved licenses like The PostgreSQL License.
The rule: `non-standard` or `unknown` means *read the LICENSE file before
assigning a tier* — never auto-zero, never auto-trust. In one real run,
three of seven candidates carried the label; one turned out fully
permissive and belonged near the top of the shortlist.

## Query craft

- 2–4 queries per relevant source. Start broad (1–3 words: the capability
  noun), then narrow with stack and qualifiers
  (`audit log postgres`, then `audit trigger supabase typescript`).
- Always run one **topic** search (`gh search repos --topic <x>`) — topics
  are self-labeled and catch repos whose names don't match the capability.
- Always check for an **awesome-list**: search `awesome <domain>`. A curated
  list is a human-scored shortlist; harvesting its top entries is the
  cheapest high-precision move in the whole hunt.
- Filters that pay: `stars:>50` for discovery runs, `pushed:>YYYY-MM-DD`
  (12 months back) to pre-filter the dead. Drop the star filter when the
  capability is niche — a 30-star repo can be the only correct answer.

## npm (JS/TS packages)

```bash
curl -s "https://registry.npmjs.org/-/v1/search?text=<query>&size=10"
```
The response includes `score.detail` with `quality`, `popularity`, and
`maintenance` sub-scores — free rubric input; use them as evidence, not as
the verdict. Then per candidate:
```bash
curl -s "https://api.npmjs.org/downloads/point/last-week/<package>"   # momentum
npm view <package> license repository.url                             # cross-check
```
The npm `license` field and the repo LICENSE file sometimes disagree
(monorepos especially). The published package's field governs what you're
consuming via ADOPT; the repo file governs what you're copying via FORK/MINE.

## PyPI (Python packages)

PyPI has no official search API. Discover via GitHub search with
`language:Python`, via awesome-lists, or via web search of pypi.org. Then
verify a known name:
```bash
curl -s "https://pypi.org/pypi/<package>/json" | jq '.info.license, .info.project_urls, .info.version'
```

## Claude skills, plugins, MCP servers

Hunt across the ecosystem's known hubs, then verify on GitHub:

- GitHub topics: `claude-skills`, `mcp-server`, `agent-skills`
- Curated lists (check 2–3; they update at different cadences):
  `travisvn/awesome-claude-skills`, `ComposioHQ/awesome-claude-skills`,
  `VoltAgent/awesome-agent-skills` (1000+ entries),
  `karanb192/awesome-claude-skills`
- Marketplaces: mcpmarket.com (skills + servers, has leaderboards),
  the official `anthropics/skills` repo

For a skill/plugin candidate, the "code" to evaluate is the SKILL.md itself:
read it fully. Thin AI-generated filler is common; a tight, specific
SKILL.md with real commands is the quality signal.

## Hugging Face (models & datasets)

```bash
curl -s "https://huggingface.co/api/models?search=<query>&sort=downloads&limit=10"
curl -s "https://huggingface.co/api/datasets?search=<query>&sort=downloads&limit=10"
```
License lives in the `tags` array (`license:mit`, `license:llama3`, etc.).
Model licenses are frequently *not* OSI-open (custom acceptable-use terms) —
for `PRODUCT` intent, read the actual license page before scoring above
zero on license fit.

## Momentum signals (all sources)

Star count alone is a lagging vanity metric. Compute momentum from:

- **Star velocity**: `stargazersCount ÷ months since createdAt` — a
  4-month-old repo at 2k stars beats a 6-year-old repo at 8k. When the
  created date isn't available (deps.dev omits it), proxy velocity with
  release cadence, download trend, and *dated* web evidence of growth
  (trending-page history, launch posts) — and state in the memo which
  basis was used.
- **Download trend**: npm last-week downloads; HF `downloads` field.
- **Release recency**: latest release date and cadence.
- **Ecosystem adoption**: who depends on it (GitHub "Used by" count on the
  repo page via web fetch; npm dependents).

## OpenSSF Scorecard enrichment (optional, deep-dive only)

```bash
curl -s "https://api.scorecard.dev/projects/github.com/{owner}/{repo}"
```
Returns 0–10 aggregate plus 18 per-check results for repos in the weekly
1M-repo scan set (404 = not scanned; not a negative signal by itself).
Hygiene signal only — it measures process compliance, not code security.
