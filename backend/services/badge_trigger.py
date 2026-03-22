"""
Badge Trigger System 4.3: evaluate user stats against badge rules and grant badges.

- Listens for engagement (call evaluate_and_award after activity/XP updates).
- Evaluates conditions from a modular registry (slug -> predicate).
- Persists to user_badges; prevents duplicates.
- Logs each newly granted badge.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from services.supabase import get_supabase

logger = logging.getLogger(__name__)

# Type for user_stats dict as returned from apply_activity / DB (snake_case)
StatsDict = dict[str, Any]

# Condition: (stats) -> True if badge should be granted. Stats have xp_total, current_streak_days, longest_streak_days.
BadgeCondition = Callable[[StatsDict], bool]

# Registry: slug -> condition. New badges = add row in DB + add entry here.
BADGE_CONDITIONS: dict[str, BadgeCondition] = {}

def _xp(stats: StatsDict) -> int:
    return int(stats.get("xp_total") or 0)

def _current_streak(stats: StatsDict) -> int:
    return int(stats.get("current_streak_days") or 0)

def _longest_streak(stats: StatsDict) -> int:
    return int(stats.get("longest_streak_days") or 0)


def _register_default_conditions() -> None:
    """Register all badge conditions. Kept in one place so new badges only add here + DB row."""
    BADGE_CONDITIONS.update({
        "getting_started": lambda s: _xp(s) >= 0,
        "first_xp": lambda s: _xp(s) > 0,
        "50_xp": lambda s: _xp(s) >= 50,
        "100_xp": lambda s: _xp(s) >= 100,
        "500_xp": lambda s: _xp(s) >= 500,
        "streak_7": lambda s: _current_streak(s) >= 7,
        "streak_14": lambda s: _current_streak(s) >= 14,
        "streak_30": lambda s: _current_streak(s) >= 30,
        "consistency_14": lambda s: _longest_streak(s) >= 14,
        "on_a_roll_30": lambda s: _longest_streak(s) >= 30,
        "scholar_1000": lambda s: _xp(s) >= 1000,
        "mastery_5000": lambda s: _xp(s) >= 5000,
        "legend_10000": lambda s: _xp(s) >= 10000,
    })


def _ensure_conditions() -> None:
    if not BADGE_CONDITIONS:
        _register_default_conditions()


def register_condition(slug: str, condition: BadgeCondition) -> None:
    """Register a condition for a badge slug. Allows adding triggers without changing core logic."""
    _ensure_conditions()
    BADGE_CONDITIONS[slug] = condition


def evaluate_and_award(user_id: str, user_stats: StatsDict | None = None) -> list[dict[str, Any]]:
    """
    Evaluate all badge conditions for a user and grant any newly earned badges.

    - If user_stats is provided (e.g. from apply_activity response), uses it.
    - Otherwise fetches user_stats from DB.
    - Fetches badges and existing user_badges; for each badge not yet granted,
      evaluates condition and inserts into user_badges if met (no duplicates).
    - Logs each newly granted badge.
    Returns list of newly granted badge records (e.g. [{"slug": "first_xp", "badge_id": 2}, ...]).
    """
    _ensure_conditions()
    sb = get_supabase()

    if user_stats is None:
        row = (
            sb.table("user_stats")
            .select("xp_total, current_streak_days, longest_streak_days")
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if not row.data:
            return []
        user_stats = row.data

    # Fetch all badges (slug -> id)
    badges_res = sb.table("badges").select("id, slug").execute()
    badges_by_slug = {b["slug"]: b["id"] for b in (badges_res.data or [])}

    # Already granted badge_ids for this user
    ub_res = sb.table("user_badges").select("badge_id").eq("user_id", user_id).execute()
    granted_ids = {r["badge_id"] for r in (ub_res.data or [])}

    granted: list[dict[str, Any]] = []
    for slug, condition in BADGE_CONDITIONS.items():
        badge_id = badges_by_slug.get(slug)
        if badge_id is None:
            continue
        if badge_id in granted_ids:
            continue
        if not condition(user_stats):
            continue
        try:
            sb.table("user_badges").insert({
                "user_id": user_id,
                "badge_id": badge_id,
            }).execute()
            granted_ids.add(badge_id)
            record = {"slug": slug, "badge_id": badge_id}
            granted.append(record)
            logger.info("Badge granted: user_id=%s slug=%s badge_id=%s", user_id, slug, badge_id)
        except Exception as e:
            # Likely duplicate from race; ignore. Otherwise log and continue.
            if "duplicate" in str(e).lower() or "unique" in str(e).lower():
                granted_ids.add(badge_id)
            else:
                logger.warning("Failed to grant badge user_id=%s slug=%s: %s", user_id, slug, e)
    return granted
