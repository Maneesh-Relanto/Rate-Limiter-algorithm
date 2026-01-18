/**
 * Token Bucket Rate Limiting Algorithm
 * 
 * Tokens are added to a bucket at a constant rate (refill rate).
 * Each request consumes one token. If no tokens are available, the request is rejected.
 * The bucket has a maximum capacity to prevent unlimited accumulation.
 * 
 * @example
 * const limiter = new TokenBucket(100, 10); // 100 capacity, 10 tokens/sec
 * if (limiter.allowRequest()) {
 *   // Process request
 * } else {
 *   // Reject request
 * }
 */
class TokenBucket {
  /**
   * Creates a new Token Bucket rate limiter
   * 
   * @param {number} capacity - Maximum number of tokens the bucket can hold
   * @param {number} refillRate - Number of tokens added per second
   * @throws {Error} If capacity or refillRate are invalid
   */
  constructor(capacity, refillRate) {
    if (!Number.isFinite(capacity) || capacity <= 0) {
      throw new Error('Capacity must be a positive number');
    }
    if (!Number.isFinite(refillRate) || refillRate <= 0) {
      throw new Error('Refill rate must be a positive number');
    }

    this.capacity = capacity;
    this.tokens = capacity; // Start with full bucket
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
    this.blockUntil = null; // Block timestamp (null = not blocked)
  }

  /**
   * Attempts to consume a token for the request
   * 
   * @param {number} [tokensRequired=1] - Number of tokens to consume
   * @returns {boolean} True if request is allowed, false otherwise
   */
  allowRequest(tokensRequired = 1) {
    if (!Number.isFinite(tokensRequired) || tokensRequired <= 0) {
      throw new Error('Tokens required must be a positive number');
    }

    // Check if blocked
    if (this.isBlocked()) {
      return false;
    }

    this._refill();

    if (this.tokens >= tokensRequired) {
      this.tokens -= tokensRequired;
      return true;
    }

    return false;
  }

