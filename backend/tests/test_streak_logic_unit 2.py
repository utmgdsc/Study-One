from __future__ import annotations

from datetime import datetime, timedelta, timezone

from services.gamification import compute_streak_update


def dt_utc(y: int, m: int, d: int, h: int = 12) -> datetime:
    return datetime(y, m, d, h, 0, 0, tzinfo=timezone.utc)


def test_first_activity_starts_streak():
    upd = compute_streak_update(
        last_active_at=None,
        current_streak_days=0,
        longest_streak_days=0,
        occurred_at=dt_utc(2026, 3, 2),
    )
    assert upd.current_streak_days == 1
    assert upd.longest_streak_days == 1


def test_same_day_does_not_increment():
    last = dt_utc(2026, 3, 2, 1)
    upd = compute_streak_update(
        last_active_at=last,
        current_streak_days=3,
        longest_streak_days=5,
        occurred_at=dt_utc(2026, 3, 2, 23),
    )
    assert upd.current_streak_days == 3
    assert upd.longest_streak_days == 5


def test_consecutive_day_increments():
    last = dt_utc(2026, 3, 1, 23)
    upd = compute_streak_update(
        last_active_at=last,
        current_streak_days=3,
        longest_streak_days=3,
        occurred_at=dt_utc(2026, 3, 2, 0),
    )
    assert upd.current_streak_days == 4
    assert upd.longest_streak_days == 4


def test_gap_resets_to_one_and_preserves_longest():
    last = dt_utc(2026, 2, 27)
    upd = compute_streak_update(
        last_active_at=last,
        current_streak_days=7,
        longest_streak_days=10,
        occurred_at=dt_utc(2026, 3, 2),
    )
    assert upd.current_streak_days == 1
    assert upd.longest_streak_days == 10


def test_timezone_is_normalized_to_utc_day():
    # occurred_at can look like "tomorrow" locally, while still being the same UTC day.
    last = dt_utc(2026, 3, 2, 1)
    occurred_utc = dt_utc(2026, 3, 2, 10)  # still 2026-03-02 in UTC
    occurred_local = occurred_utc.astimezone(timezone(timedelta(hours=14)))  # 2026-03-03 locally

    upd = compute_streak_update(
        last_active_at=last,
        current_streak_days=2,
        longest_streak_days=2,
        occurred_at=occurred_local,
    )
    assert upd.current_streak_days == 2
    assert upd.longest_streak_days == 2

