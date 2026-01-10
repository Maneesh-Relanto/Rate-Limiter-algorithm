/**
 * Tests for RedisTokenBucket
 * Testing distributed rate limiting with Redis backend
 */

const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

// Mock Redis client
class MockRedisClient {
  constructor() {
    this.data = new Map();
    this.shouldFail = false;
    this.failOnce = false;
  }

  async eval(script, numKeys, key, ...args) {
    if (this.shouldFail || this.failOnce) {
      if (this.failOnce) this.failOnce = false;
      throw new Error('Redis connection error');
    }

    // Simple implementation of the Lua script logic
    const capacity = parseFloat(args[0]);
    const refillRate = parseFloat(args[1]);
    const tokensRequired = parseFloat(args[2]);
    const now = parseFloat(args[3]);

    let state = this.data.get(key) || {
      tokens: capacity,
      lastRefill: now
    };

    // Calculate refill
    const timePassed = (now - state.lastRefill) / 1000;
    const tokensToAdd = timePassed * refillRate;
    state.tokens = Math.min(capacity, state.tokens + tokensToAdd);

    // Check if allowed
    let allowed = 0;
    if (state.tokens >= tokensRequired) {
      state.tokens -= tokensRequired;
      allowed = 1;
    }

    // Update state
    state.lastRefill = now;
    this.data.set(key, state);

    // Calculate time until next token
    let timeUntilNextToken = 0;
    if (state.tokens < tokensRequired) {
      timeUntilNextToken = ((tokensRequired - state.tokens) / refillRate) * 1000;
    }

    return [allowed, state.tokens, timeUntilNextToken];
  }

  async hmset(key, ...args) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    
    const state = this.data.get(key) || {};
    for (let i = 0; i < args.length; i += 2) {
      state[args[i]] = parseFloat(args[i + 1]);
    }
    this.data.set(key, state);
  }

  async expire(key, seconds) {
    // Mock - doesn't actually expire
    return true;
  }

  async del(key) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    this.data.delete(key);
  }

  async ping() {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    return 'PONG';
  }

  // Test helper
  setFailure(shouldFail) {
    this.shouldFail = shouldFail;
  }

  setFailOnce() {
    this.failOnce = true;
  }
}

