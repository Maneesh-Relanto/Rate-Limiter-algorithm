/**
 * Default configuration values for Express middleware
 * 
 * This file contains all configurable defaults used by the rate limiting middleware.
 * You can override these by creating a custom configuration or using environment variables.
 */

/**
 * Default rate limit configurations
 * Can be overridden via environment variables or passed directly to middleware
 */
const DEFAULT_RATE_LIMITS = {
  // Global rate limit defaults
  global: {
    capacity: Number.parseInt(process.env.RATE_LIMIT_GLOBAL_CAPACITY, 10) || 1000,
    refillRate: Number.parseFloat(process.env.RATE_LIMIT_GLOBAL_REFILL_RATE) || 16.67, // ~1000/min
    refillInterval: Number.parseInt(process.env.RATE_LIMIT_GLOBAL_INTERVAL, 10) || 1000
  },

  // Per-IP rate limit defaults
  perIp: {
    capacity: Number.parseInt(process.env.RATE_LIMIT_PER_IP_CAPACITY, 10) || 100,
    refillRate: Number.parseFloat(process.env.RATE_LIMIT_PER_IP_REFILL_RATE) || 1.67, // ~100/min
    refillInterval: Number.parseInt(process.env.RATE_LIMIT_PER_IP_INTERVAL, 10) || 1000
  },

  // Per-user rate limit defaults
  perUser: {
    capacity: Number.parseInt(process.env.RATE_LIMIT_PER_USER_CAPACITY, 10) || 500,
    refillRate: Number.parseFloat(process.env.RATE_LIMIT_PER_USER_REFILL_RATE) || 8.33, // ~500/min
    refillInterval: Number.parseInt(process.env.RATE_LIMIT_PER_USER_INTERVAL, 10) || 1000,
    fallbackToIp: process.env.RATE_LIMIT_PER_USER_FALLBACK_TO_IP === 'true' || false
  },

  // Per-endpoint rate limit defaults
  perEndpoint: {
    capacity: Number.parseInt(process.env.RATE_LIMIT_PER_ENDPOINT_CAPACITY, 10) || 50,
    refillRate: Number.parseFloat(process.env.RATE_LIMIT_PER_ENDPOINT_REFILL_RATE) || 0.83, // ~50/min
    refillInterval: Number.parseInt(process.env.RATE_LIMIT_PER_ENDPOINT_INTERVAL, 10) || 1000
  },

  // Sensitive endpoints (login, password reset, etc.)
  sensitive: {
    capacity: Number.parseInt(process.env.RATE_LIMIT_SENSITIVE_CAPACITY, 10) || 5,
    refillRate: Number.parseFloat(process.env.RATE_LIMIT_SENSITIVE_REFILL_RATE) || 0.083, // ~5/hour
    refillInterval: Number.parseInt(process.env.RATE_LIMIT_SENSITIVE_INTERVAL, 10) || 1000
  }
};

/**
 * Header configuration defaults
 */
const DEFAULT_HEADERS = {
  // Use standard draft spec headers (RateLimit-*)
  standardHeaders: process.env.RATE_LIMIT_STANDARD_HEADERS !== 'false',
  
  // Use legacy headers (X-RateLimit-*)
  legacyHeaders: process.env.RATE_LIMIT_LEGACY_HEADERS !== 'false',
  
  // Include Retry-After header on 429 responses
  retryAfter: process.env.RATE_LIMIT_RETRY_AFTER_HEADER !== 'false'
};

/**
 * Cost-based rate limiting defaults
 */
const DEFAULT_COSTS = {
  // Default token cost per request
  default: Number.parseInt(process.env.RATE_LIMIT_DEFAULT_COST, 10) || 1,
  
  // Cost tiers for common operations
  tiers: {
    read: Number.parseInt(process.env.RATE_LIMIT_COST_READ, 10) || 1,
    write: Number.parseInt(process.env.RATE_LIMIT_COST_WRITE, 10) || 5,
    search: Number.parseInt(process.env.RATE_LIMIT_COST_SEARCH, 10) || 10,
    analytics: Number.parseInt(process.env.RATE_LIMIT_COST_ANALYTICS, 10) || 20,
    export: Number.parseInt(process.env.RATE_LIMIT_COST_EXPORT, 10) || 50,
    bulk: Number.parseInt(process.env.RATE_LIMIT_COST_BULK, 10) || 100
  }
};

/**
 * Redis configuration defaults
 */
const DEFAULT_REDIS = {
  // Key prefix for Redis keys
  keyPrefix: process.env.RATE_LIMIT_REDIS_KEY_PREFIX || 'ratelimit:',
  
  // TTL for Redis keys (in seconds)
  ttl: Number.parseInt(process.env.RATE_LIMIT_REDIS_TTL, 10) || 3600,
  
  // Fail-open on Redis errors (allow requests if Redis is down)
  failOpen: process.env.RATE_LIMIT_REDIS_FAIL_OPEN !== 'false'
};

/**
 * Error handling defaults
 */
