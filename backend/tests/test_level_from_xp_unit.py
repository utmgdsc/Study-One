"""Unit tests for level-from-XP formula (must match DB xp_to_level)."""
from __future__ import annotations

import pytest
from services.gamification import xp_to_level, xp_for_level


def test_level_1_at_zero_xp():
    assert xp_to_level(0) == 1
    assert xp_to_level(99) == 1


def test_level_2_at_100_xp():
    assert xp_for_level(2) == 100
    assert xp_to_level(100) == 2
    assert xp_to_level(219) == 2


def test_level_3_at_220_xp():
    assert xp_for_level(3) == 220
    assert xp_to_level(220) == 3
    assert xp_to_level(359) == 3


def test_level_4_at_360_xp():
    assert xp_for_level(4) == 360
    assert xp_to_level(360) == 4


def test_level_5_at_520_xp():
    assert xp_for_level(5) == 520
    assert xp_to_level(520) == 5


def test_xp_for_level_inverse():
    for level in range(1, 20):
        xp = xp_for_level(level)
        assert xp_to_level(xp) == level
        if level > 1:
            assert xp_to_level(xp - 1) == level - 1
