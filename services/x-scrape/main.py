"""twscrape HTTP sidecar for Bears Pulse / The Desk.

The Next.js service (lib/x.ts) calls this as its PRIMARY X-read path. Every
request is bearer-authed with X_SCRAPE_SERVICE_SECRET. This service NEVER calls
X on a schedule of its own — it only answers /search requests driven by
/api/collect (cron or an admin "Collect now"), same discipline as the rest of
the desk.

⚑ Uses logged-in X accounts against X's internal API. This is against X's ToS
   and the accounts can be rate-limited or banned. Use burner accounts. See
   README.md.
"""

from __future__ import annotations

import hmac
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from twscrape import API, NoAccountError, gather

from accounts import bootstrap_pool
from serialize import tweet_to_json

# The account DB is rebuilt from X_SCRAPE_COOKIES on every boot, so it does not
# need to survive a restart — /tmp is fine on hosts without a persistent disk
# (Render free tier). Point TWS_DB at a mounted volume if you have one.
DB_PATH = os.environ.get("TWS_DB", "/tmp/x-scrape/accounts.db")
SECRET = os.environ.get("X_SCRAPE_SERVICE_SECRET", "")
# X rejects search queries beyond ~512 chars; mirror the official path's HTTP
# 400 handling by telling the caller to split the query instead.
MAX_QUERY_LEN = 500

_state: dict[str, Any] = {"api": None}


@asynccontextmanager
async def lifespan(_: FastAPI):
    if not SECRET:
        raise RuntimeError("X_SCRAPE_SERVICE_SECRET is required")
    _state["api"] = await bootstrap_pool(DB_PATH)
    yield
    _state["api"] = None


app = FastAPI(title="x-scrape", lifespan=lifespan)


def _require_auth(authorization: str | None) -> None:
    token = ""
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
    if not token or not hmac.compare_digest(token, SECRET):
        raise HTTPException(status_code=401, detail="unauthorized")


def _api() -> API:
    api = _state["api"]
    if api is None:
        raise HTTPException(status_code=503, detail="pool not ready")
    return api


@app.get("/")
async def liveness() -> dict[str, Any]:
    """Unauthenticated liveness probe for the host's health check. No secrets, no pool."""
    return {"service": "x-scrape", "ok": True}


@app.get("/health")
async def health(authorization: str | None = Header(default=None)) -> dict[str, Any]:
    _require_auth(authorization)
    info = await _api().pool.accounts_info()
    return {
        "ok": True,
        "accounts_total": len(info),
        "accounts_active": sum(1 for a in info if a["active"]),
    }


@app.post("/search")
async def search(req: Request, authorization: str | None = Header(default=None)) -> Any:
    _require_auth(authorization)

    body = await req.json()
    query = (body.get("query") or "").strip()
    limit = body.get("limit", 20)
    product = "Top" if str(body.get("kind", "latest")).lower() == "top" else "Latest"

    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    try:
        limit = max(10, min(100, int(limit)))
    except (TypeError, ValueError):
        limit = 20

    if len(query) > MAX_QUERY_LEN:
        return JSONResponse(status_code=422, content={"error": "query_too_long"})

    # Fail fast (and let the caller fall back to the official API) when the pool
    # has no usable account — e.g. every burner got banned.
    info = await _api().pool.accounts_info()
    if not any(a["active"] for a in info):
        return JSONResponse(
            status_code=503,
            content={"error": "no_account", "detail": "no active accounts in pool"},
        )

    try:
        tweets = await gather(
            _api().search(query, limit=limit, kv={"product": product})
        )
    except NoAccountError as e:
        return JSONResponse(status_code=503, content={"error": "no_account", "detail": str(e)})
    except Exception as e:  # noqa: BLE001 — surface any scrape failure to the caller for fallback
        return JSONResponse(
            status_code=502, content={"error": "scrape_failed", "detail": str(e)[:200]}
        )

    items = [tweet_to_json(t) for t in tweets]
    return {"tweets": items, "count": len(items), "product": product}
