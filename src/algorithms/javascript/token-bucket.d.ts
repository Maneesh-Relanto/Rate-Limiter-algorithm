/// <reference types="node" />
import { EventEmitter } from 'events';

/**
 * Configuration options for TokenBucket
 */
export interface TokenBucketOptions {
  /** Maximum number of tokens the bucket can hold */
  capacity: number;
  /** Number of tokens added per interval */
  refillRate: number;
  /** Time interval for refill in milliseconds (default: 1000ms) */
  refillInterval?: number;
}

/**
 * State information of the token bucket
 */
export interface TokenBucketState {
  /** Maximum capacity of the bucket */
  capacity: number;
  /** Currently available tokens */
  availableTokens: number;
  /** Rate at which tokens are refilled */
  refillRate: number;
  /** Interval for token refill in milliseconds */
  refillInterval: number;
  /** Timestamp of last refill */
  lastRefillTime: number;
  /** Whether the bucket is currently blocked */
  isBlocked: boolean;
  /** Timestamp when block expires (if blocked) */
  blockUntil: number | null;
}

/**
 * Result of an allowRequest operation
 */
export interface AllowRequestResult {
  /** Whether the request was allowed */
  allowed: boolean;
  /** Number of tokens remaining after the request */
  remainingTokens: number;
  /** Time in milliseconds until the next token is available */
  retryAfter: number;
}

/**
 * Event data for 'allowed' event
 */
export interface AllowedEventData {
  /** Number of tokens remaining */
  tokens: number;
  /** Cost of the request */
  cost: number;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event data for 'rateLimitExceeded' event
 */
export interface RateLimitExceededEventData {
  /** Time in milliseconds to wait before retry */
  retryAfter: number;
  /** Reason for rate limit (e.g., 'insufficient_tokens', 'blocked') */
  reason: string;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event data for 'penalty' event
 */
export interface PenaltyEventData {
  /** Number of tokens penalized */
  penaltyApplied: number;
  /** Tokens remaining after penalty */
  remainingTokens: number;
  /** Tokens before penalty */
  beforePenalty: number;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event data for 'reward' event
 */
export interface RewardEventData {
  /** Number of tokens rewarded */
  rewardApplied: number;
  /** Whether the reward was capped at capacity */
  cappedAtCapacity: boolean;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event data for 'blocked' event
 */
export interface BlockedEventData {
  /** Duration of the block in milliseconds */
  blockDuration: number;
  /** Timestamp when block expires */
  blockUntil: number;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event data for 'unblocked' event
 */
export interface UnblockedEventData {
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event data for 'reset' event
 */
export interface ResetEventData {
  /** Tokens before reset */
  oldTokens: number;
  /** Tokens after reset */
  newTokens: number;
  /** Capacity of the bucket */
  capacity: number;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * In-memory Token Bucket rate limiter with event emission
 * 
 * The Token Bucket algorithm allows bursts of traffic while maintaining
 * an average rate limit. Tokens refill at a constant rate, and each
 * request consumes one or more tokens.
 * 
 * @extends EventEmitter
 * 
 * @example
 * ```typescript
 * const limiter = new TokenBucket({
 *   capacity: 100,
 *   refillRate: 10,
 *   refillInterval: 1000
 * });
 * 
 * // Listen to events
 * limiter.on('allowed', (data) => {
 *   console.log(`Request allowed, ${data.tokens} tokens remaining`);
 * });
 * 
 * limiter.on('rateLimitExceeded', (data) => {
 *   console.log(`Rate limit exceeded, retry after ${data.retryAfter}ms`);
 * });
 * 
 * // Check if request is allowed
 * const result = limiter.allowRequest(1);
 * if (result.allowed) {
 *   // Process request
 * }
 * ```
 * 
 * @fires TokenBucket#allowed
 * @fires TokenBucket#rateLimitExceeded
 * @fires TokenBucket#penalty
 * @fires TokenBucket#reward
 * @fires TokenBucket#blocked
 * @fires TokenBucket#unblocked
 * @fires TokenBucket#reset
 */
export class TokenBucket extends EventEmitter {
  /**
   * Create a new TokenBucket instance
   * @param capacity - Maximum number of tokens the bucket can hold
   * @param refillRate - Number of tokens added per second
   */
  constructor(capacity: number, refillRate: number);

