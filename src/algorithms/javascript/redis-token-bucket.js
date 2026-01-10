/**
 * Redis-based Token Bucket Rate Limiting Algorithm
 * 
 * Distributed implementation using Redis for shared state across multiple servers.
 * Uses Lua scripts for atomic operations to prevent race conditions.
 * 
 * @example
 * const limiter = new RedisTokenBucket(redisClient, 'user:123', 100, 10);
 * if (await limiter.allowRequest()) {
 *   // Process request
 * } else {
 *   // Reject request
 * }
 */
class RedisTokenBucket {
  /**
   * Creates a new Redis-based Token Bucket rate limiter
   * 
   * @param {Object} redisClient - Redis client instance (ioredis or node-redis compatible)
   * @param {string} key - Redis key for storing bucket state
   * @param {number} capacity - Maximum number of tokens the bucket can hold
   * @param {number} refillRate - Number of tokens added per second
   * @param {Object} options - Optional configuration
   * @param {number} options.ttl - Time-to-live for Redis keys in seconds (default: 3600)
   * @throws {Error} If parameters are invalid
   */
  constructor(redisClient, key, capacity, refillRate, options = {}) {
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
      redis.call('EXPIRE', key, ttl)
      
      -- Return result: allowed, tokens, timeUntilNextToken
      local timeUntilNextToken = 0
      if tokens < tokensRequired then
        timeUntilNextToken = ((tokensRequired - tokens) / refillRate) * 1000
      end
      
      return {allowed, tokens, timeUntilNextToken}
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
      const result = await this._executeScript(tokensRequired);
      return result[0] === 1;
    } catch (error) {
      console.error('Redis error in allowRequest:', error.message);
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
   * Reset the bucket to full capacity
   * 
   * @returns {Promise<void>}
   */
  async reset() {
    try {
      await this.redis.hmset(
        this.key,
        'tokens', this.capacity,
        'lastRefill', Date.now()
      );
      await this.redis.expire(this.key, this.ttl);
    } catch (error) {
      console.error('Redis error in reset:', error.message);
      throw error;
    }
  }

  /**
   * Get current state of the bucket
   * 
   * @returns {Promise<Object>} Current state
   */
  async getState() {
    try {
      const result = await this._executeScript(0);
      return {
        capacity: this.capacity,
        availableTokens: Math.floor(result[1]),
        refillRate: this.refillRate,
        key: this.key
      };
    } catch (error) {
      console.error('Redis error in getState:', error.message);
      return {
        capacity: this.capacity,
        availableTokens: 0,
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
   * Execute Lua script for atomic operations
   * 
   * @private
   * @param {number} tokensRequired - Number of tokens to consume
   * @returns {Promise<Array>} Script result [allowed, tokens, timeUntilNext]
   */
  async _executeScript(tokensRequired) {
    const now = Date.now();
    const args = [
      this.capacity,
      this.refillRate,
      tokensRequired,
      now,
      this.ttl
    ];

    // Check if redis client has eval method (ioredis style)
    if (typeof this.redis.eval === 'function') {
      return await this.redis.eval(this.luaScript, 1, this.key, ...args);
    }
    
    // Check if redis client has sendCommand (node-redis v4+ style)
    if (typeof this.redis.sendCommand === 'function') {
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
}

module.exports = RedisTokenBucket;
