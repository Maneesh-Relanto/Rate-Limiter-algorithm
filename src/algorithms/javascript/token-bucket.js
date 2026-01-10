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
   * Resets the bucket to full capacity
   */
  reset() {
    this.tokens = this.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Gets the current state of the rate limiter
   * 
   * @returns {Object} Current state including capacity, tokens, and rate
   */
  getState() {
    this._refill();
    return {
      capacity: this.capacity,
      availableTokens: Math.floor(this.tokens),
      refillRate: this.refillRate,
      utilizationPercent: ((this.capacity - this.tokens) / this.capacity) * 100
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
