#!/usr/bin/env python3
"""
oss_scout.py — the search engine for the build-vs-borrow skill.

Gathers prior-art signals about existing open-source options for a thing you're
about to build, so the LLM can judge depend / fork / vendor / build-from-scratch.

This script GATHERS SIGNALS ONLY. It does not make the decision. It returns raw
candidates (GitHub results are STAR-ORDERED — the weakest signal; re-rank them
per references/scoring-rubric.md) with health/license/security signals; the skill
body interprets them against the repo's context (license posture, PHI, API fit).

Sources (each is best-effort — one failing never aborts the run):
  - GitHub repository search (stars, recency, issues, license, archived flag)
  - OpenSSF Scorecard  (supply-chain / maintenance score, when published)
  - Package registry search for the ecosystem (npm, crates) to confirm a
    candidate is actually published and installable

Auth: uses GITHUB_TOKEN / GH_TOKEN if set, else `gh auth token`, else
unauthenticated (low rate limit — fine for a one-shot scout).

Usage:
  python3 oss_scout.py --query "code graph visualization" \
      [--language typescript] [--ecosystem npm|crates] [--limit 8] \
      [--license-target commercial|open]

Output: a single JSON object on stdout. Never throws on network failure or odd
JSON shapes; any source error is recorded under "errors" and the run continues.
"""

import argparse
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = "build-vs-borrow-oss-scout/1.0 (+research; respectful one-shot fetch)"
TIMEOUT = 12  # seconds per request

# --- SPDX license classification ------------------------------------------------
# Conservative buckets. Anything unrecognized -> "unknown" (treated as review/blocker).
PERMISSIVE = {
    "MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause",
    "BSD-3-Clause-Clear", "ISC", "0BSD", "Unlicense", "Zlib", "Python-2.0",
    "PostgreSQL", "BlueOak-1.0.0", "CC0-1.0", "WTFPL", "Artistic-2.0", "BSL-1.0",
}
WEAK_COPYLEFT = {
    "LGPL-2.1", "LGPL-2.1-only", "LGPL-2.1-or-later", "LGPL-3.0",
    "LGPL-3.0-only", "LGPL-3.0-or-later", "MPL-2.0", "EPL-2.0", "EPL-1.0",
    "CDDL-1.0", "CDDL-1.1",
}
STRONG_COPYLEFT = {
    "GPL-2.0", "GPL-2.0-only", "GPL-2.0-or-later", "GPL-3.0", "GPL-3.0-only",
    "GPL-3.0-or-later", "AGPL-3.0", "AGPL-3.0-only", "AGPL-3.0-or-later",
    "SSPL-1.0", "EUPL-1.2", "EUPL-1.1",
    # OSL-3.0 has an AGPL-style External-Deployment (network) clause — viral for a
    # commercial/PHI target, so it belongs with strong copyleft, not weak.
    "OSL-3.0",
}


def classify_license(spdx):
    if not spdx or spdx in ("NOASSERTION", "Other", "other"):
        return "unknown"
    if spdx in PERMISSIVE:
        return "permissive"
    if spdx in WEAK_COPYLEFT:
        return "weak-copyleft"
    if spdx in STRONG_COPYLEFT:
        return "strong-copyleft"
    return "unknown"


def license_flag(license_class, target):
    """ok | review | blocker — relative to the consuming repo's posture."""
    if target == "open":  # the consuming project is itself open-source / copyleft-tolerant
        return {
            "permissive": "ok", "weak-copyleft": "ok",
            "strong-copyleft": "review", "unknown": "review",
        }[license_class]
    # default: commercial / proprietary (e.g. a PHI EMR) — copyleft is hazardous
    return {
        "permissive": "ok", "weak-copyleft": "review",
        "strong-copyleft": "blocker", "unknown": "review",
    }[license_class]


