/**
 * Express Middleware for Redis Token Bucket Rate Limiting
 *
 * Provides distributed rate limiting across multiple servers using Redis.
 * Supports per-user, per-IP, and custom key strategies.
 * Adds standard rate limit headers to responses.
 *
 * @example
 * const Redis = require('ioredis');
 * const { redisTokenBucketMiddleware } = require('./middleware/express/redis-token-bucket-middleware');
 *
 * const redis = new Redis();
 * app.use(redisTokenBucketMiddleware({
 *   redis,
 *   capacity: 100,
 *   refillRate: 10,
 *   keyGenerator: (req) => req.ip
 * }));
 */

const RedisTokenBucket = require('../../algorithms/javascript/redis-token-bucket');
const {
  DEFAULT_HEADERS,
  DEFAULT_REDIS,
  DEFAULT_RATE_LIMITS,
  shouldSkipByDefault
} = require('./defaults');

/**
 * Create distributed rate limiting middleware for Express
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.redis - Redis client instance
 * @param {number} options.capacity - Maximum tokens in bucket
 * @param {number} options.refillRate - Tokens added per second
 * @param {string} options.prefix - Redis key prefix (default: 'rate_limit:')
 * @param {number} options.ttl - Redis key TTL in seconds (default: 3600)
 * @param {Function} options.keyGenerator - Function to generate rate limit key from request
 * @param {Function} options.handler - Custom handler for rate limit exceeded (optional)
 * @param {Function} options.skip - Function to skip rate limiting for certain requests (optional)
 * @param {Object} options.headers - Header configuration (optional)
 * @param {boolean} options.headers.draft - Use draft spec headers (default: true)
 * @param {Function} options.onLimitReached - Callback when limit is reached (optional)
 * @returns {Function} Express middleware function
 */
function redisTokenBucketMiddleware(options = {}) {
  // Validate required options
  if (!options.redis) {
    throw new Error('Redis client is required');
  }
  if (!options.capacity || !options.refillRate) {
    throw new Error('Capacity and refillRate are required');
  }

  // Set defaults
  const config = {
    redis: options.redis,
    capacity: options.capacity,
    refillRate: options.refillRate,
    refillInterval: options.refillInterval || 1000,
    prefix: options.prefix || DEFAULT_REDIS.keyPrefix,
    ttl: options.ttl || DEFAULT_REDIS.ttl,
    keyGenerator: options.keyGenerator || (req => req.ip || 'global'),
    handler: options.handler || defaultHandler,
    skip: options.skip || (req => shouldSkipByDefault(req, options.config)),
    headers: {
      standard:
        options.headers?.standard ?? options.standardHeaders ?? DEFAULT_HEADERS.standardHeaders,
      legacy: options.headers?.legacy ?? options.legacyHeaders ?? DEFAULT_HEADERS.legacyHeaders
    },
    onLimitReached: options.onLimitReached || (() => {}),
    cost: options.cost || 1
  };

  // Store limiters per key  // Store limiters per key (cache limiter instances)
  const limiters = new Map();

  /**
   * Get or create limiter for a key
   */
  function getLimiter(key) {
    const redisKey = `${config.prefix}${key}`;

    if (!limiters.has(key)) {
      limiters.set(
        key,
        new RedisTokenBucket(config.redis, redisKey, config.capacity, config.refillRate, {
          ttl: config.ttl
        })
      );
    }
    return limiters.get(key);
  }

  /**
   * Express middleware function
   */
  return async function redisRateLimitMiddleware(req, res, next) {
    // Check if request should skip rate limiting
    if (config.skip(req)) {
      return next();
    }

    try {
      // Generate key for this request
      const key = config.keyGenerator(req);
      const limiter = getLimiter(key);

      // Determine token cost (can be set by route handler)
      const tokenCost = req.tokenCost || config.cost || 1;

      // Check if request is allowed
      const allowed = await limiter.allowRequest(tokenCost);
      const availableTokens = await limiter.getAvailableTokens();

      // Attach rate limit info to request
      req.rateLimit = {
        limit: config.capacity,
        remaining: Math.max(0, Math.floor(availableTokens)),
        used: config.capacity - Math.floor(availableTokens),
        resetTime: Date.now() + (config.capacity / config.refillRate) * 1000,
        key: key
      };

      // Add rate limit headers
      if (config.headers.standard) {
        res.setHeader('RateLimit-Limit', config.capacity);
        res.setHeader('RateLimit-Remaining', Math.max(0, Math.floor(availableTokens)));
        res.setHeader('RateLimit-Reset', Math.ceil(req.rateLimit.resetTime / 1000));
      }

      // Legacy headers for compatibility
      if (config.headers.legacy) {
        res.setHeader('X-RateLimit-Limit', config.capacity);
        res.setHeader('X-RateLimit-Remaining', Math.max(0, Math.floor(availableTokens)));
        res.setHeader('X-RateLimit-Reset', Math.ceil(req.rateLimit.resetTime / 1000));
      }

      if (allowed) {
        // Request allowed
        return next();
      } else {
        // Rate limit exceeded
        const retryAfter = Math.ceil((await limiter.getTimeUntilNextToken(tokenCost)) / 1000);

        res.setHeader('Retry-After', retryAfter);

        // Call onLimitReached callback
        config.onLimitReached(req, res);

        // Use custom handler or default
        return config.handler(req, res, next);
      }
    } catch (error) {
      // Log error and fail open (allow request)
      console.error('Redis rate limit middleware error:', error);
      return next();
    }
  };
}

