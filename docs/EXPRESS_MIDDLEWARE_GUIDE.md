# Express Middleware Guide

Complete guide for integrating Token Bucket rate limiting with Express.js applications.

## Table of Contents

1. [Installation](#installation)
2. [Quick Start](#quick-start)
3. [Basic Usage](#basic-usage)
4. [Helper Functions](#helper-functions)
5. [Configuration Options](#configuration-options)
6. [Custom Handlers](#custom-handlers)
7. [Monitoring & Metrics](#monitoring--metrics)
8. [Cost-Based Rate Limiting](#cost-based-rate-limiting)
9. [Redis (Distributed)](#redis-distributed)
10. [Best Practices](#best-practices)
11. [Examples](#examples)
12. [API Reference](#api-reference)

## Installation

```bash
npm install express
```

## Quick Start

```javascript
const express = require('express');
const { tokenBucketMiddleware } = require('./src/middleware/express/token-bucket-middleware');

const app = express();

// Apply to all routes
app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000
}));

app.get('/api/data', (req, res) => {
  res.json({ message: 'Success!' });
});

app.listen(3000);
```

## Basic Usage

### In-Memory Rate Limiting

```javascript
const { tokenBucketMiddleware } = require('./src/middleware/express/token-bucket-middleware');

// Apply to specific route
app.get('/api/expensive', 
  tokenBucketMiddleware({
    capacity: 10,
    refillRate: 1,
    refillInterval: 1000,
    keyGenerator: (req) => req.ip
  }),
  (req, res) => {
    res.json({ data: 'expensive operation result' });
  }
);
```

### Redis (Distributed) Rate Limiting

For multi-server deployments:

```javascript
const Redis = require('ioredis');
const { tokenBucketMiddleware } = require('./src/middleware/express/redis-token-bucket-middleware');

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

app.use(tokenBucketMiddleware({
  redis,
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000
}));
```

## Helper Functions

Convenient pre-configured middleware for common scenarios:

### 1. Global Rate Limit

Apply single bucket across all users:

```javascript
const { globalRateLimit } = require('./src/middleware/express/token-bucket-middleware');

app.use(globalRateLimit({
  capacity: 1000,
  refillRate: 100,
  refillInterval: 1000 // 100 requests/second globally
}));
```

### 2. Per-IP Rate Limit

Rate limit by client IP address:

```javascript
const { perIpRateLimit } = require('./src/middleware/express/token-bucket-middleware');

app.use(perIpRateLimit({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000 // 10 requests/second per IP
}));
```

### 3. Per-User Rate Limit

Rate limit authenticated users:

```javascript
const { perUserRateLimit } = require('./src/middleware/express/token-bucket-middleware');

// Apply after authentication middleware
app.use(perUserRateLimit({
  capacity: 500,
  refillRate: 50,
  refillInterval: 1000, // 50 requests/second per user
  getUserId: (req) => req.user?.id, // Extract user ID
  fallbackToIp: true // Fall back to IP for unauthenticated requests
}));
```

### 4. Per-Endpoint Rate Limit

Different limits for different endpoints:

```javascript
const { perEndpointRateLimit } = require('./src/middleware/express/token-bucket-middleware');

// Strict limit on sensitive endpoint
app.post('/api/login',
  perEndpointRateLimit({
    capacity: 5,
    refillRate: 1,
    refillInterval: 60000 // 1 per minute per endpoint+IP
  }),
  loginHandler
);

// More relaxed limit on public endpoint
app.get('/api/public',
  perEndpointRateLimit({
    capacity: 100,
    refillRate: 10,
    refillInterval: 1000 // 10 per second per endpoint+IP
  }),
  publicHandler
);
```

## Configuration Options

Complete list of configuration options:

```javascript
tokenBucketMiddleware({
  // Required: Token Bucket parameters
  capacity: 100,              // Maximum tokens
  refillRate: 10,             // Tokens added per interval
  refillInterval: 1000,       // Interval in milliseconds

  // Optional: Redis (for distributed)
  redis: redisClient,         // Redis client instance

  // Optional: Key generation
  keyGenerator: (req) => {    // Function to generate bucket key
    return req.user?.id || req.ip;
  },

  // Optional: Skip conditions
  skip: (req) => {            // Skip rate limiting for certain requests
    return req.path === '/health' || req.user?.isAdmin;
  },

  // Optional: Custom error handler
  handler: (req, res, next, retryAfter) => {
    res.status(429).json({
      error: 'Too many requests',
      retryAfter: retryAfter,
      message: 'Please slow down'
    });
  },

  // Optional: Monitoring callback
  onLimitReached: (req, info) => {
    console.log('Rate limit reached:', {
      key: info.key,
      ip: req.ip,
      path: req.path,
      retryAfter: info.retryAfter
    });
  },

  // Optional: Header configuration
  standardHeaders: true,      // Use draft spec headers (RateLimit-*)
  legacyHeaders: true,        // Use X-RateLimit-* headers
  
  // Optional: Token cost (default 1)
  cost: 1                     // Tokens consumed per request
})
```

## Custom Handlers

### Custom Error Response

```javascript
app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  handler: (req, res, next, retryAfter) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'You have exceeded the rate limit',
        retryAfter: retryAfter,
        timestamp: new Date().toISOString()
      }
    });
  }
}));
```

### Redirect on Limit

```javascript
app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  handler: (req, res, next, retryAfter) => {
    res.redirect('/rate-limit-exceeded');
  }
}));
```

### Custom Headers

```javascript
app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  handler: (req, res, next, retryAfter) => {
    res.set('X-Custom-Rate-Limit', 'exceeded');
    res.status(429).send('Please wait before making more requests');
  }
}));
```

## Monitoring & Metrics

### Basic Logging

```javascript
app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  onLimitReached: (req, info) => {
    console.log(`[${new Date().toISOString()}] Rate limit exceeded:`, {
      ip: req.ip,
      path: req.path,
      key: info.key,
      retryAfter: info.retryAfter
    });
  }
}));
```

### Metrics Collection

```javascript
const metrics = {
  rateLimitHits: 0,
  byEndpoint: {},
  byUser: {}
};

app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  onLimitReached: (req, info) => {
    metrics.rateLimitHits++;
    
    const endpoint = req.path;
    metrics.byEndpoint[endpoint] = (metrics.byEndpoint[endpoint] || 0) + 1;
    
    if (req.user?.id) {
      metrics.byUser[req.user.id] = (metrics.byUser[req.user.id] || 0) + 1;
    }
  }
}));

// Metrics endpoint
app.get('/metrics', (req, res) => {
  res.json(metrics);
});
```

### Prometheus Integration

```javascript
const promClient = require('prom-client');

const rateLimitCounter = new promClient.Counter({
  name: 'rate_limit_exceeded_total',
  help: 'Total number of rate limit exceeded events',
  labelNames: ['path', 'method']
});

app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  onLimitReached: (req, info) => {
    rateLimitCounter.inc({
      path: req.path,
      method: req.method
    });
  }
}));
```

## Cost-Based Rate Limiting

Different operations can consume different amounts of tokens:

### Basic Cost Assignment

```javascript
const { tokenBucketMiddleware, setRequestCost } = require('./src/middleware/express/token-bucket-middleware');

// Simple operations cost 1 token (default)
app.get('/api/simple', 
  tokenBucketMiddleware({ capacity: 100, refillRate: 10, refillInterval: 1000 }),
  handler
);

// Expensive operations cost more tokens
app.post('/api/expensive',
  setRequestCost(10), // This request costs 10 tokens
  tokenBucketMiddleware({ capacity: 100, refillRate: 10, refillInterval: 1000 }),
  handler
);
```

### Dynamic Cost Calculation

```javascript
// Cost based on request size
app.post('/api/upload',
  (req, res, next) => {
    const sizeMB = parseInt(req.headers['content-length']) / (1024 * 1024);
    const cost = Math.ceil(sizeMB); // 1 token per MB
    req.tokenCost = cost;
    next();
  },
  tokenBucketMiddleware({ capacity: 100, refillRate: 10, refillInterval: 1000 }),
  uploadHandler
);

// Cost based on query complexity
app.get('/api/search',
  (req, res, next) => {
    const { filters, sort, page } = req.query;
    let cost = 1;
    if (filters) cost += 2;
    if (sort) cost += 1;
    if (page > 10) cost += 5; // Deep pagination is expensive
    req.tokenCost = cost;
    next();
  },
  tokenBucketMiddleware({ capacity: 100, refillRate: 10, refillInterval: 1000 }),
  searchHandler
);
```

### Cost Tiers

```javascript
const OPERATION_COSTS = {
  read: 1,
  write: 5,
  search: 10,
  analytics: 20,
  export: 50
};

app.get('/api/data', 
  setRequestCost(OPERATION_COSTS.read),
  tokenBucketMiddleware({ capacity: 100, refillRate: 10, refillInterval: 1000 }),
  handler
);

app.post('/api/data',
  setRequestCost(OPERATION_COSTS.write),
  tokenBucketMiddleware({ capacity: 100, refillRate: 10, refillInterval: 1000 }),
  handler
);

app.get('/api/export',
  setRequestCost(OPERATION_COSTS.export),
  tokenBucketMiddleware({ capacity: 100, refillRate: 10, refillInterval: 1000 }),
  exportHandler
);
```

## Redis (Distributed)

For applications running on multiple servers, use Redis-backed rate limiting:

### Setup

```javascript
const Redis = require('ioredis');
const { 
  tokenBucketMiddleware,
  redisHealthCheck 
} = require('./src/middleware/express/redis-token-bucket-middleware');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD,
  db: 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const redisStatus = await redisHealthCheck(redis);
  res.json({
    status: redisStatus.healthy ? 'ok' : 'degraded',
    redis: redisStatus
  });
});

// Apply Redis-backed rate limiting
app.use(tokenBucketMiddleware({
  redis,
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000
}));
```

### Fail-Open Behavior

Redis middleware implements fail-open: if Redis is unavailable, requests are **allowed** to prevent complete outage:

```javascript
// Requests will be allowed if Redis fails
app.use(tokenBucketMiddleware({
  redis,
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  onLimitReached: (req, info) => {
    // Monitor failed Redis operations
    if (info.redisError) {
      console.error('Redis failure, fail-open activated:', info.redisError);
      // Alert your monitoring system
    }
  }
}));
```

### Key Prefixing

Organize Redis keys with prefixes:

```javascript
app.use(tokenBucketMiddleware({
  redis,
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  keyGenerator: (req) => {
    const userId = req.user?.id || req.ip;
    return `ratelimit:api:${userId}`;
  }
}));
```

### Multiple Redis Instances

Different rate limits for different services:

```javascript
const redisAuth = new Redis({ host: 'redis-auth.local' });
const redisApi = new Redis({ host: 'redis-api.local' });

// Authentication endpoints - strict limit
app.use('/auth', tokenBucketMiddleware({
  redis: redisAuth,
  capacity: 10,
  refillRate: 1,
  refillInterval: 60000 // 1 per minute
}));

// API endpoints - relaxed limit
app.use('/api', tokenBucketMiddleware({
  redis: redisApi,
  capacity: 1000,
  refillRate: 100,
  refillInterval: 1000 // 100 per second
}));
```

## Best Practices

### 1. Layer Your Rate Limits

Apply multiple layers of protection:

```javascript
// Layer 1: Global protection against DDoS
app.use(globalRateLimit({
  capacity: 10000,
  refillRate: 1000,
  refillInterval: 1000
}));

// Layer 2: Per-IP protection
app.use(perIpRateLimit({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000
}));

// Layer 3: Per-user limits (after auth)
app.use('/api', authenticateUser);
app.use('/api', perUserRateLimit({
  capacity: 500,
  refillRate: 50,
  refillInterval: 1000,
  getUserId: (req) => req.user.id
}));

// Layer 4: Endpoint-specific limits
app.post('/api/expensive', 
  perEndpointRateLimit({
    capacity: 10,
    refillRate: 1,
    refillInterval: 60000
  }),
  handler
);
```

### 2. Skip Health Checks

Don't rate limit monitoring endpoints:

```javascript
app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  skip: (req) => {
    return req.path === '/health' || 
           req.path === '/metrics' ||
           req.path.startsWith('/_internal/');
  }
}));
```

### 3. Whitelist Trusted IPs

```javascript
const TRUSTED_IPS = new Set([
  '10.0.0.1',
  '192.168.1.100'
]);

app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  skip: (req) => TRUSTED_IPS.has(req.ip)
}));
```

### 4. Provide Clear Error Messages

```javascript
app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  handler: (req, res, next, retryAfter) => {
    res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Too many requests. Please try again in ${Math.ceil(retryAfter / 1000)} seconds.`,
      retryAfter: retryAfter,
      limit: 100,
      documentation: 'https://api.example.com/docs/rate-limits'
    });
  }
}));
```

### 5. Monitor and Alert

```javascript
const alertThreshold = 100; // Alert after 100 rate limit hits in 5 minutes
let recentHits = [];

app.use(tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  onLimitReached: (req, info) => {
    recentHits.push(Date.now());
    
    // Clean old hits (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    recentHits = recentHits.filter(time => time > fiveMinutesAgo);
    
    // Alert if threshold exceeded
    if (recentHits.length >= alertThreshold) {
      console.error('ALERT: High rate limit activity detected!');
      // Send to monitoring system (PagerDuty, Slack, etc.)
    }
  }
}));
```

### 6. Use Redis for Production

For multi-server deployments, always use Redis:

```javascript
const redis = process.env.NODE_ENV === 'production' 
  ? new Redis(process.env.REDIS_URL)
  : null;

app.use(tokenBucketMiddleware({
  redis, // null in development, Redis client in production
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000
}));
```

## Examples

### Complete Express Application

```javascript
const express = require('express');
const Redis = require('ioredis');
const {
  tokenBucketMiddleware,
  perUserRateLimit,
  perEndpointRateLimit,
  globalRateLimit,
  setRequestCost
} = require('./src/middleware/express/redis-token-bucket-middleware');

const app = express();
const redis = new Redis();

// Middleware
app.use(express.json());

// Global rate limit (anti-DDoS)
app.use(globalRateLimit({
  redis,
  capacity: 10000,
  refillRate: 1000,
  refillInterval: 1000
}));

// Per-IP rate limit
app.use(tokenBucketMiddleware({
  redis,
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  keyGenerator: (req) => req.ip,
  skip: (req) => req.path === '/health'
}));

// Authentication (mock)
app.use('/api', (req, res, next) => {
  const token = req.headers.authorization;
  if (token === 'Bearer valid-token') {
    req.user = { id: '123', isAdmin: false };
  }
  next();
});

// Per-user rate limit (authenticated endpoints)
app.use('/api', perUserRateLimit({
  redis,
  capacity: 500,
  refillRate: 50,
  refillInterval: 1000,
  getUserId: (req) => req.user?.id,
  fallbackToIp: true
}));

// Health check (not rate limited)
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Public endpoint (light operations)
app.get('/api/public', (req, res) => {
  res.json({ message: 'Public data', tokens: req.rateLimit });
});

// Expensive search (costs 10 tokens)
app.get('/api/search',
  setRequestCost(10),
  (req, res) => {
    res.json({ results: [], tokens: req.rateLimit });
  }
);

// Very strict endpoint (login)
app.post('/api/login',
  perEndpointRateLimit({
    redis,
    capacity: 5,
    refillRate: 1,
    refillInterval: 60000
  }),
  (req, res) => {
    res.json({ token: 'mock-token' });
  }
);

// Custom handler example
app.get('/api/custom',
  tokenBucketMiddleware({
    redis,
    capacity: 50,
    refillRate: 5,
    refillInterval: 1000,
    handler: (req, res, next, retryAfter) => {
      res.status(429).json({
        error: 'Slow down!',
        retryAfter: Math.ceil(retryAfter / 1000)
      });
    }
  }),
  (req, res) => {
    res.json({ message: 'Success' });
  }
);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

## API Reference

### tokenBucketMiddleware(options)

Main middleware function for rate limiting.

**Parameters:**
- `options.capacity` (number, required): Maximum tokens in bucket
- `options.refillRate` (number, required): Tokens added per interval
- `options.refillInterval` (number, required): Refill interval in milliseconds
- `options.redis` (object, optional): Redis client for distributed rate limiting
- `options.keyGenerator` (function, optional): Function to generate bucket key from request
- `options.skip` (function, optional): Function to skip rate limiting for certain requests
- `options.handler` (function, optional): Custom error handler
- `options.onLimitReached` (function, optional): Callback when limit is reached
- `options.standardHeaders` (boolean, optional): Use RateLimit-* headers (default: true)
- `options.legacyHeaders` (boolean, optional): Use X-RateLimit-* headers (default: true)
- `options.cost` (number, optional): Tokens consumed per request (default: 1)

**Returns:** Express middleware function

**Response Headers:**
- `RateLimit-Limit`: Maximum requests per window
- `RateLimit-Remaining`: Remaining requests in current window
- `RateLimit-Reset`: Time when the rate limit resets (Unix timestamp)
- `Retry-After`: Seconds to wait before retrying (when rate limited)
- `X-RateLimit-Limit`: (legacy) Same as RateLimit-Limit
- `X-RateLimit-Remaining`: (legacy) Same as RateLimit-Remaining
- `X-RateLimit-Reset`: (legacy) Same as RateLimit-Reset

**Request Object Properties:**
- `req.rateLimit`: Object containing rate limit info
  - `limit`: Maximum tokens
  - `remaining`: Tokens remaining
  - `reset`: Reset time (Date object)
  - `key`: Bucket key used

### globalRateLimit(options)

Helper function for global rate limiting (single bucket for all requests).

**Parameters:** Same as `tokenBucketMiddleware`

**Returns:** Express middleware function

### perIpRateLimit(options)

Helper function for per-IP rate limiting.

**Parameters:** Same as `tokenBucketMiddleware`

**Returns:** Express middleware function

### perUserRateLimit(options)

Helper function for per-user rate limiting.

**Parameters:** 
- All `tokenBucketMiddleware` options, plus:
- `options.getUserId` (function, required): Function to extract user ID from request
- `options.fallbackToIp` (boolean, optional): Fall back to IP if no user ID (default: false)

**Returns:** Express middleware function

### perEndpointRateLimit(options)

Helper function for per-endpoint rate limiting.

**Parameters:** Same as `tokenBucketMiddleware`

**Returns:** Express middleware function

### setRequestCost(cost)

Middleware to set token cost for a request.

**Parameters:**
- `cost` (number, required): Number of tokens to consume

**Returns:** Express middleware function

### redisHealthCheck(redis)

Check Redis connection health (Redis version only).

**Parameters:**
- `redis` (object, required): Redis client instance

**Returns:** Promise<object>
- `healthy` (boolean): Whether Redis is healthy
- `latency` (number|null): Ping latency in milliseconds
- `error` (string|null): Error message if unhealthy

## Rate Limit Headers

### Standard Headers (Draft Spec)

Following the [IETF RateLimit Header Fields draft](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-ratelimit-headers):

- `RateLimit-Limit`: Maximum number of requests allowed in the window
- `RateLimit-Remaining`: Number of requests remaining in current window
- `RateLimit-Reset`: Unix timestamp when the rate limit window resets

### Legacy Headers

For backward compatibility:

- `X-RateLimit-Limit`: Same as RateLimit-Limit
- `X-RateLimit-Remaining`: Same as RateLimit-Remaining  
- `X-RateLimit-Reset`: Same as RateLimit-Reset
- `Retry-After`: Seconds to wait before retrying (only on 429 responses)

### Example Response

```http
HTTP/1.1 200 OK
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1704123456
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1704123456
Content-Type: application/json

{"data": "..."}
```

### Example Rate Limited Response

```http
HTTP/1.1 429 Too Many Requests
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 1704123456
Retry-After: 10
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1704123456
Content-Type: application/json

{"error": "Rate limit exceeded. Retry after 10 seconds."}
```

## Troubleshooting

### Rate limit not working

1. Check middleware order - ensure it's before your route handlers
2. Verify key generation - ensure unique keys per user/IP
3. Check skip conditions - you might be accidentally skipping rate limits

### Too strict rate limiting

1. Increase capacity or refill rate
2. Use per-user instead of per-IP for authenticated users
3. Implement cost-based limiting with lower costs for simple operations

### Redis connection issues

1. Check Redis client configuration
2. Verify network connectivity
3. Monitor fail-open behavior - requests are allowed when Redis fails
4. Implement health checks and alerting

### High memory usage

1. Use Redis for distributed deployments
2. Implement key expiration (TTL)
3. Clean up old buckets periodically

### Headers not appearing

1. Check `standardHeaders` and `legacyHeaders` options
2. Ensure middleware is called before error handlers
3. Verify response hasn't been sent by previous middleware

## Performance Tips

1. **Use Redis for multi-server**: Reduces memory per server
2. **Key prefix strategy**: Organize keys with prefixes for easier management
3. **Set appropriate TTL**: Keys auto-expire in Redis
4. **Monitor Redis latency**: Keep latency under 5ms for best performance
5. **Use skip conditions**: Reduce unnecessary processing
6. **Batch operations**: Use cost-based limiting instead of multiple checks

## Security Considerations

1. **Layer defense**: Use multiple rate limiting strategies
2. **Protect sensitive endpoints**: Stricter limits on auth, password reset, etc.
3. **Monitor for abuse**: Track rate limit hits and alert on patterns
4. **Whitelist carefully**: Only trusted IPs/users
5. **Fail-open vs fail-closed**: Consider impact of Redis outage
6. **Key exhaustion**: Prevent attackers from filling Redis with unique keys

## License

MIT

## Support

For issues and questions:
- GitHub Issues: [your-repo/issues]
- Documentation: [your-docs-url]
- Email: support@example.com