# --- HTTP helper ----------------------------------------------------------------
def http_json(url, headers=None, errors=None, label=""):
    """GET url -> parsed JSON, or None on any failure (recorded in `errors`)."""
    h = {"User-Agent": UA, "Accept": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if errors is not None and e.code != 404:  # 404 is expected (e.g. no scorecard)
            extra = ""
            if e.code in (403, 429):  # rate-limited — let the caller tell throttle from true-negative
                rem = e.headers.get("X-RateLimit-Remaining")
                ra = e.headers.get("Retry-After")
                extra = f" (rate-limited: remaining={rem}, retry-after={ra})"
            errors.append(f"{label}: HTTP {e.code}{extra}")
        return None
    except (urllib.error.URLError, TimeoutError, ValueError, OSError) as e:
        if errors is not None:
            errors.append(f"{label}: {type(e).__name__}: {e}")
        return None


def github_token():
    import os
    for var in ("GITHUB_TOKEN", "GH_TOKEN"):
        if os.environ.get(var):
            return os.environ[var]
    try:
        out = subprocess.run(
            ["gh", "auth", "token"], capture_output=True, text=True, timeout=5
        )
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except (OSError, subprocess.SubprocessError):
        # gh missing, non-executable, or timed out -> degrade to unauthenticated
        pass
    return None


def days_since(iso):
    if not iso:
        return None
    try:
        dt = datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).days
    except (ValueError, TypeError):
        return None


