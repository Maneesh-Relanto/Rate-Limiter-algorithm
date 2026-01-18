// Main entry point for @rate-limiter/core

// Core algorithms
const TokenBucket = require('./algorithms/javascript/token-bucket');
const RedisTokenBucket = require('./algorithms/javascript/redis-token-bucket');

// Express middleware
const {
  tokenBucketMiddleware,
  redisTokenBucketMiddleware,
  setRequestCost,
  perUserRateLimit,
  perIpRateLimit,
  globalRateLimit,
  redisHealthCheck,
  defaultMiddlewareOptions
} = require('./middleware/express/token-bucket-middleware');

// Utilities
const ConfigManager = require('./utils/config-manager');

module.exports = {
  // Algorithms
  TokenBucket,
  RedisTokenBucket,

  // Middleware
  tokenBucketMiddleware,
  redisTokenBucketMiddleware,
  setRequestCost,
  perUserRateLimit,
  perIpRateLimit,
  globalRateLimit,
  redisHealthCheck,
  defaultMiddlewareOptions,

  // Utilities
  ConfigManager,
  loadConfig: ConfigManager.loadConfig
};
