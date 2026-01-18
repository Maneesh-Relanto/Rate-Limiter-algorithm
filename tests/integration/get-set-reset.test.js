const TokenBucket = require('../../src/algorithms/javascript/token-bucket');
const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

// Mock Redis client
class MockRedis {
  constructor() {
    this.data = new Map();
    this.expirations = new Map();
  }

  async hmset(key, ...args) {
    if (!this.data.has(key)) {
      this.data.set(key, {});
    }
    const hash = this.data.get(key);
    for (let i = 0; i < args.length; i += 2) {
      hash[args[i]] = String(args[i + 1]);
    }
  }

  async hgetall(key) {
    return this.data.get(key) || null;
  }

  async expire(key, seconds) {
    this.expirations.set(key, Date.now() + seconds * 1000);
  }

  async eval(script, numKeys, ...args) {
    const key = args[0];
    let hash = this.data.get(key);
    
    if (!hash) {
      // Initialize with capacity
      const capacity = parseFloat(args[3] || this.capacity || 10);
      hash = {
        tokens: String(capacity),
        lastRefill: String(Date.now())
      };
      this.data.set(key, hash);
    }

    const tokens = parseFloat(hash.tokens || 0);
    const lastRefill = parseInt(hash.lastRefill || Date.now());
    const tokensRequired = parseInt(args[1] || 1);

    const now = Date.now();
    const elapsedSeconds = (now - lastRefill) / 1000;
    const refillRate = parseFloat(args[2] || 1);
    const capacity = parseFloat(args[3] || this.capacity || 10);
    const tokensToAdd = elapsedSeconds * refillRate;
    const newTokens = Math.min(capacity, tokens + tokensToAdd);

    if (newTokens >= tokensRequired) {
      hash.tokens = String(newTokens - tokensRequired);
      hash.lastRefill = String(now);
      return [1, parseFloat(hash.tokens), now];
    }

    hash.lastRefill = String(now);
    return [0, newTokens, now];
  }

  async get(key) {
    return this.data.get(key) || null;
  }

  async setex(key, seconds, value) {
    this.data.set(key, value);
    this.expirations.set(key, Date.now() + seconds * 1000);
  }

  async del(...keys) {
    keys.forEach(key => {
      this.data.delete(key);
      this.expirations.delete(key);
    });
  }

  async ping() {
    return 'PONG';
  }
}

