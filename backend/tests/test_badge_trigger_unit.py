"""
Unit tests for Badge Trigger System 4.3: condition evaluation and badge assignment.
"""

import pytest
from unittest.mock import MagicMock, patch

from services.badge_trigger import (
    BADGE_CONDITIONS,
    _ensure_conditions,
    register_condition,
    evaluate_and_award,
)


@pytest.fixture(autouse=True)
def ensure_conditions():
    _ensure_conditions()
    yield


class TestBadgeConditions:
    """Test that each badge condition evaluates correctly from user_stats."""

    def test_getting_started_earned_at_zero_xp(self):
        assert BADGE_CONDITIONS["getting_started"]({"xp_total": 0, "current_streak_days": 0, "longest_streak_days": 0}) is True

    def test_first_xp_not_earned_at_zero(self):
        assert BADGE_CONDITIONS["first_xp"]({"xp_total": 0}) is False

    def test_first_xp_earned_after_any_xp(self):
        assert BADGE_CONDITIONS["first_xp"]({"xp_total": 1}) is True
        assert BADGE_CONDITIONS["first_xp"]({"xp_total": 25}) is True

    def test_50_xp_threshold(self):
        assert BADGE_CONDITIONS["50_xp"]({"xp_total": 49}) is False
        assert BADGE_CONDITIONS["50_xp"]({"xp_total": 50}) is True
        assert BADGE_CONDITIONS["50_xp"]({"xp_total": 51}) is True

    def test_100_xp_and_500_xp_thresholds(self):
        assert BADGE_CONDITIONS["100_xp"]({"xp_total": 99}) is False
        assert BADGE_CONDITIONS["100_xp"]({"xp_total": 100}) is True
        assert BADGE_CONDITIONS["500_xp"]({"xp_total": 500}) is True
        assert BADGE_CONDITIONS["500_xp"]({"xp_total": 499}) is False

    def test_streak_conditions(self):
        stats_7 = {"xp_total": 0, "current_streak_days": 7, "longest_streak_days": 7}
        assert BADGE_CONDITIONS["streak_7"](stats_7) is True
        assert BADGE_CONDITIONS["streak_14"](stats_7) is False
        stats_14 = {"current_streak_days": 14, "longest_streak_days": 14}
        assert BADGE_CONDITIONS["streak_14"](stats_14) is True
        assert BADGE_CONDITIONS["streak_30"]({"current_streak_days": 30}) is True

    def test_longest_streak_conditions(self):
        assert BADGE_CONDITIONS["consistency_14"]({"longest_streak_days": 14}) is True
        assert BADGE_CONDITIONS["consistency_14"]({"longest_streak_days": 13}) is False
        assert BADGE_CONDITIONS["on_a_roll_30"]({"longest_streak_days": 30}) is True

    def test_scholar_mastery_legend(self):
        assert BADGE_CONDITIONS["scholar_1000"]({"xp_total": 1000}) is True
        assert BADGE_CONDITIONS["scholar_1000"]({"xp_total": 999}) is False
        assert BADGE_CONDITIONS["mastery_5000"]({"xp_total": 5000}) is True
        assert BADGE_CONDITIONS["legend_10000"]({"xp_total": 10000}) is True
        assert BADGE_CONDITIONS["legend_10000"]({"xp_total": 9999}) is False

    def test_stats_missing_keys_treated_as_zero(self):
        assert BADGE_CONDITIONS["first_xp"]({}) is False
        assert BADGE_CONDITIONS["getting_started"]({}) is True
        assert BADGE_CONDITIONS["streak_7"]({}) is False


class TestEvaluateAndAward:
    """Test evaluate_and_award with mocked Supabase: correct inserts and no duplicates."""

    def test_grants_earned_badges_and_persists(self):
        user_id = "user-1"
        user_stats = {"xp_total": 50, "current_streak_days": 0, "longest_streak_days": 0}
        badges_data = [
            {"id": 1, "slug": "getting_started"},
            {"id": 2, "slug": "first_xp"},
            {"id": 3, "slug": "50_xp"},
        ]
        user_badges_data = []
        insert_calls = []

        def table(name):
            t = MagicMock()
            if name == "badges":
                t.select.return_value.execute.return_value.data = badges_data
            elif name == "user_badges":
                t.select.return_value.eq.return_value.execute.return_value.data = user_badges_data
                t.insert.return_value.execute.side_effect = lambda: insert_calls.append(1) or MagicMock()
            return t
        mock_sb = MagicMock()
        mock_sb.table.side_effect = table

        with patch("services.badge_trigger.get_supabase", return_value=mock_sb):
            granted = evaluate_and_award(user_id, user_stats=user_stats)

        assert len(granted) == 3  # getting_started, first_xp, 50_xp
        slugs = {g["slug"] for g in granted}
        assert slugs == {"getting_started", "first_xp", "50_xp"}
        assert len(insert_calls) == 3

    def test_does_not_duplicate_already_granted_badges(self):
        user_id = "user-2"
        user_stats = {"xp_total": 100, "current_streak_days": 0, "longest_streak_days": 0}
        insert_calls = []

        def table(name):
            t = MagicMock()
            if name == "badges":
                t.select.return_value.execute.return_value.data = [
                    {"id": 1, "slug": "getting_started"},
                    {"id": 2, "slug": "first_xp"},
                    {"id": 3, "slug": "100_xp"},
                ]
            elif name == "user_badges":
                t.select.return_value.eq.return_value.execute.return_value.data = [
                    {"badge_id": 1},
                    {"badge_id": 2},
                ]
                t.insert.return_value.execute.side_effect = lambda: insert_calls.append(1) or MagicMock()
            return t
        mock_sb = MagicMock()
        mock_sb.table.side_effect = table

        with patch("services.badge_trigger.get_supabase", return_value=mock_sb):
            granted = evaluate_and_award(user_id, user_stats=user_stats)

        assert len(granted) == 1
        assert granted[0]["slug"] == "100_xp"
        assert len(insert_calls) == 1

    def test_returns_empty_when_no_user_stats(self):
        def table(name):
            t = MagicMock()
            if name == "user_stats":
                t.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None
            return t
        mock_sb = MagicMock()
        mock_sb.table.side_effect = table

        with patch("services.badge_trigger.get_supabase", return_value=mock_sb):
            granted = evaluate_and_award("user-no-stats", user_stats=None)

        assert granted == []


class TestRegisterCondition:
    """Test modular registration of new badge conditions."""

    def test_register_adds_new_condition(self):
        def custom_condition(stats):
            return (stats.get("xp_total") or 0) >= 999
        register_condition("custom_999", custom_condition)
        assert "custom_999" in BADGE_CONDITIONS
        assert BADGE_CONDITIONS["custom_999"]({"xp_total": 999}) is True
        assert BADGE_CONDITIONS["custom_999"]({"xp_total": 998}) is False