  /**
   * Refills tokens based on elapsed time since last refill
   * @private
   */
  _refill() {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsedSeconds * this.refillRate;

    // Add tokens but don't exceed capacity
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Gets the current number of available tokens
   * 
   * @returns {number} Current token count
   */
  getAvailableTokens() {
    this._refill();
    return Math.floor(this.tokens);
  }

  /**
   * Gets the time in milliseconds until next token is available
   * 
   * @returns {number} Milliseconds until next token (0 if tokens available)
   */
  getTimeUntilNextToken() {
    this._refill();

    if (this.tokens >= 1) {
      return 0;
    }

    const tokensNeeded = 1 - this.tokens;
    const timeNeeded = (tokensNeeded / this.refillRate) * 1000;
    return Math.ceil(timeNeeded);
  }

  /**
   * Applies a penalty by removing tokens from the bucket
   * Useful for punishing bad behavior (failed login attempts, invalid requests)
   * 
   * @param {number} [points=1] - Number of tokens to remove as penalty
   * @returns {Object} Result with remainingTokens and penaltyApplied
   * @throws {Error} If points is invalid
   * 
   * @example
   * // Failed login attempt - remove 5 tokens
   * limiter.penalty(5);
   * 
   * // Multiple failed attempts can reduce tokens below zero
   * limiter.penalty(10); // Now user must wait longer for tokens to refill
   */
  penalty(points = 1) {
    if (!Number.isFinite(points) || points <= 0) {
      throw new Error('Penalty points must be a positive number');
    }

    this._refill();
    
    // Allow tokens to go below zero (accumulating debt)
    const beforePenalty = this.tokens;
    this.tokens -= points;
    
    return {
      penaltyApplied: points,
      remainingTokens: Math.floor(this.tokens),
      beforePenalty: Math.floor(beforePenalty)
    };
  }

  /**
   * Applies a reward by adding tokens to the bucket
   * Useful for rewarding good behavior (successful captcha, verification)
   * 
   * @param {number} [points=1] - Number of tokens to add as reward
   * @returns {Object} Result with remainingTokens and rewardApplied
   * @throws {Error} If points is invalid
   * 
   * @example
   * // User completed captcha successfully - reward 2 tokens
   * limiter.reward(2);
   * 
   * // Rewards respect capacity - cannot exceed max tokens
   * limiter.reward(1000); // Only adds up to capacity
   */
  reward(points = 1) {
    if (!Number.isFinite(points) || points <= 0) {
      throw new Error('Reward points must be a positive number');
    }

    this._refill();
    
    const beforeReward = this.tokens;
    // Respect capacity - cannot exceed maximum
    this.tokens = Math.min(this.capacity, this.tokens + points);
    const actualReward = this.tokens - beforeReward;
    
    return {
      rewardApplied: Math.floor(actualReward),
      remainingTokens: Math.floor(this.tokens),
      beforeReward: Math.floor(beforeReward),
      cappedAtCapacity: this.tokens >= this.capacity
    };
  }

  /**
   * Resets the bucket to full capacity or a specified token count
   * 
   * @param {number} [tokens] - Optional: number of tokens to reset to (defaults to capacity)
   * @returns {Object} Result with old and new token counts
   * @throws {Error} If tokens exceeds capacity or is negative
   * 
   * @example
   * // Reset to full capacity
   * limiter.reset();
   * 
   * // Reset to specific value
   * limiter.reset(50); // Set to 50 tokens
   * 
   * // Admin grants bonus tokens after issue
   * limiter.reset(limiter.capacity);
   */
  reset(tokens) {
    const oldTokens = Math.floor(this.tokens);
    
    if (tokens === undefined) {
      // Default: reset to full capacity
      this.tokens = this.capacity;
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
      
      this.tokens = tokens;
    }
    
    this.lastRefill = Date.now();
    
    return {
      oldTokens,
      newTokens: Math.floor(this.tokens),
      capacity: this.capacity,
      reset: true
    };
  }

  /**
   * Manually sets the token count
   * Useful for admin operations or synchronizing state
   * 
   * @param {number} tokens - Number of tokens to set
   * @returns {Object} Result with old and new token counts
   * @throws {Error} If tokens is invalid or exceeds capacity
   * 
   * @example
   * // Set tokens to specific value
   * limiter.setTokens(75);
   * 
   * // Drain all tokens (emergency rate limit)
   * limiter.setTokens(0);
   * 
   * // Admin restores tokens after false positive
   * limiter.setTokens(limiter.capacity);
   */
  setTokens(tokens) {
    if (!Number.isFinite(tokens)) {
      throw new Error('Tokens must be a finite number');
    }
    if (tokens < 0) {
      throw new Error('Tokens cannot be negative');
    }
    if (tokens > this.capacity) {
      throw new Error(`Tokens (${tokens}) cannot exceed capacity (${this.capacity})`);
    }
    
    const oldTokens = Math.floor(this.tokens);
    this.tokens = tokens;
    this.lastRefill = Date.now();
    
    return {
      oldTokens,
      newTokens: Math.floor(this.tokens),
      capacity: this.capacity,
      changed: oldTokens !== Math.floor(tokens)
    };
  }

  /**
   * Blocks the bucket for a specified duration
   * During the block period, all requests will be rejected regardless of token availability
   * 
   * @param {number} durationMs - Duration to block in milliseconds
   * @returns {Object} Result with blockUntil timestamp and duration
   * @throws {Error} If duration is invalid
   * 
   * @example
   * // Block for 5 minutes after 3 failed login attempts
   * if (failedAttempts >= 3) {
   *   limiter.block(5 * 60 * 1000);
   * }
   * 
   * // Temporary IP ban for 1 hour
   * limiter.block(60 * 60 * 1000);
   */
  block(durationMs) {
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      throw new Error('Block duration must be a positive number');
    }

    this.blockUntil = Date.now() + durationMs;
    
    return {
      blocked: true,
      blockUntil: this.blockUntil,
      blockDuration: durationMs,
      unblockAt: new Date(this.blockUntil).toISOString()
    };
  }

  /**
   * Checks if the bucket is currently blocked
   * 
   * @returns {boolean} True if blocked, false otherwise
   * 
   * @example
   * if (limiter.isBlocked()) {
   *   const timeLeft = limiter.getBlockTimeRemaining();
   *   return res.status(403).json({ error: 'Blocked', retryAfter: timeLeft });
   * }
   */
  isBlocked() {
    if (this.blockUntil === null) {
      return false;
    }

    const now = Date.now();
    
    // Check if block has expired
    if (now >= this.blockUntil) {
      this.blockUntil = null; // Auto-unblock
      return false;
    }

    return true;
  }

  /**
   * Gets the remaining time in milliseconds until unblock
   * 
   * @returns {number} Milliseconds until unblock (0 if not blocked)
   * 
   * @example
   * const msRemaining = limiter.getBlockTimeRemaining();
   * const secondsRemaining = Math.ceil(msRemaining / 1000);
   * console.log(`Blocked for ${secondsRemaining} more seconds`);
   */
  getBlockTimeRemaining() {
    if (!this.isBlocked()) {
      return 0;
    }

    return this.blockUntil - Date.now();
  }

  /**
   * Manually unblocks the bucket
   * Useful for admin operations or resolving false positives
   * 
   * @returns {Object} Result indicating unblock status
   * 
   * @example
   * // Admin unblocks a user after verification
   * limiter.unblock();
   */
  unblock() {
    const wasBlocked = this.blockUntil !== null;
    this.blockUntil = null;
    
    return {
      unblocked: true,
      wasBlocked: wasBlocked
    };
  }

