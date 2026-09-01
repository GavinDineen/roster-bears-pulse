"""Load the X account pool for twscrape from environment variables on boot.

Two env vars, both optional, both newline-separated (one account per line).
Blank lines and lines starting with `#` are ignored.

  X_SCRAPE_COOKIES   (recommended — most stable, activates immediately)
      name│auth_token=xxxxx; ct0=yyyyy
      name│<full cookie header copied from x.com devtools>
    The separator is a pipe `│` OR a plain `|`. `name` is a local label only.

  X_SCRAPE_ACCOUNTS  (login flow — needs email access for the verification code)
      username:password:email:email_password

If both are set, cookie accounts are added first. `login_all()` runs only when
at least one login-flow account was added.
"""

from __future__ import annotations

import os

from twscrape import API

_PIPES = ("│", "|")


def _lines(raw: str | None) -> list[str]:
    if not raw:
        return []
    out: list[str] = []
    for line in raw.replace("\r\n", "\n").split("\n"):
        s = line.strip()
        if s and not s.startswith("#"):
            out.append(s)
    return out


def _split_cookie_line(line: str) -> tuple[str, str] | None:
    for p in _PIPES:
        if p in line:
            name, _, cookies = line.partition(p)
            name, cookies = name.strip(), cookies.strip()
            if name and cookies:
                return name, cookies
    return None


async def bootstrap_pool(db_path: str) -> API:
    # raise_when_no_account: surface "no usable account" to the caller as an
    # error (→ HTTP 503) instead of silently returning zero tweets, so the Next
    # service falls back to the official X API. wait_timeout keeps a short grace
    # period for a briefly-locked (rate-limited) account before giving up.
    api = API(db_path, raise_when_no_account=True, wait_timeout=10)
    existing = {a["username"] for a in await api.pool.accounts_info()}

    added_login = 0

    for line in _lines(os.environ.get("X_SCRAPE_COOKIES")):
        parsed = _split_cookie_line(line)
        if not parsed:
            print(f"[accounts] skipped malformed X_SCRAPE_COOKIES line: {line[:24]}…")
            continue
        name, cookies = parsed
        if name in existing:
            continue
        try:
            await api.pool.add_account_cookies(name, cookies)
            print(f"[accounts] added cookie account: {name}")
        except ValueError as e:
            print(f"[accounts] cookie account {name} rejected: {e}")

    for line in _lines(os.environ.get("X_SCRAPE_ACCOUNTS")):
        parts = line.split(":")
        if len(parts) < 4:
            print(f"[accounts] skipped malformed X_SCRAPE_ACCOUNTS line: {parts[0][:24]}…")
            continue
        username, password, email, email_password = (p.strip() for p in parts[:4])
        if username in existing:
            continue
        await api.pool.add_account(username, password, email, email_password)
        added_login += 1
        print(f"[accounts] added login account: {username}")

    if added_login:
        print(f"[accounts] logging in {added_login} new login-flow account(s)…")
        await api.pool.login_all()

    info = await api.pool.accounts_info()
    active = sum(1 for a in info if a["active"])
    print(f"[accounts] pool ready: {active}/{len(info)} active")
    return api
