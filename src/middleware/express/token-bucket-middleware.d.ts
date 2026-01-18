/// <reference types="node" />
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { TokenBucket, TokenBucketOptions } from '../../algorithms/javascript/token-bucket';
import { RedisTokenBucket, RedisTokenBucketOptions } from '../../algorithms/javascript/redis-token-bucket';

/**
 * Extended Express Request with rate limit information
 */
export interface RateLimitRequest extends Request {
  /** Number of tokens remaining after this request */
  remainingTokens?: number;
  /** Time in milliseconds until next token is available */
  retryAfter?: number;
  /** Whether the rate limiter is healthy (Redis only) */
  redisHealthy?: boolean;
  /** The rate limiter instance used for this request */
  rateLimiter?: TokenBucket | RedisTokenBucket;
}

/**
 * Options for token bucket middleware
 */
export interface TokenBucketMiddlewareOptions extends TokenBucketOptions {
  /** Function to extract identifier from request (default: IP address) */
  getIdentifier?: (req: Request) => string;
  /** Custom error message */
  message?: string;
  /** Custom status code for rate limit exceeded (default: 429) */
  statusCode?: number;
  /** Whether to include rate limit headers in response (default: true) */
  includeHeaders?: boolean;
  /** Custom header names */
  headers?: {
    /** Header for remaining tokens (default: 'X-RateLimit-Remaining') */
    remaining?: string;
    /** Header for retry after (default: 'Retry-After') */
    retryAfter?: string;
    /** Header for rate limit capacity (default: 'X-RateLimit-Limit') */
    limit?: string;
  };
  /** Handler for rate limit exceeded */
  handler?: (req: RateLimitRequest, res: Response, next: NextFunction) => void;
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean;
  /** Custom key generator (alias for getIdentifier) */
  keyGenerator?: (req: Request) => string;
}

/**
 * Options for Redis token bucket middleware
 */
export interface RedisTokenBucketMiddlewareOptions extends Omit<RedisTokenBucketOptions, 'key'> {
  /** Function to generate Redis key from request (default: 'rate_limit:' + IP) */
  getKey?: (req: Request) => string;
  /** Custom error message */
  message?: string;
  /** Custom status code for rate limit exceeded (default: 429) */
  statusCode?: number;
  /** Whether to include rate limit headers in response (default: true) */
  includeHeaders?: boolean;
  /** Custom header names */
  headers?: {
    /** Header for remaining tokens (default: 'X-RateLimit-Remaining') */
    remaining?: string;
    /** Header for retry after (default: 'Retry-After') */
    retryAfter?: string;
    /** Header for rate limit capacity (default: 'X-RateLimit-Limit') */
    limit?: string;
    /** Header for Redis health status (default: 'X-RateLimit-Redis-Healthy') */
    redisHealthy?: string;
  };
  /** Handler for rate limit exceeded */
  handler?: (req: RateLimitRequest, res: Response, next: NextFunction) => void;
  /** Skip rate limiting for certain requests */
  skip?: (req: Request) => boolean;
  /** Custom key generator (alias for getKey) */
  keyGenerator?: (req: Request) => string;
}

/**
 * Options for setting request cost
 */
export interface SetRequestCostOptions {
  /** Cost for this specific request */
  cost: number;
}

/**
 * Creates a per-IP token bucket rate limiter middleware for Express
 * 
 * @param options - Middleware configuration options
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * import express from 'express';
 * import { tokenBucketMiddleware } from '@rate-limiter/core';
 * 
 * const app = express();
 * 
 * app.use('/api', tokenBucketMiddleware({
 *   capacity: 100,
 *   refillRate: 10,
 *   refillInterval: 1000,
 *   message: 'Too many requests'
 * }));
 * ```
 */
export function tokenBucketMiddleware(options: TokenBucketMiddlewareOptions): RequestHandler;

/**
 * Creates a Redis-based distributed token bucket rate limiter middleware
 * 
 * @param options - Middleware configuration options
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * import express from 'express';
 * import Redis from 'ioredis';
 * import { redisTokenBucketMiddleware } from '@rate-limiter/core';
 * 
 * const app = express();
 * const redis = new Redis();
 * 
 * app.use('/api', redisTokenBucketMiddleware({
 *   redis,
 *   capacity: 100,
 *   refillRate: 10,
 *   enableInsurance: true
 * }));
 * ```
 */
export function redisTokenBucketMiddleware(options: RedisTokenBucketMiddlewareOptions): RequestHandler;

/**
 * Middleware to set custom cost for specific requests
 * 
 * @param cost - Number of tokens this request should consume
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * // Heavy operation costs more tokens
 * app.post('/api/heavy', 
 *   setRequestCost(5),
 *   tokenBucketMiddleware({ capacity: 100, refillRate: 10 })
 * );
 * 
 * // Light operation costs less
 * app.get('/api/light',
 *   setRequestCost(1),
 *   tokenBucketMiddleware({ capacity: 100, refillRate: 10 })
 * );
 * ```
 */
export function setRequestCost(cost: number): RequestHandler;

/**
 * Creates a per-user token bucket rate limiter middleware
 * 
 * @param options - Middleware configuration with user ID extraction
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * app.use('/api', perUserRateLimit({
 *   capacity: 50,
 *   refillRate: 5,
 *   getUserId: (req) => req.user?.id || req.ip
 * }));
 * ```
 */
export function perUserRateLimit(options: TokenBucketMiddlewareOptions & {
  getUserId: (req: Request) => string;
}): RequestHandler;

/**
 * Creates a per-IP token bucket rate limiter middleware
 * 
 * @param options - Middleware configuration options
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * app.use('/api', perIpRateLimit({
 *   capacity: 100,
 *   refillRate: 10
 * }));
 * ```
 */
export function perIpRateLimit(options: TokenBucketMiddlewareOptions): RequestHandler;

/**
 * Creates a global token bucket rate limiter shared across all requests
 * 
 * @param options - Middleware configuration options
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * // Limit API to 1000 req/min globally
 * app.use('/api', globalRateLimit({
 *   capacity: 1000,
 *   refillRate: 1000,
 *   refillInterval: 60000
 * }));
 * ```
 */
export function globalRateLimit(options: TokenBucketMiddlewareOptions): RequestHandler;

/**
 * Middleware to check Redis health and add to request
 * 
 * @returns Express middleware function
 * 
 * @example
 * ```typescript
 * app.use(redisHealthCheck());
 * app.use((req, res) => {
 *   if (!req.redisHealthy) {
 *     // Handle degraded mode
 *   }
 * });
 * ```
 */
export function redisHealthCheck(): RequestHandler;

/**
 * Default middleware options
 */
export const defaultMiddlewareOptions: {
  capacity: number;
  refillRate: number;
  refillInterval: number;
  statusCode: number;
  includeHeaders: boolean;
  headers: {
    remaining: string;
    retryAfter: string;
    limit: string;
  };
};