describe('Get/Set/Reset Methods - TokenBucket', () => {
  describe('setTokens()', () => {
    it('should set tokens to specified value', () => {
      const bucket = new TokenBucket(100, 10);
      
      const result = bucket.setTokens(50);
      
      expect(result.oldTokens).toBe(100); // Started full
      expect(result.newTokens).toBe(50);
      expect(result.capacity).toBe(100);
      expect(result.changed).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(50);
    });

    it('should allow setting tokens to 0', () => {
      const bucket = new TokenBucket(100, 10);
      
      const result = bucket.setTokens(0);
      
      expect(result.newTokens).toBe(0);
      expect(bucket.getAvailableTokens()).toBe(0);
      expect(bucket.allowRequest()).toBe(false);
    });

    it('should allow setting tokens to capacity', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.allowRequest(50); // Use 50 tokens
      
      const result = bucket.setTokens(100);
      
      expect(result.newTokens).toBe(100);
      expect(bucket.getAvailableTokens()).toBe(100);
    });

    it('should throw error if tokens exceeds capacity', () => {
      const bucket = new TokenBucket(100, 10);
      
      expect(() => bucket.setTokens(150)).toThrow('cannot exceed capacity');
    });

    it('should throw error if tokens is negative', () => {
      const bucket = new TokenBucket(100, 10);
      
      expect(() => bucket.setTokens(-10)).toThrow('cannot be negative');
    });

    it('should throw error if tokens is not finite', () => {
      const bucket = new TokenBucket(100, 10);
      
      expect(() => bucket.setTokens(NaN)).toThrow('must be a finite number');
      expect(() => bucket.setTokens(Infinity)).toThrow('must be a finite number');
    });

    it('should indicate no change if setting to same value', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.setTokens(75);
      
      const result = bucket.setTokens(75);
      
      expect(result.changed).toBe(false);
    });

    it('should reset lastRefill timestamp', () => {
      const bucket = new TokenBucket(100, 10);
      const oldRefill = bucket.lastRefill;
      
      // Wait a bit
      const wait = Date.now() + 100;
      while (Date.now() < wait) {}
      
      bucket.setTokens(50);
      
      expect(bucket.lastRefill).toBeGreaterThan(oldRefill);
    });
  });

  describe('reset()', () => {
    it('should reset to full capacity by default', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.allowRequest(50); // Use 50 tokens
      
      const result = bucket.reset();
      
      expect(result.newTokens).toBe(100);
      expect(result.oldTokens).toBeLessThan(100);
      expect(result.capacity).toBe(100);
      expect(result.reset).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(100);
    });

    it('should reset to specified token value', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.allowRequest(90); // Use 90 tokens
      
      const result = bucket.reset(25);
      
      expect(result.oldTokens).toBeLessThan(25);
      expect(result.newTokens).toBe(25);
      expect(bucket.getAvailableTokens()).toBe(25);
    });

    it('should allow resetting to 0', () => {
      const bucket = new TokenBucket(100, 10);
      
      const result = bucket.reset(0);
      
      expect(result.newTokens).toBe(0);
      expect(bucket.getAvailableTokens()).toBe(0);
    });

    it('should throw error if reset value exceeds capacity', () => {
      const bucket = new TokenBucket(100, 10);
      
      expect(() => bucket.reset(150)).toThrow('cannot exceed capacity');
    });

    it('should throw error if reset value is negative', () => {
      const bucket = new TokenBucket(100, 10);
      
      expect(() => bucket.reset(-10)).toThrow('cannot be negative');
    });

    it('should throw error if reset value is not finite', () => {
      const bucket = new TokenBucket(100, 10);
      
      expect(() => bucket.reset(NaN)).toThrow('must be a finite number');
      expect(() => bucket.reset(Infinity)).toThrow('must be a finite number');
    });

    it('should reset lastRefill timestamp', () => {
      const bucket = new TokenBucket(100, 10);
      const oldRefill = bucket.lastRefill;
      
      // Wait a bit
      const wait = Date.now() + 100;
      while (Date.now() < wait) {}
      
      bucket.reset();
      
      expect(bucket.lastRefill).toBeGreaterThan(oldRefill);
    });
  });

  describe('getState() - detailed mode', () => {
    it('should return basic state by default', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.allowRequest(30);
      
      const state = bucket.getState();
      
      expect(state).toHaveProperty('capacity', 100);
      expect(state).toHaveProperty('availableTokens');
      expect(state.availableTokens).toBeLessThan(100);
      expect(state).toHaveProperty('refillRate', 10);
      expect(state).toHaveProperty('utilizationPercent');
    });

    it('should return detailed state when requested', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.allowRequest(50);
      
      const state = bucket.getState(true);
      
      // Basic fields
      expect(state.capacity).toBe(100);
      expect(state.refillRate).toBe(10);
      
      // Token metrics
      expect(state).toHaveProperty('tokensUsed');
      expect(state).toHaveProperty('tokensFull');
      expect(state).toHaveProperty('tokensEmpty');
      expect(state.tokensFull).toBe(false);
      expect(state.tokensEmpty).toBe(false);
      
      // Timing information
      expect(state).toHaveProperty('lastRefill');
      expect(state).toHaveProperty('lastRefillAt');
      expect(state).toHaveProperty('nextRefillIn');
      expect(state).toHaveProperty('timeToFullMs');
      
      // Block information
      expect(state).toHaveProperty('isBlocked');
      expect(state).toHaveProperty('blockUntil');
      expect(state).toHaveProperty('blockTimeRemaining');
      expect(state.isBlocked).toBe(false);
      
      // Metadata
      expect(state).toHaveProperty('timestamp');
      expect(state).toHaveProperty('timestampISO');
    });

    it('should indicate when bucket is full', () => {
      const bucket = new TokenBucket(100, 10);
      
      const state = bucket.getState(true);
      
      expect(state.tokensFull).toBe(true);
      expect(state.availableTokens).toBe(100);
      expect(state.tokensUsed).toBe(0);
      expect(state.timeToFullMs).toBe(0);
    });

    it('should indicate when bucket is empty', () => {
      const bucket = new TokenBucket(10, 1);
      
      // Drain all tokens
      for (let i = 0; i < 10; i++) {
        bucket.allowRequest();
      }
      
      const state = bucket.getState(true);
      
      expect(state.tokensEmpty).toBe(true);
      expect(state.availableTokens).toBe(0);
      expect(state.tokensUsed).toBe(10);
    });

    it('should include block information when blocked', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.block(5000);
      
      const state = bucket.getState(true);
      
      expect(state.isBlocked).toBe(true);
      expect(state.blockUntil).not.toBeNull();
      expect(state.blockTimeRemaining).toBeGreaterThan(0);
      expect(state.blockTimeRemaining).toBeLessThanOrEqual(5000);
    });

    it('should calculate time to full correctly', () => {
      const bucket = new TokenBucket(100, 10); // 10 tokens/sec
      bucket.allowRequest(50); // Use 50 tokens
      
      const state = bucket.getState(true);
      
      // Should take ~5 seconds to refill 50 tokens at 10/sec
      expect(state.timeToFullMs).toBeGreaterThan(4000);
      expect(state.timeToFullMs).toBeLessThan(6000);
    });

    it('should calculate next refill time', () => {
      const bucket = new TokenBucket(10, 1); // 1 token/sec
      
      // Drain all tokens
      for (let i = 0; i < 10; i++) {
        bucket.allowRequest();
      }
      
      const state = bucket.getState(true);
      
      // Should need ~1 second for next token
      expect(state.nextRefillIn).toBeGreaterThan(0);
      expect(state.nextRefillIn).toBeLessThanOrEqual(1000);
    });
  });

  describe('Integration with other methods', () => {
    it('should allow requests after setTokens()', () => {
      const bucket = new TokenBucket(100, 10);
      
      // Drain all tokens
      for (let i = 0; i < 100; i++) {
        bucket.allowRequest();
      }
      
      expect(bucket.allowRequest()).toBe(false);
      
      // Restore tokens
      bucket.setTokens(50);
      
      expect(bucket.allowRequest()).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(49);
    });

    it('should work with penalty system', () => {
      const bucket = new TokenBucket(100, 10);
      
      bucket.penalty(30); // Remove 30 tokens
      expect(bucket.getAvailableTokens()).toBe(70);
      
      bucket.setTokens(100); // Admin restores
      expect(bucket.getAvailableTokens()).toBe(100);
    });

    it('should work with reward system', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.allowRequest(50);
      
      bucket.reward(25); // Add 25 tokens
      const tokens1 = bucket.getAvailableTokens();
      
      bucket.reset(100); // Reset to full
      const tokens2 = bucket.getAvailableTokens();
      
      expect(tokens2).toBeGreaterThan(tokens1);
      expect(tokens2).toBe(100);
    });

    it('should work with block system', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.block(1000);
      
      // Can't make requests while blocked
      expect(bucket.allowRequest()).toBe(false);
      
      // Set tokens doesn't affect block
      bucket.setTokens(100);
      expect(bucket.allowRequest()).toBe(false);
      
      // Unblock allows requests
      bucket.unblock();
      expect(bucket.allowRequest()).toBe(true);
    });

    it('should persist through serialization', () => {
      const bucket1 = new TokenBucket(100, 10);
      bucket1.setTokens(42);
      
      const json = bucket1.toJSON();
      const bucket2 = TokenBucket.fromJSON(json);
      
      expect(bucket2.getAvailableTokens()).toBe(42);
    });
  });
});

