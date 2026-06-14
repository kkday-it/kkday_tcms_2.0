"""In-memory presence tracker for the "站上人數" (online users) sidebar widget.

Deliberately *not* backed by the DB: this is an ephemeral observability signal,
not durable data, so it needs no table and touches none of the DB-safety rules in
.ai_rules.md. Every authenticated request to the heartbeat endpoint refreshes a
per-user last-seen timestamp; a user counts as "online" while that timestamp is
within ONLINE_WINDOW_SECONDS.

Two distinct clocks per user:
  * last_seen   — bumped by ANY authenticated request, including the 30s background
                  heartbeat. Drives the online window (presence in the list).
  * last_active — bumped only by *real* user activity (non-background requests; see
                  deps.get_current_user). Drives the idle flag: a user who is still
                  online (heartbeat ticking) but hasn't actually done anything for
                  IDLE_THRESHOLD_SECONDS renders with an amber dot instead of green.

Caveat: state lives in this process's memory. The dev/SIT deployment runs a single
uvicorn worker (see start.sh — no `--workers`), so a global dict is sufficient and
correct. If this ever scales to multiple workers, swap the dict for Redis with the
same interface.
"""
from __future__ import annotations

import os
import threading
import time
from typing import Dict

# A user is "online" if seen within this window. The frontend pings every
# HEARTBEAT_INTERVAL (30s); a 90s window tolerates one missed beat before a
# user drops off, which keeps the count from flickering on a slow request.
ONLINE_WINDOW_SECONDS = 90

# A user who is online but hasn't made a *real* (non-background) request within
# this window is considered idle — the sidebar shows an amber dot. Default 5 min;
# well below the 60-min web-session idle logout so "idle" shows long before kick.
IDLE_THRESHOLD_SECONDS = int(os.environ.get("TCMS_PRESENCE_IDLE_SECONDS", "300"))


class _Entry:
    __slots__ = ("last_seen", "last_active", "username")

    def __init__(self, now: float, username: str):
        self.last_seen = now
        self.last_active = now
        self.username = username


# id -> _Entry. Holds last_seen / last_active / cached username so the snapshot
# can list who is online (and whether they're idle) without a DB round-trip.
_seen: Dict[int, _Entry] = {}
_lock = threading.Lock()


def touch(user_id: int, username: str) -> None:
    """Record that `user_id` is online right now (background heartbeat included).

    Refreshes last_seen but NOT last_active — a background poll keeps a user in
    the list without resetting their idle clock.
    """
    with _lock:
        entry = _seen.get(user_id)
        now = time.time()
        if entry is None:
            _seen[user_id] = _Entry(now, username)
        else:
            entry.last_seen = now
            entry.username = username


def mark_active(user_id: int, username: str) -> None:
    """Record *real* user activity — refreshes both last_seen and last_active."""
    with _lock:
        entry = _seen.get(user_id)
        now = time.time()
        if entry is None:
            _seen[user_id] = _Entry(now, username)
        else:
            entry.last_seen = now
            entry.last_active = now
            entry.username = username


def drop(user_id: int) -> None:
    """Remove a user from the online set immediately (used by the admin kick)."""
    with _lock:
        _seen.pop(user_id, None)


def _prune(now: float) -> None:
    stale = [uid for uid, e in _seen.items() if now - e.last_seen > ONLINE_WINDOW_SECONDS]
    for uid in stale:
        del _seen[uid]


def snapshot() -> dict:
    """Return the current online count and users (id + username + idle flag)."""
    now = time.time()
    with _lock:
        _prune(now)
        users = sorted(
            (
                {
                    "id": uid,
                    "username": e.username,
                    "idle": (now - e.last_active) > IDLE_THRESHOLD_SECONDS,
                }
                for uid, e in _seen.items()
            ),
            key=lambda u: u["username"],
        )
        return {"online": len(users), "users": users}
