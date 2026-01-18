// Main entry point type definitions for @rate-limiter/core

// Re-export algorithms
export { default as TokenBucket } from './algorithms/javascript/token-bucket';
export { default as RedisTokenBucket } from './algorithms/javascript/redis-token-bucket';

// Re-export algorithm types
export type {
  TokenBucketOptions,
  TokenBucketState,
  AllowRequestResult,
  AllowedEventData,
  RateLimitExceededEventData,
  PenaltyEventData,
  RewardEventData,
  BlockedEventData,
  UnblockedEventData,
  ResetEventData
} from './algorithms/javascript/token-bucket';

export type {
  RedisTokenBucketOptions,
  RedisConnectionOptions,
  RedisTokenBucketState,
  RedisClient,
  RedisEventData,
  RedisAllowedEventData,
  RedisRateLimitExceededEventData,
  RedisPenaltyEventData,
  RedisRewardEventData,
  RedisErrorEventData,
  InsuranceActivatedEventData,
  InsuranceDeactivatedEventData
} from './algorithms/javascript/redis-token-bucket';

// Re-export Express middleware
export {
  tokenBucketMiddleware,
  redisTokenBucketMiddleware,
  setRequestCost,
  perUserRateLimit,
  perIpRateLimit,
  globalRateLimit,
  redisHealthCheck,
  defaultMiddlewareOptions
} from './middleware/express/token-bucket-middleware';

// Re-export middleware types
export type {
  MiddlewareOptions,
  TokenBucketMiddlewareOptions,
  RedisMiddlewareOptions,
  RedisTokenBucketMiddlewareOptions,
  SetRequestCostOptions,
  RateLimitInfo,
  RateLimitRequest,
  HealthCheckResult
} from './middleware/express/token-bucket-middleware';

// Re-export utilities
export { ConfigManager, getConfigManager } from './utils/config-manager';
export type { 
  RateLimitConfig, 
  RateLimitConfigItem,
  EnvironmentConfig,
  ConfigManagerOptions 
} from './utils/config-manager';
