# Penalty and Reward System

## Overview

The Penalty and Reward system allows you to dynamically adjust rate limits based on user behavior. This is useful for implementing adaptive rate limiting strategies that punish malicious behavior and reward good behavior.

## Key Concepts

### Penalty
**Purpose**: Remove tokens from a user's bucket to punish bad behavior  
**Use Cases**:
- Failed login attempts
- Invalid API requests
- Suspicious activity detection
- CAPTCHA failures
- Terms of service violations

### Reward
**Purpose**: Add tokens to a user's bucket to reward good behavior  
**Use Cases**:
- Successful CAPTCHA completion
- Email verification
- Account upgrades
- Good API citizenship
- Trusted user status

## Core API

### TokenBucket Methods

#### `penalty(points = 1)`

Removes tokens from the bucket. Can result in negative token balance (debt).

```javascript
const bucket = new TokenBucket(10, 1);

// Apply 3-token penalty
const result = bucket.penalty(3);

console.log(result);
// {
//   penaltyApplied: true,
//   remainingTokens: 7,
//   beforePenalty: 10
// }
```

**Parameters:**
- `points` (Number): Number of tokens to remove (default: 1)

**Returns:**
```javascript
{
  penaltyApplied: Boolean,    // Always true unless invalid input
  remainingTokens: Number,    // Tokens after penalty (can be negative)
  beforePenalty: Number       // Token count before penalty
}
```

**Special Behaviors:**
- Allows negative balances (debt system)
- Tokens must be "earned back" through refilling
- Invalid inputs (negative, zero, NaN) are rejected

#### `reward(points = 1)`

Adds tokens to the bucket. Cannot exceed capacity.

```javascript
const bucket = new TokenBucket(10, 1);
bucket.allowRequest(5); // Use 5 tokens

// Reward 3 tokens
const result = bucket.reward(3);

console.log(result);
// {
//   rewardApplied: true,
//   remainingTokens: 8,
//   beforeReward: 5,
//   cappedAtCapacity: false
// }
```

**Parameters:**
- `points` (Number): Number of tokens to add (default: 1)

**Returns:**
```javascript
{
  rewardApplied: Boolean,     // True if reward applied
  remainingTokens: Number,    // Tokens after reward (≤ capacity)
  beforeReward: Number,       // Token count before reward
  cappedAtCapacity: Boolean   // True if reward was capped at capacity
}
```

**Special Behaviors:**
- Cannot exceed bucket capacity
- Works with negative balances (debt recovery)
- Invalid inputs (negative, zero, NaN) are rejected

### RedisTokenBucket Methods

The Redis implementation provides the same API with atomic operations using Lua scripts.

```javascript
const bucket = new RedisTokenBucket(redisClient, 'user:123', 10, 1);

// All operations are atomic and race-condition safe
await bucket.penalty(3);
await bucket.reward(2);
```

**Key Differences:**
- Async operations (returns Promises)
- Atomic execution via Lua scripts
- Distributed-safe across multiple servers
- Automatic token refilling before penalty/reward

## Express Middleware Integration

### `applyPenalty(options)`

Middleware to apply penalties in Express routes.

```javascript
const { 
  tokenBucketMiddleware, 
  applyPenalty 
} = require('./middleware/express/token-bucket-middleware');

app.use(tokenBucketMiddleware({
  capacity: 10,
  refillRate: 1
}));

// Apply penalty for failed login
app.post('/login', (req, res) => {
  if (!validateCredentials(req.body)) {
    // Apply penalty before responding
    return applyPenalty({ points: 3 })(req, res, () => {
      res.status(401).json({ error: 'Invalid credentials' });
    });
  }
  res.json({ success: true });
});
```

**Options:**
```javascript
{
  points: Number | Function,     // Static or dynamic penalty points
  keyGenerator: Function         // Optional: Override key generation
}
```

**Dynamic Penalties:**
```javascript
app.post('/action', applyPenalty({
  points: (req) => {
    // Vary penalty based on request
    if (req.body.severity === 'high') return 5;
    if (req.body.severity === 'medium') return 3;
    return 1;
  }
}), (req, res) => {
  // Penalty info available in req.penaltyApplied
  res.json({ 
    penalized: true,
    remaining: req.penaltyApplied.remainingTokens 
  });
});
```

