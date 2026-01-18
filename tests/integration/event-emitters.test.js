const TokenBucket = require('../../src/algorithms/javascript/token-bucket');
const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

// Mock Redis client for testing
class MockRedis {
  constructor() {
    this.data = new Map();
    this.shouldFail = false;
  }

  setShouldFail(fail) {
    this.shouldFail = fail;
  }

  async eval(script, numKeys, key, ...args) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }

    const capacity = parseFloat(args[0]);
    const refillRate = parseFloat(args[1]);
    const tokensRequired = parseFloat(args[2]);
    const now = parseFloat(args[3]);

    let state = this.data.get(key);
    if (!state) {
      state = { tokens: capacity, lastRefill: now };
    }

    const timePassed = (now - state.lastRefill) / 1000;
    const tokensToAdd = timePassed * refillRate;
    let tokens = Math.min(capacity, state.tokens + tokensToAdd);

    let allowed = 0;
    if (tokens >= tokensRequired) {
      tokens -= tokensRequired;
      allowed = 1;
    }

    state.tokens = tokens;
    state.lastRefill = now;
    this.data.set(key, state);

    return [allowed, tokens, now];
  }

  async hmget(key, ...fields) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }

    const state = this.data.get(key);
    if (!state) {
      return [null, null];
    }
    return [state.tokens.toString(), state.lastRefill.toString()];
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
    return 'OK';
  }

  async expire(key, ttl) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    return 1;
  }

  async get(key) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    return this.data.get(key) || null;
  }

  async setex(key, ttl, value) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    this.data.set(key, value);
    return 'OK';
  }

  async del(key) {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    this.data.delete(key);
    return 1;
  }

  async ping() {
    if (this.shouldFail) {
      throw new Error('Redis connection error');
    }
    return 'PONG';
  }
}

