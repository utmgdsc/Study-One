"""
Unit tests for the GeminiService.

================================================================================
⚠️  API KEY CONSUMPTION WARNING
================================================================================

These unit tests use MOCKS and do NOT consume API quota.

To avoid accidental quota usage:
    - Run unit tests (this file) for regular development
    - Only run test_gemini_simple.py when you need to verify the API connection

================================================================================
HOW TO RUN TESTS
================================================================================

IMPORTANT: You must be in the backend/ directory to run these tests.

Start Virtual Environment:

Run all tests:
    pytest tests/test_gemini_unit.py -v

Run a specific test:
    pytest tests/test_gemini_unit.py::TestGeminiService::test_init_creates_model -v

================================================================================
HOW TO CREATE A NEW TEST
================================================================================

Sync test (regular function):
    def test_something_works(self):
        '''Test that something works correctly.'''
        # Arrange: Set up test data
        service = GeminiService()

        # Act: Call the method
        result = service.some_method()

        # Assert: Check the result
        assert result == expected_value

Async test (for async functions):
    @pytest.mark.asyncio
    async def test_async_method(self):
        '''Test an async method.'''
        service = GeminiService()

        # Mock external API calls to avoid real requests
        service.model.generate_content_async = AsyncMock(return_value=mock_response)

        result = await service.call_gemini("prompt")

        assert result == "expected"

Mocking tips:
    - MagicMock(): Creates a fake object with any attributes
    - AsyncMock(): Creates a fake async function
    - AsyncMock(side_effect=Exception("error")): Makes the mock raise an error

================================================================================

.pytest_cache folder contains the cache for the tests. It is used to speed up the tests.
Please ignore it.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock

from services.gemini import GeminiService


class TestGeminiService:
    """Test suite for GeminiService class."""

    # --------------------------------------------------
    # Initialization Tests
    # --------------------------------------------------

    def test_init_creates_model(self):
        """Test that GeminiService initializes with the correct model."""
        service = GeminiService()
        assert service.model is not None

    def test_init_with_custom_model(self):
        """Test that GeminiService accepts a custom model name."""
        service = GeminiService(model_name="gemini-1.5-pro")
        assert service.model is not None

    # --------------------------------------------------
    # API Call Tests (Success Cases)
    # --------------------------------------------------

    @pytest.mark.asyncio
    async def test_call_gemini_returns_text_on_success(self):
        """Test that call_gemini returns the response text on success."""
        service = GeminiService()
        
        # Mock the model's generate_content_async method
        mock_response = MagicMock()
        mock_response.text = "This is a test response from Gemini."
        service.model.generate_content_async = AsyncMock(return_value=mock_response)
        
        result = await service.call_gemini("Test prompt")
        
        assert result == "This is a test response from Gemini."
        service.model.generate_content_async.assert_called_once_with("Test prompt")

    # --------------------------------------------------
    # API Call Tests (Error Handling)
    # --------------------------------------------------

    @pytest.mark.asyncio
    async def test_call_gemini_returns_none_on_error(self):
        """Test that call_gemini returns None when an error occurs."""
        service = GeminiService()
        
        # Mock the model to raise an exception
        service.model.generate_content_async = AsyncMock(
            side_effect=Exception("API Error")
        )
        
        result = await service.call_gemini("Test prompt")
        
        assert result is None

    @pytest.mark.asyncio
    async def test_call_gemini_handles_rate_limit_error(self):
        """Test that call_gemini handles rate limit errors gracefully."""
        service = GeminiService()
        
        # Mock a rate limit error
        service.model.generate_content_async = AsyncMock(
            side_effect=Exception("429 Rate limit exceeded")
        )
        
        result = await service.call_gemini("Test prompt")
        
        assert result is None