**Request Augmentation:**
The middleware adds `req.penaltyApplied` with penalty details:
```javascript
{
  points: Number,             // Penalty points applied
  remainingTokens: Number,    // Tokens after penalty
  beforePenalty: Number       // Tokens before penalty
}
```

### `applyReward(options)`

Middleware to apply rewards in Express routes.

```javascript
// Reward for CAPTCHA completion
app.post('/verify-captcha', (req, res) => {
  if (verifyCaptcha(req.body.token)) {
    return applyReward({ points: 5 })(req, res, () => {
      res.json({ success: true, message: 'CAPTCHA verified' });
    });
  }
  res.status(400).json({ error: 'Invalid CAPTCHA' });
});
```

**Options:**
```javascript
{
  points: Number | Function,     // Static or dynamic reward points
  keyGenerator: Function         // Optional: Override key generation
}
```

**Request Augmentation:**
The middleware adds `req.rewardApplied` with reward details:
```javascript
{
  points: Number,                // Reward points applied
  remainingTokens: Number,       // Tokens after reward
  beforeReward: Number,          // Tokens before reward
  cappedAtCapacity: Boolean      // True if capped at capacity
}
```

## Usage Patterns

### Failed Login Protection

```javascript
app.use(perUserRateLimit({
  capacity: 20,
  refillRate: 1,
  getUserId: (req) => req.body.username
}));

app.post('/login', async (req, res) => {
  const user = await findUser(req.body.username);
  
  if (!user || !await verifyPassword(user, req.body.password)) {
    // Failed login: apply progressive penalty
    const attempts = await getFailedAttempts(req.body.username);
    const penalty = Math.min(attempts * 2, 10); // Max 10 token penalty
    
    applyPenalty({ points: penalty })(req, res, () => {
      res.status(401).json({ 
        error: 'Invalid credentials',
        remainingAttempts: Math.floor(req.penaltyApplied.remainingTokens)
      });
    });
    return;
  }
  
  // Successful login: clear penalties
  await clearFailedAttempts(req.body.username);
  res.json({ success: true, token: generateToken(user) });
});
```

### CAPTCHA Reward System

```javascript
app.use(tokenBucketMiddleware({
  capacity: 10,
  refillRate: 0.5  // Slow refill
}));

app.post('/api/expensive-operation', (req, res, next) => {
  // Check if rate limited
  if (!req.rateLimit || req.rateLimit.remaining < 1) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      solveCaptcha: true  // Client should solve CAPTCHA
    });
  }
  next();
}, performExpensiveOperation);

app.post('/verify-captcha', (req, res) => {
  if (verifyCaptcha(req.body.token)) {
    // Reward with extra tokens for solving CAPTCHA
    applyReward({ points: 5 })(req, res, () => {
      res.json({ 
        success: true,
        tokensRestored: 5,
        newBalance: req.rewardApplied.remainingTokens
      });
    });
  } else {
    res.status(400).json({ error: 'Invalid CAPTCHA' });
  }
});
```

### Tiered Penalty System

```javascript
const VIOLATION_PENALTIES = {
  spam: 2,
  invalid_input: 1,
  rate_limit_abuse: 5,
  security_violation: 10
};

app.post('/report-violation', applyPenalty({
  points: (req) => VIOLATION_PENALTIES[req.body.type] || 1
}), (req, res) => {
  logViolation(req.ip, req.body.type);
  
  res.json({ 
    penalized: true,
    points: req.penaltyApplied.points,
    remaining: req.penaltyApplied.remainingTokens,
    message: req.penaltyApplied.remainingTokens < 0 
      ? 'Account temporarily restricted'
      : 'Warning issued'
  });
});
```

### Reputation-Based Rewards

```javascript
app.use(perUserRateLimit({
  capacity: 100,
  refillRate: 10,
  getUserId: (req) => req.user.id
}));

// Reward trusted users
app.use((req, res, next) => {
  if (req.user && req.user.reputation > 1000) {
    applyReward({ 
      points: Math.floor(req.user.reputation / 100) 
    })(req, res, next);
  } else {
    next();
  }
});
```

