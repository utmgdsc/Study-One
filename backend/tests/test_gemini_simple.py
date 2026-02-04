"""
Simple script to test Gemini API connection.

⚠️  WARNING: This script makes REAL API calls and WILL consume your Gemini quota!

   For regular testing, use test_gemini_unit.py (uses mocks, no API calls).

Run from backend folder:
    cd backend
    source venv/bin/activate
    python tests/test_gemini_simple.py
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path so we can import services
sys.path.insert(0, str(Path(__file__).parent.parent))

from services.gemini import GeminiService


async def main():
    print("=" * 50)
    print("⚠️  WARNING: This makes REAL API calls!")
    print("   This WILL consume your Gemini API quota.")
    print("=" * 50)
    print("Testing Gemini API Connection")
    print("=" * 50)
    
    service = GeminiService()
    
    prompt = "Say 'Hello, Socrato!' and nothing else."
    print(f"\nSending prompt: {prompt}")
    print("-" * 50)
    
    response = await service.call_gemini(prompt)
    
    if response:
        print(f"✅ Success! Response:\n{response}")
    else:
        print("❌ Failed to get response from Gemini.")
        print("   Check your API key and quota.")
        sys.exit(1)
    
    print("-" * 50)
    print("Test complete!")


if __name__ == "__main__":
    asyncio.run(main())
