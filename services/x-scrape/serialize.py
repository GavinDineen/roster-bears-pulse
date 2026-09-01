"""Map a twscrape Tweet into the JSON shape lib/x.ts expects.

lib/x.ts finishes each record: it sets `isBeat` from the handle and runs the
Bears-football filter. Everything else it needs is produced here.
"""

from __future__ import annotations

from typing import Any


def tweet_to_json(t: Any) -> dict[str, Any]:
    user = getattr(t, "user", None)
    handle = getattr(user, "username", "") or ""
    tid = str(getattr(t, "id", "") or "")
    url = getattr(t, "url", None) or (
        f"https://x.com/{handle}/status/{tid}" if handle and tid else ""
    )
    created = getattr(t, "date", None)
    return {
        "id": tid,
        "text": getattr(t, "rawContent", "") or "",
        "authorId": str(getattr(user, "id", "") or ""),
        "authorHandle": handle,
        "authorName": getattr(user, "displayname", "") or handle,
        "createdAt": created.isoformat() if created is not None else "",
        "likes": int(getattr(t, "likeCount", 0) or 0),
        "retweets": int(getattr(t, "retweetCount", 0) or 0),
        "replies": int(getattr(t, "replyCount", 0) or 0),
        "quotes": int(getattr(t, "quoteCount", 0) or 0),
        "impressions": _opt_int(getattr(t, "viewCount", None)),
        "url": url,
    }


def _opt_int(v: Any) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (TypeError, ValueError):
        return None
