# 🌐 Distributed Rate Limiting with Redis

## Overview

The Redis Token Bucket implementation enables **distributed rate limiting** across multiple server instances by using Redis as a shared state store. This ensures consistent rate limiting regardless of which server handles the request.

## Why Distributed Rate Limiting?

### Single-Server Limitations

In-memory rate limiters (like our basic Token Bucket) have a critical limitation:

```
User → Load Balancer → [Server 1] → In-memory limiter (10/10 tokens)
                     → [Server 2] → In-memory limiter (10/10 tokens)
                     → [Server 3] → In-memory limiter (10/10 tokens)

Problem: User can make 30 requests (10 per server) instead of 10!
```

### Redis-Based Solution

With Redis, all servers share the same rate limit state:

```
User → Load Balancer → [Server 1] ↘
                     → [Server 2] → Redis (10/10 tokens total)
                     → [Server 3] ↗

Solution: User is limited to 10 requests total across all servers ✅
```

## Key Features

### 1. **Atomic Operations**
Uses Lua scripts to ensure thread-safe, atomic operations:
- Token refill calculation
- Token consumption
- State updates

All happen in a single atomic Redis operation, preventing race conditions.

### 2. **Fail-Open Strategy**
If Redis becomes unavailable, the limiter **fails open** (allows requests) rather than causing a complete outage:

```javascript
try {
  return await checkRedis();
} catch (error) {
  console.error('Redis error:', error);
  return true; // Allow request - better than breaking the entire API
}
```

### 3. **Multi-Client Support**
Compatible with multiple Redis client libraries:
- ioredis (recommended)
- node-redis v4+
- node-redis v3

### 4. **Automatic Expiration**
Keys automatically expire after TTL (default: 1 hour), preventing memory leaks.

## Installation

```bash
# Install Redis
# macOS: brew install redis
# Ubuntu: sudo apt-get install redis-server
# Windows: https://github.com/microsoftarchive/redis/releases

# Install Node.js Redis client
npm install ioredis

# Start Redis server
redis-server
```

## Basic Usage

```javascript
const Redis = require('ioredis');
const RedisTokenBucket = require('./src/algorithms/javascript/redis-token-bucket');

// Connect to Redis
const redis = new Redis({
  host: 'localhost',
  port: 6379
});

// Create distributed rate limiter
const limiter = new RedisTokenBucket(
  redis,
  'rate_limit:user:123',  // Redis key
  100,                     // Capacity
  10                       // Refill rate (tokens/sec)
);

// Check if request allowed
const allowed = await limiter.allowRequest();
if (allowed) {
  // Process request
} else {
  // Reject with 429 Too Many Requests
}
```

## Advanced Use Cases

### Per-User Rate Limiting

```javascript
class APIServer {
  constructor(redis) {
    this.redis = redis;
  }

  async handleRequest(userId, endpoint) {
    const key = `api:${userId}:${endpoint}`;
    const limiter = new RedisTokenBucket(this.redis, key, 100, 10);
    
    if (!await limiter.allowRequest()) {
      throw new Error('Rate limit exceeded');
    }
    
    // Process request...
  }
}
```

### Multi-Tier System

```javascript
const tiers = {
  free: { capacity: 100, refillRate: 1 },
  pro: { capacity: 1000, refillRate: 10 },
  enterprise: { capacity: 10000, refillRate: 100 }
};

function getLimiter(redis, userId, tier) {
  const config = tiers[tier];
  return new RedisTokenBucket(
    redis,
    `api:${tier}:${userId}`,
    config.capacity,
    config.refillRate
  );
}
```

### Cost-Based Operations

```javascript
const costs = {
  read: 1,
  write: 5,
  delete: 10,
  bulk: 50
};

async function handleOperation(limiter, operation) {
  const cost = costs[operation];
  const allowed = await limiter.allowRequest(cost);
  
  if (!allowed) {
    const wait = await limiter.getTimeUntilNextToken(cost);
    throw new Error(`Rate limit exceeded. Retry after ${wait}ms`);
  }
  
  // Process operation...
}
```

## Architecture

### Lua Script Execution

The implementation uses a single Lua script that runs atomically on Redis:

```lua
-- Get current state
local state = redis.call('HMGET', key, 'tokens', 'lastRefill')

-- Calculate refill
local timePassed = (now - lastRefill) / 1000
local tokensToAdd = timePassed * refillRate
tokens = math.min(capacity, tokens + tokensToAdd)

-- Check and consume
if tokens >= tokensRequired then
  tokens = tokens - tokensRequired
  allowed = 1
end

-- Update state
redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
redis.call('EXPIRE', key, ttl)

return {allowed, tokens, timeUntilNextToken}
```

**Why Lua?**
- Executes atomically (no race conditions)
- Single round-trip to Redis (lower latency)
- No intermediate network hops
- Guaranteed consistency

### State Storage

Each rate limiter stores state in Redis hash:

```
Key: rate_limit:user:123
Fields:
  - tokens: 7.5 (current available tokens)
  - lastRefill: 1704902400000 (last refill timestamp)
  
TTL: 3600 seconds (auto-expires after inactivity)
```

## Performance Considerations

### Latency

- **Single Redis call**: ~1-2ms on local network
- **Total overhead**: ~2-5ms per request
- **Acceptable for most APIs**: < 10ms latency added

### Throughput

- **Redis capacity**: 100,000+ ops/sec on single instance
- **Clustered Redis**: Millions of ops/sec
- **Bottleneck**: Usually network, not Redis

### Memory Usage