  /**
   * Gets the current state of the rate limiter
   * 
   * @param {boolean} [detailed=false] - Include detailed metrics and timing info
   * @returns {Object} Current state including capacity, tokens, and rate
   * 
   * @example
   * // Basic state
   * const state = limiter.getState();
   * console.log(state.availableTokens); // Current tokens
   * 
   * // Detailed state with timing and block info
   * const detailed = limiter.getState(true);
   * console.log(detailed.isBlocked, detailed.nextRefillIn);
   */
  getState(detailed = false) {
    this._refill();
    
    const baseState = {
      capacity: this.capacity,
      availableTokens: Math.floor(this.tokens),
      refillRate: this.refillRate,
      utilizationPercent: ((this.capacity - this.tokens) / this.capacity) * 100
    };
    
    if (!detailed) {
      return baseState;
    }
    
    // Calculate time until next token
    const tokensNeeded = 1;
    const timeUntilNextToken = tokensNeeded > this.tokens 
      ? Math.ceil(((tokensNeeded - this.tokens) / this.refillRate) * 1000)
      : 0;
    
    return {
      ...baseState,
      // Token metrics
      tokensUsed: this.capacity - Math.floor(this.tokens),
      tokensFull: Math.floor(this.tokens) === this.capacity,
      tokensEmpty: this.tokens < 1,
      
      // Timing information
      lastRefill: this.lastRefill,
      lastRefillAt: new Date(this.lastRefill).toISOString(),
      nextRefillIn: timeUntilNextToken,
      timeToFullMs: Math.ceil(((this.capacity - this.tokens) / this.refillRate) * 1000),
      
      // Block information
      isBlocked: this.isBlocked(),
      blockUntil: this.blockUntil,
      blockTimeRemaining: this.getBlockTimeRemaining(),
      
      // Metadata
      timestamp: Date.now(),
      timestampISO: new Date().toISOString()
    };
  }

  /**
   * Serializes the token bucket state to JSON
   * Useful for persisting state to disk or transferring between processes
   * 
   * @returns {Object} Serializable object containing bucket state
   * 
   * @example
   * const limiter = new TokenBucket(100, 10);
   * limiter.allowRequest();
   * const state = limiter.toJSON();
   * // Save to file: fs.writeFileSync('state.json', JSON.stringify(state));
   */
  toJSON() {
    this._refill();
    return {
      version: 1, // For future compatibility
      capacity: this.capacity,
      tokens: this.tokens,
      refillRate: this.refillRate,
      lastRefill: this.lastRefill,
      blockUntil: this.blockUntil,
      timestamp: Date.now(),
      metadata: {
        serializedAt: new Date().toISOString(),
        className: 'TokenBucket'
      }
    };
  }

  /**
   * Creates a TokenBucket instance from a JSON object
   * Restores the exact state including token count and timing
   * 
   * @param {Object} json - Serialized state from toJSON()
   * @returns {TokenBucket} New TokenBucket instance with restored state
   * @throws {Error} If json is invalid or missing required fields
   * 
   * @example
   * const state = JSON.parse(fs.readFileSync('state.json'));
   * const limiter = TokenBucket.fromJSON(state);
   * // Continue using limiter with restored state
   */
  static fromJSON(json) {
    // Validate input
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('Invalid JSON: must be an object');
    }

    // Check for required fields
    const requiredFields = ['capacity', 'tokens', 'refillRate', 'lastRefill'];
    const missingFields = requiredFields.filter(field => !(field in json));
    
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    // Validate field types and values
    if (!Number.isFinite(json.capacity) || json.capacity <= 0) {
      throw new Error('Invalid capacity: must be a positive number');
    }
    if (!Number.isFinite(json.refillRate) || json.refillRate <= 0) {
      throw new Error('Invalid refillRate: must be a positive number');
    }
    if (!Number.isFinite(json.tokens) || json.tokens < 0) {
      throw new Error('Invalid tokens: must be a non-negative number');
    }
    if (!Number.isFinite(json.lastRefill) || json.lastRefill <= 0) {
      throw new Error('Invalid lastRefill: must be a positive timestamp');
    }

    // Validate tokens don't exceed capacity
    if (json.tokens > json.capacity) {
      throw new Error(`Invalid state: tokens (${json.tokens}) cannot exceed capacity (${json.capacity})`);
    }

    // Create instance
    const instance = new TokenBucket(json.capacity, json.refillRate);
    
    // Restore state
    instance.tokens = json.tokens;
    instance.lastRefill = json.lastRefill;
    
    // Restore block state if present
    if (json.blockUntil !== undefined && json.blockUntil !== null) {
      if (!Number.isFinite(json.blockUntil) || json.blockUntil < 0) {
        throw new Error('Invalid blockUntil: must be a non-negative timestamp or null');
      }
      instance.blockUntil = json.blockUntil;
    }

    return instance;
  }

  /**
   * Creates a deep copy of the token bucket
   * 
   * @returns {TokenBucket} New instance with same state
   * 
   * @example
   * const original = new TokenBucket(100, 10);
   * const copy = original.clone();
   * copy.allowRequest(); // Doesn't affect original
   */
  clone() {
    return TokenBucket.fromJSON(this.toJSON());
  }
}

module.exports = TokenBucket;
