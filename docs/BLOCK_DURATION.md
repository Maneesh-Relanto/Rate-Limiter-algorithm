# Block Duration System

## Overview

The Block Duration feature allows you to temporarily block rate limiters for a specified time period, completely preventing requests regardless of token availability. This is useful for implementing temporary bans, cooldowns, and graduated penalties.

## Key Concepts

### Blocking
**Purpose**: Completely prevent requests for a specified duration  
**Use Cases**:
- Temporary IP bans after repeated violations
- Account cooldowns after failed logins
- Security holds after suspicious activity
- Time-based restrictions (e.g., rate limit exceeded)
- Graduated penalty enforcement

### Features
- **Automatic expiry**: Blocks auto-expire after duration
- **Manual unblock**: Admin or automated processes can lift blocks early
- **Distributed safe**: Works across multiple servers with Redis
- **State persistence**: Block state survives restarts
- **Zero token consumption**: Blocked requests don't consume tokens

## Core API

### TokenBucket Methods

#### `block(durationMs)`

Blocks the bucket for a specified duration. All requests will be rejected until the block expires or is manually removed.

```javascript
const bucket = new TokenBucket(10, 1);

// Block for 5 minutes
const result = bucket.block(5 * 60 * 1000);

console.log(result);
// {
//   blocked: true,
//   blockUntil: 1706550600000,  // Unix timestamp
//   blockDuration: 300000,       // milliseconds
//   unblockAt: '2026-01-18T10:30:00.000Z'  // ISO string
// }
```

**Parameters:**
- `durationMs` (Number): Duration to block in milliseconds

**Returns:**
```javascript
{
  blocked: Boolean,        // Always true
  blockUntil: Number,      // Unix timestamp when block expires
  blockDuration: Number,   // Duration in milliseconds
  unblockAt: String       // ISO 8601 formatted date/time
}
```

#### `isBlocked()`

Checks if the bucket is currently blocked. Automatically clears expired blocks.

```javascript
if (bucket.isBlocked()) {
  const remaining = bucket.getBlockTimeRemaining();
  res.status(403).json({ 
    error: 'Account temporarily blocked',
    retryAfter: Math.ceil(remaining / 1000)
  });
  return;
}
```

**Returns:** `Boolean` - true if currently blocked

#### `getBlockTimeRemaining()`

Gets the remaining block time in milliseconds.

```javascript
const msRemaining = bucket.getBlockTimeRemaining();

if (msRemaining > 0) {
  const secondsRemaining = Math.ceil(msRemaining / 1000);
  res.setHeader('Retry-After', secondsRemaining);
}
```

**Returns:** `Number` - Milliseconds until unblock (0 if not blocked)

#### `unblock()`

Manually removes the block before it expires.

```javascript
// Admin action to unblock a user
const result = bucket.unblock();

console.log(result);
// {
//   unblocked: true,
//   wasBlocked: true   // false if wasn't blocked
// }
```

**Returns:**
```javascript
{
  unblocked: Boolean,    // Always true
  wasBlocked: Boolean    // true if was blocked, false otherwise
}
```

### RedisTokenBucket Methods

All methods are async and use Redis for distributed blocking.

```javascript
const bucket = new RedisTokenBucket(redisClient, 'user:123', 10, 1);

// Block (distributed across all servers)
await bucket.block(5 * 60 * 1000);

// Check if blocked
if (await bucket.isBlocked()) {
  const remaining = await bucket.getBlockTimeRemaining();
  // Handle blocked request
}

// Manually unblock
await bucket.unblock();
```

## Usage Patterns

### Failed Login Protection

```javascript
const { TokenBucket } = require('./token-bucket');

// Track login attempts per user
const loginBuckets = new Map();

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const bucketKey = `login:${username}`;
  
  // Get or create bucket (5 attempts, refill 1 per minute)
  if (!loginBuckets.has(bucketKey)) {
    loginBuckets.set(bucketKey, new TokenBucket(5, 1/60));
  }
  
  const bucket = loginBuckets.get(bucketKey);
  
  // Check if blocked from previous failures
  if (bucket.isBlocked()) {
    const remaining = bucket.getBlockTimeRemaining();
    return res.status(403).json({
      error: 'Too many failed attempts',
      retryAfter: Math.ceil(remaining / 1000),
      message: 'Account temporarily locked'
    });
  }
  
  // Check rate limit
  if (!bucket.allowRequest()) {
    // Rate limit exceeded - apply graduated block
    const blockDuration = 5 * 60 * 1000; // 5 minutes
    bucket.block(blockDuration);
    
    return res.status(429).json({
      error: 'Too many login attempts',
      blockedUntil: new Date(Date.now() + blockDuration).toISOString(),
      message: 'Account locked for 5 minutes'
    });
  }
  
  //Verify credentials
  const user = await verifyCredentials(username, password);
  
  if (!user) {
    // Failed login - consume token
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Successful login - reset bucket
  bucket.reset();
  res.json({ success: true, token: generateToken(user) });
});
```

### Graduated Blocking System

