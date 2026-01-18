const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

// Mock Redis client that can simulate failures
class MockRedis {
  constructor() {
    this.data = new Map();
    this.expirations = new Map();
    this.shouldFail = false;
    this.failureCount = 0;
  }

  setShouldFail(shouldFail) {
    this.shouldFail = shouldFail;
    if (!shouldFail) {
      this.failureCount = 0;
    }
  }

  async eval(script, numKeys, ...args) {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error('Redis connection error');
    }

    const key = args[0];
    const capacity = parseFloat(args[1]);
    const refillRate = parseFloat(args[2]);
    const tokensRequired = parseFloat(args[3]);
    const now = parseInt(args[4]);

    let hash = this.data.get(key);
    if (!hash) {
      hash = {
        tokens: String(capacity),
        lastRefill: String(now)
      };
      this.data.set(key, hash);
    }

    const tokens = parseFloat(hash.tokens);
    const lastRefill = parseInt(hash.lastRefill);
    const elapsedSeconds = (now - lastRefill) / 1000;
    const tokensToAdd = elapsedSeconds * refillRate;
    let newTokens = Math.min(capacity, tokens + tokensToAdd);

    let allowed = 0;
    if (newTokens >= tokensRequired) {
      newTokens -= tokensRequired;
      allowed = 1;
    }

    hash.tokens = String(newTokens);
    hash.lastRefill = String(now);

    return [allowed, newTokens, now];
  }

  async hmset(key, ...args) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    
    if (!this.data.has(key)) {
      this.data.set(key, {});
    }
    const hash = this.data.get(key);
    for (let i = 0; i < args.length; i += 2) {
      hash[args[i]] = String(args[i + 1]);
    }
  }

  async hgetall(key) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    return this.data.get(key) || null;
  }

  async get(key) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    return this.data.get(key) || null;
  }

  async setex(key, seconds, value) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    this.data.set(key, value);
    this.expirations.set(key, Date.now() + seconds * 1000);
  }

  async del(...keys) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    keys.forEach(key => {
      this.data.delete(key);
      this.expirations.delete(key);
    });
  }

  async expire(key, seconds) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    this.expirations.set(key, Date.now() + seconds * 1000);
  }

  async ping() {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    return 'PONG';
  }
}

