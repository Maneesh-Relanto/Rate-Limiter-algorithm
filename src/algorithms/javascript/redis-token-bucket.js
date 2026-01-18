const EventEmitter = require('events');
const TokenBucket = require('./token-bucket');

/**
 * Redis-based Token Bucket Rate Limiting Algorithm
 *
 * Distributed implementation using Redis for shared state across multiple servers.
 * Uses Lua scripts for atomic operations to prevent race conditions.
 *
 * Events emitted (inherits all from TokenBucket):
 * - 'allowed': Request was allowed
 * - 'rateLimitExceeded': Request was denied
 * - 'penalty': Penalty applied
 * - 'reward': Reward given
 * - 'blocked': Bucket was blocked
 * - 'unblocked': Bucket was unblocked
 * - 'reset': Bucket was reset
 * - 'insuranceActivated': Failover to in-memory limiter { reason, timestamp }
 * - 'insuranceDeactivated': Returned to Redis { reason, timestamp }
 * - 'redisError': Redis operation failed { operation, error, timestamp }
 *
 * @example
 * const limiter = new RedisTokenBucket(redisClient, 'user:123', 100, 10);
 * limiter.on('insuranceActivated', (data) => {
 *   console.log('Failover activated:', data);
 * });
 * if (await limiter.allowRequest()) {
 *   // Process request
 * } else {
 *   // Reject request
 * }
 */
class RedisTokenBucket extends EventEmitter {
  /**
   * Creates a new Redis-based Token Bucket rate limiter
   *
   * @param {Object} redisClient - Redis client instance (ioredis or node-redis compatible)
   * @param {string} key - Redis key for storing bucket state
   * @param {number} capacity - Maximum number of tokens the bucket can hold
   * @param {number} refillRate - Number of tokens added per second
   * @param {Object} options - Optional configuration
   * @param {number} options.ttl - Time-to-live for Redis keys in seconds (default: 3600)
   * @param {boolean} options.enableInsurance - Enable in-memory fallback on Redis failure (default: false)
   * @param {number} options.insuranceCapacity - Capacity for fallback limiter (default: capacity * 0.1)
   * @param {number} options.insuranceRefillRate - Refill rate for fallback (default: refillRate * 0.1)
   * @throws {Error} If parameters are invalid
   */
  constructor(redisClient, key, capacity, refillRate, options = {}) {
    super();
    if (!redisClient) {
      throw new Error('Redis client is required');
    }
    if (!key || typeof key !== 'string') {
      throw new Error('Key must be a non-empty string');
    }
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('Capacity must be a positive number');
    }
    if (!Number.isFinite(refillRate) || refillRate <= 0) {
      throw new Error('Refill rate must be a positive number');
    }

    this.redis = redisClient;
    this.key = key;
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.ttl = options.ttl || 3600; // Default 1 hour TTL

    // Insurance limiter configuration
    this.insuranceEnabled = options.enableInsurance || false;
    this.insuranceLimiter = null;
    this.insuranceActive = false;
    this.redisFailureCount = 0;
    this.lastRedisSuccess = Date.now();

    // Initialize insurance limiter if enabled
    if (this.insuranceEnabled) {
      const insuranceCapacity =
        options.insuranceCapacity || Math.max(1, Math.floor(capacity * 0.1));
      const insuranceRefillRate = options.insuranceRefillRate || Math.max(0.1, refillRate * 0.1);

      this.insuranceLimiter = new TokenBucket(insuranceCapacity, insuranceRefillRate);
      this.insuranceCapacity = insuranceCapacity;
      this.insuranceRefillRate = insuranceRefillRate;

      // Forward insurance limiter events
      this.insuranceLimiter.on('allowed', data =>
        this.emit('allowed', { ...data, source: 'insurance' })
      );
      this.insuranceLimiter.on('rateLimitExceeded', data =>
        this.emit('rateLimitExceeded', { ...data, source: 'insurance' })
      );
      this.insuranceLimiter.on('penalty', data =>
        this.emit('penalty', { ...data, source: 'insurance' })
      );
      this.insuranceLimiter.on('reward', data =>
        this.emit('reward', { ...data, source: 'insurance' })
      );
      this.insuranceLimiter.on('blocked', data =>
        this.emit('blocked', { ...data, source: 'insurance' })
      );
      this.insuranceLimiter.on('unblocked', data =>
        this.emit('unblocked', { ...data, source: 'insurance' })
      );
      this.insuranceLimiter.on('reset', data =>
        this.emit('reset', { ...data, source: 'insurance' })
      );
    }