  /**
   * Check if a request is allowed and consume tokens if so
   * @param cost - Number of tokens to consume (default: 1)
   * @returns True if request allowed, false otherwise
   */
  allowRequest(cost?: number): boolean;

  /**
   * Apply a penalty by removing tokens
   * @param penaltyTokens - Number of tokens to remove
   * @returns Object with penalty details and remaining tokens
   */
  penalty(penaltyTokens: number): {
    penaltyApplied: number;
    remainingTokens: number;
    beforePenalty: number;
    timestamp: number;
  };

  /**
   * Apply a reward by adding tokens
   * @param rewardTokens - Number of tokens to add
   * @returns Object with reward details and remaining tokens
   */
  reward(rewardTokens: number): {
    rewardApplied: number;
    remainingTokens: number;
    beforeReward: number;
    timestamp: number;
  };

  /**
   * Block all requests for a specified duration
   * @param durationMs - Duration in milliseconds
   * @returns Object with block details
   */
  block(durationMs: number): {
    blocked: true;
    blockUntil: number;
    blockDuration: number;
    unblockAt: string;
    timestamp: number;
  };

  /**
   * Unblock and allow requests immediately
   * @returns Object with unblock details
   */
  unblock(): {
    unblocked: true;
    wasBlocked: boolean;
    reason: string;
    timestamp: number;
  };

  /**
   * Check if the bucket is currently blocked
   * @returns True if blocked, false otherwise
   */
  isBlocked(): boolean;

  /**
   * Get the number of currently available tokens
   * @returns Number of available tokens
   */
  getAvailableTokens(): number;

  /**
   * Get time until next token is available
   * @returns Time in milliseconds
   */
  getTimeUntilNextToken(): number;

  /**
   * Reset the bucket to a specific token count
   * @param tokens - Number of tokens to set (default: capacity)
   */
  reset(tokens?: number): void;

  /**
   * Get the current state of the bucket
   * @returns Complete state information
   */
  getState(): TokenBucketState;

  /**
   * Emitted when a request is allowed
   * @event TokenBucket#allowed
   * @type {AllowedEventData}
   */
  on(event: 'allowed', listener: (data: AllowedEventData) => void): this;

  /**
   * Emitted when a request exceeds the rate limit
   * @event TokenBucket#rateLimitExceeded
   * @type {RateLimitExceededEventData}
   */
  on(event: 'rateLimitExceeded', listener: (data: RateLimitExceededEventData) => void): this;

  /**
   * Emitted when a penalty is applied
   * @event TokenBucket#penalty
   * @type {PenaltyEventData}
   */
  on(event: 'penalty', listener: (data: PenaltyEventData) => void): this;

  /**
   * Emitted when a reward is applied
   * @event TokenBucket#reward
   * @type {RewardEventData}
   */
  on(event: 'reward', listener: (data: RewardEventData) => void): this;

  /**
   * Emitted when the bucket is blocked
   * @event TokenBucket#blocked
   * @type {BlockedEventData}
   */
  on(event: 'blocked', listener: (data: BlockedEventData) => void): this;

  /**
   * Emitted when the bucket is unblocked
   * @event TokenBucket#unblocked
   * @type {UnblockedEventData}
   */
  on(event: 'unblocked', listener: (data: UnblockedEventData) => void): this;

  /**
   * Emitted when the bucket is reset
   * @event TokenBucket#reset
   * @type {ResetEventData}
   */
  on(event: 'reset', listener: (data: ResetEventData) => void): this;

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

// Default export to match module.exports = TokenBucket in JS
export default TokenBucket;