/**
 * Default handler for rate limit exceeded
 */
function defaultHandler(req, res) {
  res.status(429).json({
    error: 'Too Many Requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: res.getHeader('Retry-After')
  });
}

/**
 * Create middleware with per-user rate limiting
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.getUserId - Function to extract user ID from request
 * @param {boolean} options.fallbackToIp - Fall back to IP if no user ID (default: false)
 * @returns {Function} Express middleware
 */
function perUserRateLimit(options = {}) {
  if (!options.getUserId) {
    throw new Error('getUserId function is required for perUserRateLimit');
  }

  const defaults = DEFAULT_RATE_LIMITS.perUser;

  return redisTokenBucketMiddleware({
    capacity: options.capacity || defaults.capacity,
    refillRate: options.refillRate || defaults.refillRate,
    refillInterval: options.refillInterval || defaults.refillInterval,
    ...options,
    keyGenerator: req => {
      const userId = options.getUserId(req);
      if (userId) {
        return `user:${userId}`;
      }
      return options.fallbackToIp === false ? 'anonymous' : `ip:${req.ip}`;
    }
  });
}

/**
 * Create middleware with per-IP rate limiting
 *
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
function perIpRateLimit(options = {}) {
  const defaults = DEFAULT_RATE_LIMITS.perIp;

  return redisTokenBucketMiddleware({
    capacity: options.capacity || defaults.capacity,
    refillRate: options.refillRate || defaults.refillRate,
    refillInterval: options.refillInterval || defaults.refillInterval,
    ...options,
    keyGenerator: req => `ip:${req.ip}`
  });
}

/**
 * Create middleware with per-endpoint rate limiting
 *
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
function perEndpointRateLimit(options = {}) {
  const defaults = DEFAULT_RATE_LIMITS.perEndpoint;

  return redisTokenBucketMiddleware({
    capacity: options.capacity || defaults.capacity,
    refillRate: options.refillRate || defaults.refillRate,
    refillInterval: options.refillInterval || defaults.refillInterval,
    ...options,
    keyGenerator: req => {
      const userId = options.getUserId?.(req) || req.ip;
      return `${req.method}:${req.path}:${userId}`;
    }
  });
}

/**
 * Create global rate limiter (single bucket for all requests)
 *
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
function globalRateLimit(options = {}) {
  const defaults = DEFAULT_RATE_LIMITS.global;

  return redisTokenBucketMiddleware({
    capacity: options.capacity || defaults.capacity,
    refillRate: options.refillRate || defaults.refillRate,
    refillInterval: options.refillInterval || defaults.refillInterval,
    ...options,
    keyGenerator: () => 'global'
  });
}

/**
 * Cost-based rate limiting helper
 * Sets token cost for the request based on operation type
 *
 * @param {number|Function} cost - Number of tokens this request costs, or function that returns cost
 * @returns {Function} Express middleware
 */
function setRequestCost(cost) {
  return function (req, res, next) {
    req.tokenCost = typeof cost === 'function' ? cost(req) : cost;
    next();
  };
}

/**
 * Health check middleware for Redis connection
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.redis - Redis client instance
 * @returns {Function} Express middleware
 */
function redisHealthCheck(options = {}) {
  if (!options.redis) {
    throw new Error('Redis client is required');
  }

  return async function (req, res, next) {
    try {
      const result = await options.redis.ping();
      req.redisHealthy = result === 'PONG' || result === true;
    } catch (error) {
      console.error('Redis health check failed in middleware:', error.message);
      req.redisHealthy = false;
    }
    next();
  };
}

module.exports = {
  redisTokenBucketMiddleware,
  perUserRateLimit,
  perIpRateLimit,
  perEndpointRateLimit,
  globalRateLimit,
  setRequestCost,
  redisHealthCheck
};