### Combined Workflow

```javascript
app.use(tokenBucketMiddleware({
  capacity: 20,
  refillRate: 2
}));

app.post('/submit-content', async (req, res) => {
  const content = req.body.content;
  
  // Check for spam
  if (isSpam(content)) {
    return applyPenalty({ points: 5 })(req, res, () => {
      res.status(400).json({ 
        error: 'Spam detected',
        penalty: 5,
        remaining: req.penaltyApplied.remainingTokens
      });
    });
  }
  
  // Check for high-quality content
  const quality = assessQuality(content);
  if (quality > 0.8) {
    return applyReward({ points: 2 })(req, res, () => {
      saveContent(content);
      res.json({ 
        success: true,
        quality: 'high',
        bonus: 2,
        remaining: req.rewardApplied.remainingTokens
      });
    });
  }
  
  // Normal submission
  saveContent(content);
  res.json({ success: true });
});
```

## Debt System

The penalty system allows negative token balances (debt). Users must "pay off" debt through natural refilling before making new requests.

```javascript
const bucket = new TokenBucket(10, 1); // 10 tokens, refill 1/sec

// Apply severe penalty
bucket.penalty(15);
console.log(bucket.tokens); // -5 (in debt)

// Request will be blocked
bucket.allowRequest(); // false

// After 5 seconds, debt is cleared
setTimeout(() => {
  console.log(bucket.tokens); // 0
  bucket.allowRequest(); // false (need tokens to accumulate)
}, 5000);

// After 7 seconds, have positive balance
setTimeout(() => {
  console.log(bucket.tokens); // 2
  bucket.allowRequest(); // true
}, 7000);
```

## Capacity Limits

Rewards cannot exceed bucket capacity. Excess rewards are discarded.

```javascript
const bucket = new TokenBucket(10, 1);

// Bucket is full
console.log(bucket.tokens); // 10

// Try to reward 5 tokens
const result = bucket.reward(5);

console.log(result);
// {
//   rewardApplied: true,
//   remainingTokens: 10,        // Capped at capacity
//   beforeReward: 10,
//   cappedAtCapacity: true      // Indicates capping occurred
// }
```

## Redis Distributed Implementation

For distributed systems, use RedisTokenBucket with atomic operations:

```javascript
const Redis = require('ioredis');
const { RedisTokenBucket } = require('./algorithms/javascript/redis-token-bucket');

const redis = new Redis();

// Penalty across multiple servers
async function handleFailedLogin(userId) {
  const bucket = new RedisTokenBucket(redis, `user:${userId}:login`, 10, 1);
  
  const result = await bucket.penalty(3);
  
  if (result.remainingTokens < 0) {
    // User is in debt, block login attempts
    return { blocked: true, retryAfter: Math.abs(result.remainingTokens) };
  }
  
  return { blocked: false, remainingAttempts: result.remainingTokens };
}

// Reward across multiple servers
async function rewardTrustedUser(userId, points) {
  const bucket = new RedisTokenBucket(redis, `user:${userId}:api`, 100, 10);
  
  const result = await bucket.reward(points);
  
  return {
    success: true,
    tokensAdded: points,
    currentBalance: result.remainingTokens,
    capped: result.cappedAtCapacity
  };
}
```

## Best Practices

### 1. Progressive Penalties
Start small and increase penalties for repeated violations:

```javascript
const penalties = [1, 2, 5, 10, 20];

app.post('/action', async (req, res) => {
  const violations = await getViolationCount(req.user.id);
  const penalty = penalties[Math.min(violations, penalties.length - 1)];
  
  if (isViolation(req.body)) {
    applyPenalty({ points: penalty })(req, res, () => {
      res.status(400).json({ 
        error: 'Violation detected',
        penalty,
        violations: violations + 1
      });
    });
  }
});
```

### 2. Meaningful Rewards
Make rewards valuable enough to incentivize good behavior:

```javascript
const REWARDS = {
  email_verified: 5,
  phone_verified: 5,
  premium_user: 20,
  trusted_user: 50
};

app.post('/verify-email', async (req, res) => {
  if (await verifyEmail(req.body.token)) {
    applyReward({ points: REWARDS.email_verified })(req, res, () => {
      res.json({ 
        verified: true,
        bonus: REWARDS.email_verified,
        message: 'Rate limit increased!'
      });
    });
  }
});
```