    // Define Lua script for atomic token bucket operations
    this.luaScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refillRate = tonumber(ARGV[2])
      local tokensRequired = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      local ttl = tonumber(ARGV[5])
      
      -- Get current state
      local state = redis.call('HMGET', key, 'tokens', 'lastRefill')
      local tokens = tonumber(state[1])
      local lastRefill = tonumber(state[2])
      
      -- Initialize if not exists
      if not tokens then
        tokens = capacity
        lastRefill = now
      end
      
      -- Calculate token refill
      local timePassed = (now - lastRefill) / 1000
      local tokensToAdd = timePassed * refillRate
      tokens = math.min(capacity, tokens + tokensToAdd)
      
      -- Check if request can be allowed
      local allowed = 0
      if tokens >= tokensRequired then
        tokens = tokens - tokensRequired
        allowed = 1
      end
      
      -- Update state
      redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
      
      -- Set TTL
      if ttl > 0 then
        redis.call('EXPIRE', key, ttl)
      end
      
      -- Return: allowed, current tokens, lastRefill
      return {allowed, tokens, now}
    `;
  }

  /**
   * Attempts to consume tokens for a request
   *
   * @param {number} tokensRequired - Number of tokens to consume (default: 1)
   * @returns {Promise<boolean>} True if request allowed, false otherwise
   *
   * @example
   * const allowed = await limiter.allowRequest(5);
   */
  async allowRequest(tokensRequired = 1) {
    if (!Number.isFinite(tokensRequired) || tokensRequired <= 0) {
      throw new Error('Tokens required must be a positive number');
    }

    try {
      // Check if blocked first
      const blocked = await this.isBlocked();
      if (blocked) {
        const blockTimeRemaining = await this.getBlockTimeRemaining();
        this.emit('rateLimitExceeded', {
          tokens: 0,
          cost: tokensRequired,
          retryAfter: blockTimeRemaining,
          reason: 'blocked',
          source: 'redis',
          timestamp: Date.now()
        });
        return false;
      }

      const result = await this._executeScript(tokensRequired);

      // Redis success - reset failure tracking
      if (this.insuranceEnabled) {
        this.redisFailureCount = 0;
        this.lastRedisSuccess = Date.now();
        if (this.insuranceActive) {
          this.insuranceActive = false;
          // Reset insurance limiter on Redis recovery
          this.insuranceLimiter.reset();
          this.emit('insuranceDeactivated', {
            reason: 'redis_recovered',
            failureCount: this.redisFailureCount,
            timestamp: Date.now()
          });
        }
      }

      const allowed = result[0] === 1;
      const tokens = Math.floor(result[1]);

      if (allowed) {
        this.emit('allowed', {
          tokens,
          remainingTokens: tokens,
          cost: tokensRequired,
          source: 'redis',
          timestamp: Date.now()
        });
      } else {
        const retryAfter = await this.getTimeUntilNextToken(tokensRequired);
        this.emit('rateLimitExceeded', {
          tokens,
          cost: tokensRequired,
          retryAfter,
          reason: 'insufficient_tokens',
          source: 'redis',
          timestamp: Date.now()
        });
      }

      return allowed;
    } catch (error) {
      console.error('Redis error in allowRequest:', error.message);

      this.emit('redisError', {
        operation: 'allowRequest',
        error: error.message,
        timestamp: Date.now()
      });

      // Use insurance limiter if enabled
      if (this.insuranceEnabled && this.insuranceLimiter) {
        this.redisFailureCount++;
        const wasActive = this.insuranceActive;
        this.insuranceActive = true;

        if (!wasActive) {
          this.emit('insuranceActivated', {
            reason: 'redis_error',
            error: error.message,
            failureCount: this.redisFailureCount,
            timestamp: Date.now()
          });
        }

        const allowed = this.insuranceLimiter.allowRequest(tokensRequired);
        return allowed;
      }

      // Fail open: allow request on Redis errors to prevent complete outage
      return true;
    }
  }

  /**
   * Get available tokens without consuming
   *
   * @returns {Promise<number>} Number of available tokens
   */
  async getAvailableTokens() {
    try {
      const result = await this._executeScript(0); // 0 tokens required = just check
      return Math.floor(result[1]);
    } catch (error) {
      console.error('Redis error in getAvailableTokens:', error.message);
      return 0;
    }
  }

  /**
   * Get time until next token becomes available (in milliseconds)
   *
   * @param {number} tokensRequired - Number of tokens needed (default: 1)
   * @returns {Promise<number>} Milliseconds until tokens available
   */
  async getTimeUntilNextToken(tokensRequired = 1) {
    try {
      const result = await this._executeScript(0); // Don't consume
      const currentTokens = result[1];

      if (currentTokens >= tokensRequired) {
        return 0;
      }

      const tokensNeeded = tokensRequired - currentTokens;
      return Math.ceil((tokensNeeded / this.refillRate) * 1000);
    } catch (error) {
      console.error('Redis error in getTimeUntilNextToken:', error.message);
      return 0;
    }
  }

  /**
   * Reset the bucket to full capacity or a specified token count
   *
   * @param {number} [tokens] - Optional: number of tokens to reset to (defaults to capacity)
   * @returns {Promise<Object>} Result with old and new token counts
   * @throws {Error} If tokens exceeds capacity or is negative
   *
   * @example
   * // Reset to full capacity
   * await limiter.reset();
   *
   * // Reset to specific value
   * await limiter.reset(50);
   */
  async reset(tokens) {
    try {
      // Get old state first
      const oldState = await this.getState();
      const oldTokens = oldState.availableTokens;

      // Determine target token count
      let targetTokens;
      if (tokens === undefined) {
        targetTokens = this.capacity;
      } else {
        // Validate custom token value
        if (!Number.isFinite(tokens)) {
          throw new Error('Tokens must be a finite number');
        }
        if (tokens < 0) {
          throw new Error('Tokens cannot be negative');
        }
        if (tokens > this.capacity) {
          throw new Error(`Tokens (${tokens}) cannot exceed capacity (${this.capacity})`);
        }
        targetTokens = tokens;
      }

      // Set tokens in Redis
      await this.redis.hmset(this.key, 'tokens', targetTokens, 'lastRefill', Date.now());
      await this.redis.expire(this.key, this.ttl);

      return {
        oldTokens,
        newTokens: Math.floor(targetTokens),
        capacity: this.capacity,
        reset: true
      };
    } catch (error) {
      console.error('Redis error in reset:', error.message);
      throw error;
    }
  }

  /**
   * Manually sets the token count
   *
   * @param {number} tokens - Number of tokens to set
   * @returns {Promise<Object>} Result with old and new token counts
   * @throws {Error} If tokens is invalid or exceeds capacity
   *
   * @example
   * // Set tokens to specific value
   * await limiter.setTokens(75);
   *
   * // Drain all tokens
   * await limiter.setTokens(0);
   */
  async setTokens(tokens) {
    try {
      // Validate
      if (!Number.isFinite(tokens)) {
        throw new Error('Tokens must be a finite number');
      }
      if (tokens < 0) {
        throw new Error('Tokens cannot be negative');
      }
      if (tokens > this.capacity) {
        throw new Error(`Tokens (${tokens}) cannot exceed capacity (${this.capacity})`);
      }

      // Get old state
      const oldState = await this.getState();
      const oldTokens = oldState.availableTokens;

      // Set new tokens
      await this.redis.hmset(this.key, 'tokens', tokens, 'lastRefill', Date.now());
      await this.redis.expire(this.key, this.ttl);

      return {
        oldTokens,
        newTokens: Math.floor(tokens),
        capacity: this.capacity,
        changed: oldTokens !== Math.floor(tokens)
      };
    } catch (error) {
      console.error('Redis error in setTokens:', error.message);
      throw error;
    }
  }

  /**
   * Get current state of the bucket
   *
   * @param {boolean} [detailed=false] - Include detailed metrics and timing info
   * @returns {Promise<Object>} Current state
   *
   * @example
   * // Basic state
   * const state = await limiter.getState();
   *
   * // Detailed state
   * const detailed = await limiter.getState(true);
   */
  async getState(detailed = false) {
    try {
      const result = await this._executeScript(0);
      const availableTokens = Math.floor(result[1]);
      const lastRefill = result[2];

      const baseState = {
        capacity: this.capacity,
        availableTokens,
        lastRefill,
        refillRate: this.refillRate,
        key: this.key
      };

      if (!detailed) {
        return baseState;
      }

      // Calculate detailed metrics
      const utilizationPercent = ((this.capacity - availableTokens) / this.capacity) * 100;
      const tokensNeeded = 1;
      const timeUntilNextToken =
        tokensNeeded > availableTokens
          ? Math.ceil(((tokensNeeded - availableTokens) / this.refillRate) * 1000)
          : 0;
      const timeToFullMs = Math.ceil(((this.capacity - availableTokens) / this.refillRate) * 1000);

      // Get block information
      const isBlocked = await this.isBlocked();
      const blockTimeRemaining = isBlocked ? await this.getBlockTimeRemaining() : 0;
      const blockUntil = isBlocked ? await this.redis.get(`${this.key}:block`) : null;

      return {
        ...baseState,
        // Token metrics
        tokensUsed: this.capacity - availableTokens,
        utilizationPercent,
        tokensFull: availableTokens === this.capacity,
        tokensEmpty: availableTokens < 1,

        // Timing information
        lastRefillAt: new Date(lastRefill).toISOString(),
        nextRefillIn: timeUntilNextToken,
        timeToFullMs,

        // Block information
        isBlocked,
        blockUntil: blockUntil ? parseInt(blockUntil) : null,
        blockTimeRemaining,

        // Metadata
        timestamp: Date.now(),
        timestampISO: new Date().toISOString(),
        distributed: true
      };
    } catch (error) {
      console.error('Redis error in getState:', error.message);
      return {
        capacity: this.capacity,
        availableTokens: 0,
        lastRefill: Date.now(),
        refillRate: this.refillRate,
        key: this.key,
        error: error.message
      };
    }
  }

  /**
   * Delete the bucket from Redis
   *
   * @returns {Promise<void>}
   */
  async delete() {
    try {
      await this.redis.del(this.key);
    } catch (error) {
      console.error('Redis error in delete:', error.message);
      throw error;
    }
  }

  /**
   * Applies a penalty by removing tokens from the bucket
   * Useful for punishing bad behavior (failed login attempts, invalid requests)
   *
   * @param {number} [points=1] - Number of tokens to remove as penalty
   * @returns {Promise<Object>} Result with remainingTokens and penaltyApplied
   * @throws {Error} If points is invalid
   *
   * @example
   * // Failed login attempt - remove 5 tokens
   * await limiter.penalty(5);
   *
   * // Multiple failed attempts can reduce tokens below zero
   * await limiter.penalty(10); // Now user must wait longer for tokens to refill
   */
  async penalty(points = 1) {
    if (!Number.isFinite(points) || points <= 0) {
      throw new Error('Penalty points must be a positive number');
    }

    const luaPenaltyScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refillRate = tonumber(ARGV[2])
      local penaltyPoints = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      local ttl = tonumber(ARGV[5])
      
      -- Get current state
      local state = redis.call('HMGET', key, 'tokens', 'lastRefill')
      local tokens = tonumber(state[1])
      local lastRefill = tonumber(state[2])
      
      -- Initialize if not exists
      if not tokens then
        tokens = capacity
        lastRefill = now
      end
      
      -- Calculate token refill
      local timePassed = (now - lastRefill) / 1000
      local tokensToAdd = timePassed * refillRate
      tokens = math.min(capacity, tokens + tokensToAdd)
      
      -- Store state before penalty
      local beforePenalty = tokens
      
      -- Apply penalty (allow tokens to go below zero)
      tokens = tokens - penaltyPoints
      
      -- Update state
      redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
      
      -- Set TTL
      if ttl > 0 then
        redis.call('EXPIRE', key, ttl)
      end
      
      -- Return: penaltyApplied, remainingTokens, beforePenalty
      return {penaltyPoints, math.floor(tokens), math.floor(beforePenalty)}
    `;

