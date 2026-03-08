from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from services.supabase import get_supabase


XP_FLASHCARD_SESSION = 10
XP_QUIZ_COMPLETION = 25
XP_PERFECT_QUIZ_BONUS = 15


def _utc_day(dt: datetime) -> date:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date()


@dataclass(frozen=True)
class StreakUpdate:
    current_streak_days: int
    longest_streak_days: int


def compute_streak_update(
    *,
    last_active_at: datetime | None,
    current_streak_days: int,
    longest_streak_days: int,
    occurred_at: datetime,
) -> StreakUpdate:
    """
    Pure streak logic (UTC-day based). Used for unit tests only.
    MUST stay in sync with public.apply_activity() in 20250302000001_xp_streak_engine.sql.
    - Same day: no streak change
    - Next consecutive day: +1
    - Any gap: reset to 1
    """
    activity_day = _utc_day(occurred_at)
    if last_active_at is None:
        new_current = 1
    else:
        last_day = _utc_day(last_active_at)
        if activity_day == last_day:
            new_current = max(current_streak_days, 1)
        elif activity_day == (last_day + timedelta(days=1)):
            new_current = max(current_streak_days, 0) + 1
        else:
            new_current = 1

    new_longest = max(longest_streak_days, new_current)
    return StreakUpdate(current_streak_days=new_current, longest_streak_days=new_longest)


def apply_activity(
    *,
    user_id: str,
    activity_type: str,
    xp_awarded: int,
    occurred_at: datetime | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Idempotently apply a daily activity and return:
      { applied: bool, xp_awarded: int, user_stats: {...} }
    """
    if xp_awarded < 0:
        raise ValueError("xp_awarded must be >= 0")

    sb = get_supabase()
    payload = {
        "p_user_id": user_id,
        "p_activity_type": activity_type,
        "p_xp_awarded": xp_awarded,
        "p_occurred_at": (occurred_at or datetime.now(timezone.utc)).isoformat(),
        "p_metadata": metadata or {},
    }
    res = sb.rpc("apply_activity", payload).execute()
    # supabase-py returns {"data": <jsonb>, "error": ...} shape via PostgREST
    if res.data is None:
        raise RuntimeError(f"apply_activity failed: {res}")
    return res.data


def award_flashcard_session_xp(
    *,
    user_id: str,
    occurred_at: datetime | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    return apply_activity(
        user_id=user_id,
        activity_type="flashcard_session",
        xp_awarded=XP_FLASHCARD_SESSION,
        occurred_at=occurred_at,
        metadata={"session_id": session_id} if session_id else {},
    )


def award_quiz_completion_xp(
    *,
    user_id: str,
    correct: int,
    total: int,
    occurred_at: datetime | None = None,
    quiz_id: str | None = None,
) -> dict[str, Any]:
    if total <= 0:
        raise ValueError("total must be > 0")
    if correct < 0 or correct > total:
        raise ValueError("correct must be within [0, total]")

    perfect = correct == total
    xp = XP_QUIZ_COMPLETION + (XP_PERFECT_QUIZ_BONUS if perfect else 0)
    md: dict[str, Any] = {"correct": correct, "total": total, "perfect": perfect}
    if quiz_id:
        md["quiz_id"] = quiz_id
    return apply_activity(
        user_id=user_id,
        activity_type="quiz_completion",
        xp_awarded=xp,
        occurred_at=occurred_at,
        metadata=md,
    )