describe('Event Emitters Feature', () => {
  describe('TokenBucket Events', () => {
    describe('allowed event', () => {
      it('should emit allowed event when request is allowed', (done) => {
        const bucket = new TokenBucket(100, 10);
        
        bucket.on('allowed', (data) => {
          expect(data.tokens).toBeDefined();
          expect(data.remainingTokens).toBeDefined();
          expect(data.cost).toBe(5);
          expect(data.timestamp).toBeDefined();
          done();
        });

        bucket.allowRequest(5);
      });

      it('should emit correct token counts', (done) => {
        const bucket = new TokenBucket(100, 10);
        bucket.allowRequest(20); // Consume 20 tokens

        bucket.on('allowed', (data) => {
          expect(data.tokens).toBeGreaterThanOrEqual(69); // Allow for refill
          expect(data.tokens).toBeLessThanOrEqual(80);
          expect(data.cost).toBe(10);
          done();
        });

        bucket.allowRequest(10);
      });
    });

    describe('rateLimitExceeded event', () => {
      it('should emit rateLimitExceeded when insufficient tokens', (done) => {
        const bucket = new TokenBucket(10, 1);
        bucket.allowRequest(10); // Consume all tokens

        bucket.on('rateLimitExceeded', (data) => {
          expect(data.tokens).toBe(0);
          expect(data.cost).toBe(5);
          expect(data.retryAfter).toBeGreaterThan(0);
          expect(data.reason).toBe('insufficient_tokens');
          expect(data.timestamp).toBeDefined();
          done();
        });

        bucket.allowRequest(5); // Should fail
      });

      it('should emit rateLimitExceeded when blocked', (done) => {
        const bucket = new TokenBucket(100, 10);
        bucket.block(5000); // Block for 5 seconds

        bucket.on('rateLimitExceeded', (data) => {
          expect(data.reason).toBe('blocked');
          expect(data.retryAfter).toBeGreaterThan(4000);
          expect(data.timestamp).toBeDefined();
          done();
        });

        bucket.allowRequest();
      });
    });

    describe('penalty event', () => {
      it('should emit penalty event', (done) => {
        const bucket = new TokenBucket(100, 10);

        bucket.on('penalty', (data) => {
          expect(data.penaltyApplied).toBe(10);
          expect(data.remainingTokens).toBeGreaterThanOrEqual(89);
          expect(data.remainingTokens).toBeLessThanOrEqual(90);
          expect(data.beforePenalty).toBeGreaterThanOrEqual(99);
          expect(data.timestamp).toBeDefined();
          done();
        });

        bucket.penalty(10);
      });

      it('should emit penalty with negative tokens', (done) => {
        const bucket = new TokenBucket(10, 1);

        bucket.on('penalty', (data) => {
          expect(data.penaltyApplied).toBe(50);
          expect(data.remainingTokens).toBeLessThan(0);
          done();
        });

        bucket.penalty(50);
      });
    });

    describe('reward event', () => {
      it('should emit reward event', (done) => {
        const bucket = new TokenBucket(100, 10);
        bucket.allowRequest(30); // Consume 30 tokens

        bucket.on('reward', (data) => {
          expect(data.rewardApplied).toBeGreaterThanOrEqual(14);
          expect(data.rewardApplied).toBeLessThanOrEqual(15);
          expect(data.cappedAtCapacity).toBe(false);
          expect(data.timestamp).toBeDefined();
          done();
        });

        bucket.reward(15);
      });

      it('should emit reward with capped flag', (done) => {
        const bucket = new TokenBucket(100, 10);

        bucket.on('reward', (data) => {
          expect(data.cappedAtCapacity).toBe(true);
          expect(data.remainingTokens).toBe(100);
          done();
        });

        bucket.reward(50); // Will be capped at capacity
      });
    });

    describe('blocked event', () => {
      it('should emit blocked event', (done) => {
        const bucket = new TokenBucket(100, 10);

        bucket.on('blocked', (data) => {
          expect(data.blocked).toBe(true);
          expect(data.blockDuration).toBe(5000);
          expect(data.blockUntil).toBeDefined();
          expect(data.timestamp).toBeDefined();
          done();
        });

        bucket.block(5000);
      });
    });

    describe('unblocked event', () => {
      it('should emit unblocked event when unblocking', (done) => {
        const bucket = new TokenBucket(100, 10);
        bucket.block(5000); // Block first

        bucket.on('unblocked', (data) => {
          expect(data.unblocked).toBe(true);
          expect(data.wasBlocked).toBe(true);
          expect(data.timestamp).toBeDefined();
          done();
        });

        bucket.unblock();
      });

      it('should not emit when already unblocked', () => {
        const bucket = new TokenBucket(100, 10);
        let emitted = false;

        bucket.on('unblocked', () => {
          emitted = true;
        });

        bucket.unblock(); // No previous block
        expect(emitted).toBe(false);
      });
    });

    describe('reset event', () => {
      it('should emit reset event', (done) => {
        const bucket = new TokenBucket(100, 10);
        bucket.allowRequest(40); // Consume some tokens

        bucket.on('reset', (data) => {
          expect(data.oldTokens).toBeGreaterThanOrEqual(59);
          expect(data.oldTokens).toBeLessThanOrEqual(60);
          expect(data.newTokens).toBe(100);
          expect(data.capacity).toBe(100);
          expect(data.reset).toBe(true);
          expect(data.timestamp).toBeDefined();
          done();
        });

        bucket.reset();
      });

      it('should emit reset with custom token value', (done) => {
        const bucket = new TokenBucket(100, 10);

        bucket.on('reset', (data) => {
          expect(data.newTokens).toBe(50);
          done();
        });

        bucket.reset(50);
      });
    });

    describe('multiple events', () => {
      it('should emit penalty then rateLimitExceeded', (done) => {
        const bucket = new TokenBucket(10, 1);
        const events = [];

        bucket.on('penalty', (data) => {
          events.push({ type: 'penalty', data });
        });

        bucket.on('rateLimitExceeded', (data) => {
          events.push({ type: 'rateLimitExceeded', data });
          expect(events).toHaveLength(2);
          expect(events[0].type).toBe('penalty');
          expect(events[1].type).toBe('rateLimitExceeded');
          done();
        });

        bucket.penalty(15); // Heavy penalty
        bucket.allowRequest(); // Should fail
      });

      it('should handle multiple listeners', (done) => {
        const bucket = new TokenBucket(100, 10);
        let listener1Called = false;
        let listener2Called = false;

        bucket.on('allowed', () => {
          listener1Called = true;
        });

        bucket.on('allowed', () => {
          listener2Called = true;
          expect(listener1Called).toBe(true);
          expect(listener2Called).toBe(true);
          done();
        });

        bucket.allowRequest();
      });
    });
  });

  describe('RedisTokenBucket Events', () => {
    let mockRedis;

    beforeEach(() => {
      mockRedis = new MockRedis();
    });

    describe('allowed event', () => {
      it('should emit allowed event with source=redis', async () => {
        const bucket = new RedisTokenBucket(mockRedis, 'test:user', 100, 10);
        
        return new Promise((resolve) => {
          bucket.on('allowed', (data) => {
            expect(data.source).toBe('redis');
            expect(data.tokens).toBeDefined();
            expect(data.cost).toBe(5);
            expect(data.timestamp).toBeDefined();
            resolve();
          });

          bucket.allowRequest(5);
        });
      });
    });

    describe('rateLimitExceeded event', () => {
      it('should emit rateLimitExceeded with source=redis', async () => {
        const bucket = new RedisTokenBucket(mockRedis, 'test:user', 10, 1);
        await bucket.allowRequest(10); // Consume all

        return new Promise((resolve) => {
          bucket.on('rateLimitExceeded', (data) => {
            expect(data.source).toBe('redis');
            expect(data.reason).toBe('insufficient_tokens');
            expect(data.retryAfter).toBeGreaterThan(0);
            resolve();
          });

          bucket.allowRequest(5);
        });
      });
    });

    describe('redisError event', () => {
      it('should emit redisError on Redis failure', async () => {
        const bucket = new RedisTokenBucket(mockRedis, 'test:user', 100, 10);
        mockRedis.setShouldFail(true);

        return new Promise((resolve) => {
          bucket.on('redisError', (data) => {
            expect(data.operation).toBe('allowRequest');
            expect(data.error).toBeDefined();
            expect(data.timestamp).toBeDefined();
            resolve();
          });

          bucket.allowRequest();
        });
      });
    });

    describe('insurance events', () => {
      it('should emit insuranceActivated on Redis failure', async () => {
        const bucket = new RedisTokenBucket(mockRedis, 'test:user', 100, 10, {
          enableInsurance: true
        });
        mockRedis.setShouldFail(true);

        return new Promise((resolve) => {
          bucket.on('insuranceActivated', (data) => {
            expect(data.reason).toBe('redis_error');
            expect(data.error).toBeDefined();
            expect(data.failureCount).toBe(1);
            expect(data.timestamp).toBeDefined();
            resolve();
          });

          bucket.allowRequest();
        });
      });

      it('should emit insuranceDeactivated on Redis recovery', async () => {
        const bucket = new RedisTokenBucket(mockRedis, 'test:user', 100, 10, {
          enableInsurance: true
        });

        // Trigger insurance
        mockRedis.setShouldFail(true);
        await bucket.allowRequest();

        // Recover Redis
        mockRedis.setShouldFail(false);

        return new Promise((resolve) => {
          bucket.on('insuranceDeactivated', (data) => {
            expect(data.reason).toBe('redis_recovered');
            expect(data.timestamp).toBeDefined();
            resolve();
          });

          bucket.allowRequest();
        });
      });

      it('should forward insurance limiter events with source=insurance', async () => {
        const bucket = new RedisTokenBucket(mockRedis, 'test:user', 100, 10, {
          enableInsurance: true,
          insuranceCapacity: 10
        });
        mockRedis.setShouldFail(true); // Activate insurance

        await bucket.allowRequest(); // Trigger insurance activation

        return new Promise((resolve) => {
          bucket.on('allowed', (data) => {
            expect(data.source).toBe('insurance');
            resolve();
          });

          bucket.allowRequest();
        });
      });

      it('should emit penalty event from insurance', async () => {
        const bucket = new RedisTokenBucket(mockRedis, 'test:user', 100, 10, {
          enableInsurance: true
        });
        mockRedis.setShouldFail(true); // Activate insurance
        await bucket.allowRequest(); // Activate

        return new Promise((resolve) => {
          bucket.on('penalty', (data) => {
            expect(data.source).toBe('insurance');
            expect(data.penaltyApplied).toBe(5);
            resolve();
          });

          bucket.insuranceLimiter.penalty(5);
        });
      });

      it('should emit reward event from insurance', async () => {
        const bucket = new RedisTokenBucket(mockRedis, 'test:user', 100, 10, {
          enableInsurance: true,
          insuranceCapacity: 10,
          insuranceRefillRate: 1
        });
        mockRedis.setShouldFail(true);
        await bucket.allowRequest(); // Activate
        bucket.insuranceLimiter.allowRequest(5); // Consume some tokens

        return new Promise((resolve) => {
          bucket.on('reward', (data) => {
            expect(data.source).toBe('insurance');
            expect(data.rewardApplied).toBeGreaterThanOrEqual(1);
            resolve();
          });

          bucket.insuranceLimiter.reward(5);
        });
      });
    });

    describe('event ordering', () => {
      it('should emit redisError before insuranceActivated', async () => {
        const bucket = new RedisTokenBucket(mockRedis, 'test:user', 100, 10, {
          enableInsurance: true
        });
        mockRedis.setShouldFail(true);
        const events = [];

        bucket.on('redisError', (data) => {
          events.push({ type: 'redisError', timestamp: data.timestamp });
        });

        bucket.on('insuranceActivated', (data) => {
          events.push({ type: 'insuranceActivated', timestamp: data.timestamp });
          expect(events).toHaveLength(2);
          expect(events[0].type).toBe('redisError');
          expect(events[1].type).toBe('insuranceActivated');
        });

        await bucket.allowRequest();
      });
    });

    describe('event listener management', () => {
      it('should allow removing event listeners', async () => {
        const bucket = new TokenBucket(100, 10);
        let callCount = 0;

        const listener = () => {
          callCount++;
        };

        bucket.on('allowed', listener);
        bucket.allowRequest();
        expect(callCount).toBe(1);

        bucket.off('allowed', listener);
        bucket.allowRequest();
        expect(callCount).toBe(1); // Should not increment
      });

      it('should support once listeners', async () => {
        const bucket = new TokenBucket(100, 10);
        let callCount = 0;

        bucket.once('allowed', () => {
          callCount++;
        });

        bucket.allowRequest();
        bucket.allowRequest();
        expect(callCount).toBe(1); // Called only once
      });
    });
  });

  describe('Event Data Validation', () => {
    it('all events should have timestamp', () => {
      const bucket = new TokenBucket(100, 10);
      const events = [];

      bucket.on('allowed', (data) => events.push(data));
      bucket.on('penalty', (data) => events.push(data));
      bucket.on('reward', (data) => events.push(data));
      bucket.on('blocked', (data) => events.push(data));
      bucket.on('unblocked', (data) => events.push(data));
      bucket.on('reset', (data) => events.push(data));
      bucket.on('rateLimitExceeded', (data) => events.push(data));

      bucket.allowRequest(10);
      bucket.penalty(5);
      bucket.reward(3);
      bucket.block(1000);
      bucket.unblock();
      bucket.reset();
      bucket.allowRequest(1000); // Will fail

      events.forEach(event => {
        expect(event.timestamp).toBeDefined();
        expect(typeof event.timestamp).toBe('number');
        expect(event.timestamp).toBeGreaterThan(0);
      });
    });
  });
});