```javascript
const BLOCK_DURATIONS = {
  first: 1 * 60 * 1000,      // 1 minute
  second: 5 * 60 * 1000,     // 5 minutes
  third: 30 * 60 * 1000,     // 30 minutes
  severe: 24 * 60 * 60 * 1000 // 24 hours
};

class GraduatedBlocker {
  constructor() {
    this.violations = new Map(); // Track violation counts
    this.buckets = new Map();
  }
  
  async handleViolation(userId, severity = 'minor') {
    const count = (this.violations.get(userId) || 0) + 1;
    this.violations.set(userId, count);
    
    let bucket = this.buckets.get(userId);
    if (!bucket) {
      bucket = new TokenBucket(10, 1);
      this.buckets.set(userId, bucket);
    }
    
    // Determine block duration based on violation history
    let duration;
    if (severity === 'severe') {
      duration = BLOCK_DURATIONS.severe;
    } else if (count === 1) {
      duration = BLOCK_DURATIONS.first;
    } else if (count === 2) {
      duration = BLOCK_DURATIONS.second;
    } else {
      duration = BLOCK_DURATIONS.third;
    }
    
    bucket.block(duration);
    
    return {
      blocked: true,
      duration,
      violationCount: count,
      unblockAt: new Date(Date.now() + duration).toISOString()
    };
  }
  
  async clearViolations(userId) {
    this.violations.delete(userId);
    const bucket = this.buckets.get(userId);
    if (bucket) {
      bucket.unblock();
    }
  }
}

// Usage
const blocker = new GraduatedBlocker();

app.post('/api/action', async (req, res) => {
  if (detectsSpam(req.body)) {
    const result = await blocker.handleViolation(req.user.id, 'minor');
    return res.status(400).json({
      error: 'Spam detected',
      ...result
    });
  }
  
  if (detectsSecurityThreat(req.body)) {
    const result = await blocker.handleViolation(req.user.id, 'severe');
    return res.status(403).json({
      error: 'Security violation',
      ...result
    });
  }
  
  // Process normal request
});
```

### Distributed Blocking with Redis

```javascript
const Redis = require('ioredis');
const { RedisTokenBucket } = require('./redis-token-bucket');

const redis = new Redis();

// Block user across all servers
async function blockUser(userId, reason, durationMs) {
  const bucket = new RedisTokenBucket(
    redis, 
    `user:${userId}:api`, 
    100, 
    10
  );
  
  await bucket.block(durationMs);
  
  // Log to audit trail
  await redis.hset(`block:${userId}`, {
    reason,
    blockedAt: Date.now(),
    duration: durationMs,
    unblockAt: Date.now() + durationMs
  });
  
  return {
    userId,
    blocked: true,
    reason,
    duration: durationMs
  };
}

// Check if user is blocked
async function isUserBlocked(userId) {
  const bucket = new RedisTokenBucket(
    redis,
    `user:${userId}:api`,
    100,
    10
  );
  
  if (await bucket.isBlocked()) {
    const remaining = await bucket.getBlockTimeRemaining();
    const info = await redis.hgetall(`block:${userId}`);
    
    return {
      blocked: true,
      reason: info.reason,
      remainingMs: remaining,
      remainingSec: Math.ceil(remaining / 1000),
      unblockAt: new Date(parseInt(info.unblockAt)).toISOString()
    };
  }
  
  return { blocked: false };
}

// Admin endpoint to manually unblock
app.post('/admin/unblock/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const bucket = new RedisTokenBucket(
    redis,
    `user:${userId}:api`,
    100,
    10
  );
  
  await bucket.unblock();
  await redis.del(`block:${userId}`);
  
  res.json({ success: true, userId, unblocked: true });
});
```

### Automatic Block Expiry

```javascript
// Blocks automatically expire
bucket.block(60 * 1000); // 1 minute

setTimeout(() => {
  console.log(bucket.isBlocked()); // false (auto-expired)
  console.log(bucket.allowRequest()); // true (can make requests)
}, 65 * 1000);
```

### State Persistence

```javascript
// Block state persists in serialization
const bucket = new TokenBucket(10, 1);
bucket.block(5 * 60 * 1000);

// Save state
const state = bucket.toJSON();
fs.writeFileSync('bucket-state.json', JSON.stringify(state));

// Later: Restore state (block still active)
const savedState = JSON.parse(fs.readFileSync('bucket-state.json'));
const restored = TokenBucket.fromJSON(savedState);

console.log(restored.isBlocked()); // true (if block hasn't expired)
console.log(restored.getBlockTimeRemaining()); // remaining time
```

### Security Holds