### 3. Clear Communication
Inform users about penalties and rewards:

```javascript
app.post('/api/action', (req, res) => {
  if (isSuspicious(req.body)) {
    applyPenalty({ points: 3 })(req, res, () => {
      res.status(400).json({
        error: 'Suspicious activity detected',
        penalty: {
          points: 3,
          reason: 'Multiple invalid requests',
          remaining: req.penaltyApplied.remainingTokens,
          message: req.penaltyApplied.remainingTokens < 0
            ? 'Please wait before retrying'
            : 'Warning issued'
        }
      });
    });
  }
});
```

### 4. Debt Recovery
Provide ways to recover from penalties:

```javascript
app.post('/recover-from-penalty', async (req, res) => {
  // Allow users to solve challenges to clear debt
  if (await solveChallenge(req.body.solution)) {
    // Clear debt by resetting tokens
    const bucket = getBucket(req.user.id);
    bucket.tokens = Math.max(0, bucket.tokens); // Clear negative balance
    
    res.json({ 
      success: true,
      message: 'Debt cleared',
      tokens: bucket.tokens
    });
  }
});
```

### 5. Monitoring
Track penalty/reward metrics:

```javascript
app.use((req, res, next) => {
  const originalPenalty = applyPenalty;
  const originalReward = applyReward;
  
  applyPenalty = (...args) => {
    metrics.penaltiesApplied.inc();
    return originalPenalty(...args);
  };
  
  applyReward = (...args) => {
    metrics.rewardsApplied.inc();
    return originalReward(...args);
  };
  
  next();
});
```

## Testing

Unit tests for penalty/reward functionality:

```javascript
const TokenBucket = require('./token-bucket');

describe('Penalty System', () => {
  it('should remove tokens', () => {
    const bucket = new TokenBucket(10, 1);
    const result = bucket.penalty(3);
    
    expect(result.remainingTokens).toBe(7);
    expect(result.beforePenalty).toBe(10);
  });
  
  it('should allow negative balances', () => {
    const bucket = new TokenBucket(5, 1);
    const result = bucket.penalty(10);
    
    expect(result.remainingTokens).toBeLessThan(0);
  });
});

describe('Reward System', () => {
  it('should add tokens', () => {
    const bucket = new TokenBucket(10, 1);
    bucket.allowRequest(5);
    
    const result = bucket.reward(3);
    
    expect(result.remainingTokens).toBe(8);
  });
  
  it('should cap at capacity', () => {
    const bucket = new TokenBucket(10, 1);
    const result = bucket.reward(20);
    
    expect(result.remainingTokens).toBe(10);
    expect(result.cappedAtCapacity).toBe(true);
  });
});
```

## Performance Considerations

- **In-Memory (TokenBucket)**: O(1) operations, no network overhead
- **Redis (RedisTokenBucket)**: Single round-trip per operation via Lua scripts
- **Atomic Operations**: Lua scripts ensure race-condition safety
- **Minimal Overhead**: ~1-2ms added to request processing time

## Migration from Basic Rate Limiting

If you're currently using basic rate limiting:

```javascript
// Before
app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10
}));

// After: Add penalty/reward logic
app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10
}));

app.post('/api/action', (req, res) => {
  // Add behavior-based adjustments
  if (isBadBehavior(req.body)) {
    return applyPenalty({ points: 5 })(req, res, () => {
      res.status(400).json({ error: 'Bad request' });
    });
  }
  
  if (isGoodBehavior(req.body)) {
    return applyReward({ points: 2 })(req, res, () => {
      processRequest(req, res);
    });
  }
  
  processRequest(req, res);
});
```

## See Also

- [Algorithm Comparison](./ALGORITHM_COMPARISON.md) - Understanding token bucket vs other algorithms
- [Best Practices](./BEST_PRACTICES.md) - General rate limiting best practices
- [Configuration Guide](./CONFIGURATION.md) - Configuring rate limiters
- [Redis Distributed Guide](./guides/REDIS_DISTRIBUTED.md) - Setting up distributed rate limiting
