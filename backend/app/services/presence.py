"""In-memory presence tracker for the "站上人數" (online users) sidebar widget.

Deliberately *not* backed by the DB: this is an ephemeral observability signal,
not durable data, so it needs no table and touches none of the DB-safety rules in
.ai_rules.md. Every authenticated request to the heartbeat endpoint refreshes a
per-user last-seen timestamp; a user counts as "online" while that timestamp is
within ONLINE_WINDOW_SECONDS.

Caveat: state lives in this process's memory. The dev/SIT deployment runs a single
uvicorn worker (see start.sh — no `--workers`), so a global dict is sufficient and
correct. If this ever scales to multiple workers, swap the dict for Redis with the
same interface.
"""
from __future__ import annotations

import threading
import time
from typing import Dict

# A user is "online" if seen within this window. The frontend pings every
# HEARTBEAT_INTERVAL (30s); a 90s window tolerates one missed beat before a
# user drops off, which keeps the count from flickering on a slow request.
ONLINE_WINDOW_SECONDS = 90

# id -> (last_seen_epoch, username). username is cached so /online can list who
# is on without a DB round-trip.
_seen: Dict[int, tuple[float, str]] = {}
_lock = threading.Lock()


def touch(user_id: int, username: str) -> None:
    """Record that `user_id` is active right now."""
    with _lock:
        _seen[user_id] = (time.time(), username)


def drop(user_id: int) -> None:
    """Remove a user from the online set immediately (used by the admin kick)."""
    with _lock:
        _seen.pop(user_id, None)


def _prune(now: float) -> None:
    stale = [uid for uid, (ts, _) in _seen.items() if now - ts > ONLINE_WINDOW_SECONDS]
    for uid in stale:
        del _seen[uid]


def snapshot() -> dict:
    """Return the current online count and the online users (id + username)."""
    now = time.time()
    with _lock:
        _prune(now)
        users = sorted(
            ({"id": uid, "username": name} for uid, (_, name) in _seen.items()),
            key=lambda u: u["username"],
        )
        return {"online": len(users), "users": users}
