"""
Pytest configuration for Socrato backend tests.
This file is used to remove the google-generativeai deprecation warning that does 
not reflect on the quality of our code.

This file is automatically loaded by pytest when running tests from this folder.
"""

import pytest


def pytest_configure(config):
    """Configure pytest settings."""
    # Filter out the google-generativeai deprecation warning
    config.addinivalue_line(
        "filterwarnings", "ignore::FutureWarning"
    )
