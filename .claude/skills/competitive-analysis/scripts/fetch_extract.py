#!/usr/bin/env python3
"""
fetch_extract.py — the token lever for the competitive-analysis skill.

Fetches one or more URLs, strips each page to readable text *inside this script*,
truncates to a budget, and returns compact JSON. The point: a research subagent
calls this and reads ~1–2k tokens of clean text instead of pulling a 50–100k-token
raw HTML page into its context. Raw HTML never reaches the model. That is the
single biggest reason a competitive analysis bloats to 1–2M tokens — this removes it.

GATHERS TEXT ONLY. It does not judge or summarize; the subagent extracts the schema
fields from the clean text it returns.

Safety: only http/https are allowed (no file:// / ftp:// / data:// — those would let an
LLM- or page-supplied URL read local files). Redirects are followed only to public
http(s) hosts — never to loopback / private / link-local / cloud-metadata addresses
(best-effort SSRF guard; DNS-rebinding/TOCTOU is not fully closed). Each URL is isolated:
one failing (timeout, 403, blocked scheme, malformed response) never aborts the others.

Stdlib only. Usage:
  python3 fetch_extract.py --url https://competitor.com --url https://competitor.com/pricing
  python3 fetch_extract.py --max-chars 8000 https://a.com https://b.com
  echo "https://a.com" | python3 fetch_extract.py --stdin

Output: {results: [{url, status, title, meta_description, text, chars, truncated, error}], errors: [...]}.
"""

import argparse
import http.client
import ipaddress
import json
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser

UA = "competitive-analysis-fetch/1.0 (+research; respectful one-shot fetch)"
TIMEOUT = 12  # seconds per network op (NOT total wall-clock); bounded further by the 2MB read cap
DEFAULT_MAX_CHARS = 6000  # ~1.5k tokens of readable text per page
MAX_BYTES = 2_000_000
_ALLOWED_SCHEMES = {"http", "https"}
_SKIP_TAGS = {"script", "style", "noscript", "svg", "template", "iframe"}
# NB: do NOT skip <head> — <title>'s text lives there and is read via handle_data;
# script/style inside head are still skipped individually above.
_BLOCK_TAGS = {"p", "div", "section", "article", "li", "tr", "br", "h1", "h2",
               "h3", "h4", "h5", "h6", "header", "footer", "main"}


def _host_is_public(host):
    """True only if every resolved address is a routable public IP (SSRF guard)."""
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError, OSError):
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0].split("%")[0])
        except ValueError:
            return False
        if (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
                or ip.is_multicast or ip.is_unspecified):
            return False
    return True


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Follow redirects only to public http(s) hosts."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parts = urllib.parse.urlsplit(newurl)
        if parts.scheme.lower() not in _ALLOWED_SCHEMES or not _host_is_public(parts.hostname):
            return None
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_OPENER = urllib.request.build_opener(_SafeRedirectHandler())


