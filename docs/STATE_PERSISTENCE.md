# State Persistence Guide

This guide explains how to save and restore the state of Token Bucket rate limiters, enabling features like:
- **Crash Recovery**: Resume rate limiting after process restarts
- **State Migration**: Move rate limiter state between processes or servers
- **Backup & Restore**: Create snapshots for disaster recovery
- **Monitoring**: Export state for analysis and debugging

## Table of Contents
- [TokenBucket (In-Memory) Persistence](#tokenbucket-in-memory-persistence)
- [RedisTokenBucket (Distributed) Persistence](#redistokenbucket-distributed-persistence)
- [Common Use Cases](#common-use-cases)
- [Best Practices](#best-practices)

## TokenBucket (In-Memory) Persistence

The `TokenBucket` class provides three methods for state management:

### toJSON()
Serializes the complete bucket state to a JSON-compatible object.

```javascript
const TokenBucket = require('./src/algorithms/javascript/token-bucket');

const limiter = new TokenBucket(1000, 100); // 1000 capacity, 100/sec refill
limiter.allowRequest(300); // Consume 300 tokens

const state = limiter.toJSON();
console.log(state);
// {
//   version: 1,
//   capacity: 1000,
//   tokens: 700,
//   refillRate: 100,
//   lastRefill: 1704067200000,
//   timestamp: 1704067200000,
//   metadata: {
//     serializedAt: '2024-01-01T00:00:00.000Z',
//     className: 'TokenBucket'
//   }
// }

// Save to file
const fs = require('fs');
fs.writeFileSync('limiter-state.json', JSON.stringify(state, null, 2));
```

### fromJSON(json)
Static method that restores a TokenBucket from serialized state.

```javascript
const fs = require('fs');
const TokenBucket = require('./src/algorithms/javascript/token-bucket');

// Load from file
const savedState = JSON.parse(fs.readFileSync('limiter-state.json'));

// Restore bucket
const limiter = TokenBucket.fromJSON(savedState);

// Continue using limiter with restored state
console.log(limiter.getAvailableTokens()); // ~700 tokens
```

**Validation**: `fromJSON()` performs comprehensive validation:
- Checks for required fields (capacity, tokens, refillRate, lastRefill)
- Validates types and ranges (positive numbers, tokens ≤ capacity)
- Throws descriptive errors for invalid data

### clone()
Creates an independent deep copy of a bucket.

```javascript
const original = new TokenBucket(1000, 100);
original.allowRequest(200);

const copy = original.clone();

// Independent copies
copy.allowRequest(300);
console.log(original.getAvailableTokens()); // ~800
console.log(copy.getAvailableTokens());     // ~500
```

## RedisTokenBucket (Distributed) Persistence

The `RedisTokenBucket` class provides four persistence methods:

### toJSON()
Exports **configuration only** (not state, which lives in Redis).

```javascript
const Redis = require('ioredis');
const RedisTokenBucket = require('./src/algorithms/javascript/redis-token-bucket');

const redis = new Redis();
const limiter = new RedisTokenBucket(redis, 'user:123', 1000, 100);

const config = limiter.toJSON();
console.log(config);
// {
//   version: 1,
//   type: 'RedisTokenBucket',
//   key: 'user:123',
//   capacity: 1000,
//   refillRate: 100,
//   ttl: 3600,
//   metadata: {
//     serializedAt: '2024-01-01T00:00:00.000Z',
//     className: 'RedisTokenBucket',
//     note: 'State is stored in Redis. This is configuration only.'
//   }
// }
```

### fromJSON(redis, json)
Reconnects to an existing Redis bucket from configuration.

```javascript
const Redis = require('ioredis');
const RedisTokenBucket = require('./src/algorithms/javascript/redis-token-bucket');

// Process 1 saves config
const redis1 = new Redis();
const limiter1 = new RedisTokenBucket(redis1, 'shared:limiter', 1000, 100);
await limiter1.allowRequest(300);

const config = limiter1.toJSON();
fs.writeFileSync('redis-config.json', JSON.stringify(config));

// Process 2 reconnects
const redis2 = new Redis();
const savedConfig = JSON.parse(fs.readFileSync('redis-config.json'));
const limiter2 = RedisTokenBucket.fromJSON(redis2, savedConfig);

// limiter2 sees the same state as limiter1 (700 tokens)
console.log(await limiter2.getAvailableTokens()); // ~700
```

### exportState()
Exports **complete state** including current tokens and lastRefill from Redis.

```javascript
const limiter = new RedisTokenBucket(redis, 'api:limiter', 1000, 100);
await limiter.allowRequest(400);

const snapshot = await limiter.exportState();
console.log(snapshot);
// {
//   version: 1,
//   type: 'RedisTokenBucket',
//   key: 'api:limiter',
//   capacity: 1000,
//   tokens: 600,           // Current tokens from Redis
//   refillRate: 100,
//   lastRefill: 1704067200000,  // From Redis
//   ttl: 3600,
//   metadata: {
//     serializedAt: '2024-01-01T00:00:00.000Z',
//     className: 'RedisTokenBucket'
//   }
// }

// Save complete state
fs.writeFileSync('backup.json', JSON.stringify(snapshot, null, 2));
```

### importState(snapshot)
Restores complete state into Redis from a snapshot.

```javascript
const fs = require('fs');

// Load snapshot
const snapshot = JSON.parse(fs.readFileSync('backup.json'));

// Create new bucket and import state
const limiter = new RedisTokenBucket(redis, 'api:limiter', 1000, 100);
await limiter.importState(snapshot);

// Bucket now has the restored state
console.log(await limiter.getAvailableTokens()); // ~600 tokens
```

**Validation**: `importState()` performs thorough validation:
- Checks required fields (capacity, tokens, refillRate, lastRefill)
- Validates types and ranges
- Updates both Redis state and bucket configuration

## Common Use Cases

### 1. Crash Recovery (In-Memory)

```javascript
const TokenBucket = require('./src/algorithms/javascript/token-bucket');
const fs = require('fs');

// Periodically save state
const limiter = new TokenBucket(10000, 1000);
const stateFile = 'limiter-state.json';

// Auto-save every 5 seconds
setInterval(() => {
  const state = limiter.toJSON();
  fs.writeFileSync(stateFile, JSON.stringify(state));
}, 5000);

// On restart: restore from last saved state
process.on('SIGTERM', () => {
  const state = limiter.toJSON();
  fs.writeFileSync(stateFile, JSON.stringify(state));
  process.exit(0);
});

// Startup: load if exists
if (fs.existsSync(stateFile)) {
  const savedState = JSON.parse(fs.readFileSync(stateFile));
  limiter = TokenBucket.fromJSON(savedState);
  console.log('Restored limiter state from disk');
}
```

### 2. Redis Backup & Restore

```javascript
const RedisTokenBucket = require('./src/algorithms/javascript/redis-token-bucket');

// Backup all limiters
async function backupAllLimiters(redis) {
  const keys = await redis.keys('limiter:*');
  const backups = {};

  for (const key of keys) {
    // Extract config from key pattern
    const parts = key.split(':');
    const limiter = new RedisTokenBucket(redis, key, 1000, 100);
    backups[key] = await limiter.exportState();
  }

  fs.writeFileSync('redis-backup.json', JSON.stringify(backups, null, 2));
  console.log(`Backed up ${keys.length} limiters`);
}

// Restore from backup
async function restoreAllLimiters(redis, backupFile) {
  const backups = JSON.parse(fs.readFileSync(backupFile));

  for (const [key, snapshot] of Object.entries(backups)) {
    const limiter = new RedisTokenBucket(
      redis,
      snapshot.key,
      snapshot.capacity,
      snapshot.refillRate
    );
    await limiter.importState(snapshot);
  }

  console.log(`Restored ${Object.keys(backups).length} limiters`);
}
```

### 3. State Migration Between Servers

```javascript
// Server A: Export state
const limiterA = new RedisTokenBucket(redisA, 'user:123', 1000, 100);
const snapshot = await limiterA.exportState();

// Transfer snapshot via HTTP, message queue, etc.
const transferData = JSON.stringify(snapshot);
await sendToServerB(transferData);

// Server B: Import state
const limiterB = new RedisTokenBucket(redisB, 'user:123', 1000, 100);
await limiterB.importState(JSON.parse(transferData));
```

### 4. Monitoring & Debugging

```javascript
// Collect snapshots for analysis
async function monitorLimiter(limiter, duration = 60000) {
  const snapshots = [];
  const interval = 5000; // Every 5 seconds
  const iterations = duration / interval;

  for (let i = 0; i < iterations; i++) {
    if (limiter.constructor.name === 'RedisTokenBucket') {
      snapshots.push(await limiter.exportState());
    } else {
      snapshots.push(limiter.toJSON());
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  // Analyze token consumption over time
  const analysis = snapshots.map((s, i) => ({
    time: i * interval,
    tokens: s.tokens,
    consumed: i > 0 ? snapshots[i-1].tokens - s.tokens : 0
  }));

  fs.writeFileSync('limiter-analysis.json', JSON.stringify(analysis, null, 2));
  return analysis;
}
```

### 5. Testing & Simulation

```javascript
// Set up specific state for testing
const TokenBucket = require('./src/algorithms/javascript/token-bucket');

function createLimiterWithState(capacity, tokens, refillRate) {
  const state = {
    capacity,
    tokens,
    refillRate,
    lastRefill: Date.now()
  };
  return TokenBucket.fromJSON(state);
}

// Test edge cases
describe('Rate Limiting Edge Cases', () => {
  it('should deny when out of tokens', () => {
    const limiter = createLimiterWithState(100, 0, 10);
    expect(limiter.allowRequest()).toBe(false);
  });

  it('should allow when tokens available', () => {
    const limiter = createLimiterWithState(100, 50, 10);
    expect(limiter.allowRequest(30)).toBe(true);
  });
});
```

## Best Practices

### 1. Periodic Snapshots
Save state periodically rather than on every request to avoid I/O overhead:

```javascript
// Good: Periodic saves
setInterval(() => saveState(limiter.toJSON()), 10000); // Every 10 seconds

// Bad: Save on every request
app.use((req, res, next) => {
  limiter.allowRequest();
  saveState(limiter.toJSON()); // Too frequent!
  next();
});
```

### 2. Graceful Shutdown
Always save state on shutdown signals:

```javascript
process.on('SIGTERM', async () => {
  console.log('Saving limiter state before shutdown...');
  
  if (limiter instanceof RedisTokenBucket) {
    const snapshot = await limiter.exportState();
    fs.writeFileSync('final-state.json', JSON.stringify(snapshot));
  } else {
    const state = limiter.toJSON();
    fs.writeFileSync('final-state.json', JSON.stringify(state));
  }
  
  process.exit(0);
});
```

### 3. Error Handling
Always handle serialization errors:

```javascript
try {
  const state = limiter.toJSON();
  fs.writeFileSync('state.json', JSON.stringify(state));
} catch (error) {
  console.error('Failed to save limiter state:', error.message);
  // Continue running - don't crash the application
}

try {
  const savedState = JSON.parse(fs.readFileSync('state.json'));
  limiter = TokenBucket.fromJSON(savedState);
} catch (error) {
  console.error('Failed to restore state, starting fresh:', error.message);
  limiter = new TokenBucket(1000, 100); // Fallback to new limiter
}
```

### 4. Version Compatibility
Always check version field when restoring:

```javascript
function restoreLimiter(stateFile) {
  const state = JSON.parse(fs.readFileSync(stateFile));
  
  if (state.version !== 1) {
    throw new Error(`Unsupported state version: ${state.version}`);
  }
  
  return TokenBucket.fromJSON(state);
}
```

### 5. Atomic Writes
Use atomic file operations to prevent corruption:

```javascript
const fs = require('fs');
const path = require('path');

function saveStateSafely(state, filePath) {
  const tempPath = `${filePath}.tmp`;
  
  // Write to temp file first
  fs.writeFileSync(tempPath, JSON.stringify(state, null, 2));
  
  // Atomic rename
  fs.renameSync(tempPath, filePath);
}
```

### 6. Redis Persistence
For Redis-backed limiters, rely on Redis persistence (RDB/AOF) for durability:

```javascript
// Redis handles persistence automatically
// Configure in redis.conf:
// save 900 1       # Save after 900 seconds if at least 1 key changed
// appendonly yes   # Enable AOF for maximum durability

// Only use exportState/importState for:
// - Cross-region migration
// - Backup to external storage
// - State inspection/debugging
```

### 7. Compression for Large Datasets
Compress state when saving many limiters:

```javascript
const zlib = require('zlib');

function saveCompressed(data, filePath) {
  const json = JSON.stringify(data);
  const compressed = zlib.gzipSync(json);
  fs.writeFileSync(`${filePath}.gz`, compressed);
}

function loadCompressed(filePath) {
  const compressed = fs.readFileSync(`${filePath}.gz`);
  const json = zlib.gunzipSync(compressed).toString();
  return JSON.parse(json);
}
```

## API Reference

### TokenBucket Methods

| Method | Return Type | Description |
|--------|-------------|-------------|
| `toJSON()` | `Object` | Serializes complete bucket state |
| `TokenBucket.fromJSON(json)` | `TokenBucket` | Static: Restores from serialized state |
| `clone()` | `TokenBucket` | Creates independent copy |

### RedisTokenBucket Methods

| Method | Return Type | Description |
|--------|-------------|-------------|
| `toJSON()` | `Object` | Exports configuration (not state) |
| `RedisTokenBucket.fromJSON(redis, json)` | `RedisTokenBucket` | Static: Reconnects to Redis bucket |
| `exportState()` | `Promise<Object>` | Exports complete state from Redis |
| `importState(snapshot)` | `Promise<void>` | Imports complete state into Redis |

## Related Documentation

- [Token Bucket Algorithm Guide](./TOKEN_BUCKET.md)
- [Redis Implementation Guide](./REDIS.md)
- [Express Middleware Guide](./EXPRESS_MIDDLEWARE.md)
- [Configuration Guide](./CONFIGURATION.md)