Per limiter:
```
Hash: ~200 bytes (2 fields)
Key: ~50 bytes (average)
Total: ~250 bytes per active limiter
```

For 1 million active limiters: ~250 MB memory

### Optimization Tips

1. **Connection Pooling**
```javascript
const redis = new Redis({
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true
});
```

2. **Pipeline Requests**
```javascript
// Check multiple limiters at once
const pipeline = redis.pipeline();
limiters.forEach(l => l.allowRequest());
await pipeline.exec();
```

3. **Use Redis Cluster** for horizontal scaling
```javascript
const Redis = require('ioredis');
const cluster = new Redis.Cluster([
  { host: 'redis-1', port: 6379 },
  { host: 'redis-2', port: 6379 },
  { host: 'redis-3', port: 6379 }
]);
```

## Error Handling

### Fail-Open Strategy

```javascript
try {
  const allowed = await limiter.allowRequest();
  return allowed;
} catch (error) {
  // Redis is down - fail open
  console.error('Redis error:', error);
  return true; // Allow request
}
```

**Why fail-open?**
- Prevents complete API outage
- Redis downtime doesn't break entire system
- Rate limiting is degraded but service remains available

### Health Checks

```javascript
const healthy = await limiter.isHealthy();
if (!healthy) {
  console.warn('Redis connection lost');
  // Alert monitoring system
  // Fall back to in-memory limiter
}
```

### Circuit Breaker Pattern

```javascript
class ResilientRateLimiter {
  constructor(redisLimiter, memoryLimiter) {
    this.redis = redisLimiter;
    this.memory = memoryLimiter;
    this.useRedis = true;
  }

  async allowRequest() {
    if (!this.useRedis) {
      return this.memory.allowRequest();
    }

    try {
      return await this.redis.allowRequest();
    } catch (error) {
      console.error('Redis failed, switching to memory limiter');
      this.useRedis = false;
      setTimeout(() => { this.useRedis = true; }, 60000); // Retry after 1 min
      return this.memory.allowRequest();
    }
  }
}
```

## Monitoring

### Key Metrics to Track

1. **Request Rate**: Requests per second per limiter
2. **Rejection Rate**: Percentage of requests rejected
3. **Redis Latency**: Time taken for Redis operations
4. **Error Rate**: Redis connection failures
5. **Memory Usage**: Redis memory consumption

### Example Monitoring Code

```javascript
class MonitoredRateLimiter {
  constructor(redis, key, capacity, refillRate, metrics) {
    this.limiter = new RedisTokenBucket(redis, key, capacity, refillRate);
    this.metrics = metrics;
  }

  async allowRequest(tokens = 1) {
    const start = Date.now();
    
    try {
      const allowed = await this.limiter.allowRequest(tokens);
      const latency = Date.now() - start;
      
      this.metrics.recordLatency('rate_limiter.redis', latency);
      this.metrics.increment(`rate_limiter.${allowed ? 'allowed' : 'rejected'}`);
      
      return allowed;
    } catch (error) {
      this.metrics.increment('rate_limiter.errors');
      throw error;
    }
  }
}
```

## Comparison: In-Memory vs Redis

| Feature | In-Memory | Redis |
|---------|-----------|-------|
| **Multi-Server** | ❌ Separate state per server | ✅ Shared state |
| **Persistence** | ❌ Lost on restart | ✅ Optional persistence |
| **Latency** | ⚡ < 1ms | 🔸 1-5ms |
| **Complexity** | ✅ Simple | 🔸 Requires Redis |
| **Scalability** | ❌ Limited to single server | ✅ Horizontal scaling |
| **Memory** | 🔸 Per-server memory | ✅ Centralized |
| **Consistency** | ❌ Eventually consistent | ✅ Strong consistency |

## When to Use Redis Rate Limiting

✅ **Use Redis when:**
- Running multiple server instances
- Need consistent rate limits across servers
- Want state persistence across restarts
- Building microservices architecture
- Require strong consistency

❌ **Use in-memory when:**
- Single server deployment
- Extremely low latency required (< 1ms)
- Minimal dependencies preferred
- Prototyping or development

## Best Practices

1. **Set Appropriate TTL**: Balance between memory usage and user experience
2. **Monitor Redis Health**: Implement health checks and alerts
3. **Use Meaningful Keys**: Include user ID, tier, and endpoint
4. **Handle Errors Gracefully**: Fail-open to maintain availability
5. **Test Thoroughly**: Simulate Redis failures in testing
6. **Use Connection Pooling**: Reuse Redis connections
7. **Enable Persistence**: Configure Redis AOF or RDB for data durability
8. **Set Memory Limits**: Configure Redis maxmemory and eviction policy

## Testing

Run the test suite:

```bash
npm test tests/unit/redis-token-bucket.test.js
```

**38 comprehensive tests** covering:
- Constructor validation
- Token consumption and refill
- Multi-token requests
- Error handling and fail-open
- Distributed scenarios
- Concurrent requests
- Edge cases

## Configuration

Add to `config/rate-limits.json`:

```json
{
  "redis": {
    "host": "localhost",
    "port": 6379,
    "password": null,
    "db": 0,
    "keyPrefix": "rate_limit:",
    "retryStrategy": {
      "maxRetries": 3,
      "retryDelay": 1000
    }
  }
}
```

## See Also

- [Token Bucket Algorithm](../../ALGORITHM_COMPARISON.md#token-bucket)
- [Best Practices](../../BEST_PRACTICES.md#distributed-systems)
- [Configuration Guide](../../guides/CONFIGURATION.md)
- [Examples](../../../examples/javascript/redis-token-bucket-example.js)
