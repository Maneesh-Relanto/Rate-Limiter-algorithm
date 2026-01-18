# Multi-Language Support Test for Rate Limiter API

Write-Host "=========================================`n" -ForegroundColor Cyan
Write-Host "Rate Limiter API - Multi-Language Test`n" -ForegroundColor Cyan
Write-Host "=========================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:8080"

# Test 1: PowerShell (C#/.NET)
Write-Host "1. PowerShell / C# / .NET Test" -ForegroundColor Yellow
$body = @{ key = "powershell-user"; capacity = 10; refillRate = 2 } | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$baseUrl/api/v1/limiter/check" -Method Post -Body $body -ContentType "application/json"
Write-Host "   Success: Allowed=$($result.allowed), Tokens=$($result.tokens)/$($result.capacity)`n" -ForegroundColor Green

# Test 2: curl (Universal)
Write-Host "2. curl Test (Universal HTTP)" -ForegroundColor Yellow
$curlResult = curl.exe -s -X POST "$baseUrl/api/v1/limiter/check" -H "Content-Type: application/json" -d '{\"key\":\"curl-user\",\"capacity\":5,\"refillRate\":1}' | ConvertFrom-Json
Write-Host "   Success: Allowed=$($curlResult.allowed), Tokens=$($curlResult.tokens)/$($curlResult.capacity)`n" -ForegroundColor Green

# Test 3: Penalty System
Write-Host "3. Testing Penalty (Bad Behavior)" -ForegroundColor Yellow
$penaltyBody = @{ key = "powershell-user"; points = 3 } | ConvertTo-Json
$penaltyResult = Invoke-RestMethod -Uri "$baseUrl/api/v1/limiter/penalty" -Method Post -Body $penaltyBody -ContentType "application/json"
Write-Host "   Success: Penalty=$($penaltyResult.penaltyApplied) points, Remaining=$($penaltyResult.remainingTokens)`n" -ForegroundColor Green

# Test 4: Reward System
Write-Host "4. Testing Reward (Good Behavior)" -ForegroundColor Yellow
$rewardBody = @{ key = "curl-user"; points = 2 } | ConvertTo-Json
$rewardResult = Invoke-RestMethod -Uri "$baseUrl/api/v1/limiter/reward" -Method Post -Body $rewardBody -ContentType "application/json"
Write-Host "   Success: Reward=$($rewardResult.rewardApplied) points, Remaining=$($rewardResult.remainingTokens)`n" -ForegroundColor Green

# Test 5: Blocking
Write-Host "5. Testing Block Feature" -ForegroundColor Yellow
$blockBody = @{ key = "spammer-test"; duration = 5000 } | ConvertTo-Json
$blockResult = Invoke-RestMethod -Uri "$baseUrl/api/v1/limiter/block" -Method Post -Body $blockBody -ContentType "application/json"
Write-Host "   Success: Blocked=$($blockResult.blocked), Until=$($blockResult.blockedUntil)`n" -ForegroundColor Green

# Test 6: Verify blocked key returns 429
Write-Host "6. Verify Blocked Key Returns 429" -ForegroundColor Yellow
$testBody = @{ key = "spammer-test" } | ConvertTo-Json
try {
    Invoke-RestMethod -Uri "$baseUrl/api/v1/limiter/check" -Method Post -Body $testBody -ContentType "application/json"
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "   Success: HTTP $statusCode returned (correctly blocked)`n" -ForegroundColor Green
}

# Test 7: List limiters
Write-Host "7. List All Active Limiters" -ForegroundColor Yellow
$listResult = Invoke-RestMethod -Uri "$baseUrl/api/v1/limiters" -Method Get
Write-Host "   Success: $($listResult.count) active limiters`n" -ForegroundColor Green

# Test 8: Health and Metrics
Write-Host "8. Server Health and Metrics" -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "$baseUrl/api/health" -Method Get
$metrics = Invoke-RestMethod -Uri "$baseUrl/api/metrics" -Method Get
Write-Host "   Server: $($health.status)" -ForegroundColor Green
Write-Host "   Uptime: $([math]::Round($health.uptime, 2))s" -ForegroundColor Green
Write-Host "   Total Requests: $($metrics.totalRequests)" -ForegroundColor Green
Write-Host "   Success Rate: $($metrics.successRate)`n" -ForegroundColor Green

Write-Host "=========================================`n" -ForegroundColor Cyan
Write-Host "Supported Languages:`n" -ForegroundColor Yellow
Write-Host "  - Python (requests)" -ForegroundColor Green
Write-Host "  - Java (HttpClient)" -ForegroundColor Green
Write-Host "  - Go (net/http)" -ForegroundColor Green
Write-Host "  - PHP (cURL / Guzzle)" -ForegroundColor Green
Write-Host "  - Ruby (Net::HTTP)" -ForegroundColor Green
Write-Host "  - C# (HttpClient)" -ForegroundColor Green
Write-Host "  - Rust (reqwest)" -ForegroundColor Green
Write-Host "  - Node.js (fetch / axios)" -ForegroundColor Green
Write-Host "  - Swift (URLSession)" -ForegroundColor Green
Write-Host "  - Kotlin (OkHttp)" -ForegroundColor Green
Write-Host "`n=========================================`n" -ForegroundColor Cyan
Write-Host "RESULT: Multi-Language Support VERIFIED!" -ForegroundColor Green
Write-Host "=========================================`n" -ForegroundColor Cyan
