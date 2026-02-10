#!/bin/bash
# Manual test script for POST /api/v1/generate (curl)
# Run with backend: cd backend && source venv/bin/activate && uvicorn main:app --port 8000
# Requires: GEMINI_API_KEY (tokens) in backend/.env or Study-One/.env for generate tests

BASE_URL="http://127.0.0.1:8000"
PASSED=0
FAILED=0

test_req() {
    local name="$1"
    local body="$2"
    local expected="$3"
    echo ""
    echo "--- $name ---"
    resp=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/generate" \
        -H "Content-Type: application/json" -d "$body")
    status=$(echo "$resp" | tail -n1)
    content=$(echo "$resp" | sed '$d')
    if [ "$status" = "$expected" ]; then
        echo "PASS: Status $status"
        ((PASSED++))
    else
        echo "FAIL: Expected $expected, got $status"
        ((FAILED++))
    fi
    echo "Response: ${content:0:200}..."
}

echo "=== Study Generation Endpoint Manual Tests ==="
echo "Backend must be running at $BASE_URL"
echo ""

# 1. Short notes
test_req "Short notes" '{"text":"Photosynthesis converts light into chemical energy."}' 200

# 2. Longer notes
test_req "Longer notes" '{"text":"The French Revolution (1789-1799) was a period of radical social and political upheaval. Key causes included financial crisis and Enlightenment ideas. Napoleon eventually rose to power."}' 200

# 3. Empty text
test_req "Empty text (validation)" '{"text":""}' 422

# 4. Whitespace-only
test_req "Whitespace-only (validation)" '{"text":"   "}' 422

# 5. Missing text
test_req "Missing text field" '{}' 422

# 6. Invalid JSON
test_req "Invalid JSON body" 'not json' 422

echo ""
echo "=== Summary ==="
echo "Passed: $PASSED, Failed: $FAILED"
[ $FAILED -gt 0 ] && exit 1
exit 0