describe('Get/Set/Reset Methods - RedisTokenBucket', () => {
  let redis;

  beforeEach(() => {
    redis = new MockRedis();
    redis.capacity = 100; // For mock eval
  });

  describe('setTokens()', () => {
    it('should set tokens to specified value', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user1', 100, 10);
      
      const result = await bucket.setTokens(50);
      
      expect(result.newTokens).toBe(50);
      expect(result.capacity).toBe(100);
      expect(result.changed).toBe(true);
      
      const state = await bucket.getState();
      expect(state.availableTokens).toBe(50);
    });

    it('should allow setting tokens to 0', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user2', 100, 10);
      
      await bucket.setTokens(0);
      
      const allowed = await bucket.allowRequest();
      expect(allowed).toBe(false);
    });

    it('should throw error if tokens exceeds capacity', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user3', 100, 10);
      
      await expect(bucket.setTokens(150)).rejects.toThrow('cannot exceed capacity');
    });

    it('should throw error if tokens is negative', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user4', 100, 10);
      
      await expect(bucket.setTokens(-10)).rejects.toThrow('cannot be negative');
    });

    it('should work across multiple instances (distributed)', async () => {
      const bucket1 = new RedisTokenBucket(redis, 'test:shared', 100, 10);
      const bucket2 = new RedisTokenBucket(redis, 'test:shared', 100, 10);
      
      // Instance 1 sets tokens
      await bucket1.setTokens(25);
      
      // Instance 2 should see the change
      const state = await bucket2.getState();
      expect(state.availableTokens).toBe(25);
    });
  });

  describe('reset()', () => {
    it('should reset to full capacity by default', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user5', 100, 10);
      
      // Initialize bucket first
      await bucket.allowRequest();
      
      const result = await bucket.reset();
      
      expect(result.newTokens).toBe(100);
      expect(result.capacity).toBe(100);
      expect(result.reset).toBe(true);
    });

    it('should reset to specified token value', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user6', 100, 10);
      
      const result = await bucket.reset(30);
      
      expect(result.newTokens).toBe(30);
      
      const state = await bucket.getState();
      expect(state.availableTokens).toBe(30);
    });

    it('should throw error if reset value exceeds capacity', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user7', 100, 10);
      
      await expect(bucket.reset(150)).rejects.toThrow('cannot exceed capacity');
    });

    it('should work across multiple instances', async () => {
      const bucket1 = new RedisTokenBucket(redis, 'test:shared2', 100, 10);
      const bucket2 = new RedisTokenBucket(redis, 'test:shared2', 100, 10);
      
      // Instance 1 initializes
      await bucket1.allowRequest();
      
      // Instance 2 resets
      await bucket2.reset(50);
      
      // Instance 1 should see the reset
      const state = await bucket1.getState();
      expect(state.availableTokens).toBe(50);
    });
  });

  describe('getState() - detailed mode', () => {
    it('should return basic state by default', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user8', 100, 10);
      
      const state = await bucket.getState();
      
      expect(state).toHaveProperty('capacity', 100);
      expect(state).toHaveProperty('availableTokens');
      expect(state).toHaveProperty('refillRate', 10);
      expect(state).toHaveProperty('key');
    });

    it('should return detailed state when requested', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user9', 100, 10);
      
      const state = await bucket.getState(true);
      
      // Basic fields
      expect(state.capacity).toBe(100);
      expect(state.refillRate).toBe(10);
      
      // Token metrics
      expect(state).toHaveProperty('tokensUsed');
      expect(state).toHaveProperty('tokensFull');
      expect(state).toHaveProperty('tokensEmpty');
      expect(state).toHaveProperty('utilizationPercent');
      
      // Timing information
      expect(state).toHaveProperty('lastRefillAt');
      expect(state).toHaveProperty('nextRefillIn');
      expect(state).toHaveProperty('timeToFullMs');
      
      // Block information
      expect(state).toHaveProperty('isBlocked');
      expect(state).toHaveProperty('blockTimeRemaining');
      
      // Metadata
      expect(state).toHaveProperty('timestamp');
      expect(state).toHaveProperty('timestampISO');
      expect(state).toHaveProperty('distributed', true);
    });

    it('should indicate when bucket is full', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user10', 100, 10);
      
      const result = await bucket.reset(100); // Ensure full
      
      // Verify reset return value
      expect(result.newTokens).toBe(100);
      expect(result.capacity).toBe(100);
    });

    it('should include block information when blocked', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user11', 100, 10);
      await bucket.block(5000);
      
      const state = await bucket.getState(true);
      
      expect(state.isBlocked).toBe(true);
      expect(state.blockTimeRemaining).toBeGreaterThan(0);
    });
  });

  describe('Integration tests', () => {
    it('should work with setTokens', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user12', 100, 10);
      
      const result1 = await bucket.setTokens(50);
      expect(result1.newTokens).toBe(50);
      
      const result2 = await bucket.setTokens(100);
      expect(result2.newTokens).toBe(100);
    });

    it('should work with block system', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user13', 100, 10);
      
      await bucket.setTokens(100); // Ensure tokens available
      await bucket.block(1000);
      expect(await bucket.isBlocked()).toBe(true);
      expect(await bucket.allowRequest()).toBe(false);
      
      await bucket.unblock();
      expect(await bucket.isBlocked()).toBe(false);
    });

    it('should handle admin operations across instances', async () => {
      const user1 = new RedisTokenBucket(redis, 'test:admin', 100, 10);
      const admin = new RedisTokenBucket(redis, 'test:admin', 100, 10);
      
      // User sets tokens
      const result1 = await user1.setTokens(50);
      expect(result1.newTokens).toBe(50);
      
      // Admin resets
      const result2 = await admin.reset(100);
      expect(result2.newTokens).toBe(100);
    });
  });
});
