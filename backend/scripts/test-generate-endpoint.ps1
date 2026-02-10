# Manual test script for POST /api/v1/generate
# Run with backend server: cd backend && .\venv\Scripts\Activate.ps1; uvicorn main:app --port 8000
# Requires: GEMINI_API_KEY (tokens) in backend/.env or Study-One/.env for generate tests

$baseUrl = "http://127.0.0.1:8000"
$passed = 0
$failed = 0

function Test-Endpoint {
    param([string]$Name, [string]$Body, [int]$ExpectedStatus, [switch]$ExpectSuccess)
    Write-Host "`n--- $Name ---" -ForegroundColor Cyan
    try {
        $response = Invoke-WebRequest -Uri "$baseUrl/api/v1/generate" -Method POST `
            -ContentType "application/json" -Body $Body -UseBasicParsing
        $status = $response.StatusCode
        $content = $response.Content
    } catch {
        $status = [int]$_.Exception.Response.StatusCode
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $content = $reader.ReadToEnd()
    }
    $ok = ($status -eq $ExpectedStatus)
    if ($ok) {
        Write-Host "PASS: Status $status" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "FAIL: Expected $ExpectedStatus, got $status" -ForegroundColor Red
        $script:failed++
    }
    Write-Host "Response: $($content.Substring(0, [Math]::Min(200, $content.Length)))..."
    if ($ExpectSuccess -and $ok) {
        $json = $content | ConvertFrom-Json
        if ($json.summary -and $json.quiz) {
            Write-Host "Structure OK: summary ($($json.summary.Count) items), quiz ($($json.quiz.Count) items)" -ForegroundColor Green
        } else {
            Write-Host "Structure INVALID: missing summary or quiz" -ForegroundColor Red
            $script:failed++
        }
    }
}

Write-Host "`n=== Study Generation Endpoint Manual Tests ===" -ForegroundColor Yellow
Write-Host "Backend must be running at $baseUrl`n"

# 1. Short notes
$shortNotes = @{ text = "Photosynthesis converts light into chemical energy. Plants use chlorophyll." } | ConvertTo-Json
Test-Endpoint -Name "Short notes" -Body $shortNotes -ExpectedStatus 200 -ExpectSuccess

# 2. Longer notes
$longNotes = @{
    text = @"
The French Revolution (1789-1799) was a period of radical social and political upheaval in France.
Key causes included financial crisis, inequality, and Enlightenment ideas. The storming of the
Bastille on July 14, 1789 marked the start. The Declaration of the Rights of Man was adopted.
The Reign of Terror saw mass executions. Napoleon Bonaparte eventually rose to power.
"@
} | ConvertTo-Json
Test-Endpoint -Name "Longer notes" -Body $longNotes -ExpectedStatus 200 -ExpectSuccess

# 3. Empty text - validation error
Test-Endpoint -Name "Empty text (validation)" -Body '{"text":""}' -ExpectedStatus 422

# 4. Whitespace-only text - validation error
Test-Endpoint -Name "Whitespace-only (validation)" -Body '{"text":"   "}' -ExpectedStatus 422

# 5. Missing text field
Test-Endpoint -Name "Missing text field" -Body '{}' -ExpectedStatus 422

# 6. Invalid JSON body
Test-Endpoint -Name "Invalid JSON body" -Body 'not json' -ExpectedStatus 422

Write-Host "`n=== Summary ===" -ForegroundColor Yellow
Write-Host "Passed: $passed, Failed: $failed"
if ($failed -gt 0) { exit 1 }