class _TextExtractor(HTMLParser):
    """Pull visible text + <title> + meta description; drop script/style/etc."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.title = ""
        self.meta_description = ""
        self._skip_depth = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
        elif tag == "title":
            self._in_title = True
        elif tag == "meta":
            d = dict(attrs)
            name = (d.get("name") or d.get("property") or "").lower()
            if name in ("description", "og:description") and d.get("content") and not self.meta_description:
                self.meta_description = d["content"].strip()
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in _SKIP_TAGS and self._skip_depth > 0:
            self._skip_depth -= 1
        elif tag == "title":
            self._in_title = False
        if tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._skip_depth > 0:
            return
        text = data.strip()
        if not text:
            return
        if self._in_title and not self.title:
            self.title = text
        else:
            self.parts.append(text)

    def get_text(self):
        raw = " ".join(self.parts)
        lines = [ln.strip() for ln in raw.replace("\n ", "\n").split("\n")]
        out, blanks = [], 0
        for ln in lines:
            if not ln:
                blanks += 1
                if blanks <= 1:
                    out.append("")
                continue
            blanks = 0
            out.append(" ".join(ln.split()))
        return "\n".join(out).strip()


def _decode(raw, declared_charset):
    charset = declared_charset
    if not charset:
        head = raw[:4096].decode("ascii", "ignore").lower()
        m = re.search(r'charset=["\']?([\w-]+)', head)
        charset = m.group(1) if m else "utf-8"
    try:
        return raw.decode(charset, errors="replace")
    except (LookupError, TypeError):
        return raw.decode("utf-8", errors="replace")


def fetch_one(url, max_chars, errors):
    result = {
        "url": url, "status": None, "title": "", "meta_description": "",
        "text": "", "chars": 0, "truncated": False, "error": None,
    }
    try:
        parts = urllib.parse.urlsplit(url)
        scheme = parts.scheme.lower()
        if scheme not in _ALLOWED_SCHEMES:
            result["error"] = f"blocked scheme: {scheme or 'none'}"
            if errors is not None:
                errors.append(f"{url}: {result['error']}")
            return result
        if not _host_is_public(parts.hostname):
            result["error"] = "blocked host (non-public / unresolvable)"
            if errors is not None:
                errors.append(f"{url}: {result['error']}")
            return result

        req = urllib.request.Request(url, headers={
            "User-Agent": UA, "Accept": "text/html,*/*",
            "Accept-Encoding": "identity",  # avoid gzip/br bodies we can't decode
        })
        with _OPENER.open(req, timeout=TIMEOUT) as resp:
            result["status"] = getattr(resp, "status", None) or resp.getcode()
            ctype = (resp.headers.get("Content-Type") or "").lower()
            declared = resp.headers.get_content_charset()
            raw = resp.read(MAX_BYTES)
        body = _decode(raw, declared)
        if "html" in ctype or "<html" in body[:2000].lower():
            parser = _TextExtractor()
            try:
                parser.feed(body)
            except Exception:  # never let a malformed page abort the run
                pass
            result["title"] = parser.title[:300]
            result["meta_description"] = parser.meta_description[:600]
            text = parser.get_text()
        else:
            text = " ".join(body.split())
        if len(text) > max_chars:
            result["text"], result["truncated"] = text[:max_chars], True
        else:
            result["text"] = text
        result["chars"] = len(result["text"])
    except urllib.error.HTTPError as e:
        result["status"], result["error"] = e.code, f"HTTP {e.code}"
        if errors is not None:
            errors.append(f"{url}: HTTP {e.code}")
    except (urllib.error.URLError, TimeoutError, OSError, ValueError, http.client.HTTPException) as e:
        result["error"] = f"{type(e).__name__}: {e}"
        if errors is not None:
            errors.append(f"{url}: {type(e).__name__}")
    except Exception as e:  # per-URL isolation IS the contract — never abort the batch
        result["error"] = f"{type(e).__name__}: {e}"
        if errors is not None:
            errors.append(f"{url}: {type(e).__name__}")
    return result


def _dedupe_key(u):
    p = urllib.parse.urlsplit(u)
    return urllib.parse.urlunsplit(
        (p.scheme.lower(), p.netloc.lower(), p.path.rstrip("/") or "/", p.query, "")
    )


def main():
    ap = argparse.ArgumentParser(description="Fetch URLs and return clean, truncated text as JSON.")
    ap.add_argument("urls", nargs="*", help="URLs to fetch (positional).")
    ap.add_argument("--url", action="append", default=[], help="URL to fetch (repeatable).")
    ap.add_argument("--stdin", action="store_true", help="Also read URLs from stdin, one per line.")
    ap.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS,
                    help=f"Max readable chars kept per URL (default {DEFAULT_MAX_CHARS}; floor 500).")
    args = ap.parse_args()

    urls = list(args.urls) + list(args.url)
    if args.stdin:
        urls += [ln.strip() for ln in sys.stdin.read().splitlines() if ln.strip()]
    seen, ordered = set(), []
    for u in urls:
        k = _dedupe_key(u)
        if k not in seen:
            seen.add(k)
            ordered.append(u)

    if not ordered:
        json.dump({"results": [], "errors": ["no URLs provided"]}, sys.stdout)
        sys.stdout.write("\n")
        return

    max_chars = max(500, args.max_chars)  # floor so truncation always yields usable text
    errors = []
    results = [fetch_one(u, max_chars, errors) for u in ordered]
    out = {
        "results": results,
        "errors": errors,
        "note": (
            "TEXT ONLY — raw HTML was stripped in-script so it never enters context. "
            "Extract the competitive schema fields from each result's text; treat "
            "`truncated: true` as 'fetch the specific subpage you still need', not 'page was empty'."
        ),
    }
    json.dump(out, sys.stdout, indent=2)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
