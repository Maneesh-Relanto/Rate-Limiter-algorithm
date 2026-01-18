/// <reference types="node" />
import { EventEmitter } from 'events';
import { TokenBucket, TokenBucketOptions, AllowRequestResult, TokenBucketState } from './token-bucket';

/**
 * Redis client interface (compatible with ioredis, node-redis v4+)
 */
export interface RedisClient {
  eval(script: string, numKeys: number, ...args: any[]): Promise<any>;
  evalsha?(sha: string, numKeys: number, ...args: any[]): Promise<any>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string | number, ...args: any[]): Promise<any>;
  del(key: string | string[]): Promise<number>;
  ping(): Promise<string | boolean>;
  [key: string]: any;
}

/**
 * Configuration options for RedisTokenBucket
 */
export interface RedisTokenBucketOptions extends TokenBucketOptions {
  /** Redis client instance */
  redis: RedisClient;
  /** Redis key for storing bucket state */
  key: string;
  /** Enable insurance limiter for Redis failures (default: false) */
  enableInsurance?: boolean;
  /** Insurance limiter capacity (default: capacity * 0.1) */
  insuranceCapacity?: number;
  /** Insurance limiter refill rate (default: refillRate * 0.1) */
  insuranceRefillRate?: number;
  /** Insurance limiter refill interval (default: refillInterval) */
  insuranceRefillInterval?: number;
}

/**
 * Event data for Redis-specific events
 */
export interface RedisEventData {
  /** Redis key used */
  key: string;
  /** Source of the event ('redis' or 'insurance') */
  source: 'redis' | 'insurance';
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event data for 'allowed' event from Redis
 */
export interface RedisAllowedEventData extends RedisEventData {
  /** Number of tokens remaining */
  tokens: number;
  /** Cost of the request */
  cost: number;
}

/**
 * Event data for 'rateLimitExceeded' event from Redis
 */
export interface RedisRateLimitExceededEventData extends RedisEventData {
  /** Time in milliseconds to wait before retry */
  retryAfter: number;
  /** Reason for rate limit */
  reason: string;
}

/**
 * Event data for 'penalty' event from Redis
 */
export interface RedisPenaltyEventData extends RedisEventData {
  /** Number of tokens penalized */
  penaltyApplied: number;
  /** Tokens remaining after penalty */
  remainingTokens: number;
  /** Tokens before penalty */
  beforePenalty: number;
}

/**
 * Event data for 'reward' event from Redis
 */
export interface RedisRewardEventData extends RedisEventData {
  /** Number of tokens rewarded */
  rewardApplied: number;
  /** Whether the reward was capped at capacity */
  cappedAtCapacity: boolean;
}

/**
 * Event data for 'redisError' event
 */
export interface RedisErrorEventData {
  /** Operation that failed */
  operation: string;
  /** Error message */
  error: string;
  /** Redis key involved */
  key: string;
  /** Timestamp of the error */
  timestamp: number;
}

/**
 * Event data for 'insuranceActivated' event
 */
export interface InsuranceActivatedEventData {
  /** Reason for activation */
  reason: string;
  /** Number of consecutive failures */
  failureCount: number;
  /** Timestamp of activation */
  timestamp: number;
}

/**
 * Event data for 'insuranceDeactivated' event
 */
export interface InsuranceDeactivatedEventData {
  /** Reason for deactivation */
  reason: string;
  /** Timestamp of deactivation */
  timestamp: number;
}

/**
 * Redis-based distributed Token Bucket rate limiter with insurance failover
 * 
 * Provides distributed rate limiting using Redis for state persistence.
 * Includes an optional in-memory insurance limiter that activates when
 * Redis becomes unavailable.
 * 
 * @extends EventEmitter
 * 
 * @example
 * ```typescript
 * import Redis from 'ioredis';
 * 
 * const redis = new Redis();
 * const limiter = new RedisTokenBucket({
 *   redis,
 *   key: 'rate_limit:user:123',
 *   capacity: 100,
 *   refillRate: 10,
 *   refillInterval: 1000,
 *   enableInsurance: true
 * });
 * 
 * // Listen to events
 * limiter.on('allowed', (data) => {
 *   console.log(`[${data.source}] Request allowed`);
 * });
 * 
 * limiter.on('redisError', (data) => {
 *   console.error(`Redis error: ${data.error}`);
 * });
 * 
 * limiter.on('insuranceActivated', (data) => {
 *   console.warn(`Insurance activated: ${data.reason}`);
 * });
 * 
 * // Check if request is allowed
 * const result = await limiter.allowRequest(1);
 * ```
 * 
 * @fires RedisTokenBucket#allowed
 * @fires RedisTokenBucket#rateLimitExceeded
 * @fires RedisTokenBucket#penalty
 * @fires RedisTokenBucket#reward
 * @fires RedisTokenBucket#blocked
 * @fires RedisTokenBucket#unblocked
 * @fires RedisTokenBucket#reset
 * @fires RedisTokenBucket#redisError
 * @fires RedisTokenBucket#insuranceActivated
 * @fires RedisTokenBucket#insuranceDeactivated
 */
export class RedisTokenBucket extends EventEmitter {
  /** Insurance limiter instance (if enabled) */
  readonly insuranceLimiter?: TokenBucket;