```javascript
async function detectAndBlockSuspiciousActivity(req) {
  const patterns = {
    sql_injection: /(\bOR\b.*=.*|\bUNION\b.*\bSELECT\b)/i,
    xss: /<script|javascript:|onerror=/i,
    path_traversal: /\.\.[\/\\]/
  };
  
  const suspicious = Object.entries(patterns).find(([name, pattern]) => 
    pattern.test(JSON.stringify(req.body)) || pattern.test(req.url)
  );
  
  if (suspicious) {
    const [attackType] = suspicious;
    const bucket = getBucket(req.ip);
    
    // Immediate 1-hour block for security threats
    bucket.block(60 * 60 * 1000);
    
    // Alert security team
    await alertSecurity({
      type: attackType,
      ip: req.ip,
      blockedUntil: Date.now() + (60 * 60 * 1000),
      request: sanitizeForLogging(req)
    });
    
    return true;
  }
  
  return false;
}

app.use(async (req, res, next) => {
  if (await detectAndBlockSuspiciousActivity(req)) {
    return res.status(403).json({
      error: 'Security violation detected',
      message: 'This IP has been temporarily blocked',
      contact: 'security@example.com'
    });
  }
  next();
});
```

## Best Practices

### 1. Graduated Responses
Start with short blocks and increase duration for repeated violations:

```javascript
const getBlockDuration = (violationCount) => {
  const durations = [
    1 * 60 * 1000,      // 1st: 1 minute
    5 * 60 * 1000,      // 2nd: 5 minutes
    30 * 60 * 1000,     // 3rd: 30 minutes
    60 * 60 * 1000,     // 4th: 1 hour
    24 * 60 * 60 * 1000 // 5th+: 24 hours
  ];
  
  return durations[Math.min(violationCount - 1, durations.length - 1)];
};
```

### 2. Clear Communication
Always inform users why they're blocked and when they can retry:

```javascript
if (bucket.isBlocked()) {
  const remaining = bucket.getBlockTimeRemaining();
  const unblockAt = new Date(Date.now() + remaining);
  
  return res.status(403).json({
    error: 'Account temporarily blocked',
    reason: 'Multiple failed login attempts',
    retryAfter: Math.ceil(remaining / 1000),
    unblockAt: unblockAt.toISOString(),
    message: `Please try again after ${unblockAt.toLocaleTimeString()}`
  });
}
```

### 3. Admin Override
Provide admin tools to review and lift blocks:

```javascript
app.get('/admin/blocks', async (req, res) => {
  const blocks = await getActiveBlocks();
  res.json(blocks);
});

app.post('/admin/unblock/:identifier', async (req, res) => {
  const bucket = getBucket(req.params.identifier);
  bucket.unblock();
  
  await logAdminAction({
    action: 'unblock',
    admin: req.admin.id,
    target: req.params.identifier,
    timestamp: Date.now()
  });
  
  res.json({ success: true });
});
```

### 4. Monitoring
Track block metrics to identify patterns:

```javascript
const blockMetrics = {
  total: 0,
  byReason: {},
  byDuration: {}
};

function trackBlock(reason, duration) {
  blockMetrics.total++;
  blockMetrics.byReason[reason] = (blockMetrics.byReason[reason] || 0) + 1;
  
  const durationKey = getDurationBucket(duration);
  blockMetrics.byDuration[durationKey] = (blockMetrics.byDuration[durationKey] || 0) + 1;
}
```

### 5. Automatic Cleanup
For Redis, blocks auto-expire via TTL. For in-memory, periodically clean up expired blocks:

```javascript
// Optional: Clean up expired in-memory blocks
setInterval(() => {
  for (const [key, bucket] of buckets.entries()) {
    if (!bucket.isBlocked() && bucket.tokens === bucket.capacity) {
      buckets.delete(key); // Remove idle, unblocked buckets
    }
  }
}, 60 * 60 * 1000); // Every hour
```

## Testing

```javascript
const TokenBucket = require('./token-bucket');

describe('Block Duration', () => {
  it('should block requests during block period', () => {
    const bucket = new TokenBucket(10, 1);
    bucket.block(5000);
    
    expect(bucket.isBlocked()).toBe(true);
    expect(bucket.allowRequest()).toBe(false);
  });
  
  it('should auto-expire blocks', (done) => {
    const bucket = new TokenBucket(10, 1);
    bucket.block(100);
    
    setTimeout(() => {
      expect(bucket.isBlocked()).toBe(false);
      expect(bucket.allowRequest()).toBe(true);
      done();
    }, 150);
  });
  
  it('should allow manual unblock', () => {
    const bucket = new TokenBucket(10, 1);
    bucket.block(60000);
    
    expect(bucket.isBlocked()).toBe(true);
    bucket.unblock();
    expect(bucket.isBlocked()).toBe(false);
  });
});
```

## Performance Considerations

- **In-Memory (TokenBucket)**: O(1) operations, ~0.1ms overhead
- **Redis (RedisTokenBucket)**: Single GET per block check, ~1-2ms overhead
- **Auto-expiry**: Checked on access, no background cleanup needed
- **State size**: Minimal (single timestamp per bucket)

## See Also

- [Penalty & Reward System](./PENALTY_REWARD.md) - Combine with block duration for advanced control
- [Best Practices](./BEST_PRACTICES.md) - General rate limiting guidelines
- [Redis Distributed Guide](./guides/REDIS_DISTRIBUTED.md) - Setting up distributed rate limiting
- [API Reference](./API_REFERENCE.md) - Complete API documentation
