# 🎯 Best Practices for Rate Limiting

## Table of Contents
1. [Choosing the Right Algorithm](#choosing-the-right-algorithm)
2. [Setting Appropriate Limits](#setting-appropriate-limits)
3. [Implementation Guidelines](#implementation-guidelines)
4. [Distributed Systems](#distributed-systems)
5. [User Experience](#user-experience)
6. [Monitoring & Alerting](#monitoring--alerting)
7. [Security Considerations](#security-considerations)
8. [Testing Strategies](#testing-strategies)

---

## Choosing the Right Algorithm

### Decision Framework

```
┌─────────────────────────────────────┐
│ Need perfect accuracy?              │
│ (e.g., payments, compliance)        │
└────────┬───────────────────┬────────┘
         │ YES               │ NO
         ↓                   ↓
   Sliding Window Log    Token Bucket
                         or Sliding 
                         Window Counter
```

### By Application Type

**REST APIs (Public)**
- **Recommended**: Sliding Window Counter
- **Why**: Balance of accuracy, performance, memory
- **Config**: 100-1000 req/min per user

**WebSocket/Real-time**
- **Recommended**: Token Bucket
- **Why**: Handles bursts, fast decisions
- **Config**: Large bucket, high refill rate

**Background Jobs**
- **Recommended**: Leaky Bucket
- **Why**: Constant processing rate
- **Config**: Match processing capacity

**Authentication Endpoints**
- **Recommended**: Token Bucket with backoff
- **Why**: Allow retries, prevent brute force
- **Config**: 5-10 attempts per 15 minutes

**Payment Processing**
- **Recommended**: Sliding Window Log
- **Why**: Perfect accuracy required
- **Config**: Very strict, consider user tier

---

## Setting Appropriate Limits

### Capacity Planning

```
Calculate safe limit:
─────────────────────
1. Measure system capacity (requests/sec)
2. Set limit to 70-80% of capacity
3. Add buffer for spikes
4. Test under load
```

### Example Calculation

```javascript
// System can handle 10,000 req/sec
const systemCapacity = 10000;

// Use 75% for safety
const safeCapacity = systemCapacity * 0.75; // 7,500

// Per-user limit (1000 users)
const expectedUsers = 1000;
const perUserLimit = safeCapacity / expectedUsers; // 7.5 req/sec

// Round down for safety
const finalLimit = Math.floor(perUserLimit); // 7 req/sec per user
```

### Tiered Limits

```yaml
# Example tier structure
tiers:
  free:
    requests: 100
    period: hour
    burst: 20
  
  pro:
    requests: 1000
    period: hour
    burst: 100
  
  enterprise:
    requests: 10000
    period: hour
    burst: 500
```

### Time-based Adjustments

```javascript
// Higher limits during off-peak hours
function getLimit(hour) {
  const peakHours = [9, 10, 11, 12, 13, 14, 15, 16, 17]; // 9am-5pm
  const baseLimit = 100;
  
  return peakHours.includes(hour) 
    ? baseLimit           // Peak: strict
    : baseLimit * 1.5;    // Off-peak: relaxed
}
```

---

## Implementation Guidelines

### 1. Start Simple

```javascript
// ✅ Good - Start with simple implementation
class SimpleRateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.requests = new Map();
  }
  
  isAllowed(userId) {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    
    // Remove old requests
    const validRequests = userRequests.filter(
      time => now - time < this.windowMs
    );
    
    if (validRequests.length < this.limit) {
      validRequests.push(now);
      this.requests.set(userId, validRequests);
      return true;
    }
    
    return false;
  }
}

// ❌ Bad - Over-engineering from start
// Don't start with complex distributed system
// unless you actually need it
```

### 2. Fail Open vs Fail Closed

```javascript
// Fail Open (Recommended for non-critical)
try {
  if (rateLimiter.isAllowed(userId)) {
    return processRequest();
  }
  return rejectRequest();
} catch (error) {
  logger.error('Rate limiter error', error);
  return processRequest(); // Allow on error
}

// Fail Closed (For security-critical)
try {
  if (rateLimiter.isAllowed(userId)) {
    return processRequest();
  }
  return rejectRequest();
} catch (error) {
  logger.error('Rate limiter error', error);
  return rejectRequest(); // Reject on error
}
```

### 3. Atomic Operations

```javascript
// ✅ Good - Atomic increment
async function checkRateLimit(userId) {
  const key = `rate_limit:${userId}`;
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, 60); // Set expiry on first request
  }
  
  return current <= LIMIT;
}

// ❌ Bad - Race condition
async function checkRateLimit(userId) {
  const current = await redis.get(key);
  if (current < LIMIT) {
    await redis.incr(key); // Race condition here!
    return true;
  }
  return false;
}
```

### 4. Memory Management

```javascript
// ✅ Good - Automatic cleanup
class RateLimiter {
  constructor() {
    this.data = new Map();
    
    // Cleanup every minute
    setInterval(() => this.cleanup(), 60000);
  }
  
  cleanup() {
    const now = Date.now();
    for (const [key, value] of this.data.entries()) {
      if (now - value.lastAccess > 3600000) { // 1 hour
        this.data.delete(key);
      }
    }
  }
}

// ❌ Bad - Memory leak
class RateLimiter {
  constructor() {
    this.data = new Map();
    // Never cleaned up!
  }
}
```

---

## Distributed Systems

### Using Redis

```javascript
// Sliding window with Redis
async function checkRateLimit(userId, limit, windowSec) {
  const key = `rate_limit:${userId}`;
  const now = Date.now();
  const windowStart = now - (windowSec * 1000);
  
  const multi = redis.multi();
  
  // Remove old entries
  multi.zremrangebyscore(key, 0, windowStart);
  
  // Count current requests
  multi.zcard(key);
  
  // Add new request
  multi.zadd(key, now, `${now}-${Math.random()}`);
  
  // Set expiry
  multi.expire(key, windowSec);
  
  const results = await multi.exec();
  const currentCount = results[1][1];
  
  return currentCount < limit;
}
```

### Handling Clock Skew

```javascript
// Use Redis time instead of local time
async function checkRateLimit(userId) {
  const redisTime = await redis.time(); // [seconds, microseconds]
  const timestamp = redisTime[0] * 1000 + Math.floor(redisTime[1] / 1000);
  
  // Use timestamp for rate limiting logic
  return processWithTimestamp(timestamp);
}
```

### Distributed Consensus

```javascript
// Lua script for atomic rate limiting
const luaScript = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local current = redis.call('INCR', key)
if current == 1 then
    redis.call('EXPIRE', key, window)
end

if current > limit then
    return 0
end

return 1
`;

// Use script
const allowed = await redis.eval(
  luaScript,
  1,
  `rate_limit:${userId}`,
  limit,
  windowSec,
  Date.now()
);
```

---

## User Experience

### Informative Error Responses

```javascript
// ✅ Good - Helpful error message
{
  "error": "Rate limit exceeded",
  "message": "Too many requests. Please try again later.",
  "retryAfter": 45,  // seconds
  "limit": 100,
  "remaining": 0,
  "reset": 1609459200  // Unix timestamp
}

// ❌ Bad - Cryptic error
{
  "error": "429"
}
```

### Response Headers

```javascript
// Include rate limit info in headers
app.use((req, res, next) => {
  const limit = req.rateLimit.limit;
  const remaining = req.rateLimit.remaining;
  const reset = req.rateLimit.reset;
  
  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', reset);
  
  if (remaining === 0) {
    res.setHeader('Retry-After', Math.ceil((reset - Date.now()) / 1000));
  }
  
  next();
});
```

### Graceful Degradation

```javascript
// Reduce functionality instead of complete block
if (!rateLimiter.isAllowed(userId)) {
  // Still allow access but with reduced features
  return {
    data: getCachedData(),  // Return cached data
    features: ['read-only'],  // Disable writes
    warning: 'Rate limit reached. Some features disabled.'
  };
}
```

---

## Monitoring & Alerting

### Key Metrics

```javascript
// Metrics to track
const metrics = {
  // Rate limiting specific
  requests_total: counter,
  requests_allowed: counter,
  requests_rejected: counter,
  rejection_rate: gauge,
  
  // Performance
  rate_limit_check_duration: histogram,
  rate_limit_errors: counter,
  
  // User behavior
  unique_users_rate_limited: counter,
  repeated_violations: counter
};
```

### Alert Thresholds

```yaml
alerts:
  # High rejection rate
  - name: HighRejectionRate
    condition: rejection_rate > 0.3  # 30%
    duration: 5m
    severity: warning
    message: "High rate limit rejection rate"
  
  # Rate limiter errors
  - name: RateLimiterErrors
    condition: rate_limit_errors > 10
    duration: 1m
    severity: critical
    message: "Rate limiter experiencing errors"
  
  # Suspicious activity
  - name: SuspiciousActivity
    condition: repeated_violations > 100
    duration: 5m
    severity: warning
    message: "Possible DDoS or abuse"
```

### Dashboard Example

```
Rate Limiting Dashboard
──────────────────────────────────────────
Requests/sec:     1,234 ▲ 12%
Allowed:          1,111 (90%)
Rejected:         123 (10%)
Avg Latency:      0.5ms

Top Rate Limited Users:
1. user_123      145 rejections
2. user_456      89 rejections
3. user_789      56 rejections

Algorithm Performance:
Token Bucket:     0.3ms avg
Leaky Bucket:     0.4ms avg
Sliding Window:   0.5ms avg
```

---

## Security Considerations

### 1. Don't Rely Solely on IP

```javascript
// ✅ Good - Multiple identifiers
function getUserIdentifier(req) {
  if (req.user?.id) return `user:${req.user.id}`;
  if (req.apiKey) return `key:${req.apiKey}`;
  return `ip:${req.ip}`;
}

// ❌ Bad - IP only (NATs, proxies cause issues)
function getUserIdentifier(req) {
  return req.ip;
}
```

### 2. Protect Rate Limiter Itself

```javascript
// Rate limiter should be fast and simple
// Don't let rate limiting become bottleneck

// ✅ Good - Fast in-memory check
const allowed = tokenBucket.check(userId);

// ❌ Bad - Slow database lookup in rate limiter
const user = await db.users.find(userId);
const tier = await db.tiers.find(user.tierId);
const allowed = rateLimiter.check(userId, tier.limit);
```

### 3. Handle Distributed Attacks

```javascript
// Track requests per endpoint
const endpointLimiter = {
  '/api/login': new RateLimiter(5, 60000),    // 5/min
  '/api/register': new RateLimiter(3, 60000), // 3/min
  '/api/reset': new RateLimiter(2, 60000)     // 2/min
};

// Global limit across all endpoints
const globalLimiter = new RateLimiter(100, 60000); // 100/min
```

### 4. Honeypot Endpoints

```javascript
// Create decoy endpoints to detect bots
app.post('/api/admin-secret', (req, res) => {
  // Log suspicious activity
  logger.warn('Honeypot accessed', {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  
  // Immediately block this IP
  blocklist.add(req.ip, 24 * 60 * 60); // 24 hours
  
  // Return fake success
  res.json({ status: 'ok' });
});
```

---

## Testing Strategies

### Unit Tests

```javascript
describe('TokenBucket', () => {
  it('should allow requests under limit', () => {
    const bucket = new TokenBucket(10, 1);
    
    for (let i = 0; i < 10; i++) {
      expect(bucket.allowRequest()).toBe(true);
    }
  });
  
  it('should reject requests over limit', () => {
    const bucket = new TokenBucket(10, 1);
    
    // Exhaust bucket
    for (let i = 0; i < 10; i++) {
      bucket.allowRequest();
    }
    
    expect(bucket.allowRequest()).toBe(false);
  });
  
  it('should refill tokens over time', async () => {
    const bucket = new TokenBucket(10, 10); // 10 tokens/sec
    
    // Exhaust bucket
    for (let i = 0; i < 10; i++) {
      bucket.allowRequest();
    }
    
    // Wait 1 second
    await sleep(1000);
    
    // Should have 10 new tokens
    expect(bucket.allowRequest()).toBe(true);
  });
});
```

### Load Testing

```javascript
// Use k6 or similar tool
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 100 },   // Ramp up
    { duration: '3m', target: 100 },   // Stay
    { duration: '1m', target: 0 },     // Ramp down
  ],
};

export default function() {
  const res = http.get('http://api.example.com/endpoint');
  
  check(res, {
    'status is 200 or 429': (r) => [200, 429].includes(r.status),
    'has rate limit headers': (r) => r.headers['X-RateLimit-Limit'] !== undefined,
  });
  
  sleep(1);
}
```

### Chaos Testing

```javascript
// Simulate failures
describe('Rate Limiter Resilience', () => {
  it('should handle Redis failures gracefully', async () => {
    // Stop Redis
    await redis.disconnect();
    
    // Should fail open (allow requests)
    const allowed = await rateLimiter.check('user123');
    expect(allowed).toBe(true);
    
    // Should log error
    expect(logger.error).toHaveBeenCalled();
  });
});
```

---

## Production Checklist

### Before Deployment

- [ ] Load tested under expected traffic
- [ ] Load tested under 2x expected traffic
- [ ] Tested failure scenarios
- [ ] Monitoring and alerts configured
- [ ] Documentation updated
- [ ] Rollback plan prepared
- [ ] Gradual rollout plan (canary/blue-green)

### After Deployment

- [ ] Monitor rejection rates
- [ ] Monitor latency impact
- [ ] Check error logs
- [ ] Validate user feedback
- [ ] Adjust limits if needed
- [ ] Document any issues

---

*Next: [Implementation Guide](guides/IMPLEMENTATION_GUIDE.md)*
