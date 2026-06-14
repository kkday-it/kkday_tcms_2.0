"""Presence tracker — online window + idle (amber dot) logic."""

import time

import pytest

import app.services.presence as p


@pytest.fixture(autouse=True)
def _clean_state():
    p._seen.clear()
    yield
    p._seen.clear()


def _user(snap, uid):
    return next((u for u in snap["users"] if u["id"] == uid), None)


def test_touch_marks_online_and_not_idle():
    p.touch(1, "alice")
    snap = p.snapshot()
    assert snap["online"] == 1
    assert _user(snap, 1) == {"id": 1, "username": "alice", "idle": False}


def test_background_heartbeat_does_not_clear_idle():
    # First real activity, then let last_active age past the idle threshold while
    # background heartbeats keep refreshing last_seen.
    p.mark_active(1, "alice")
    p._seen[1].last_active = time.time() - (p.IDLE_THRESHOLD_SECONDS + 10)
    p.touch(1, "alice")  # background heartbeat — keeps online, must NOT clear idle

    snap = p.snapshot()
    assert snap["online"] == 1                  # still online (last_seen fresh)
    assert _user(snap, 1)["idle"] is True       # but idle → amber


def test_real_activity_clears_idle():
    p.touch(1, "alice")
    p._seen[1].last_active = time.time() - (p.IDLE_THRESHOLD_SECONDS + 10)
    assert _user(p.snapshot(), 1)["idle"] is True

    p.mark_active(1, "alice")                   # user did something
    assert _user(p.snapshot(), 1)["idle"] is False


def test_stale_user_pruned_from_online():
    p.touch(1, "alice")
    p._seen[1].last_seen = time.time() - (p.ONLINE_WINDOW_SECONDS + 10)
    snap = p.snapshot()
    assert snap["online"] == 0
    assert _user(snap, 1) is None