const DEFAULT_ERROR_HANDLING = {
  // HTTP status code for rate limit exceeded
  statusCode: Number.parseInt(process.env.RATE_LIMIT_ERROR_STATUS_CODE, 10) || 429,
  
  // Default error message
  message: process.env.RATE_LIMIT_ERROR_MESSAGE || 'Too many requests, please try again later.',
  
  // Include detailed error information in response
  includeDetails: process.env.RATE_LIMIT_ERROR_INCLUDE_DETAILS !== 'false'
};

/**
 * Monitoring and logging defaults
 */
const DEFAULT_MONITORING = {
  // Enable logging of rate limit events
  enableLogging: process.env.RATE_LIMIT_ENABLE_LOGGING === 'true',
  
  // Log level (error, warn, info, debug)
  logLevel: process.env.RATE_LIMIT_LOG_LEVEL || 'warn',
  
  // Enable metrics collection
  enableMetrics: process.env.RATE_LIMIT_ENABLE_METRICS === 'true'
};

/**
 * Skip patterns - requests matching these will bypass rate limiting
 */
const DEFAULT_SKIP_PATTERNS = {
  // Health check endpoints
  healthChecks: [
    '/health',
    '/healthz',
    '/ping',
    '/status',
    '/_health',
    '/_internal/health'
  ].concat((process.env.RATE_LIMIT_SKIP_HEALTH_CHECKS || '').split(',').filter(Boolean)),
  
  // Internal endpoints
  internal: [
    '/_internal/',
    '/_admin/',
    '/_system/'
  ].concat((process.env.RATE_LIMIT_SKIP_INTERNAL || '').split(',').filter(Boolean)),
  
  // Static assets
  static: [
    '/static/',
    '/assets/',
    '/public/',
    '/favicon.ico',
    '/robots.txt'
  ].concat((process.env.RATE_LIMIT_SKIP_STATIC || '').split(',').filter(Boolean))
};

/**
 * Trusted IP addresses and networks
 * These IPs will bypass rate limiting by default
 */
const DEFAULT_TRUSTED_IPS = (process.env.RATE_LIMIT_TRUSTED_IPS || '')
  .split(',')
  .map(ip => ip.trim())
  .filter(Boolean);

/**
 * Helper function to merge user config with defaults
 * 
 * @param {Object} userConfig - User-provided configuration
 * @param {Object} defaults - Default configuration
 * @returns {Object} Merged configuration
 */
function mergeWithDefaults(userConfig = {}, defaults = {}) {
  const merged = { ...defaults };
  
  for (const [key, value] of Object.entries(userConfig)) {
    if (value !== undefined && value !== null) {
      if (typeof value === 'object' && !Array.isArray(value) && typeof defaults[key] === 'object') {
        merged[key] = mergeWithDefaults(value, defaults[key]);
      } else {
        merged[key] = value;
      }
    }
  }
  
  return merged;
}

/**
 * Get complete configuration with defaults applied
 * 
 * @param {Object} userConfig - User-provided configuration
 * @returns {Object} Complete configuration
 */
function getConfig(userConfig = {}) {
  return {
    rateLimits: mergeWithDefaults(userConfig.rateLimits, DEFAULT_RATE_LIMITS),
    headers: mergeWithDefaults(userConfig.headers, DEFAULT_HEADERS),
    costs: mergeWithDefaults(userConfig.costs, DEFAULT_COSTS),
    redis: mergeWithDefaults(userConfig.redis, DEFAULT_REDIS),
    errorHandling: mergeWithDefaults(userConfig.errorHandling, DEFAULT_ERROR_HANDLING),
    monitoring: mergeWithDefaults(userConfig.monitoring, DEFAULT_MONITORING),
    skipPatterns: mergeWithDefaults(userConfig.skipPatterns, DEFAULT_SKIP_PATTERNS),
    trustedIps: userConfig.trustedIps || DEFAULT_TRUSTED_IPS
  };
}

/**
 * Check if a request should be skipped based on default patterns
 * 
 * @param {Object} req - Express request object
 * @param {Object} config - Configuration object
 * @returns {boolean} True if request should skip rate limiting
 */
function shouldSkipByDefault(req, config = {}) {
  const fullConfig = getConfig(config);
  const path = req.path || req.url;
  const ip = req.ip;
  
  // Check trusted IPs
  if (fullConfig.trustedIps.includes(ip)) {
    return true;
  }
  
  // Check skip patterns
  const allPatterns = [
    ...fullConfig.skipPatterns.healthChecks,
    ...fullConfig.skipPatterns.internal,
    ...fullConfig.skipPatterns.static
  ];
  
  return allPatterns.some(pattern => {
    if (pattern.endsWith('/')) {
      return path.startsWith(pattern);
    }
    return path === pattern || path.startsWith(`${pattern}/`);
  });
}

module.exports = {
  DEFAULT_RATE_LIMITS,
  DEFAULT_HEADERS,
  DEFAULT_COSTS,
  DEFAULT_REDIS,
  DEFAULT_ERROR_HANDLING,
  DEFAULT_MONITORING,
  DEFAULT_SKIP_PATTERNS,
  DEFAULT_TRUSTED_IPS,
  mergeWithDefaults,
  getConfig,
  shouldSkipByDefault
};
