# API Reference

Complete API documentation for all rate limiting algorithms, middleware, and utilities.

## Table of Contents

1. [TokenBucket (In-Memory)](#tokenbucket-in-memory)
2. [RedisTokenBucket (Distributed)](#redistokenbucket-distributed)
3. [Express Middleware](#express-middleware)
4. [ConfigManager](#configmanager)
5. [Type Definitions (TypeScript)](#type-definitions-typescript)

---

## TokenBucket (In-Memory)

Single-server, in-memory Token Bucket implementation with event emitters.

### Constructor

```javascript
new TokenBucket(capacity, refillRate, refillInterval = 1000)
```

**Parameters:**
- `capacity` (number): Maximum number of tokens the bucket can hold
- `refillRate` (number): Number of tokens added per refill interval
- `refillInterval` (number, optional): Milliseconds between refills (default: 1000ms)

**Example:**
```javascript
const TokenBucket = require('./src/algorithms/javascript/token-bucket');

// 100 tokens, refill 10 tokens per second
const limiter = new TokenBucket(100, 10, 1000);
```

### Methods

#### allowRequest(cost = 1)

Check if request is allowed and consume tokens.

**Parameters:**
- `cost` (number, optional): Number of tokens to consume (default: 1)

**Returns:**
```javascript
{
  allowed: boolean,        // Whether request is allowed
  remainingTokens: number, // Tokens remaining after this request
  retryAfter: number       // Milliseconds until next token (if rejected)
}
```

**Example:**
```javascript
const result = limiter.allowRequest();
if (result.allowed) {
  console.log(`Request allowed. ${result.remainingTokens} tokens remaining`);
} else {
  console.log(`Rate limited. Retry after ${result.retryAfter}ms`);
}

// Cost-based request (consumes 5 tokens)
const heavyResult = limiter.allowRequest(5);
```

#### penalty(amount)

Remove tokens as penalty (cannot go below 0).

**Parameters:**
- `amount` (number): Number of tokens to remove

**Returns:**
```javascript
{
  penaltyApplied: boolean, // Always true
  tokensRemoved: number,   // Actual tokens removed
  remainingTokens: number  // Tokens remaining after penalty
}
```

**Example:**
```javascript
// Penalize by 10 tokens for spam
const result = limiter.penalty(10);
console.log(`Removed ${result.tokensRemoved} tokens`);
```

#### reward(amount)

Add bonus tokens (cannot exceed capacity).

**Parameters:**
- `amount` (number): Number of tokens to add

**Returns:**
```javascript
{
  rewardApplied: boolean,  // Always true
  tokensAdded: number,     // Actual tokens added
  remainingTokens: number  // Tokens after reward
}
```

**Example:**
```javascript
// Reward verified user with 20 tokens
const result = limiter.reward(20);
console.log(`Added ${result.tokensAdded} tokens`);
```

#### block(durationMs)

Block all requests for specified duration.

**Parameters:**
- `durationMs` (number): Block duration in milliseconds

**Returns:**
```javascript
{
  blocked: boolean,        // Always true
  duration: number,        // Block duration in ms
  blockedUntil: number     // Timestamp when block expires
}
```

**Example:**
```javascript
// Block for 5 minutes
const result = limiter.block(5 * 60 * 1000);
console.log(`Blocked until ${new Date(result.blockedUntil).toISOString()}`);
```

#### unblock()

Remove active block immediately.

**Returns:**
```javascript
{
  unblocked: boolean,      // Always true
  wasBlocked: boolean      // true if was previously blocked
}
```

**Example:**
```javascript
const result = limiter.unblock();
console.log(`Unblocked. Was blocked: ${result.wasBlocked}`);
```

#### isBlocked()

Check if bucket is currently blocked.

**Returns:** `boolean` - true if blocked, false otherwise

**Example:**
```javascript
if (limiter.isBlocked()) {
  console.log('Currently blocked');
}
```

#### getBlockTimeRemaining()

Get remaining block duration.

**Returns:** `number` - Milliseconds until block expires (0 if not blocked)

**Example:**
```javascript
const remaining = limiter.getBlockTimeRemaining();
console.log(`Block expires in ${Math.ceil(remaining / 1000)} seconds`);
```

#### getAvailableTokens()

Get current token count (with auto-refill applied).

**Returns:** `number` - Available tokens

**Example:**
```javascript
const tokens = limiter.getAvailableTokens();
console.log(`${tokens} tokens available`);
```

#### getTimeUntilNextToken()

Calculate time until next token becomes available.

**Returns:** `number` - Milliseconds until next token (0 if tokens available)

**Example:**
```javascript
const waitTime = limiter.getTimeUntilNextToken();
if (waitTime > 0) {
  console.log(`Wait ${waitTime}ms for next token`);
}
```

#### reset()

Reset bucket to initial state (full capacity, unblocked).

**Returns:**
```javascript
{
  reset: boolean,          // Always true
  tokensRestored: number,  // Tokens added to reach capacity
  remainingTokens: number  // Always equals capacity
}
```

**Example:**
```javascript
const result = limiter.reset();
console.log(`Reset complete. ${result.remainingTokens} tokens available`);
```

#### getState()

Get complete bucket state (non-mutating).

**Returns:**
```javascript
{
  capacity: number,        // Maximum tokens
  tokens: number,          // Current tokens
  refillRate: number,      // Tokens per interval
  refillInterval: number,  // Milliseconds per refill
  lastRefill: number,      // Timestamp of last refill
  blocked: boolean,        // Block status
  blockedUntil: number     // Block expiry timestamp (0 if not blocked)
}
```

**Example:**
```javascript
const state = limiter.getState();
console.log(`Capacity: ${state.capacity}, Available: ${state.tokens}`);
```

#### toJSON()

Serialize bucket state to JSON (for persistence).

**Returns:**
```javascript
{
  version: number,         // Serialization format version
  capacity: number,
  tokens: number,
  refillRate: number,
  refillInterval: number,
  lastRefill: number,
  blocked: boolean,
  blockedUntil: number,
  timestamp: number,       // Serialization timestamp
  metadata: {
    serializedAt: string,  // ISO 8601 timestamp
    className: string      // "TokenBucket"
  }
}
```

**Example:**
```javascript
const state = limiter.toJSON();
fs.writeFileSync('limiter-state.json', JSON.stringify(state, null, 2));
```

#### fromJSON(json) (static)

Restore bucket from serialized state.

**Parameters:**
- `json` (object): Serialized state from `toJSON()`

**Returns:** `TokenBucket` - Restored bucket instance

**Example:**
```javascript
const savedState = JSON.parse(fs.readFileSync('limiter-state.json'));
const limiter = TokenBucket.fromJSON(savedState);
```

#### clone()

Create independent copy of bucket.

**Returns:** `TokenBucket` - Deep copy

**Example:**
```javascript
const copy = limiter.clone();
copy.allowRequest(); // Doesn't affect original
```

### Events

TokenBucket extends EventEmitter and emits the following events:

#### 'allowed'

Emitted when request is allowed.

**Event Data:**
```javascript
{
  timestamp: number,       // Event timestamp
  cost: number,            // Tokens consumed
  remainingTokens: number, // Tokens after consumption
  capacity: number         // Bucket capacity
}
```

**Example:**
```javascript
limiter.on('allowed', (data) => {
  console.log(`Request allowed. ${data.remainingTokens}/${data.capacity} remaining`);
});
```

#### 'rateLimitExceeded'

Emitted when request is rejected (rate limit exceeded).

**Event Data:**
```javascript
{
  timestamp: number,
  cost: number,            // Tokens requested
  remainingTokens: number, // Current tokens
  capacity: number,
  retryAfter: number       // Ms until next token
}
```

**Example:**
```javascript
limiter.on('rateLimitExceeded', (data) => {
  console.log(`Rate limited. Retry after ${data.retryAfter}ms`);
});
```

#### 'penalty'

Emitted when penalty is applied.

**Event Data:**
```javascript
{
  timestamp: number,
  tokensRemoved: number,   // Actual tokens removed
  requestedAmount: number, // Penalty amount requested
  remainingTokens: number
}
```

#### 'reward'

Emitted when reward is applied.

**Event Data:**
```javascript
{
  timestamp: number,
  tokensAdded: number,     // Actual tokens added
  requestedAmount: number, // Reward amount requested
  remainingTokens: number
}
```

#### 'blocked'

Emitted when bucket is blocked.

**Event Data:**
```javascript
{
  timestamp: number,
  duration: number,        // Block duration in ms
  blockedUntil: number     // Expiry timestamp
}
```

#### 'unblocked'

Emitted when bucket is unblocked.

**Event Data:**
```javascript
{
  timestamp: number,
  wasBlocked: boolean      // true if manual unblock, false if auto-expired
}
```

#### 'reset'

Emitted when bucket is reset.

**Event Data:**
```javascript
{
  timestamp: number,
  tokensRestored: number,
  capacity: number
}
```

---

## RedisTokenBucket (Distributed)

Distributed Token Bucket implementation using Redis for multi-server deployments.

### Constructor

```javascript
new RedisTokenBucket(redis, key, capacity, refillRate, refillInterval = 1000, options = {})
```

**Parameters:**
- `redis` (object): Redis client instance (ioredis, node-redis v4+, or node-redis v3)
- `key` (string): Redis key for this bucket
- `capacity` (number): Maximum tokens
- `refillRate` (number): Tokens per interval
- `refillInterval` (number, optional): Ms between refills (default: 1000)
- `options` (object, optional):
  - `ttl` (number): Redis key TTL in seconds (default: 3600)
  - `enableInsurance` (boolean): Enable in-memory fallback (default: true)
  - `insuranceCapacity` (number): Insurance bucket capacity (default: same as capacity)
  - `insuranceRefillRate` (number): Insurance refill rate (default: same as refillRate)

**Example:**
```javascript
const Redis = require('ioredis');
const RedisTokenBucket = require('./src/algorithms/javascript/redis-token-bucket');

const redis = new Redis();
const limiter = new RedisTokenBucket(
  redis,
  'rate_limit:user:123',
  100,
  10,
  1000,
  { ttl: 3600, enableInsurance: true }
);
```

### Methods

All methods are **async** and return Promises.

#### allowRequest(cost = 1)

Check if request is allowed (distributed, atomic operation).

**Parameters:**
- `cost` (number, optional): Tokens to consume (default: 1)

**Returns:**
```javascript
{
  allowed: boolean,
  remainingTokens: number,
  retryAfter: number,
  source: string           // 'redis' or 'insurance'
}
```

**Example:**
```javascript
const result = await limiter.allowRequest();
if (result.allowed) {
  console.log(`Allowed via ${result.source}`);
}
```

#### penalty(amount)

Apply penalty (distributed).

**Returns:**
```javascript
{
  penaltyApplied: boolean,
  tokensRemoved: number,
  remainingTokens: number,
  source: string
}
```

#### reward(amount)

Apply reward (distributed).

**Returns:**
```javascript
{
  rewardApplied: boolean,
  tokensAdded: number,
  remainingTokens: number,
  source: string
}
```

#### block(durationMs)

Block bucket (distributed).

**Returns:**
```javascript
{
  blocked: boolean,
  duration: number,
  blockedUntil: number,
  source: string
}
```

#### unblock()

Unblock bucket (distributed).

**Returns:**
```javascript
{
  unblocked: boolean,
  wasBlocked: boolean,
  source: string
}
```

#### isBlocked()

Check block status (distributed).

**Returns:** `boolean`

#### getBlockTimeRemaining()

Get remaining block duration (distributed).

**Returns:** `number` - Milliseconds

#### getAvailableTokens()

Get current tokens (distributed).

**Returns:** `number`

#### getTimeUntilNextToken()

Calculate wait time (distributed).

**Returns:** `number` - Milliseconds

#### reset()

Reset bucket (distributed).

**Returns:**
```javascript
{
  reset: boolean,
  tokensRestored: number,
  remainingTokens: number,
  source: string
}
```

#### getState()

Get complete state (distributed).

**Returns:**
```javascript
{
  capacity: number,
  tokens: number,
  refillRate: number,
  refillInterval: number,
  lastRefill: number,
  blocked: boolean,
  blockedUntil: number,
  source: string
}
```

#### delete()

Delete bucket from Redis.

**Returns:**
```javascript
{
  deleted: boolean,
  existed: boolean         // true if key existed
}
```

**Example:**
```javascript
await limiter.delete();
```

#### isHealthy()

Check Redis connection health.

**Returns:**
```javascript
{
  healthy: boolean,
  latency: number,         // Ping latency in ms
  error: string           // Error message if unhealthy
}
```

**Example:**
```javascript
const health = await limiter.isHealthy();
if (!health.healthy) {
  console.error('Redis unhealthy:', health.error);
}
```

### Properties

#### insuranceLimiter (readonly)

Access the in-memory insurance bucket (if enabled).

**Type:** `TokenBucket | null`

**Example:**
```javascript
if (limiter.insuranceLimiter) {
  console.log('Insurance is active');
}
```

### Events

Inherits all TokenBucket events with additional fields:

- All event data includes `source: 'redis' | 'insurance'`
- Additional event: `'redisError'` emitted on Redis failures
- Additional event: `'insuranceActivated'` when falling back to insurance
- Additional event: `'insuranceDeactivated'` when Redis recovers

---

## Express Middleware

Pre-built middleware functions for Express.js integration.

### tokenBucketMiddleware(options)

Create in-memory rate limiting middleware.

**Parameters:**
- `options` (object):
  - `capacity` (number, required): Bucket capacity
  - `refillRate` (number, required): Refill rate
  - `refillInterval` (number, optional): Refill interval (default: 1000ms)
  - `keyGenerator` (function, optional): Extract key from request (default: `req.ip`)
  - `skipFailedRequests` (boolean, optional): Don't count failed requests (default: false)
  - `skipSuccessfulRequests` (boolean, optional): Don't count successful requests (default: false)
  - `requestWasSuccessful` (function, optional): Determine if request succeeded
  - `onLimitReached` (function, optional): Custom error handler
  - `headers` (object, optional): Customize response headers
  - `standardHeaders` (boolean, optional): Use RateLimit- headers (default: true)
  - `legacyHeaders` (boolean, optional): Use X-RateLimit- headers (default: true)

**Returns:** Express middleware function

**Example:**
```javascript
const { tokenBucketMiddleware } = require('./src/middleware/express/token-bucket-middleware');

app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  keyGenerator: (req) => req.user?.id || req.ip,
  onLimitReached: (req, res) => {
    res.status(429).json({ error: 'Too many requests' });
  }
}));
```

### redisTokenBucketMiddleware(options)

Create distributed rate limiting middleware using Redis.

**Parameters:**
- Same as `tokenBucketMiddleware` plus:
  - `redis` (object, required): Redis client instance
  - `keyPrefix` (string, optional): Prefix for Redis keys (default: 'rate_limit:')
  - `ttl` (number, optional): Redis key TTL in seconds (default: 3600)
  - `enableInsurance` (boolean, optional): Enable fallback (default: true)

**Example:**
```javascript
const Redis = require('ioredis');
const { redisTokenBucketMiddleware } = require('./src/middleware/express/redis-token-bucket-middleware');

const redis = new Redis();

app.use(redisTokenBucketMiddleware({
  redis,
  capacity: 100,
  refillRate: 10,
  keyPrefix: 'api_limit:',
  keyGenerator: (req) => req.user?.id || req.ip
}));
```

### Helper Functions

#### globalRateLimit(options)

Apply single bucket across all requests.

**Example:**
```javascript
const { globalRateLimit } = require('./src/middleware/express/token-bucket-middleware');

app.use(globalRateLimit({ capacity: 1000, refillRate: 100 }));
```

#### perIpRateLimit(options)

Apply separate bucket per IP address.

**Example:**
```javascript
const { perIpRateLimit } = require('./src/middleware/express/token-bucket-middleware');

app.use(perIpRateLimit({ capacity: 100, refillRate: 10 }));
```

#### perUserRateLimit(options)

Apply separate bucket per authenticated user.

**Example:**
```javascript
const { perUserRateLimit } = require('./src/middleware/express/token-bucket-middleware');

app.use(perUserRateLimit({ 
  capacity: 200, 
  refillRate: 20,
  userProperty: 'user.id'  // Path to user ID in req object
}));
```

#### setRequestCost(cost, options)

Middleware to set variable token cost per request.

**Parameters:**
- `cost` (number | function): Token cost or function to calculate cost
- `options` (object, optional): Additional options

**Example:**
```javascript
const { setRequestCost, perIpRateLimit } = require('./src/middleware/express/token-bucket-middleware');

// Heavy endpoint costs 5 tokens
app.post('/api/expensive', 
  setRequestCost(5),
  perIpRateLimit({ capacity: 100, refillRate: 10 }),
  (req, res) => { /* handler */ }
);

// Dynamic cost based on request
app.post('/api/query',
  setRequestCost((req) => req.body.complexity || 1),
  perIpRateLimit({ capacity: 100, refillRate: 10 }),
  (req, res) => { /* handler */ }
);
```

#### redisHealthCheck()

Middleware to check Redis health and expose endpoint.

**Example:**
```javascript
const { redisHealthCheck } = require('./src/middleware/express/redis-token-bucket-middleware');

app.get('/health/redis', redisHealthCheck);
// Returns: { healthy: true, latency: 1.23 }
```

### Request Object Extensions

Middleware adds properties to `req.rateLimit`:

```typescript
req.rateLimit = {
  remainingTokens: number,  // Tokens left
  retryAfter: number,       // Wait time if limited (ms)
  limit: number,            // Bucket capacity
  redisHealthy?: boolean    // Redis health (distributed only)
}
```

### Response Headers

#### Standard Headers (RateLimit Draft Spec)
- `RateLimit-Limit`: Bucket capacity
- `RateLimit-Remaining`: Remaining tokens
- `RateLimit-Reset`: Unix timestamp when bucket refills

#### Legacy Headers (X-RateLimit-)
- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

#### Rate Limited Response
- `Retry-After`: Seconds until next token available (429 response only)

---

## ConfigManager

Utility for loading rate limit configuration from JSON files.

### loadConfig(configPath)

Load rate limit configuration from JSON file.

**Parameters:**
- `configPath` (string): Path to JSON config file

**Returns:**
```javascript
{
  endpoints: Array<EndpointConfig>,
  default: RateLimitConfig
}
```

**Example:**
```javascript
const { ConfigManager } = require('./src/utils/config-manager');

const config = ConfigManager.loadConfig('./config/rate-limits.json');
console.log(config.endpoints); // Array of endpoint configs
console.log(config.default);   // Default rate limit
```

### getEndpointConfig(config, path, method)

Find configuration for specific endpoint.

**Parameters:**
- `config` (object): Config object from `loadConfig()`
- `path` (string): Request path
- `method` (string): HTTP method

**Returns:** `EndpointConfig | null`

**Example:**
```javascript
const endpointConfig = ConfigManager.getEndpointConfig(
  config,
  '/api/users',
  'GET'
);
if (endpointConfig) {
  console.log(`Capacity: ${endpointConfig.capacity}`);
}
```

### applyEnvironmentMultiplier(config, environment)

Adjust limits based on environment.

**Parameters:**
- `config` (object): Config from `loadConfig()`
- `environment` (string): 'development' | 'staging' | 'production'

**Returns:** Modified config object

**Example:**
```javascript
const config = ConfigManager.loadConfig('./config/rate-limits.json');
const prodConfig = ConfigManager.applyEnvironmentMultiplier(config, 'production');
// Production gets 1x multiplier, development gets 10x, staging 2x
```

---

## Type Definitions (TypeScript)

Full TypeScript definitions available in `index.d.ts`.

### Import Types

```typescript
import {
  TokenBucket,
  RedisTokenBucket,
  TokenBucketOptions,
  RedisTokenBucketOptions,
  AllowRequestResult,
  TokenBucketState,
  tokenBucketMiddleware,
  redisTokenBucketMiddleware,
  ConfigManager
} from 'rate-limiter';
```

### Type Interfaces

```typescript
interface TokenBucketOptions {
  capacity: number;
  refillRate: number;
  refillInterval?: number;
}

interface AllowRequestResult {
  allowed: boolean;
  remainingTokens: number;
  retryAfter: number;
}

interface TokenBucketState {
  capacity: number;
  tokens: number;
  refillRate: number;
  refillInterval: number;
  lastRefill: number;
  blocked: boolean;
  blockedUntil: number;
}
```

See [index.d.ts](../index.d.ts) for complete type definitions.

---

## Error Handling

### TokenBucket Errors

**Invalid Parameters:**
```javascript
new TokenBucket(-1, 10); // Throws: "Capacity must be a positive number"
new TokenBucket(100, 0); // Throws: "Refill rate must be greater than 0"
```

**Invalid Operations:**
```javascript
limiter.allowRequest(-5); // Throws: "Cost must be a positive number"
limiter.penalty(-10);     // Throws: "Penalty amount must be a positive number"
```

### RedisTokenBucket Errors

**Redis Connection Failures:**
```javascript
try {
  await limiter.allowRequest();
} catch (error) {
  console.error('Redis error:', error);
  // Falls back to insurance bucket if enabled
}
```

**Insurance Fallback:**
```javascript
limiter.on('insuranceActivated', (data) => {
  console.warn('Redis down, using insurance limiter');
});

limiter.on('redisError', (data) => {
  console.error('Redis error:', data.error);
});
```

---

## Performance

### TokenBucket (In-Memory)
- **Operation time**: O(1) constant time
- **Memory**: ~200 bytes per bucket
- **Throughput**: 1M+ operations/second

### RedisTokenBucket (Distributed)
- **Operation time**: O(1) + network latency
- **Latency**: Typically 1-5ms (LAN), 10-50ms (WAN)
- **Throughput**: Limited by Redis (100K+ ops/sec single instance)
- **Memory**: Redis memory + ~500 bytes per bucket (insurance)

### Express Middleware
- **Overhead**: 0.1-0.5ms (in-memory), 1-5ms (Redis)
- **Impact**: Minimal on request latency

---

## Examples

See the [examples/](../examples/) directory for complete working examples:
- [Basic Token Bucket](../examples/javascript/token-bucket-example.js)
- [Redis Token Bucket](../examples/javascript/redis-token-bucket-example.js)
- [Express Integration](../examples/express/server.js)
- [Config-based Setup](../examples/javascript/config-based-example.js)
- [Demo Application](../examples/demo-app/) - Full-featured test app

---

## See Also

- [Setup Guide](guides/SETUP.md) - Installation instructions
- [Best Practices](BEST_PRACTICES.md) - Production deployment
- [Algorithm Comparison](ALGORITHM_COMPARISON.md) - Choose the right algorithm
- [Express Middleware Guide](EXPRESS_MIDDLEWARE_GUIDE.md) - Detailed Express integration
- [Redis Distributed Guide](guides/REDIS_DISTRIBUTED.md) - Multi-server setup
- [State Persistence](STATE_PERSISTENCE.md) - Save/restore bucket state
