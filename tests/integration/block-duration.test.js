/**
 * Integration Tests for Block Duration Feature
 */

const TokenBucket = require('../../src/algorithms/javascript/token-bucket');
const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

describe('Block Duration Feature', () => {
  describe('TokenBucket Block Functionality', () => {
    let bucket;

    beforeEach(() => {
      bucket = new TokenBucket(10, 1);
    });

    describe('block()', () => {
      it('should block the bucket for specified duration', () => {
        const result = bucket.block(5000);
        
        expect(result.blocked).toBe(true);
        expect(result.blockUntil).toBeGreaterThan(Date.now());
        expect(result.blockDuration).toBe(5000);
        expect(result.unblockAt).toBeDefined();
      });

      it('should reject invalid duration', () => {
        expect(() => bucket.block(0)).toThrow('Block duration must be a positive number');
        expect(() => bucket.block(-1000)).toThrow('Block duration must be a positive number');
        expect(() => bucket.block(NaN)).toThrow('Block duration must be a positive number');
        expect(() => bucket.block('5000')).toThrow('Block duration must be a positive number');
      });

      it('should update existing block', () => {
        bucket.block(1000);
        const result = bucket.block(5000);
        
        expect(result.blocked).toBe(true);
        expect(result.blockDuration).toBe(5000);
      });
    });

    describe('isBlocked()', () => {
      it('should return false when not blocked', () => {
        expect(bucket.isBlocked()).toBe(false);
      });

      it('should return true when blocked', () => {
        bucket.block(5000);
        expect(bucket.isBlocked()).toBe(true);
      });

      it('should return false after block expires', (done) => {
        bucket.block(100);
        expect(bucket.isBlocked()).toBe(true);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(false);
          done();
        }, 150);
      });

      it('should auto-unblock on check after expiry', () => {
        bucket.block(50);
        expect(bucket.isBlocked()).toBe(true);
        
        // Wait for expiry
        const start = Date.now();
        while (Date.now() - start < 100) {
          // Busy wait
        }
        
        expect(bucket.isBlocked()).toBe(false);
        expect(bucket.blockUntil).toBeNull();
      });
    });

    describe('getBlockTimeRemaining()', () => {
      it('should return 0 when not blocked', () => {
        expect(bucket.getBlockTimeRemaining()).toBe(0);
      });

      it('should return remaining time when blocked', () => {
        bucket.block(5000);
        const remaining = bucket.getBlockTimeRemaining();
        
        expect(remaining).toBeGreaterThan(4900);
        expect(remaining).toBeLessThanOrEqual(5000);
      });

      it('should return 0 after block expires', (done) => {
        bucket.block(100);
        
        setTimeout(() => {
          expect(bucket.getBlockTimeRemaining()).toBe(0);
          done();
        }, 150);
      });

      it('should decrease over time', (done) => {
        bucket.block(1000);
        const time1 = bucket.getBlockTimeRemaining();
        
        setTimeout(() => {
          const time2 = bucket.getBlockTimeRemaining();
          expect(time2).toBeLessThan(time1);
          done();
        }, 100);
      });
    });

    describe('unblock()', () => {
      it('should manually unblock the bucket', () => {
        bucket.block(5000);
        expect(bucket.isBlocked()).toBe(true);
        
        const result = bucket.unblock();
        
        expect(result.unblocked).toBe(true);
        expect(result.wasBlocked).toBe(true);
        expect(bucket.isBlocked()).toBe(false);
      });

      it('should work when not blocked', () => {
        const result = bucket.unblock();
        
        expect(result.unblocked).toBe(true);
        expect(result.wasBlocked).toBe(false);
      });

      it('should clear blockUntil timestamp', () => {
        bucket.block(5000);
        expect(bucket.blockUntil).not.toBeNull();
        
        bucket.unblock();
        expect(bucket.blockUntil).toBeNull();
      });
    });

    describe('Integration with allowRequest()', () => {
      it('should reject requests when blocked', () => {
        bucket.block(5000);
        
        const allowed = bucket.allowRequest();
        expect(allowed).toBe(false);
      });

      it('should not consume tokens when blocked', () => {
        const initialTokens = bucket.tokens;
        bucket.block(5000);
        
        bucket.allowRequest();
        expect(bucket.tokens).toBe(initialTokens);
      });

      it('should allow requests after unblock', () => {
        bucket.block(5000);
        expect(bucket.allowRequest()).toBe(false);
        
        bucket.unblock();
        expect(bucket.allowRequest()).toBe(true);
      });

      it('should allow requests after block expires', (done) => {
        bucket.block(100);
        expect(bucket.allowRequest()).toBe(false);
        
        setTimeout(() => {
          expect(bucket.allowRequest()).toBe(true);
          done();
        }, 150);
      });
    });

    describe('Serialization with block state', () => {
      it('should include blockUntil in toJSON()', () => {
        bucket.block(5000);
        
        const json = bucket.toJSON();
        expect(json.blockUntil).toBeDefined();
        expect(json.blockUntil).toBeGreaterThan(Date.now());
      });

      it('should restore block state from JSON', () => {
        bucket.block(5000);
        const json = bucket.toJSON();
        
        const restored = TokenBucket.fromJSON(json);
        expect(restored.isBlocked()).toBe(true);
        expect(restored.blockUntil).toBe(json.blockUntil);
      });

      it('should handle null blockUntil', () => {
        const json = bucket.toJSON();
        expect(json.blockUntil).toBeNull();
        
        const restored = TokenBucket.fromJSON(json);
        expect(restored.isBlocked()).toBe(false);
      });

      it('should handle expired block on restore', () => {
        const json = {
          capacity: 10,
          tokens: 5,
          refillRate: 1,
          lastRefill: Date.now(),
          blockUntil: Date.now() - 1000 // Already expired
        };
        
        const restored = TokenBucket.fromJSON(json);
        expect(restored.isBlocked()).toBe(false);
      });
    });
  });

  describe('RedisTokenBucket Block Functionality', () => {
    let redis;
    let bucket;
    const testKey = 'test:block:user123';

    beforeEach(async () => {
      // Mock Redis client
      redis = {
        storage: new Map(),
        async setex(key, ttl, value) {
          this.storage.set(key, { value, expiry: Date.now() + ttl * 1000 });
          return 'OK';
        },
        async get(key) {
          const item = this.storage.get(key);
          if (!item) return null;
          if (Date.now() > item.expiry) {
            this.storage.delete(key);
            return null;
          }
          return item.value;
        },
        async del(...keys) {
          let deleted = 0;
          for (const key of keys) {
            if (this.storage.delete(key)) deleted++;
          }
          return deleted;
        },
        async ping() {
          return 'PONG';
        },
        eval: jest.fn().mockResolvedValue([1, 10, Date.now()])
      };

      bucket = new RedisTokenBucket(redis, testKey, 10, 1);
    });

    afterEach(async () => {
      await redis.del(testKey, `${testKey}:block`);
    });

    describe('block()', () => {
      it('should block the bucket in Redis', async () => {
        const result = await bucket.block(5000);
        
        expect(result.blocked).toBe(true);
        expect(result.blockUntil).toBeGreaterThan(Date.now());
        expect(result.blockDuration).toBe(5000);
      });

      it('should store block in Redis with TTL', async () => {
        await bucket.block(5000);
        
        const blockValue = await redis.get(`${testKey}:block`);
        expect(blockValue).toBeDefined();
        expect(parseInt(blockValue, 10)).toBeGreaterThan(Date.now());
      });

      it('should reject invalid duration', async () => {
        await expect(bucket.block(0)).rejects.toThrow('Block duration must be a positive number');
        await expect(bucket.block(-1000)).rejects.toThrow('Block duration must be a positive number');
      });
    });

    describe('isBlocked()', () => {
      it('should return false when not blocked', async () => {
        const blocked = await bucket.isBlocked();
        expect(blocked).toBe(false);
      });

      it('should return true when blocked', async () => {
        await bucket.block(5000);
        const blocked = await bucket.isBlocked();
        expect(blocked).toBe(true);
      });

      it('should return false after block expires', async () => {
        await bucket.block(100);
        expect(await bucket.isBlocked()).toBe(true);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(await bucket.isBlocked()).toBe(false);
      });
    });

    describe('getBlockTimeRemaining()', () => {
      it('should return 0 when not blocked', async () => {
        const remaining = await bucket.getBlockTimeRemaining();
        expect(remaining).toBe(0);
      });

      it('should return remaining time when blocked', async () => {
        await bucket.block(5000);
        const remaining = await bucket.getBlockTimeRemaining();
        
        expect(remaining).toBeGreaterThan(4900);
        expect(remaining).toBeLessThanOrEqual(5000);
      });

      it('should clean up expired blocks', async () => {
        await bucket.block(100);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        const remaining = await bucket.getBlockTimeRemaining();
        
        expect(remaining).toBe(0);
        expect(await redis.get(`${testKey}:block`)).toBeNull();
      });
    });

    describe('unblock()', () => {
      it('should manually unblock the bucket', async () => {
        await bucket.block(5000);
        expect(await bucket.isBlocked()).toBe(true);
        
        const result = await bucket.unblock();
        
        expect(result.unblocked).toBe(true);
        expect(result.wasBlocked).toBe(true);
        expect(await bucket.isBlocked()).toBe(false);
      });

      it('should work when not blocked', async () => {
        const result = await bucket.unblock();
        
        expect(result.unblocked).toBe(true);
        expect(result.wasBlocked).toBe(false);
      });
    });

    describe('Integration with allowRequest()', () => {
      it('should reject requests when blocked', async () => {
        await bucket.block(5000);
        
        const allowed = await bucket.allowRequest();
        expect(allowed).toBe(false);
      });

      it('should allow requests after unblock', async () => {
        await bucket.block(5000);
        expect(await bucket.allowRequest()).toBe(false);
        
        await bucket.unblock();
        expect(await bucket.allowRequest()).toBe(true);
      });

      it('should allow requests after block expires', async () => {
        await bucket.block(100);
        expect(await bucket.allowRequest()).toBe(false);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(await bucket.allowRequest()).toBe(true);
      });
    });

    describe('Distributed blocking', () => {
      it('should enforce block across multiple instances', async () => {
        const bucket1 = new RedisTokenBucket(redis, testKey, 10, 1);
        const bucket2 = new RedisTokenBucket(redis, testKey, 10, 1);
        
        await bucket1.block(5000);
        
        expect(await bucket1.isBlocked()).toBe(true);
        expect(await bucket2.isBlocked()).toBe(true);
      });

      it('should synchronize unblock across instances', async () => {
        const bucket1 = new RedisTokenBucket(redis, testKey, 10, 1);
        const bucket2 = new RedisTokenBucket(redis, testKey, 10, 1);
        
        await bucket1.block(5000);
        await bucket1.unblock();
        
        expect(await bucket2.isBlocked()).toBe(false);
      });
    });
  });
});