# --- Sources --------------------------------------------------------------------
def search_github(query, language, limit, token, errors):
    q = query
    if language:
        q += f" language:{language}"
    url = (
        "https://api.github.com/search/repositories?q="
        + urllib.parse.quote(q)
        + f"&sort=stars&order=desc&per_page={min(max(limit, 1), 100)}"
    )
    headers = {"Accept": "application/vnd.github+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = http_json(url, headers=headers, errors=errors, label="github.search")
    if not isinstance(data, dict):
        return []
    out = []
    for r in (data.get("items") or []):
        if not isinstance(r, dict):
            continue
        spdx = (r.get("license") or {}).get("spdx_id")
        lic_class = classify_license(spdx)
        out.append({
            "source": "github",
            "name": r.get("full_name"),
            "url": r.get("html_url"),
            "description": r.get("description"),
            "stars": r.get("stargazers_count"),
            "language": r.get("language"),
            "license_spdx": spdx,
            "license_class": lic_class,
            "pushed_at": r.get("pushed_at"),
            "days_since_push": days_since(r.get("pushed_at")),
            "open_issues": r.get("open_issues_count"),
            "archived": r.get("archived", False),
            "fork": r.get("fork", False),
            "owner_repo": r.get("full_name"),
        })
    return out


def fetch_scorecard(owner_repo, errors):
    """OpenSSF Scorecard, if the project publishes one (many don't -> None)."""
    if not owner_repo:
        return None
    url = f"https://api.securityscorecards.dev/projects/github.com/{owner_repo}"
    data = http_json(url, errors=errors, label="scorecard")
    if not isinstance(data, dict):
        return None
    checks = {
        c.get("name"): c.get("score")
        for c in (data.get("checks") or []) if isinstance(c, dict)
    }
    interesting = {k: checks[k] for k in (
        "Maintained", "Vulnerabilities", "Dangerous-Workflow",
        "Token-Permissions", "Branch-Protection", "Code-Review",
    ) if k in checks}
    return {"score": data.get("score"), "checks": interesting}


def search_npm(query, limit, errors):
    url = (
        "https://registry.npmjs.org/-/v1/search?text="
        + urllib.parse.quote(query)
        + f"&size={min(max(limit, 1), 250)}"
    )
    data = http_json(url, errors=errors, label="npm.search")
    if not isinstance(data, dict):
        return []
    out = []
    for obj in (data.get("objects") or []):
        if not isinstance(obj, dict):
            continue
        p = obj.get("package", {}) or {}
        repo = (p.get("links") or {}).get("repository")
        out.append({
            "source": "npm",
            "name": p.get("name"),
            "url": repo or (p.get("links") or {}).get("npm"),
            "description": p.get("description"),
            "version": p.get("version"),
            "published": p.get("date"),
            "registry_repo": repo,
        })
    return out


def search_crates(query, limit, errors):
    url = (
        "https://crates.io/api/v1/crates?q="
        + urllib.parse.quote(query)
        + f"&per_page={min(max(limit, 1), 100)}"
    )
    data = http_json(url, errors=errors, label="crates.search")
    if not isinstance(data, dict):
        return []
    out = []
    for c in (data.get("crates") or []):
        if not isinstance(c, dict):
            continue
        out.append({
            "source": "crates",
            "name": c.get("name"),
            "url": c.get("repository") or f"https://crates.io/crates/{c.get('name')}",
            "description": c.get("description"),
            "version": c.get("max_stable_version") or c.get("max_version"),
            "downloads": c.get("downloads"),
            "registry_repo": c.get("repository"),
        })
    return out


def annotate_signals(c, license_target):
    """Attach human-readable signal notes + the license flag (GitHub candidates)."""
    notes = []
    if c.get("source") != "github":
        return c
    c["license_flag"] = license_flag(c.get("license_class", "unknown"), license_target)
    if c.get("archived"):
        notes.append("ARCHIVED — unmaintained, do not adopt as a live dependency")
    if c.get("fork"):
        notes.append("is a fork — prefer the upstream source")
    d = c.get("days_since_push")
    if d is not None:
        if d > 365:
            notes.append(f"stale: last push {d}d ago (>1y)")
        elif d > 180:
            notes.append(f"aging: last push {d}d ago")
    if c.get("license_class") == "unknown":
        notes.append(
            "license unverifiable from GitHub metadata (NOASSERTION/none) — open the "
            "actual LICENSE file before adopting; this can mask viral copyleft (GPL/SSPL)"
        )
    elif c.get("license_flag") == "blocker":
        notes.append(f"LICENSE BLOCKER for this repo: {c.get('license_spdx')} (copyleft)")
    elif c.get("license_flag") == "review":
        notes.append(f"license needs review: {c.get('license_spdx')}")
    sc = c.get("scorecard")
    if sc and isinstance(sc.get("score"), (int, float)) and sc["score"] < 5:
        notes.append(f"low OpenSSF Scorecard: {sc['score']}/10")
    c["signal_notes"] = notes
    return c


def main():
    ap = argparse.ArgumentParser(description="Scout OSS prior art for build-vs-borrow.")
    ap.add_argument("--query", required=True, help="What you're about to build, in keywords.")
    ap.add_argument("--language", default="", help="GitHub language filter (e.g. typescript, python).")
    ap.add_argument("--ecosystem", default="", choices=["", "npm", "crates"],
                    help="Also search this package registry (npm/crates only).")
    ap.add_argument("--limit", type=int, default=8, help="Max GitHub candidates (clamped to 100).")
    ap.add_argument("--license-target", default="commercial", choices=["commercial", "open"],
                    help="Consuming repo's license posture (drives copyleft flagging).")
    ap.add_argument("--no-scorecard", action="store_true", help="Skip OpenSSF Scorecard lookups.")
    args = ap.parse_args()

    errors = []
    token = github_token()

    gh = search_github(args.query, args.language, args.limit, token, errors)

    if not args.no_scorecard:
        for c in gh[: min(len(gh), 6)]:  # cap scorecard lookups to the top few
            c["scorecard"] = fetch_scorecard(c.get("owner_repo"), errors)

    for c in gh:
        annotate_signals(c, args.license_target)

    registry = []
    if args.ecosystem == "npm":
        registry = search_npm(args.query, args.limit, errors)
    elif args.ecosystem == "crates":
        registry = search_crates(args.query, args.limit, errors)

    result = {
        "query": args.query,
        "language": args.language or None,
        "ecosystem": args.ecosystem or None,
        "license_target": args.license_target,
        "authenticated_github": bool(token),
        "candidates_github": gh,
        "candidates_registry": registry,
        "errors": errors,
        "note": (
            "SIGNALS ONLY — this script does not decide, and GitHub results are sorted by "
            "stars (the weakest signal), so RE-RANK per scoring-rubric.md. Any candidate with "
            "license_class 'unknown' needs a manual LICENSE check (GitHub reports NOASSERTION "
            "for many real GPL/SSPL projects). Judge each option against the consuming repo's "
            "fit and license posture, and (for PHI/payments) a deep security audit, before "
            "recommending depend/fork/vendor/build."
        ),
    }
    json.dump(result, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