describe('RedisTokenBucket', () => {
  let redisClient;
  let bucket;

  beforeEach(() => {
    redisClient = new MockRedisClient();
    bucket = new RedisTokenBucket(redisClient, 'test:user:123', 10, 1);
  });

  describe('Constructor', () => {
    it('should create instance with valid parameters', () => {
      expect(bucket).toBeDefined();
      expect(bucket.capacity).toBe(10);
      expect(bucket.refillRate).toBe(1);
      expect(bucket.key).toBe('test:user:123');
    });

    it('should throw error if redis client is missing', () => {
      expect(() => {
        new RedisTokenBucket(null, 'key', 10, 1);
      }).toThrow('Redis client is required');
    });

    it('should throw error if key is missing', () => {
      expect(() => {
        new RedisTokenBucket(redisClient, '', 10, 1);
      }).toThrow('Key must be a non-empty string');
    });

    it('should throw error if key is not a string', () => {
      expect(() => {
        new RedisTokenBucket(redisClient, 123, 10, 1);
      }).toThrow('Key must be a non-empty string');
    });

    it('should throw error if capacity is invalid', () => {
      expect(() => {
        new RedisTokenBucket(redisClient, 'key', 0, 1);
      }).toThrow('Capacity must be a positive number');
      
      expect(() => {
        new RedisTokenBucket(redisClient, 'key', -10, 1);
      }).toThrow('Capacity must be a positive number');
      
      expect(() => {
        new RedisTokenBucket(redisClient, 'key', 'invalid', 1);
      }).toThrow('Capacity must be a positive number');
    });

    it('should throw error if refill rate is invalid', () => {
      expect(() => {
        new RedisTokenBucket(redisClient, 'key', 10, 0);
      }).toThrow('Refill rate must be a positive number');
      
      expect(() => {
        new RedisTokenBucket(redisClient, 'key', 10, -1);
      }).toThrow('Refill rate must be a positive number');
    });

    it('should accept custom TTL option', () => {
      const customBucket = new RedisTokenBucket(redisClient, 'key', 10, 1, { ttl: 7200 });
      expect(customBucket.ttl).toBe(7200);
    });

    it('should use default TTL if not provided', () => {
      expect(bucket.ttl).toBe(3600);
    });
  });

  describe('allowRequest()', () => {
    it('should allow request when tokens available', async () => {
      const allowed = await bucket.allowRequest();
      expect(allowed).toBe(true);
    });

    it('should reject request when tokens exhausted', async () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await bucket.allowRequest();
      }
      
      const allowed = await bucket.allowRequest();
      expect(allowed).toBe(false);
    });

    it('should handle multi-token requests', async () => {
      const allowed = await bucket.allowRequest(5);
      expect(allowed).toBe(true);
      
      const available = await bucket.getAvailableTokens();
      expect(available).toBe(5);
    });

    it('should reject multi-token request when insufficient tokens', async () => {
      await bucket.allowRequest(8);
      const allowed = await bucket.allowRequest(5);
      expect(allowed).toBe(false);
    });

    it('should throw error for invalid token count', async () => {
      await expect(bucket.allowRequest(0)).rejects.toThrow('Tokens required must be a positive number');
      await expect(bucket.allowRequest(-1)).rejects.toThrow('Tokens required must be a positive number');
      await expect(bucket.allowRequest('invalid')).rejects.toThrow('Tokens required must be a positive number');
    });

    it('should fail open on Redis errors', async () => {
      redisClient.setFailOnce();
      const allowed = await bucket.allowRequest();
      expect(allowed).toBe(true); // Fails open for availability
    });

    it('should refill tokens over time', async () => {
      // Exhaust tokens
      for (let i = 0; i < 10; i++) {
        await bucket.allowRequest();
      }
      
      // Should be rejected immediately
      expect(await bucket.allowRequest()).toBe(false);
      
      // Wait for refill (mock time progression)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should now be allowed (1 token refilled)
      const allowed = await bucket.allowRequest();
      expect(allowed).toBe(true);
    });
  });

  describe('getAvailableTokens()', () => {
    it('should return full capacity initially', async () => {
      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBe(10);
    });

    it('should return reduced tokens after consumption', async () => {
      await bucket.allowRequest(3);
      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBe(7);
    });

    it('should not consume tokens when checking', async () => {
      await bucket.getAvailableTokens();
      await bucket.getAvailableTokens();
      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBe(10);
    });

    it('should return 0 on Redis errors', async () => {
      redisClient.setFailure(true);
      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBe(0);
    });
  });

  describe('getTimeUntilNextToken()', () => {
    it('should return 0 when tokens available', async () => {
      const time = await bucket.getTimeUntilNextToken();
      expect(time).toBe(0);
    });

    it('should calculate time correctly when tokens depleted', async () => {
      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        await bucket.allowRequest();
      }
      
      const time = await bucket.getTimeUntilNextToken();
      expect(time).toBeGreaterThan(0);
      expect(time).toBeLessThanOrEqual(1000); // Should be ~1 second for 1 token at 1/sec
    });

    it('should calculate time for multiple tokens', async () => {
      await bucket.allowRequest(9);
      const time = await bucket.getTimeUntilNextToken(5);
      
      // Need 4 more tokens, at 1/sec = 4000ms
      expect(time).toBeGreaterThan(3000);
      expect(time).toBeLessThanOrEqual(5000);
    });

    it('should return 0 on Redis errors', async () => {
      redisClient.setFailure(true);
      const time = await bucket.getTimeUntilNextToken();
      expect(time).toBe(0);
    });
  });

  describe('reset()', () => {
    it('should reset bucket to full capacity', async () => {
      await bucket.allowRequest(8);
      await bucket.reset();
      
      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBe(10);
    });

    it('should throw error on Redis failure', async () => {
      redisClient.setFailure(true);
      await expect(bucket.reset()).rejects.toThrow('Redis connection error');
    });
  });

  describe('getState()', () => {
    it('should return current state', async () => {
      const state = await bucket.getState();
      
      expect(state).toHaveProperty('capacity');
      expect(state).toHaveProperty('availableTokens');
      expect(state).toHaveProperty('refillRate');
      expect(state).toHaveProperty('key');
      
      expect(state.capacity).toBe(10);
      expect(state.refillRate).toBe(1);
      expect(state.key).toBe('test:user:123');
    });

    it('should reflect consumed tokens', async () => {
      await bucket.allowRequest(4);
      const state = await bucket.getState();
      expect(state.availableTokens).toBe(6);
    });

    it('should include error message on failure', async () => {
      redisClient.setFailure(true);
      const state = await bucket.getState();
      expect(state).toHaveProperty('error');
    });
  });

  describe('delete()', () => {
    it('should delete bucket from Redis', async () => {
      await bucket.allowRequest(5);
      await bucket.delete();
      
      // After delete, should start fresh
      const newBucket = new RedisTokenBucket(redisClient, 'test:user:123', 10, 1);
      const tokens = await newBucket.getAvailableTokens();
      expect(tokens).toBe(10);
    });

    it('should throw error on Redis failure', async () => {
      redisClient.setFailure(true);
      await expect(bucket.delete()).rejects.toThrow('Redis connection error');
    });
  });

  describe('isHealthy()', () => {
    it('should return true when Redis connected', async () => {
      const healthy = await bucket.isHealthy();
      expect(healthy).toBe(true);
    });

    it('should return false when Redis disconnected', async () => {
      redisClient.setFailure(true);
      const healthy = await bucket.isHealthy();
      expect(healthy).toBe(false);
    });
  });

  describe('Distributed Scenarios', () => {
    it('should handle multiple instances with same key', async () => {
      const bucket1 = new RedisTokenBucket(redisClient, 'shared:key', 10, 1);
      const bucket2 = new RedisTokenBucket(redisClient, 'shared:key', 10, 1);
      
      // Both instances share the same state
      await bucket1.allowRequest(5);
      
      const tokens1 = await bucket1.getAvailableTokens();
      const tokens2 = await bucket2.getAvailableTokens();
      
      expect(tokens1).toBe(5);
      expect(tokens2).toBe(5);
    });

    it('should isolate different keys', async () => {
      const bucket1 = new RedisTokenBucket(redisClient, 'user:1', 10, 1);
      const bucket2 = new RedisTokenBucket(redisClient, 'user:2', 10, 1);
      
      await bucket1.allowRequest(8);
      
      const tokens1 = await bucket1.getAvailableTokens();
      const tokens2 = await bucket2.getAvailableTokens();
      
      expect(tokens1).toBe(2);
      expect(tokens2).toBe(10);
    });

    it('should handle concurrent requests atomically', async () => {
      const sharedKey = 'concurrent:test';
      const instances = Array(5).fill(null).map(() => 
        new RedisTokenBucket(redisClient, sharedKey, 10, 1)
      );
      
      // Simulate concurrent requests
      const results = await Promise.all(
        instances.map(inst => inst.allowRequest(3))
      );
      
      // Only 3 out of 5 should succeed (10 tokens / 3 per request = 3.33)
      const allowed = results.filter(r => r === true).length;
      expect(allowed).toBeLessThanOrEqual(3);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small refill rates', async () => {
      const slowBucket = new RedisTokenBucket(redisClient, 'slow', 10, 0.1);
      
      for (let i = 0; i < 10; i++) {
        await slowBucket.allowRequest();
      }
      
      expect(await slowBucket.allowRequest()).toBe(false);
    });

    it('should handle very large capacities', async () => {
      const largeBucket = new RedisTokenBucket(redisClient, 'large', 1000000, 1000);
      
      const allowed = await largeBucket.allowRequest(500000);
      expect(allowed).toBe(true);
      
      const tokens = await largeBucket.getAvailableTokens();
      expect(tokens).toBeGreaterThanOrEqual(500000);
    });

    it('should handle fractional refill rates', async () => {
      const fractionalBucket = new RedisTokenBucket(redisClient, 'frac', 10, 0.5);
      
      for (let i = 0; i < 10; i++) {
        await fractionalBucket.allowRequest();
      }
      
      expect(await fractionalBucket.allowRequest()).toBe(false);
    });

    it('should fail open for unsupported Redis client', async () => {
      const unsupportedClient = {
        // No eval, sendCommand, or evalAsync methods
        ping: async () => 'PONG'
      };

      const bucket = new RedisTokenBucket(unsupportedClient, 'test', 10, 1);
      
      // Should fail open (return true) when Redis client is unsupported
      const allowed = await bucket.allowRequest();
      expect(allowed).toBe(true);
    });
  });
});
