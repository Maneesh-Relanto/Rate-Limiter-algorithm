// Main entry point for @rate-limiter/core

// Core algorithms
const TokenBucket = require('./algorithms/javascript/token-bucket');
const RedisTokenBucket = require('./algorithms/javascript/redis-token-bucket');

// Express middleware - Token Bucket
const {
  tokenBucketMiddleware,
  setRequestCost,
  perUserRateLimit: perUserRateLimitLocal,
  perIpRateLimit: perIpRateLimitLocal,
  globalRateLimit: globalRateLimitLocal
} = require('./middleware/express/token-bucket-middleware');

// Express middleware - Redis Token Bucket
const {
  redisTokenBucketMiddleware,
  perUserRateLimit: perUserRateLimitRedis,
  perIpRateLimit: perIpRateLimitRedis,
  globalRateLimit: globalRateLimitRedis,
  redisHealthCheck
} = require('./middleware/express/redis-token-bucket-middleware');

// Utilities
const { ConfigManager, getConfigManager } = require('./utils/config-manager');

module.exports = {
  // Algorithms
  TokenBucket,
  RedisTokenBucket,

  // Middleware
  tokenBucketMiddleware,
  redisTokenBucketMiddleware,
  setRequestCost,
  perUserRateLimit: perUserRateLimitLocal,
  perIpRateLimit: perIpRateLimitLocal,
  globalRateLimit: globalRateLimitLocal,
  redisHealthCheck,

  // Utilities
  ConfigManager,
  getConfigManager
};
