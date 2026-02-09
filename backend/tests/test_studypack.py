"""
Simple script to test /generate-study-pack.

⚠️  WARNING: This script makes REAL API calls and WILL consume your Gemini quota!

Run this after starting the server to test the endpoint.
Run from backend folder:
    cd backend
    source venv/bin/activate
    python tests/test_study_pack.py
"""

import requests
import json
from typing import Dict, Any

# Configuration
BASE_URL = "http://localhost:8000"

# Sample study notes for testing
SAMPLE_NOTES = """
Photosynthesis is the process by which plants convert light energy into chemical energy.

Key components:
- Chlorophyll: Green pigment that absorbs light
- Chloroplasts: Organelles where photosynthesis occurs
- Stomata: Pores that allow gas exchange

The process has two main stages:

1. Light-dependent reactions (in thylakoid membranes):
   - Water molecules are split (photolysis)
   - Oxygen is released as a byproduct
   - ATP and NADPH are produced

2. Light-independent reactions (Calvin Cycle in stroma):
   - CO2 is fixed into organic molecules
   - Uses ATP and NADPH from light reactions
   - Produces glucose (C6H12O6)

Overall equation: 6CO2 + 6H2O + light energy → C6H12O6 + 6O2

Factors affecting photosynthesis rate:
- Light intensity
- CO2 concentration
- Temperature
- Water availability
"""

def test_generate_study_pack():
    """Test the main study pack generation endpoint."""
    print("\n🔍 Testing study pack generation...")
    print(f"Sending notes ({len(SAMPLE_NOTES)} characters)...")
    
    try:
        response = requests.post(
            f"{BASE_URL}/generate-study-pack",
            json={"text": SAMPLE_NOTES},
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        
        data = response.json()
        print("✅ Study pack generated successfully!")
        print("\n" + "="*60)
        print("STUDY PACK RESULTS")
        print("="*60)
        
        print(f"\n📋 SUMMARY:")
        for i, s in enumerate(data['summary']):
            print(f"- {s}")
        
        print(f"\n❓ QUIZ QUESTIONS ({len(data['quiz'])}):")
        for i, q in enumerate(data['quiz']):  # Show first 2
            print(f"\n   Question {i + 1}: {q['question']}")
            for j, option in enumerate(q['options']):
                if option == q['answer']:
                    marker = "✓"
                else:
                    marker = " "
                print(f"   [{marker}] {j}. {option}")
        
        print("\n" + "="*60)
        print("\n✅ All tests passed!")
        
    except requests.exceptions.HTTPError as e:
        print(f"❌ HTTP Error: {e}")
        print(f"Response: {e.response.text}")
    except Exception as e:
        print(f"❌ Error: {e}")


def test_validation():
    """Test input validation."""
    print("\n🔍 Testing input validation...")
    
    # Test empty notes
    print("   Testing empty notes...")
    try:
        response = requests.post(
            f"{BASE_URL}/generate-study-pack",
            json={"text": ""},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 422:
            print("   ✅ Empty notes rejected correctly")
        else:
            print(f"   ⚠️  Unexpected status code: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test whitespace-only notes
    print("   Testing whitespace-only notes...")
    try:
        response = requests.post(
            f"{BASE_URL}/generate-study-pack",
            json={"text": "   \n  \t  "},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 422:
            print("   ✅ Whitespace-only notes rejected correctly")
        else:
            print(f"   ⚠️  Unexpected status code: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    
    # Test too short notes
    print("   Testing too short notes...")
    try:
        response = requests.post(
            f"{BASE_URL}/generate-study-pack",
            json={"text": "Hi"},
            headers={"Content-Type": "application/json"}
        )
        if response.status_code == 422:
            print("   ✅ Too short notes rejected correctly")
        else:
            print(f"   ⚠️  Unexpected status code: {response.status_code}")
    except Exception as e:
        print(f"   ❌ Error: {e}")
    


def main():
    """Run all tests."""
    print("="*60)
    print("Study Pack Generator Test")
    print("="*60)
    
    # Check if server is running
    print("\n🔌 Checking if server is running...")
    try:
        requests.get(BASE_URL, timeout=2)
        print("✅ Server is running!\n")
    except requests.exceptions.ConnectionError:
        print("❌ Server is not running!")
        print("Please start the server first:")
        print("   python main.py")
        print("   or: uvicorn main:app --reload")
        
    
    # Run tests
    test_validation()
    test_generate_study_pack()

if __name__ == "__main__":
    main()