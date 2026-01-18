#!/bin/bash

# Rate Limiter API - curl Examples
# Base URL for the API
BASE_URL="http://localhost:8080"

echo "========================================="
echo "Rate Limiter API - curl Examples"
echo "========================================="
echo ""

# 1. Health Check
echo "1. Health Check"
echo "GET $BASE_URL/api/health"
curl -s "$BASE_URL/api/health" | jq .
echo ""

# 2. Get Metrics
echo "2. Get Metrics"
echo "GET $BASE_URL/api/metrics"
curl -s "$BASE_URL/api/metrics" | jq .
echo ""

# 3. Check Rate Limit (Allow)
echo "3. Check Rate Limit (Should Allow)"
echo "POST $BASE_URL/api/v1/limiter/check"
curl -s -X POST "$BASE_URL/api/v1/limiter/check" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "user-123",
    "capacity": 10,
    "refillRate": 2
  }' | jq .
echo ""

# 4. Get Limiter Status
echo "4. Get Limiter Status"
echo "GET $BASE_URL/api/v1/limiter/status/user-123"
curl -s "$BASE_URL/api/v1/limiter/status/user-123" | jq .
echo ""

# 5. Apply Penalty
echo "5. Apply Penalty (Bad Behavior)"
echo "POST $BASE_URL/api/v1/limiter/penalty"
curl -s -X POST "$BASE_URL/api/v1/limiter/penalty" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "user-123",
    "points": 3
  }' | jq .
echo ""

# 6. Apply Reward
echo "6. Apply Reward (Good Behavior)"
echo "POST $BASE_URL/api/v1/limiter/reward"
curl -s -X POST "$BASE_URL/api/v1/limiter/reward" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "user-123",
    "points": 2
  }' | jq .
echo ""

# 7. Block a Key
echo "7. Block a Key (Spam Detection)"
echo "POST $BASE_URL/api/v1/limiter/block"
curl -s -X POST "$BASE_URL/api/v1/limiter/block" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "spammer-456",
    "duration": 60000
  }' | jq .
echo ""

# 8. Check Blocked Key (Should be blocked)
echo "8. Check Blocked Key (Should Return 429)"
echo "POST $BASE_URL/api/v1/limiter/check"
curl -s -X POST "$BASE_URL/api/v1/limiter/check" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "spammer-456"
  }' | jq .
echo ""

# 9. Unblock a Key
echo "9. Unblock a Key"
echo "POST $BASE_URL/api/v1/limiter/unblock"
curl -s -X POST "$BASE_URL/api/v1/limiter/unblock" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "spammer-456"
  }' | jq .
echo ""

# 10. Reset Limiter
echo "10. Reset Limiter (Refill Tokens)"
echo "POST $BASE_URL/api/v1/limiter/reset/user-123"
curl -s -X POST "$BASE_URL/api/v1/limiter/reset/user-123" | jq .
echo ""

# 11. List All Limiters
echo "11. List All Limiters"
echo "GET $BASE_URL/api/v1/limiters"
curl -s "$BASE_URL/api/v1/limiters" | jq .
echo ""

# 12. Delete Limiter
echo "12. Delete Limiter"
echo "DELETE $BASE_URL/api/v1/limiter/user-123"
curl -s -X DELETE "$BASE_URL/api/v1/limiter/user-123" | jq .
echo ""

# 13. Rate Limit Exhaustion Demo
echo "13. Rate Limit Exhaustion Demo (10 requests with capacity=5)"
for i in {1..10}; do
  echo "Request #$i:"
  curl -s -X POST "$BASE_URL/api/v1/limiter/check" \
    -H "Content-Type: application/json" \
    -d '{
      "key": "demo-user",
      "capacity": 5,
      "refillRate": 1
    }' | jq -c '{allowed: .allowed, tokens: .tokens, status: .status}'
done
echo ""

echo "========================================="
echo "All examples completed!"
echo "========================================="
