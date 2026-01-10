/**
 * Express Middleware for Token Bucket Rate Limiting
 * 
 * Provides easy integration of rate limiting into Express applications.
 * Supports per-user, per-IP, and custom key strategies.
 * Adds standard rate limit headers to responses.
 * 
 * @example
 * const { tokenBucketMiddleware } = require('./middleware/express/token-bucket-middleware');
 * 
 * app.use(tokenBucketMiddleware({
 *   capacity: 100,
 *   refillRate: 10,
 *   keyGenerator: (req) => req.ip
 * }));
 */

const TokenBucket = require('../../algorithms/javascript/token-bucket');

/**
 * Create rate limiting middleware for Express
 * 
 * @param {Object} options - Configuration options
 * @param {number} options.capacity - Maximum tokens in bucket
 * @param {number} options.refillRate - Tokens added per second
 * @param {Function} options.keyGenerator - Function to generate rate limit key from request
 * @param {Function} options.handler - Custom handler for rate limit exceeded (optional)
 * @param {Function} options.skip - Function to skip rate limiting for certain requests (optional)
 * @param {Object} options.headers - Header configuration (optional)
 * @param {boolean} options.headers.draft - Use draft spec headers (default: true)
 * @param {boolean} options.standardHeaders - Alias for headers.draft (deprecated)
 * @param {Function} options.onLimitReached - Callback when limit is reached (optional)
 * @returns {Function} Express middleware function
 */
function tokenBucketMiddleware(options = {}) {
  // Validate required options
  if (!options.capacity || !options.refillRate) {
    throw new Error('Capacity and refillRate are required');
  }

  // Set defaults
  const config = {
    capacity: options.capacity,
    refillRate: options.refillRate,
    keyGenerator: options.keyGenerator || ((req) => req.ip || 'global'),
    handler: options.handler || defaultHandler,
    skip: options.skip || (() => false),
    headers: {
      draft: options.headers?.draft ?? options.standardHeaders ?? true
    },
    onLimitReached: options.onLimitReached || (() => {})
  };

  // Store limiters per key
  const limiters = new Map();

  /**
   * Get or create limiter for a key
   */
  function getLimiter(key) {
    if (!limiters.has(key)) {
      limiters.set(key, new TokenBucket(config.capacity, config.refillRate));
    }
    return limiters.get(key);
  }

  /**
   * Express middleware function
   */
  return async function rateLimitMiddleware(req, res, next) {
    // Check if request should skip rate limiting
    if (config.skip(req)) {
      return next();
    }

    try {
      // Generate key for this request
      const key = config.keyGenerator(req);
      const limiter = getLimiter(key);

      // Determine token cost (can be set by route handler)
      const tokenCost = req.rateLimit?.cost || 1;

      // Check if request is allowed
      const allowed = limiter.allowRequest(tokenCost);
      const state = limiter.getState();

      // Attach rate limit info to request
      req.rateLimit = {
        limit: config.capacity,
        remaining: Math.floor(state.availableTokens),
        used: config.capacity - Math.floor(state.availableTokens),
        resetTime: Date.now() + (config.capacity / config.refillRate) * 1000,
        key: key
      };

      // Add rate limit headers
      if (config.headers.draft) {
        res.setHeader('RateLimit-Limit', config.capacity);
        res.setHeader('RateLimit-Remaining', Math.max(0, Math.floor(state.availableTokens)));
        res.setHeader('RateLimit-Reset', Math.ceil(req.rateLimit.resetTime / 1000));
      }

      // Legacy headers for compatibility
      res.setHeader('X-RateLimit-Limit', config.capacity);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, Math.floor(state.availableTokens)));
      res.setHeader('X-RateLimit-Reset', Math.ceil(req.rateLimit.resetTime / 1000));

      if (allowed) {
        // Request allowed
        return next();
      } else {
        // Rate limit exceeded
        const retryAfter = Math.ceil(limiter.getTimeUntilNextToken(tokenCost) / 1000);
        
        res.setHeader('Retry-After', retryAfter);
        
        // Call onLimitReached callback
        config.onLimitReached(req, res);

        // Use custom handler or default
        return config.handler(req, res, next);
      }
    } catch (error) {
      // Log error and fail open (allow request)
      console.error('Rate limit middleware error:', error);
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
 * @returns {Function} Express middleware
 */
function perUserRateLimit(options = {}) {
  if (!options.getUserId) {
    throw new Error('getUserId function is required');
  }

  return tokenBucketMiddleware({
    ...options,
    keyGenerator: (req) => {
      const userId = options.getUserId(req);
      return userId ? `user:${userId}` : `ip:${req.ip}`;
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
  return tokenBucketMiddleware({
    ...options,
    keyGenerator: (req) => `ip:${req.ip}`
  });
}

/**
 * Create middleware with per-endpoint rate limiting
 * 
 * @param {Object} options - Configuration options
 * @returns {Function} Express middleware
 */
function perEndpointRateLimit(options = {}) {
  return tokenBucketMiddleware({
    ...options,
    keyGenerator: (req) => {
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
  return tokenBucketMiddleware({
    ...options,
    keyGenerator: () => 'global'
  });
}

/**
 * Cost-based rate limiting helper
 * Sets token cost for the request based on operation type
 * 
 * @param {number} cost - Number of tokens this request costs
 * @returns {Function} Express middleware
 */
function setRequestCost(cost) {
  return function(req, res, next) {
    req.rateLimit = req.rateLimit || {};
    req.rateLimit.cost = cost;
    next();
  };
}

module.exports = {
  tokenBucketMiddleware,
  perUserRateLimit,
  perIpRateLimit,
  perEndpointRateLimit,
  globalRateLimit,
  setRequestCost
};
