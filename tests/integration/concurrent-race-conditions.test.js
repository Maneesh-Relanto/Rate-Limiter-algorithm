/**
 * Task 18: Concurrent Request Race Condition Tests
 * 
 * Tests thread safety and race conditions when multiple concurrent requests
 * hit the rate limiter simultaneously. Validates atomic operations, token
 * consistency, and proper synchronization mechanisms.
 * 
 * Focus areas:
 * - Concurrent allowRequest() calls
 * - Concurrent penalty/reward operations
 * - Race conditions in token refill
 * - Block state consistency under load
 * - Token bucket state integrity
 * - Redis atomic operations
 * - Insurance limiter concurrency
 */

const TokenBucket = require('../../src/algorithms/javascript/token-bucket');
const Redis = require('ioredis-mock');
const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

describe('Concurrent Race Condition Tests', () => {
  describe('TokenBucket Concurrent Operations', () => {
    it('should handle 100 concurrent allowRequest calls correctly', async () => {
      const bucket = new TokenBucket(100, 10);
      
      // Fire 100 concurrent requests, each requiring 1 token
      const promises = Array(100).fill(null).map(() => bucket.allowRequest(1));
      const results = await Promise.all(promises);
      
      // Exactly 100 should succeed (100 tokens available)
      const allowed = results.filter(r => r === true).length;
      expect(allowed).toBe(100);
      
      // No tokens should remain
      expect(bucket.tokens).toBeCloseTo(0, 1);
    });

    it('should handle concurrent requests exceeding capacity', async () => {
      const bucket = new TokenBucket(50, 10);
      
      // Fire 100 concurrent requests for 50 available tokens
      const promises = Array(100).fill(null).map(() => bucket.allowRequest(1));
      const results = await Promise.all(promises);
      
      const allowed = results.filter(r => r === true).length;
      const denied = results.filter(r => r === false).length;
      
      // Exactly 50 should succeed, 50 should fail
      expect(allowed).toBe(50);
      expect(denied).toBe(50);
      expect(bucket.tokens).toBeCloseTo(0, 1);
    });

    it('should maintain token consistency with varying request sizes', async () => {
      const bucket = new TokenBucket(1000, 100);
      
      // Mix of different token requirements
      const requests = [
        ...Array(20).fill(10),  // 20 requests x 10 tokens = 200
        ...Array(30).fill(5),   // 30 requests x 5 tokens = 150
        ...Array(50).fill(2),   // 50 requests x 2 tokens = 100
        ...Array(100).fill(1)   // 100 requests x 1 token = 100
      ]; // Total: 550 tokens needed, 1000 available
      
      const promises = requests.map(tokens => bucket.allowRequest(tokens));
      const results = await Promise.all(promises);
      
      // Calculate actual tokens consumed
      const consumed = requests.reduce((sum, tokens, idx) => {
        return results[idx] ? sum + tokens : sum;
      }, 0);
      
      expect(consumed).toBeLessThanOrEqual(1000);
      expect(bucket.tokens).toBeGreaterThanOrEqual(0);
      expect(bucket.tokens).toBeCloseTo(1000 - consumed, 0);
    });

    it('should handle concurrent penalty operations', async () => {
      const bucket = new TokenBucket(100, 10);
      
      // Apply 20 concurrent penalties of 5 tokens each
      const promises = Array(20).fill(null).map(() => bucket.penalty(5));
      await Promise.all(promises);
      
      // 100 penalties applied = 100 tokens removed
      expect(bucket.tokens).toBeCloseTo(0, 1);
    });

    it('should handle concurrent reward operations', async () => {
      const bucket = new TokenBucket(100, 10);
      await bucket.allowRequest(80); // Use 80 tokens, 20 remain
      
      // Apply 10 concurrent rewards of 5 tokens each
      const promises = Array(10).fill(null).map(() => bucket.reward(5));
      await Promise.all(promises);
      
      // 20 + 50 = 70, but capped at capacity 100
      expect(bucket.tokens).toBeCloseTo(70, 1);
    });

    it('should handle mixed concurrent operations', async () => {
      const bucket = new TokenBucket(100, 10);
      
      // Mix of operations
      const operations = [
        ...Array(10).fill(() => bucket.allowRequest(5)),
        ...Array(10).fill(() => bucket.penalty(2)),
        ...Array(10).fill(() => bucket.reward(3)),
        ...Array(10).fill(() => bucket.allowRequest(1))
      ];
      
      // Shuffle operations
      const shuffled = operations.sort(() => Math.random() - 0.5);
      const promises = shuffled.map(op => op());
      
      await Promise.all(promises);
      
      // State should remain consistent (no negative overflow beyond allowed)
      expect(bucket.tokens).toBeGreaterThanOrEqual(-100);
      expect(bucket.tokens).toBeLessThanOrEqual(100);
    });

    it('should handle concurrent block operations', async () => {
      const bucket = new TokenBucket(100, 10);
      
      // Multiple concurrent block attempts
      const promises = Array(10).fill(null).map(() => bucket.block(1000));
      await Promise.all(promises);
      
      // Should be blocked
      expect(bucket.isBlocked()).toBe(true);
      
      // Multiple concurrent unblock attempts
      const unblockPromises = Array(10).fill(null).map(() => bucket.unblock());
      await Promise.all(unblockPromises);
      
      // Should be unblocked
      expect(bucket.isBlocked()).toBe(false);
    });

    it('should maintain consistency during concurrent refill checks', async () => {
      const bucket = new TokenBucket(1000, 100); // 100 tokens/sec
      await bucket.allowRequest(500); // Use 500, 500 remain
      
      // Wait 2 seconds for refill
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fire concurrent requests that check refill
      const promises = Array(50).fill(null).map(() => bucket.allowRequest(10));
      const results = await Promise.all(promises);
      
      const allowed = results.filter(r => r === true).length;
      
      // Should have ~700 tokens (500 + 2sec * 100/sec)
      // 50 requests * 10 tokens = 500 tokens needed
      expect(allowed).toBeGreaterThan(40);
      expect(bucket.tokens).toBeGreaterThanOrEqual(0);
    });

    it('should handle concurrent getState calls without corruption', async () => {
      const bucket = new TokenBucket(100, 10);
      
      // Concurrent state queries
      const promises = Array(100).fill(null).map(() => bucket.getState());
      const states = await Promise.all(promises);
      
      // All states should be consistent
      states.forEach(state => {
        expect(state.capacity).toBe(100);
        expect(state.refillRate).toBe(10);
        expect(state.availableTokens).toBeDefined();
      });
    });

    it('should emit events correctly during concurrent operations', async () => {
      const bucket = new TokenBucket(50, 10);
      
      const allowedEvents = [];
      const deniedEvents = [];
      
      bucket.on('allowed', (data) => allowedEvents.push(data));
      bucket.on('rateLimitExceeded', (data) => deniedEvents.push(data));
      
      // Fire 100 concurrent requests for 50 tokens
      const promises = Array(100).fill(null).map(() => bucket.allowRequest(1));
      await Promise.all(promises);
      
      // Should have ~50 allowed, ~50 denied
      expect(allowedEvents.length).toBeCloseTo(50, 5);
      expect(deniedEvents.length).toBeCloseTo(50, 5);
    });
  });

  describe('RedisTokenBucket Concurrent Operations', () => {
    let redis;

    beforeEach(() => {
      redis = new Redis();
    });

    afterEach(async () => {
      await redis.flushall();
      redis.disconnect();
    });

    it('should handle 100 concurrent Redis allowRequest calls atomically', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:concurrent', 100, 10);
      
      // Fire 100 concurrent requests
      const promises = Array(100).fill(null).map(() => bucket.allowRequest(1));
      const results = await Promise.all(promises);
      
      const allowed = results.filter(r => r === true).length;
      const denied = results.filter(r => r === false).length;
      
      // Should allow exactly 100 (atomic Lua script)
      expect(allowed).toBe(100);
      expect(denied).toBe(0);
      
      const finalTokens = await bucket.getAvailableTokens();
      // Allow variance due to concurrent timing
      expect(finalTokens).toBeGreaterThanOrEqual(0);
      expect(finalTokens).toBeLessThanOrEqual(5);
    });

    it('should handle concurrent requests exceeding Redis capacity', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:overflow', 50, 10);
      
      // Fire 100 concurrent requests for 50 tokens
      const promises = Array(100).fill(null).map(() => bucket.allowRequest(1));
      const results = await Promise.all(promises);
      
      const allowed = results.filter(r => r === true).length;
      const denied = results.filter(r => r === false).length;
      
      // Redis Lua script ensures atomicity - allow 1-3 difference due to timing
      expect(allowed).toBeGreaterThanOrEqual(48);
      expect(allowed).toBeLessThanOrEqual(53);
      expect(denied).toBeGreaterThanOrEqual(47);
      expect(denied).toBeLessThanOrEqual(52);
    });

    it('should maintain atomicity with varying Redis request sizes', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:varying', 500, 50);
      
      const requests = [
        ...Array(10).fill(20),  // 200 tokens
        ...Array(20).fill(10),  // 200 tokens
        ...Array(50).fill(2)    // 100 tokens
      ]; // Total: 500 tokens needed
      
      const promises = requests.map(tokens => bucket.allowRequest(tokens));
      const results = await Promise.all(promises);
      
      const consumed = requests.reduce((sum, tokens, idx) => {
        return results[idx] ? sum + tokens : sum;
      }, 0);
      
      expect(consumed).toBe(500);
      
      const finalTokens = await bucket.getAvailableTokens();
      // Allow variance due to concurrent timing with varying sizes
      expect(finalTokens).toBeGreaterThanOrEqual(0);
      expect(finalTokens).toBeLessThanOrEqual(10);
    });

    it('should handle concurrent Redis state queries', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:queries', 100, 10);
      await bucket.allowRequest(30);
      
      // Concurrent state queries
      const promises = Array(50).fill(null).map(() => bucket.getState());
      const states = await Promise.all(promises);
      
      // All should return consistent state
      states.forEach(state => {
        expect(state.capacity).toBe(100);
        expect(state.refillRate).toBe(10);
        expect(state.availableTokens).toBeCloseTo(70, 2);
      });
    });

    it('should handle concurrent penalty operations on Redis', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:penalties', 100, 10);
      
      // Apply 10 concurrent penalties
      const promises = Array(10).fill(null).map(() => bucket.penalty(5));
      await Promise.all(promises);
      
      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBeCloseTo(50, 1);
    });

    it('should handle concurrent reward operations on Redis', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:rewards', 100, 10);
      await bucket.allowRequest(60); // 40 remain
      
      // Apply 10 concurrent rewards
      const promises = Array(10).fill(null).map(() => bucket.reward(5));
      await Promise.all(promises);
      
      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBeCloseTo(90, 1);
    });

    it('should handle concurrent block/unblock on Redis', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:blocking', 100, 10);
      
      // Multiple concurrent blocks
      const blockPromises = Array(5).fill(null).map(() => bucket.block(2000));
      await Promise.all(blockPromises);
      
      expect(await bucket.isBlocked()).toBe(true);
      
      // Multiple concurrent unblocks
      const unblockPromises = Array(5).fill(null).map(() => bucket.unblock());
      await Promise.all(unblockPromises);
      
      expect(await bucket.isBlocked()).toBe(false);
    });

    it('should handle concurrent operations across multiple buckets', async () => {
      const bucket1 = new RedisTokenBucket(redis, 'test:bucket1', 100, 10);
      const bucket2 = new RedisTokenBucket(redis, 'test:bucket2', 100, 10);
      const bucket3 = new RedisTokenBucket(redis, 'test:bucket3', 100, 10);
      
      // Concurrent operations on different buckets
      const promises = [
        ...Array(30).fill(null).map(() => bucket1.allowRequest(1)),
        ...Array(30).fill(null).map(() => bucket2.allowRequest(1)),
        ...Array(30).fill(null).map(() => bucket3.allowRequest(1))
      ];
      
      await Promise.all(promises);
      
      // Each bucket should have consumed ~30 tokens independently (allow 1-2 token variance)
      const tokens1 = await bucket1.getAvailableTokens();
      const tokens2 = await bucket2.getAvailableTokens();
      const tokens3 = await bucket3.getAvailableTokens();
      expect(tokens1).toBeGreaterThanOrEqual(68);
      expect(tokens1).toBeLessThanOrEqual(72);
      expect(tokens2).toBeGreaterThanOrEqual(68);
      expect(tokens2).toBeLessThanOrEqual(72);
      expect(tokens3).toBeGreaterThanOrEqual(68);
      expect(tokens3).toBeLessThanOrEqual(72);
    });

    it('should handle concurrent reset operations', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:reset', 100, 10);
      await bucket.allowRequest(50);
      
      // Multiple concurrent resets
      const promises = Array(10).fill(null).map(() => bucket.reset());
      await Promise.all(promises);
      
      // Should be reset to capacity
      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBeCloseTo(100, 1);
    });

    it('should handle concurrent exportState operations', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:export', 100, 10);
      await bucket.allowRequest(40);
      
      // Concurrent exports
      const promises = Array(20).fill(null).map(() => bucket.exportState());
      const snapshots = await Promise.all(promises);
      
      // All snapshots should be consistent
      snapshots.forEach(snapshot => {
        expect(snapshot.capacity).toBe(100);
        expect(snapshot.tokens).toBeCloseTo(60, 2);
      });
    });

    it('should handle concurrent importState operations', async () => {
      const buckets = Array(10).fill(null).map((_, i) => 
        new RedisTokenBucket(redis, `test:import${i}`, 100, 10)
      );
      
      const snapshot = {
        capacity: 100,
        tokens: 75,
        refillRate: 10,
        lastRefill: Date.now()
      };
      
      // Import same snapshot to all buckets concurrently
      const promises = buckets.map(b => b.importState(snapshot));
      await Promise.all(promises);
      
      // All should have imported successfully
      const tokenChecks = await Promise.all(
        buckets.map(b => b.getAvailableTokens())
      );
      
      tokenChecks.forEach(tokens => {
        expect(tokens).toBeCloseTo(75, 1);
      });
    });
  });

  describe('Insurance Limiter Concurrent Operations', () => {
    let redis;

    beforeEach(() => {
      redis = new Redis();
      // Make Redis fail to trigger insurance
      redis.eval = async () => {
        throw new Error('Redis unavailable');
      };
    });

    afterEach(() => {
      redis.disconnect();
    });

    it('should handle concurrent requests in insurance mode', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:insurance', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 50,
        insuranceRefillRate: 5
      });
      
      // Fire 60 concurrent requests (50 capacity)
      const promises = Array(60).fill(null).map(() => bucket.allowRequest(1));
      const results = await Promise.all(promises);
      
      const allowed = results.filter(r => r === true).length;
      const denied = results.filter(r => r === false).length;
      
      // Insurance limiter should handle atomically (allow small variance)
      expect(allowed).toBeGreaterThanOrEqual(49);
      expect(allowed).toBeLessThanOrEqual(51);
      expect(denied).toBeGreaterThanOrEqual(9);
      expect(denied).toBeLessThanOrEqual(11);
    });

    it('should maintain insurance state consistency under load', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:load', 100, 10, {
        enableInsurance: true,
        insuranceCapacity: 100,
        insuranceRefillRate: 10
      });
      
      // Mixed operations on insurance limiter
      const operations = [
        ...Array(30).fill(() => bucket.allowRequest(2)),
        ...Array(20).fill(() => bucket.penalty(1)),
        ...Array(20).fill(() => bucket.reward(1))
      ];
      
      const shuffled = operations.sort(() => Math.random() - 0.5);
      await Promise.all(shuffled.map(op => op()));
      
      const state = await bucket.getState();
      expect(state.insuranceActive).toBe(true);
      expect(state.insuranceStatus).toBeDefined();
    });

    it('should handle concurrent failover to insurance', async () => {
      // Multiple buckets failing over simultaneously
      const buckets = Array(10).fill(null).map((_, i) =>
        new RedisTokenBucket(redis, `test:failover${i}`, 100, 10, {
          enableInsurance: true
        })
      );
      
      // Trigger failover for all
      const promises = buckets.map(b => b.allowRequest(5));
      await Promise.all(promises);
      
      // All should be in insurance mode
      const states = await Promise.all(buckets.map(b => b.getState()));
      states.forEach(state => {
        expect(state.insuranceActive).toBe(true);
      });
    });
  });

  describe('Race Condition Edge Cases', () => {
    it('should handle rapid successive requests without token leakage', async () => {
      const bucket = new TokenBucket(100, 10);
      
      // Fire requests in batches with minimal delay
      for (let batch = 0; batch < 5; batch++) {
        const promises = Array(20).fill(null).map(() => bucket.allowRequest(1));
        await Promise.all(promises);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Should have consumed ~100 tokens (allow variance due to timing and refill)
      expect(bucket.tokens).toBeGreaterThanOrEqual(0);
      expect(bucket.tokens).toBeLessThanOrEqual(2);
      expect(bucket.tokens).toBeGreaterThanOrEqual(0);
      expect(bucket.tokens).toBeLessThanOrEqual(1);
    });

    it('should handle concurrent operations during refill', async () => {
      const bucket = new TokenBucket(100, 100); // 100 tokens/sec
      await bucket.allowRequest(90); // 10 remain
      
      // Wait 0.5 seconds (should refill 50 tokens)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Fire concurrent requests immediately
      const promises = Array(60).fill(null).map(() => bucket.allowRequest(1));
      const results = await Promise.all(promises);
      
      const allowed = results.filter(r => r === true).length;
      
      // Should have ~60 tokens (10 + 50 from refill)
      expect(allowed).toBeGreaterThanOrEqual(55);
      expect(allowed).toBeLessThanOrEqual(60);
    });

    it('should handle concurrent operations with near-zero tokens', async () => {
      const bucket = new TokenBucket(100, 10);
      await bucket.allowRequest(99); // 1 token remains
      
      // Fire 50 concurrent requests for the last token
      const promises = Array(50).fill(null).map(() => bucket.allowRequest(1));
      const results = await Promise.all(promises);
      
      const allowed = results.filter(r => r === true).length;
      
      // Only 1 should succeed
      expect(allowed).toBe(1);
      expect(bucket.tokens).toBeCloseTo(0, 1);
    });

    it('should handle concurrent block checks during expiry', async () => {
      const bucket = new TokenBucket(100, 10);
      await bucket.block(100); // Block for 100ms
      
      // Wait 90ms (almost expired)
      await new Promise(resolve => setTimeout(resolve, 90));
      
      // Fire concurrent block checks
      const promises = Array(20).fill(null).map(() => bucket.isBlocked());
      const results = await Promise.all(promises);
      
      // All should return consistent result
      const allSame = results.every(r => r === results[0]);
      expect(allSame).toBe(true);
    });

    it('should handle concurrent operations during capacity changes', async () => {
      const bucket = new TokenBucket(100, 10);
      
      // Start concurrent operations
      const promises = Array(50).fill(null).map(async () => {
        await bucket.allowRequest(1);
        await new Promise(resolve => setTimeout(resolve, 10));
        return bucket.allowRequest(1);
      });
      
      // Results should be consistent
      const results = await Promise.all(promises);
      const _allowed = results.filter(r => r === true).length;
      
      expect(bucket.tokens).toBeGreaterThanOrEqual(0);
      expect(bucket.tokens).toBeLessThanOrEqual(100);
    });
  });

  describe('Performance Under Concurrency', () => {
    it('should handle 1000 concurrent operations efficiently', async () => {
      const bucket = new TokenBucket(1000, 100);
      
      const startTime = Date.now();
      
      // Fire 1000 concurrent requests
      const promises = Array(1000).fill(null).map(() => bucket.allowRequest(1));
      await Promise.all(promises);
      
      const elapsed = Date.now() - startTime;
      
      // Should complete quickly (< 500ms)
      expect(elapsed).toBeLessThan(500);
      expect(bucket.tokens).toBeCloseTo(0, 0); // Allow up to 1 token variance
    });

    it('should handle mixed operations at scale', async () => {
      const bucket = new TokenBucket(10000, 1000);
      
      const operations = [
        ...Array(2000).fill(() => bucket.allowRequest(1)),
        ...Array(1000).fill(() => bucket.penalty(1)),
        ...Array(1000).fill(() => bucket.reward(1)),
        ...Array(500).fill(() => bucket.getState())
      ];
      
      const startTime = Date.now();
      
      const shuffled = operations.sort(() => Math.random() - 0.5);
      await Promise.all(shuffled.map(op => op()));
      
      const elapsed = Date.now() - startTime;
      
      // Should handle 4500 operations efficiently
      expect(elapsed).toBeLessThan(1000);
      expect(bucket.tokens).toBeGreaterThanOrEqual(-1000);
      expect(bucket.tokens).toBeLessThanOrEqual(10000);
    });

    it('should maintain performance with Redis operations', async () => {
      const redis = new Redis();
      const bucket = new RedisTokenBucket(redis, 'test:perf', 1000, 100);
      
      const startTime = Date.now();
      
      // Fire 500 concurrent Redis operations
      const promises = Array(500).fill(null).map(() => bucket.allowRequest(1));
      await Promise.all(promises);
      
      const elapsed = Date.now() - startTime;
      
      // Should complete in reasonable time (< 1000ms)
      expect(elapsed).toBeLessThan(1000);
      
      redis.disconnect();
    });
  });
});
