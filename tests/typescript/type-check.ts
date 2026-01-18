// TypeScript validation test file
// This file is not executed - it's used to verify type definitions compile correctly

import {
  TokenBucket,
  RedisTokenBucket,
  tokenBucketMiddleware,
  redisTokenBucketMiddleware,
  setRequestCost,
  perUserRateLimit,
  perIpRateLimit,
  globalRateLimit,
  TokenBucketOptions,
  RedisTokenBucketOptions,
  AllowRequestResult,
  TokenBucketState,
  AllowedEventData,
  RateLimitExceededEventData,
  PenaltyEventData,
  RewardEventData,
  BlockedEventData,
  UnblockedEventData,
  ResetEventData,
  ConfigManager,
  RateLimitConfig
} from '../../index';
import { Request, Response, NextFunction } from 'express';
import { RateLimitRequest } from '../../index';

// Test TokenBucket types
const tokenBucketOptions: TokenBucketOptions = {
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000
};

const bucket = new TokenBucket(tokenBucketOptions);

// Test synchronous methods
const result: AllowRequestResult = bucket.allowRequest(1);
const available: number = bucket.getAvailableTokens();
const timeUntilNext: number = bucket.getTimeUntilNextToken();
const isBlocked: boolean = bucket.isBlocked();
const state: TokenBucketState = bucket.getState();
const penaltyResult: number = bucket.penalty(5);
const rewardResult: number = bucket.reward(10);

bucket.block(5000);
bucket.unblock();
bucket.reset();
bucket.reset(50);

// Test event listeners
bucket.on('allowed', (data: AllowedEventData) => {
  console.log(`Allowed: ${data.tokens} tokens remaining`);
});

bucket.on('rateLimitExceeded', (data: RateLimitExceededEventData) => {
  console.log(`Rate limited: retry after ${data.retryAfter}ms`);
});

bucket.on('penalty', (data: PenaltyEventData) => {
  console.log(`Penalty: ${data.penaltyApplied} tokens removed`);
});

bucket.on('reward', (data: RewardEventData) => {
  console.log(`Reward: ${data.rewardApplied} tokens added`);
});

bucket.on('blocked', (data: BlockedEventData) => {
  console.log(`Blocked until ${data.blockUntil}`);
});

bucket.on('unblocked', (data: UnblockedEventData) => {
  console.log(`Unblocked at ${data.timestamp}`);
});

bucket.on('reset', (data: ResetEventData) => {
  console.log(`Reset: ${data.oldTokens} -> ${data.newTokens}`);
});

bucket.once('allowed', (data: AllowedEventData) => {
  console.log('First allowed event');
});

bucket.off('allowed', () => {});

// Test RedisTokenBucket types
const redisOptions: RedisTokenBucketOptions = {
  redis: {} as any, // Mock Redis client
  key: 'test:key',
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  enableInsurance: true,
  insuranceCapacity: 10,
  insuranceRefillRate: 1
};

const redisBucket = new RedisTokenBucket(redisOptions);

// Test async methods
(async () => {
  const result: AllowRequestResult = await redisBucket.allowRequest(1);
  const available: number = await redisBucket.getAvailableTokens();
  const timeUntilNext: number = await redisBucket.getTimeUntilNextToken();
  const isBlocked: boolean = await redisBucket.isBlocked();
  const state: TokenBucketState = await redisBucket.getState();
  const penaltyResult: number = await redisBucket.penalty(5);
  const rewardResult: number = await redisBucket.reward(10);
  const healthy: boolean = await redisBucket.isHealthy();

  await redisBucket.block(5000);
  await redisBucket.unblock();
  await redisBucket.reset();
  await redisBucket.delete();
})();

// Test Redis event listeners
import {
  RedisAllowedEventData,
  RedisRateLimitExceededEventData,
  RedisErrorEventData,
  InsuranceActivatedEventData,
  InsuranceDeactivatedEventData
} from '../../index';

redisBucket.on('allowed', (data: RedisAllowedEventData) => {
  console.log(`[${data.source}] Allowed: ${data.tokens} tokens`);
});

redisBucket.on('rateLimitExceeded', (data: RedisRateLimitExceededEventData) => {
  console.log(`[${data.source}] Rate limited: ${data.reason}`);
});

redisBucket.on('redisError', (data: RedisErrorEventData) => {
  console.error(`Redis error in ${data.operation}: ${data.error}`);
});

redisBucket.on('insuranceActivated', (data: InsuranceActivatedEventData) => {
  console.warn(`Insurance activated: ${data.reason}`);
});

redisBucket.on('insuranceDeactivated', (data: InsuranceDeactivatedEventData) => {
  console.log(`Insurance deactivated: ${data.reason}`);
});

// Test Express middleware
const middleware1 = tokenBucketMiddleware({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000,
  message: 'Too many requests',
  statusCode: 429,
  includeHeaders: true,
  getIdentifier: (req: Request) => req.ip,
  skip: (req: Request) => req.path === '/health',
  handler: (req: RateLimitRequest, res: Response, next: NextFunction) => {
    res.status(429).json({ error: 'Rate limited' });
  }
});

const middleware2 = redisTokenBucketMiddleware({
  redis: {} as any,
  capacity: 100,
  refillRate: 10,
  enableInsurance: true,
  getKey: (req: Request) => `rate_limit:${req.ip}`,
  headers: {
    remaining: 'X-RateLimit-Remaining',
    retryAfter: 'Retry-After',
    limit: 'X-RateLimit-Limit',
    redisHealthy: 'X-RateLimit-Redis-Healthy'
  }
});

const middleware3 = setRequestCost(5);

const middleware4 = perUserRateLimit({
  capacity: 50,
  refillRate: 5,
  getUserId: (req: Request) => (req as any).user?.id || req.ip
});

const middleware5 = perIpRateLimit({
  capacity: 100,
  refillRate: 10
});

const middleware6 = globalRateLimit({
  capacity: 1000,
  refillRate: 100
});

// Test ConfigManager
const config: RateLimitConfig = ConfigManager.loadConfig('./config/rate-limits.json');
const endpointConfig = ConfigManager.getConfigForPath(config, '/api/users');
ConfigManager.validateConfig(config);

// Test extended Request type
function handleRequest(req: Request, res: Response, next: NextFunction) {
  const rateLimitReq = req as any;
  const remaining: number | undefined = rateLimitReq.remainingTokens;
  const retryAfter: number | undefined = rateLimitReq.retryAfter;
  const healthy: boolean | undefined = rateLimitReq.redisHealthy;
}

console.log('TypeScript definitions validated successfully!');