describe('Insurance Limiter Feature', () => {
  let redis;

  beforeEach(() => {
    redis = new MockRedis();
  });

  describe('Configuration', () => {
    it('should initialize without insurance by default', () => {
      const bucket = new RedisTokenBucket(redis, 'test:user1', 100, 10);
      
      expect(bucket.insuranceEnabled).toBe(false);
      expect(bucket.insuranceLimiter).toBeNull();
      expect(bucket.insuranceActive).toBe(false);
    });

    it('should initialize with insurance when enabled', () => {
      const bucket = new RedisTokenBucket(redis, 'test:user2', 100, 10, {
        enableInsurance: true
      });
      
      expect(bucket.insuranceEnabled).toBe(true);
      expect(bucket.insuranceLimiter).not.toBeNull();
      expect(bucket.insuranceCapacity).toBe(10); // 10% of 100
      expect(bucket.insuranceRefillRate).toBe(1); // 10% of 10
    });

    it('should use custom insurance limits', () => {
      const bucket = new RedisTokenBucket(redis, 'test:user3', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 20,
        insuranceRefillRate: 2
      });
      
      expect(bucket.insuranceCapacity).toBe(20);
      expect(bucket.insuranceRefillRate).toBe(2);
    });

    it('should ensure minimum insurance limits', () => {
      const bucket = new RedisTokenBucket(redis, 'test:user4', 5, 0.5, {
        enableInsurance: true
      });
      
      // Should be at least 1 token and 0.1 refill rate
      expect(bucket.insuranceCapacity).toBeGreaterThanOrEqual(1);
      expect(bucket.insuranceRefillRate).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('Failover Behavior', () => {
    it('should use Redis when available', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user5', 100, 10, {
        enableInsurance: true
      });
      
      const allowed = await bucket.allowRequest();
      
      expect(allowed).toBe(true);
      expect(bucket.isInsuranceActive()).toBe(false);
    });

    it('should fallback to insurance on Redis failure', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user6', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 5,
        insuranceRefillRate: 1
      });
      
      // Simulate Redis failure
      redis.setShouldFail(true);
      
      const allowed = await bucket.allowRequest();
      
      expect(allowed).toBe(true);
      expect(bucket.isInsuranceActive()).toBe(true);
      expect(bucket.redisFailureCount).toBe(1);
    });

    it('should enforce insurance limits during fallback', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user7', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 3,
        insuranceRefillRate: 0.1
      });
      
      // Simulate Redis failure
      redis.setShouldFail(true);
      
      // Should allow 3 requests (insurance capacity)
      expect(await bucket.allowRequest()).toBe(true);
      expect(await bucket.allowRequest()).toBe(true);
      expect(await bucket.allowRequest()).toBe(true);
      
      // 4th request should be rejected
      expect(await bucket.allowRequest()).toBe(false);
      
      expect(bucket.isInsuranceActive()).toBe(true);
    });

    it('should recover when Redis comes back', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user8', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 5
      });
      
      // Simulate Redis failure
      redis.setShouldFail(true);
      await bucket.allowRequest();
      expect(bucket.isInsuranceActive()).toBe(true);
      
      // Redis recovers
      redis.setShouldFail(false);
      await bucket.allowRequest();
      
      expect(bucket.isInsuranceActive()).toBe(false);
      expect(bucket.redisFailureCount).toBe(0);
    });

    it('should reset insurance limiter on Redis recovery', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user9', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 5
      });
      
      // Fail Redis and drain insurance tokens
      redis.setShouldFail(true);
      await bucket.allowRequest();
      await bucket.allowRequest();
      await bucket.allowRequest();
      
      // Redis recovers
      redis.setShouldFail(false);
      await bucket.allowRequest();
      
      // Fail Redis again - insurance should be reset to full capacity
      redis.setShouldFail(true);
      const status = bucket.getInsuranceStatus();
      
      expect(status.insuranceTokens).toBe(5); // Reset to full capacity
    });
  });

  describe('Status Methods', () => {
    it('isInsuranceActive() should return false initially', () => {
      const bucket = new RedisTokenBucket(redis, 'test:user10', 100, 10, {
        enableInsurance: true
      });
      
      expect(bucket.isInsuranceActive()).toBe(false);
    });

    it('isInsuranceActive() should return true during failover', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user11', 100, 10, {
        enableInsurance: true
      });
      
      redis.setShouldFail(true);
      await bucket.allowRequest();
      
      expect(bucket.isInsuranceActive()).toBe(true);
    });

    it('getInsuranceStatus() should return disabled status when not enabled', () => {
      const bucket = new RedisTokenBucket(redis, 'test:user12', 100, 10);
      
      const status = bucket.getInsuranceStatus();
      
      expect(status.enabled).toBe(false);
      expect(status.active).toBe(false);
      expect(status.available).toBe(false);
    });

    it('getInsuranceStatus() should return detailed status when enabled', () => {
      const bucket = new RedisTokenBucket(redis, 'test:user13', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 15,
        insuranceRefillRate: 2
      });
      
      const status = bucket.getInsuranceStatus();
      
      expect(status.enabled).toBe(true);
      expect(status.active).toBe(false);
      expect(status.available).toBe(true);
      expect(status.failureCount).toBe(0);
      expect(status.insuranceCapacity).toBe(15);
      expect(status.insuranceRefillRate).toBe(2);
      expect(status.insuranceTokens).toBe(15);
      expect(status).toHaveProperty('lastSuccess');
      expect(status).toHaveProperty('lastSuccessAt');
    });

    it('getInsuranceStatus() should track failure count', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user14', 100, 10, {
        enableInsurance: true
      });
      
      redis.setShouldFail(true);
      await bucket.allowRequest();
      await bucket.allowRequest();
      await bucket.allowRequest();
      
      const status = bucket.getInsuranceStatus();
      
      expect(status.failureCount).toBe(3);
      expect(status.active).toBe(true);
    });
  });

  describe('Manual Control', () => {
    it('setInsuranceActive() should throw if insurance not enabled', () => {
      const bucket = new RedisTokenBucket(redis, 'test:user15', 100, 10);
      
      expect(() => bucket.setInsuranceActive(true)).toThrow('not enabled');
    });

    it('setInsuranceActive() should manually activate insurance', () => {
      const bucket = new RedisTokenBucket(redis, 'test:user16', 100, 10, {
        enableInsurance: true
      });
      
      const result = bucket.setInsuranceActive(true);
      
      expect(result.success).toBe(true);
      expect(result.wasActive).toBe(false);
      expect(result.nowActive).toBe(true);
      expect(bucket.isInsuranceActive()).toBe(true);
    });

    it('setInsuranceActive() should manually deactivate insurance', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user17', 100, 10, {
        enableInsurance: true
      });
      
      // Activate insurance
      redis.setShouldFail(true);
      await bucket.allowRequest();
      expect(bucket.isInsuranceActive()).toBe(true);
      
      // Manually deactivate
      redis.setShouldFail(false);
      const result = bucket.setInsuranceActive(false);
      
      expect(result.success).toBe(true);
      expect(result.wasActive).toBe(true);
      expect(result.nowActive).toBe(false);
      expect(bucket.redisFailureCount).toBe(0);
    });

    it('deactivating insurance should reset the limiter', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user18', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 5
      });
      
      // Drain some insurance tokens
      bucket.setInsuranceActive(true);
      await bucket.allowRequest();
      await bucket.allowRequest();
      
      // Deactivate
      bucket.setInsuranceActive(false);
      
      // Reactivate and check tokens
      bucket.setInsuranceActive(true);
      const status = bucket.getInsuranceStatus();
      
      expect(status.insuranceTokens).toBe(5); // Reset to full
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle intermittent Redis failures gracefully', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user19', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 10
      });
      
      // Normal operation
      expect(await bucket.allowRequest()).toBe(true);
      expect(bucket.isInsuranceActive()).toBe(false);
      
      // Failure
      redis.setShouldFail(true);
      expect(await bucket.allowRequest()).toBe(true);
      expect(bucket.isInsuranceActive()).toBe(true);
      
      // Recovery
      redis.setShouldFail(false);
      expect(await bucket.allowRequest()).toBe(true);
      expect(bucket.isInsuranceActive()).toBe(false);
      
      // Another failure
      redis.setShouldFail(true);
      expect(await bucket.allowRequest()).toBe(true);
      expect(bucket.isInsuranceActive()).toBe(true);
    });

    it('should protect against abuse during Redis outage', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user20', 1000, 100, {
        enableInsurance: true,
        insuranceCapacity: 10, // Much lower than Redis capacity
        insuranceRefillRate: 1 // Much slower than Redis rate
      });
      
      redis.setShouldFail(true);
      
      // Should only allow 10 requests (insurance capacity)
      let allowedCount = 0;
      for (let i = 0; i < 20; i++) {
        if (await bucket.allowRequest()) {
          allowedCount++;
        }
      }
      
      expect(allowedCount).toBeLessThanOrEqual(10);
      expect(bucket.isInsuranceActive()).toBe(true);
    });

    it('should maintain separate state for Redis and insurance', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user21', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 5
      });
      
      // Use Redis capacity
      for (let i = 0; i < 50; i++) {
        await bucket.allowRequest();
      }
      
      // Fail over to insurance - should have full insurance capacity
      redis.setShouldFail(true);
      
      let insuranceAllowed = 0;
      for (let i = 0; i < 10; i++) {
        if (await bucket.allowRequest()) {
          insuranceAllowed++;
        }
      }
      
      expect(insuranceAllowed).toBe(5); // Full insurance capacity available
    });
  });

  describe('Fail-Open Behavior', () => {
    it('should fail open when insurance disabled', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user22', 100, 10);
      
      redis.setShouldFail(true);
      
      // Should allow requests (fail open)
      expect(await bucket.allowRequest()).toBe(true);
      expect(bucket.isInsuranceActive()).toBe(false);
    });

    it('should fail closed via insurance when enabled', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:user23', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 1
      });
      
      redis.setShouldFail(true);
      
      // First request allowed
      expect(await bucket.allowRequest()).toBe(true);
      
      // Second request rejected (insurance depleted)
      expect(await bucket.allowRequest()).toBe(false);
    });
  });
});
