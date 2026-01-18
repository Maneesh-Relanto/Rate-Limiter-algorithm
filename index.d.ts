/// <reference types="node" />

// Core algorithms
export {
  TokenBucket,
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

export {
  RedisTokenBucket,
  RedisClient,
  RedisTokenBucketOptions,
  RedisEventData,
  RedisAllowedEventData,
  RedisRateLimitExceededEventData,
  RedisPenaltyEventData,
  RedisRewardEventData,
  RedisErrorEventData,
  InsuranceActivatedEventData,
  InsuranceDeactivatedEventData
} from './algorithms/javascript/redis-token-bucket';

// Express middleware
export {
  RateLimitRequest,
  TokenBucketMiddlewareOptions,
  RedisTokenBucketMiddlewareOptions,
  SetRequestCostOptions,
  tokenBucketMiddleware,
  redisTokenBucketMiddleware,
  setRequestCost,
  perUserRateLimit,
  perIpRateLimit,
  globalRateLimit,
  redisHealthCheck,
  defaultMiddlewareOptions
} from './middleware/express/token-bucket-middleware';

// Utility
export {
  ConfigManager,
  RateLimitConfig,
  EndpointConfig,
  loadConfig
} from './utils/config-manager';