    try {
      const now = Date.now();
      const args = [this.capacity, this.refillRate, points, now, this.ttl];

      let result;
      if (typeof this.redis.eval === 'function') {
        result = await this.redis.eval(luaPenaltyScript, 1, this.key, ...args);
      } else if (typeof this.redis.sendCommand === 'function') {
        result = await this.redis.sendCommand([
          'EVAL',
          luaPenaltyScript,
          '1',
          this.key,
          ...args.map(String)
        ]);
      } else if (typeof this.redis.evalAsync === 'function') {
        result = await this.redis.evalAsync(luaPenaltyScript, 1, this.key, ...args);
      } else {
        throw new Error('Unsupported Redis client: no eval method found');
      }

      const data = {
        penaltyApplied: result[0],
        remainingTokens: result[1],
        beforePenalty: result[2],
        source: 'redis',
        timestamp: Date.now()
      };

      this.emit('penalty', data);

      return data;
    } catch (error) {
      console.error('Redis error in penalty:', error.message);
      this.emit('redisError', {
        operation: 'penalty',
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Applies a reward by adding tokens to the bucket
   * Useful for rewarding good behavior (successful captcha, verification)
   *
   * @param {number} [points=1] - Number of tokens to add as reward
   * @returns {Promise<Object>} Result with remainingTokens and rewardApplied
   * @throws {Error} If points is invalid
   *
   * @example
   * // User completed captcha successfully - reward 2 tokens
   * await limiter.reward(2);
   *
   * // Rewards respect capacity - cannot exceed max tokens
   * await limiter.reward(1000); // Only adds up to capacity
   */
  async reward(points = 1) {
    if (!Number.isFinite(points) || points <= 0) {
      throw new Error('Reward points must be a positive number');
    }

    const luaRewardScript = `
      local key = KEYS[1]
      local capacity = tonumber(ARGV[1])
      local refillRate = tonumber(ARGV[2])
      local rewardPoints = tonumber(ARGV[3])
      local now = tonumber(ARGV[4])
      local ttl = tonumber(ARGV[5])
      
      -- Get current state
      local state = redis.call('HMGET', key, 'tokens', 'lastRefill')
      local tokens = tonumber(state[1])
      local lastRefill = tonumber(state[2])
      
      -- Initialize if not exists
      if not tokens then
        tokens = capacity
        lastRefill = now
      end
      
      -- Calculate token refill
      local timePassed = (now - lastRefill) / 1000
      local tokensToAdd = timePassed * refillRate
      tokens = math.min(capacity, tokens + tokensToAdd)
      
      -- Store state before reward
      local beforeReward = tokens
      
      -- Apply reward (respect capacity limit)
      tokens = math.min(capacity, tokens + rewardPoints)
      local actualReward = tokens - beforeReward
      local cappedAtCapacity = actualReward < rewardPoints
      
      -- Update state
      redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
      
      -- Set TTL
      if ttl > 0 then
        redis.call('EXPIRE', key, ttl)
      end
      
      -- Return: actualReward, remainingTokens, beforeReward, cappedAtCapacity
      return {math.floor(actualReward), math.floor(tokens), math.floor(beforeReward), cappedAtCapacity and 1 or 0}
    `;

    try {
      const now = Date.now();
      const args = [this.capacity, this.refillRate, points, now, this.ttl];

      let result;
      if (typeof this.redis.eval === 'function') {
        result = await this.redis.eval(luaRewardScript, 1, this.key, ...args);
      } else if (typeof this.redis.sendCommand === 'function') {
        result = await this.redis.sendCommand([
          'EVAL',
          luaRewardScript,
          '1',
          this.key,
          ...args.map(String)
        ]);
      } else if (typeof this.redis.evalAsync === 'function') {
        result = await this.redis.evalAsync(luaRewardScript, 1, this.key, ...args);
      } else {
        throw new Error('Unsupported Redis client: no eval method found');
      }

      const data = {
        rewardApplied: result[0],
        remainingTokens: result[1],
        beforeReward: result[2],
        cappedAtCapacity: result[3] === 1,
        source: 'redis',
        timestamp: Date.now()
      };

      this.emit('reward', data);

      return data;
    } catch (error) {
      console.error('Redis error in reward:', error.message);
      this.emit('redisError', {
        operation: 'reward',
        error: error.message,
        timestamp: Date.now()
      });
      throw error;
    }
  }

  /**
   * Execute Lua script for atomic operations
   *
   * @private
   * @param {number} tokensRequired - Number of tokens to consume
   * @returns {Promise<Array>} Script result [allowed, tokens, timeUntilNext]
   */
  async _executeScript(tokensRequired) {
    const now = Date.now();
    const args = [this.capacity, this.refillRate, tokensRequired, now, this.ttl];

    // Check if redis client has eval method (ioredis style)
    if (typeof this.redis.eval === 'function') {
      // eslint-disable-next-line no-return-await
      return await this.redis.eval(this.luaScript, 1, this.key, ...args);
    }

    // Check if redis client has sendCommand (node-redis v4+ style)
    if (typeof this.redis.sendCommand === 'function') {
      // eslint-disable-next-line no-return-await
      return await this.redis.sendCommand([
        'EVAL',
        this.luaScript,
        '1',
        this.key,
        ...args.map(String)
      ]);
    }

    // Check if redis client has evalsha/script (node-redis v3 style)
    if (typeof this.redis.evalAsync === 'function') {
      // eslint-disable-next-line no-return-await
      return await this.redis.evalAsync(this.luaScript, 1, this.key, ...args);
    }

    throw new Error('Unsupported Redis client: no eval method found');
  }

  /**
   * Check Redis connection health
   *
   * @returns {Promise<boolean>} True if connected, false otherwise
   */
  async isHealthy() {
    try {
      const result = await this.redis.ping();
      return result === 'PONG' || result === true;
    } catch (error) {
      console.error('Redis health check failed:', error.message);
      return false;
    }
  }

  /**
   * Check if insurance limiter is currently active
   *
   * @returns {boolean} True if using fallback limiter
   *
   * @example
   * if (limiter.isInsuranceActive()) {
   *   console.log('Redis is down, using fallback rate limits');
   * }
   */
  isInsuranceActive() {
    return this.insuranceEnabled && this.insuranceActive;
  }

  /**
   * Get insurance limiter status and metrics
   *
   * @returns {Object} Insurance status information
   *
   * @example
   * const status = limiter.getInsuranceStatus();
   * console.log(`Fallback active: ${status.active}`);
   * console.log(`Redis failures: ${status.failureCount}`);
   */
  getInsuranceStatus() {
    if (!this.insuranceEnabled) {
      return {
        enabled: false,
        active: false,
        available: false
      };
    }

    return {
      enabled: true,
      active: this.insuranceActive,
      available: this.insuranceLimiter !== null,
      failureCount: this.redisFailureCount,
      lastSuccess: this.lastRedisSuccess,
      lastSuccessAt: new Date(this.lastRedisSuccess).toISOString(),
      insuranceCapacity: this.insuranceCapacity,
      insuranceRefillRate: this.insuranceRefillRate,
      insuranceTokens: this.insuranceLimiter ? this.insuranceLimiter.getAvailableTokens() : 0
    };
  }

  /**
   * Manually activate or deactivate insurance limiter
   * Useful for testing or manual failover
   *
   * @param {boolean} active - Whether to activate insurance
   * @returns {Object} Result with activation status
   *
   * @example
   * // Force fallback for testing
   * limiter.setInsuranceActive(true);
   *
   * // Return to normal operation
   * limiter.setInsuranceActive(false);
   */
  setInsuranceActive(active) {
    if (!this.insuranceEnabled) {
      throw new Error('Insurance limiter is not enabled');
    }

    const wasActive = this.insuranceActive;
    this.insuranceActive = active;

    if (!active && wasActive) {
      // Reset insurance limiter when deactivating
      this.insuranceLimiter.reset();
      this.redisFailureCount = 0;
    }

    return {
      success: true,
      wasActive,
      nowActive: this.insuranceActive
    };
  }

  /**   * Blocks the bucket for a specified duration
   * During the block period, all requests will be rejected regardless of token availability
   * Uses Redis to store block state for distributed enforcement
   *
   * @param {number} durationMs - Duration to block in milliseconds
   * @returns {Promise<Object>} Result with blockUntil timestamp and duration
   * @throws {Error} If duration is invalid
   *
   * @example
   * // Block for 5 minutes after 3 failed login attempts
   * if (failedAttempts >= 3) {
   *   await limiter.block(5 * 60 * 1000);
   * }
   *
   * // Temporary IP ban for 1 hour
   * await limiter.block(60 * 60 * 1000);
   */
  async block(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('Block duration must be a positive number');
    }

    try {
      const blockUntil = Date.now() + durationMs;
      const blockKey = `${this.key}:block`;

      // Set block timestamp in Redis with TTL matching block duration
      const ttlSeconds = Math.ceil(durationMs / 1000);
      await this.redis.setex(blockKey, ttlSeconds, blockUntil.toString());

      return {
        blocked: true,
        blockUntil,
        blockDuration: durationMs,
        unblockAt: new Date(blockUntil).toISOString()
      };
    } catch (error) {
      console.error('Redis error in block:', error.message);
      throw error;
    }
  }

  /**
   * Checks if the bucket is currently blocked
   *
   * @returns {Promise<boolean>} True if blocked, false otherwise
   *
   * @example
   * if (await limiter.isBlocked()) {
   *   const timeLeft = await limiter.getBlockTimeRemaining();
   *   return res.status(403).json({ error: 'Blocked', retryAfter: timeLeft });
   * }
   */
  async isBlocked() {
    try {
      const blockKey = `${this.key}:block`;
      const blockUntil = await this.redis.get(blockKey);

      if (!blockUntil) {
        return false;
      }

      const now = Date.now();
      const blockTime = parseInt(blockUntil, 10);

      if (now >= blockTime) {
        // Block has expired, clean up
        await this.redis.del(blockKey);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Redis error in isBlocked:', error.message);
      // Fail open on Redis errors
      return false;
    }
  }

  /**
   * Gets the remaining block time in milliseconds
   *
   * @returns {Promise<number>} Milliseconds until unblock, or 0 if not blocked
   *
   * @example
   * const msRemaining = await limiter.getBlockTimeRemaining();
   * const secondsRemaining = Math.ceil(msRemaining / 1000);
   * res.setHeader('Retry-After', secondsRemaining);
   */
  async getBlockTimeRemaining() {
    try {
      const blockKey = `${this.key}:block`;
      const blockUntil = await this.redis.get(blockKey);

      if (!blockUntil) {
        return 0;
      }

      const now = Date.now();
      const blockTime = parseInt(blockUntil, 10);
      const remaining = Math.max(0, blockTime - now);

      if (remaining === 0) {
        // Block has expired, clean up
        await this.redis.del(blockKey);
      }

      return remaining;
    } catch (error) {
      console.error('Redis error in getBlockTimeRemaining:', error.message);
      return 0;
    }
  }

  /**
   * Manually unblocks the bucket before the block duration expires
   * Useful for admin actions or when block should be lifted early
   *
   * @returns {Promise<Object>} Result indicating unblock status
   *
   * @example
   * // Admin manually unblocks a user
   * await limiter.unblock();
   */
  async unblock() {
    try {
      const blockKey = `${this.key}:block`;
      const deleted = await this.redis.del(blockKey);

      return {
        unblocked: true,
        wasBlocked: deleted > 0
      };
    } catch (error) {
      console.error('Redis error in unblock:', error.message);
      throw error;
    }
  }

  /**   * Exports the bucket configuration to JSON
   * Note: For Redis buckets, the actual state is stored in Redis.
   * This method exports the configuration needed to reconnect to the same bucket.
   *
   * @returns {Object} Serializable configuration object
   *
   * @example
   * const bucket = new RedisTokenBucket(redis, 'user:123', 100, 10);
   * const config = bucket.toJSON();
   * // Save config to disk or database
   * fs.writeFileSync('bucket-config.json', JSON.stringify(config));
   */
  toJSON() {
    return {
      version: 1,
      type: 'RedisTokenBucket',
      key: this.key,
      capacity: this.capacity,
      refillRate: this.refillRate,
      ttl: this.ttl,
      timestamp: Date.now(),
      metadata: {
        serializedAt: new Date().toISOString(),
        className: 'RedisTokenBucket',
        note: 'State is stored in Redis. This is configuration only.'
      }
    };
  }

  /**
   * Creates a RedisTokenBucket instance from JSON configuration
   * Note: This restores the configuration, not the state. The actual state is in Redis.
   *
   * @param {Object} redis - Redis client instance
   * @param {Object} json - Serialized configuration from toJSON()
   * @returns {RedisTokenBucket} New instance connected to the same Redis bucket
   * @throws {Error} If json is invalid or missing required fields
   *
   * @example
   * const config = JSON.parse(fs.readFileSync('bucket-config.json'));
   * const redis = new Redis();
   * const bucket = RedisTokenBucket.fromJSON(redis, config);
   * // bucket reconnects to the same Redis state
   */
  static fromJSON(redis, json) {
    // Validate input
    if (!redis) {
      throw new Error('Invalid Redis client');
    }
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('Invalid JSON: must be an object');
    }

    // Check for required fields
    const requiredFields = ['key', 'capacity', 'refillRate'];
    const missingFields = requiredFields.filter(field => !(field in json));

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate field types and values
    if (typeof json.key !== 'string' || json.key.length === 0) {
      throw new Error('Invalid key: must be a non-empty string');
    }
    if (!Number.isFinite(json.capacity) || json.capacity <= 0) {
      throw new Error('Invalid capacity: must be a positive number');
    }
    if (!Number.isFinite(json.refillRate) || json.refillRate <= 0) {
      throw new Error('Invalid refillRate: must be a positive number');
    }

    // Create instance with optional TTL
    const options = json.ttl ? { ttl: json.ttl } : undefined;
    return new RedisTokenBucket(redis, json.key, json.capacity, json.refillRate, options);
  }

  /**
   * Exports current state from Redis to a portable format
   * Unlike toJSON(), this fetches the actual state from Redis
   *
   * @returns {Promise<Object>} Complete state including configuration and current tokens
   *
   * @example
   * const bucket = new RedisTokenBucket(redis, 'user:123', 100, 10);
   * const snapshot = await bucket.exportState();
   * // Save complete state
   * fs.writeFileSync('state.json', JSON.stringify(snapshot));
   */
  async exportState() {
    try {
      const state = await this.getState();
      return {
        version: 1,
        type: 'RedisTokenBucket',
        key: this.key,
        capacity: this.capacity,
        tokens: state.availableTokens,
        refillRate: this.refillRate,
        lastRefill: state.lastRefill,
        ttl: this.ttl,
        timestamp: Date.now(),
        metadata: {
          serializedAt: new Date().toISOString(),
          className: 'RedisTokenBucket'
        }
      };
    } catch (error) {
      console.error('Redis error in exportState:', error.message);
      // Return configuration even if state fetch fails
      return {
        ...this.toJSON(),
        error: error.message,
        tokens: null,
        lastRefill: null
      };
    }
  }

  /**
   * Imports state into Redis from an exported snapshot
   * This can restore a bucket to a previous state
   *
   * @param {Object} snapshot - State exported from exportState()
   * @returns {Promise<void>}
   * @throws {Error} If snapshot is invalid
   *
   * @example
   * const snapshot = JSON.parse(fs.readFileSync('state.json'));
   * const redis = new Redis();
   * const bucket = new RedisTokenBucket(redis, snapshot.key, snapshot.capacity, snapshot.refillRate);
   * await bucket.importState(snapshot);
   * // Bucket now has the restored state
   */
  async importState(snapshot) {
    // Validate input
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      throw new Error('Invalid snapshot: must be an object');
    }

    // Check for required fields
    const requiredFields = ['capacity', 'tokens', 'refillRate', 'lastRefill'];
    const missingFields = requiredFields.filter(field => !(field in snapshot));

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields in snapshot: ${missingFields.join(', ')}`);
    }

    // Validate field types and values
    if (!Number.isFinite(snapshot.capacity) || snapshot.capacity <= 0) {
      throw new Error('Invalid capacity in snapshot: must be a positive number');
    }

    if (!Number.isFinite(snapshot.refillRate) || snapshot.refillRate <= 0) {
      throw new Error('Invalid refillRate in snapshot: must be a positive number');
    }

    if (!Number.isFinite(snapshot.tokens) || snapshot.tokens < 0) {
      throw new Error('Invalid tokens in snapshot: must be a non-negative number');
    }

    if (!Number.isFinite(snapshot.lastRefill) || snapshot.lastRefill <= 0) {
      throw new Error('Invalid lastRefill in snapshot: must be a positive timestamp');
    }

    if (snapshot.tokens > snapshot.capacity) {
      throw new Error(
        `Invalid snapshot: tokens (${snapshot.tokens}) cannot exceed capacity (${snapshot.capacity})`
      );
    }

    try {
      // Update bucket configuration
      this.capacity = snapshot.capacity;
      this.refillRate = snapshot.refillRate;

      // Set state in Redis using multi/exec for atomicity
      const multi = this.redis.multi();
      multi.hset(this.key, 'tokens', snapshot.tokens.toString());
      multi.hset(this.key, 'lastRefill', snapshot.lastRefill.toString());

      // Set TTL if configured
      if (this.ttl > 0) {
        multi.expire(this.key, this.ttl);
      }

      await multi.exec();
    } catch (error) {
      console.error('Redis error in importState:', error.message);
      throw error;
    }
  }
}

module.exports = RedisTokenBucket;