  /**
   * Create a new RedisTokenBucket instance
   * @param options - Configuration options
   */
  constructor(options: RedisTokenBucketOptions);

  /**
   * Check if a request is allowed and consume tokens if so
   * @param cost - Number of tokens to consume (default: 1)
   * @returns Promise resolving to result indicating if request was allowed
   */
  allowRequest(cost?: number): Promise<AllowRequestResult>;

  /**
   * Apply a penalty by removing tokens
   * @param penaltyTokens - Number of tokens to remove
   * @returns Promise resolving to new token count
   */
  penalty(penaltyTokens: number): Promise<number>;

  /**
   * Apply a reward by adding tokens
   * @param rewardTokens - Number of tokens to add
   * @returns Promise resolving to new token count
   */
  reward(rewardTokens: number): Promise<number>;

  /**
   * Block all requests for a specified duration
   * @param durationMs - Duration in milliseconds
   * @returns Promise that resolves when block is set
   */
  block(durationMs: number): Promise<void>;

  /**
   * Unblock and allow requests immediately
   * @returns Promise that resolves when unblock is complete
   */
  unblock(): Promise<void>;

  /**
   * Check if the bucket is currently blocked
   * @returns Promise resolving to true if blocked
   */
  isBlocked(): Promise<boolean>;

  /**
   * Get the number of currently available tokens
   * @returns Promise resolving to number of available tokens
   */
  getAvailableTokens(): Promise<number>;

  /**
   * Get time until next token is available
   * @returns Promise resolving to time in milliseconds
   */
  getTimeUntilNextToken(): Promise<number>;

  /**
   * Reset the bucket to a specific token count
   * @param tokens - Number of tokens to set (default: capacity)
   * @returns Promise that resolves when reset is complete
   */
  reset(tokens?: number): Promise<void>;

  /**
   * Get the current state of the bucket
   * @returns Promise resolving to complete state information
   */
  getState(): Promise<TokenBucketState>;

  /**
   * Delete the bucket state from Redis
   * @returns Promise that resolves when deletion is complete
   */
  delete(): Promise<void>;

  /**
   * Check Redis connection health
   * @returns Promise resolving to true if healthy
   */
  isHealthy(): Promise<boolean>;

  /**
   * Emitted when a request is allowed
   * @event RedisTokenBucket#allowed
   * @type {RedisAllowedEventData}
   */
  on(event: 'allowed', listener: (data: RedisAllowedEventData) => void): this;

  /**
   * Emitted when a request exceeds the rate limit
   * @event RedisTokenBucket#rateLimitExceeded
   * @type {RedisRateLimitExceededEventData}
   */
  on(event: 'rateLimitExceeded', listener: (data: RedisRateLimitExceededEventData) => void): this;

  /**
   * Emitted when a penalty is applied
   * @event RedisTokenBucket#penalty
   * @type {RedisPenaltyEventData}
   */
  on(event: 'penalty', listener: (data: RedisPenaltyEventData) => void): this;

  /**
   * Emitted when a reward is applied
   * @event RedisTokenBucket#reward
   * @type {RedisRewardEventData}
   */
  on(event: 'reward', listener: (data: RedisRewardEventData) => void): this;

  /**
   * Emitted when the bucket is blocked
   * @event RedisTokenBucket#blocked
   */
  on(event: 'blocked', listener: (data: RedisEventData) => void): this;

  /**
   * Emitted when the bucket is unblocked
   * @event RedisTokenBucket#unblocked
   */
  on(event: 'unblocked', listener: (data: RedisEventData) => void): this;

  /**
   * Emitted when the bucket is reset
   * @event RedisTokenBucket#reset
   */
  on(event: 'reset', listener: (data: RedisEventData) => void): this;

  /**
   * Emitted when a Redis operation fails
   * @event RedisTokenBucket#redisError
   * @type {RedisErrorEventData}
   */
  on(event: 'redisError', listener: (data: RedisErrorEventData) => void): this;

  /**
   * Emitted when insurance limiter is activated
   * @event RedisTokenBucket#insuranceActivated
   * @type {InsuranceActivatedEventData}
   */
  on(event: 'insuranceActivated', listener: (data: InsuranceActivatedEventData) => void): this;

  /**
   * Emitted when insurance limiter is deactivated
   * @event RedisTokenBucket#insuranceDeactivated
   * @type {InsuranceDeactivatedEventData}
   */
  on(event: 'insuranceDeactivated', listener: (data: InsuranceDeactivatedEventData) => void): this;

  /**
   * Remove event listener
   */
  off(event: string, listener: (...args: any[]) => void): this;

  /**
   * Add one-time event listener
   */
  once(event: string, listener: (...args: any[]) => void): this;

  /**
   * Emit event
   */
  emit(event: string | symbol, ...args: any[]): boolean;
}

// Default export to match module.exports = RedisTokenBucket in JS
export default RedisTokenBucket;
