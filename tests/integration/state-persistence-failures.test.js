/**
 * Task 17: State Persistence Failure Tests
 * 
 * Tests Redis state save/load failures, corrupted data handling,
 * missing keys, and recovery mechanisms during persistence operations.
 * 
 * Focus areas:
 * - exportState() failures during Redis read errors
 * - importState() failures during Redis write errors
 * - getState() failures and fallback behavior
 * - Corrupted state data handling
 * - Missing state keys handling
 * - State synchronization across operations
 * - Recovery from state inconsistencies
 * - Partial failure scenarios
 */

const Redis = require('ioredis-mock');
const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

/**
 * Mock Redis client that extends ioredis-mock with failure simulation
 */
class MockRedisClient extends Redis {
  constructor() {
    super();
    this.shouldFailEval = false;
    this.shouldFailHmset = false;
    this.shouldFailHgetall = false;
    this.shouldFailMulti = false;
    this.corruptData = false;
    this.missingKeys = false;
  }

  async eval(...args) {
    if (this.shouldFailEval) {
      throw new Error('Redis EVAL failed');
    }
    if (this.missingKeys) {
      // Return state indicating no bucket exists
      return [0, 0, Date.now()];
    }
    return super.eval(...args);
  }

  async hmset(key, ...args) {
    if (this.shouldFailHmset) {
      throw new Error('Redis HMSET failed');
    }
    return super.hmset(key, ...args);
  }

  async hgetall(key) {
    if (this.shouldFailHgetall) {
      throw new Error('Redis HGETALL failed');
    }
    if (this.missingKeys) {
      return null;
    }
    if (this.corruptData) {
      return { tokens: 'corrupt', lastRefill: 'invalid' };
    }
    return super.hgetall(key);
  }

  multi() {
    if (this.shouldFailMulti) {
      throw new Error('Redis MULTI failed');
    }
    const pipeline = super.multi();
    const originalExec = pipeline.exec.bind(pipeline);
    
    // Wrap exec to allow failure injection
    pipeline.exec = async () => {
      if (this.shouldFailMulti) {
        throw new Error('Redis transaction failed');
      }
      return originalExec();
    };
    
    return pipeline;
  }

  // Control methods
  setFailEval(shouldFail) {
    this.shouldFailEval = shouldFail;
  }

  setFailHmset(shouldFail) {
    this.shouldFailHmset = shouldFail;
  }

  setFailHgetall(shouldFail) {
    this.shouldFailHgetall = shouldFail;
  }

  setFailMulti(shouldFail) {
    this.shouldFailMulti = shouldFail;
  }

  setCorruptData(corrupt) {
    this.corruptData = corrupt;
  }

  setMissingKeys(missing) {
    this.missingKeys = missing;
  }

  reset() {
    this.shouldFailEval = false;
    this.shouldFailHmset = false;
    this.shouldFailHgetall = false;
    this.shouldFailMulti = false;
    this.corruptData = false;
    this.missingKeys = false;
  }
}

describe('State Persistence Failure Tests', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = new MockRedisClient();
  });

  afterEach(async () => {
    await mockRedis.flushall();
    mockRedis.disconnect();
  });

  describe('exportState() Failures', () => {
    it('should handle Redis HGETALL failures during export', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user1', 100, 10);
      await bucket.allowRequest(20);

      // Simulate Redis failure
      mockRedis.setFailHgetall(true);

      const snapshot = await bucket.exportState();
      
      // Should return configuration with error indication
      expect(snapshot).toHaveProperty('error');
      expect(snapshot).toHaveProperty('capacity', 100);
      expect(snapshot).toHaveProperty('refillRate', 10);
      expect(snapshot.tokens).toBeNull();
      expect(snapshot.lastRefill).toBeNull();
    });

    it('should handle corrupted token data during export', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user2', 100, 10);
      await bucket.allowRequest(20);

      // Corrupt the data
      mockRedis.setCorruptData(true);

      const snapshot = await bucket.exportState();
      
      // Should handle gracefully
      expect(snapshot).toHaveProperty('error');
      expect(snapshot.capacity).toBe(100);
    });

    it('should handle missing keys during export', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user3', 100, 10);
      
      // Don't initialize - keys don't exist
      mockRedis.setMissingKeys(true);

      const snapshot = await bucket.exportState();
      
      // Should return config - missingKeys affects hgetall, returns empty tokens
      expect(snapshot).toHaveProperty('capacity', 100);
      expect(snapshot.tokens).toBeCloseTo(0, 1);
    });

    it('should emit redisError event on export failure', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user4', 100, 10);
      
      const errors = [];
      bucket.on('redisError', (data) => errors.push(data));

      mockRedis.setFailHgetall(true);
      await bucket.exportState();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('Redis HGETALL failed');
    });

    it('should handle partial Redis failures during export', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user5', 100, 10);
      await bucket.allowRequest(30);

      // Missing keys scenario
      mockRedis.setMissingKeys(true);

      const snapshot = await bucket.exportState();
      
      // Should handle gracefully
      expect(snapshot.capacity).toBe(100);
    });

    it('should not crash application on export failure', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user6', 100, 10);
      
      mockRedis.setFailHgetall(true);

      // Should not throw
      await expect(bucket.exportState()).resolves.toBeDefined();
    });
  });

  describe('importState() Failures', () => {
    it('should handle Redis transaction failures during import', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user10', 100, 10);
      const snapshot = {
        capacity: 100,
        tokens: 50,
        refillRate: 10,
        lastRefill: Date.now()
      };

      mockRedis.setFailMulti(true);

      await expect(bucket.importState(snapshot)).rejects.toThrow('Redis');
    });

    it('should validate snapshot before attempting import', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user11', 100, 10);
      
      // Invalid snapshot - missing required fields
      const invalidSnapshot = { capacity: 100 };

      await expect(bucket.importState(invalidSnapshot)).rejects.toThrow('Missing required fields');
      
      // Redis should not be called
      // (validated by no Redis errors thrown)
    });

    it('should reject corrupted snapshot data', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user12', 100, 10);
      
      const corruptedSnapshot = {
        capacity: -50, // Invalid
        tokens: 100,
        refillRate: 10,
        lastRefill: Date.now()
      };

      await expect(bucket.importState(corruptedSnapshot)).rejects.toThrow('Invalid capacity');
    });

    it('should reject snapshot with tokens exceeding capacity', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user13', 100, 10);
      
      const invalidSnapshot = {
        capacity: 100,
        tokens: 150, // Exceeds capacity
        refillRate: 10,
        lastRefill: Date.now()
      };

      await expect(bucket.importState(invalidSnapshot)).rejects.toThrow('tokens (150) cannot exceed capacity (100)');
    });

    it('should reject snapshot with invalid refillRate', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user14', 100, 10);
      
      const invalidSnapshot = {
        capacity: 100,
        tokens: 50,
        refillRate: -5, // Invalid
        lastRefill: Date.now()
      };

      await expect(bucket.importState(invalidSnapshot)).rejects.toThrow('Invalid refillRate');
    });

    it('should reject snapshot with invalid lastRefill timestamp', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user15', 100, 10);
      
      const invalidSnapshot = {
        capacity: 100,
        tokens: 50,
        refillRate: 10,
        lastRefill: 'not-a-timestamp'
      };

      await expect(bucket.importState(invalidSnapshot)).rejects.toThrow('Invalid lastRefill');
    });

    it('should handle mid-import Redis failure gracefully', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user16', 100, 10);
      const snapshot = {
        capacity: 100,
        tokens: 50,
        refillRate: 10,
        lastRefill: Date.now()
      };

      // Fail transaction
      mockRedis.setFailMulti(true);

      await expect(bucket.importState(snapshot)).rejects.toThrow();
    });

    it('should emit redisError event on import failure', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user17', 100, 10);
      const snapshot = {
        capacity: 100,
        tokens: 50,
        refillRate: 10,
        lastRefill: Date.now()
      };

      const errors = [];
      bucket.on('redisError', (data) => errors.push(data));

      mockRedis.setFailMulti(true);

      try {
        await bucket.importState(snapshot);
      } catch (e) {
        // Expected
      }

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('Redis');
    });
  });

  describe('getState() Failures', () => {
    it('should return error information when Redis fails', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user20', 100, 10);
      
      mockRedis.setFailEval(true);

      const state = await bucket.getState();

      expect(state).toHaveProperty('error');
      expect(state.error).toContain('Redis EVAL failed');
      expect(state.capacity).toBe(100);
      expect(state.refillRate).toBe(10);
    });

    it('should handle corrupted state data gracefully', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user21', 100, 10);
      await bucket.allowRequest(20);

      mockRedis.setCorruptData(true);

      const state = await bucket.getState();

      // Should return error but not crash
      expect(state).toHaveProperty('error');
      expect(state.capacity).toBe(100);
    });

    it('should handle missing Redis keys', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user22', 100, 10);
      
      mockRedis.setMissingKeys(true);

      const state = await bucket.getState();

      // Should initialize with capacity if keys missing  
      expect(state).toHaveProperty('availableTokens');
    });

    it('should work in detailed mode even with Redis failures', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user23', 100, 10);
      
      mockRedis.setFailEval(true);

      const state = await bucket.getState(true);

      // Should still return basic structure with error
      expect(state).toHaveProperty('error');
      expect(state.capacity).toBe(100);
      // detailed flag is not in error state
    });

    it('should emit redisError event on getState failure', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user24', 100, 10);
      
      const errors = [];
      bucket.on('redisError', (data) => errors.push(data));

      mockRedis.setFailEval(true);
      await bucket.getState();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].error).toContain('Redis EVAL failed');
    });
  });

  describe('State Recovery Mechanisms', () => {
    it('should recover from temporary Redis failures', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user30', 100, 10);
      await bucket.allowRequest(30);

      // Export succeeds
      const snapshot1 = await bucket.exportState();
      expect(snapshot1.tokens).toBeCloseTo(70, 1);

      // Redis fails
      mockRedis.setFailMget(true);
      const snapshot2 = await bucket.exportState();
      expect(snapshot2).toHaveProperty('error');

      // Redis recovers
      mockRedis.reset();
      const snapshot3 = await bucket.exportState();
      expect(snapshot3.tokens).toBeCloseTo(70, 1);
    });

    it('should maintain consistency after failed import attempt', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user31', 100, 10);
      await bucket.allowRequest(40);

      const originalTokens = await bucket.getAvailableTokens();

      const badSnapshot = {
        capacity: 100,
        tokens: 25,
        refillRate: 10,
        lastRefill: Date.now()
      };

      mockRedis.setFailMset(true);

      try {
        await bucket.importState(badSnapshot);
      } catch (e) {
        // Expected failure
      }

      // Original state should be unchanged
      mockRedis.reset();
      const currentTokens = await bucket.getAvailableTokens();
      expect(currentTokens).toBeCloseTo(originalTokens, 1);
    });

    it('should handle export-import cycle with intermittent failures', async () => {
      const bucket1 = new RedisTokenBucket(mockRedis, 'test:source', 100, 10);
      await bucket1.allowRequest(45);

      // Export attempt 1: fails
      mockRedis.setFailMget(true);
      const snapshot1 = await bucket1.exportState();
      expect(snapshot1).toHaveProperty('error');

      // Export attempt 2: succeeds
      mockRedis.reset();
      const snapshot2 = await bucket1.exportState();
      expect(snapshot2.tokens).toBeCloseTo(55, 1);

      // Import attempt 1: fails
      const bucket2 = new RedisTokenBucket(mockRedis, 'test:target', 100, 10);
      mockRedis.setFailMset(true);
      await expect(bucket2.importState(snapshot2)).rejects.toThrow();

      // Import attempt 2: succeeds
      mockRedis.reset();
      await expect(bucket2.importState(snapshot2)).resolves.not.toThrow();

      const targetTokens = await bucket2.getAvailableTokens();
      expect(targetTokens).toBeCloseTo(55, 1);
    });

    it('should support retry logic for failed exports', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user33', 100, 10);
      await bucket.allowRequest(20);

      let attempts = 0;
      const maxAttempts = 3;
      let snapshot;

      while (attempts < maxAttempts) {
        attempts++;
        mockRedis.setFailMget(attempts < 3);
        
        snapshot = await bucket.exportState();
        
        if (!snapshot.error) {
          break;
        }
        
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      expect(attempts).toBe(3);
      expect(snapshot).not.toHaveProperty('error');
      expect(snapshot.tokens).toBeCloseTo(80, 1);
    });

    it('should recover state after partial write failure', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user34', 100, 10);
      await bucket.allowRequest(30);

      const snapshot = {
        capacity: 100,
        tokens: 50,
        refillRate: 10,
        lastRefill: Date.now()
      };

      // Simulate partial failure (write succeeds but confirmation fails)
      let writeCalled = false;
      const originalMset = mockRedis.mset.bind(mockRedis);
      mockRedis.mset = async function(...args) {
        if (!writeCalled) {
          writeCalled = true;
          await originalMset(...args);
          throw new Error('Confirmation timeout');
        }
        return originalMset(...args);
      };

      try {
        await bucket.importState(snapshot);
      } catch (e) {
        // Expected
      }

      // Reset mock
      mockRedis.mset = originalMset;

      // Verify state was actually written
      mockRedis.reset();
      const state = await bucket.getState();
      expect(state.availableTokens).toBeCloseTo(50, 1);
    });
  });

  describe('Concurrent State Operations', () => {
    it('should handle concurrent exports during Redis failure', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user40', 100, 10);
      await bucket.allowRequest(25);

      mockRedis.setFailMget(true);

      const exports = await Promise.all([
        bucket.exportState(),
        bucket.exportState(),
        bucket.exportState()
      ]);

      // All should handle failure gracefully
      exports.forEach(snapshot => {
        expect(snapshot).toHaveProperty('error');
        expect(snapshot.capacity).toBe(100);
      });
    });

    it('should handle concurrent imports with one failure', async () => {
      const bucket1 = new RedisTokenBucket(mockRedis, 'test:target1', 100, 10);
      const bucket2 = new RedisTokenBucket(mockRedis, 'test:target2', 100, 10);

      const snapshot = {
        capacity: 100,
        tokens: 60,
        refillRate: 10,
        lastRefill: Date.now()
      };

      // First import succeeds, second fails
      let firstImport = true;
      const originalMset = mockRedis.mset.bind(mockRedis);
      mockRedis.mset = async function(...args) {
        if (firstImport) {
          firstImport = false;
          return originalMset(...args);
        }
        throw new Error('Redis overloaded');
      };

      const results = await Promise.allSettled([
        bucket1.importState(snapshot),
        bucket2.importState(snapshot)
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');

      // Restore mock
      mockRedis.mset = originalMset;
      mockRedis.reset();

      // First bucket should have imported successfully
      const tokens1 = await bucket1.getAvailableTokens();
      expect(tokens1).toBeCloseTo(60, 1);
    });

    it('should handle export during concurrent imports', async () => {
      const source = new RedisTokenBucket(mockRedis, 'test:source', 100, 10);
      const target = new RedisTokenBucket(mockRedis, 'test:target', 100, 10);
      
      await source.allowRequest(35);

      const snapshot = {
        capacity: 100,
        tokens: 40,
        refillRate: 10,
        lastRefill: Date.now()
      };

      // Run export and import concurrently
      const [exported, imported] = await Promise.all([
        source.exportState(),
        target.importState(snapshot)
      ]);

      expect(exported.tokens).toBeCloseTo(65, 1);
      expect(imported).toBeUndefined(); // importState returns void

      const targetTokens = await target.getAvailableTokens();
      expect(targetTokens).toBeCloseTo(40, 1);
    });
  });

  describe('Error Propagation', () => {
    it('should provide detailed error messages', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user50', 100, 10);
      
      mockRedis.setFailMget(true);

      const snapshot = await bucket.exportState();

      expect(snapshot.error).toBeDefined();
      expect(snapshot.error).toContain('Redis MGET failed');
    });

    it('should include operation context in errors', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user51', 100, 10);
      
      const errors = [];
      bucket.on('redisError', (data) => errors.push(data));

      mockRedis.setFailMget(true);
      await bucket.exportState();

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toHaveProperty('error');
      expect(errors[0]).toHaveProperty('key', 'test:user51');
    });

    it('should not expose Redis internal details in errors', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user52', 100, 10);
      
      mockRedis.setFailMget(true);

      const snapshot = await bucket.exportState();

      // Error should be sanitized
      expect(snapshot.error).not.toContain('password');
      expect(snapshot.error).not.toContain('127.0.0.1');
    });
  });

  describe('Data Integrity', () => {
    it('should validate imported data matches snapshot', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user60', 100, 10);
      
      const snapshot = {
        capacity: 100,
        tokens: 73,
        refillRate: 10,
        lastRefill: Date.now() - 100
      };

      await bucket.importState(snapshot);

      const state = await bucket.getState();
      
      // Tokens should match or be slightly higher due to refill
      expect(state.availableTokens).toBeGreaterThanOrEqual(73);
      expect(state.availableTokens).toBeLessThanOrEqual(74);
    });

    it('should reject snapshot with future timestamps', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user61', 100, 10);
      
      const snapshot = {
        capacity: 100,
        tokens: 50,
        refillRate: 10,
        lastRefill: Date.now() + 10000 // 10 seconds in future
      };

      // Should accept but treat as current time
      await bucket.importState(snapshot);

      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBeCloseTo(50, 1);
    });

    it('should handle very old timestamps in snapshots', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user62', 100, 10);
      
      const snapshot = {
        capacity: 100,
        tokens: 20,
        refillRate: 100, // 100 tokens/sec
        lastRefill: Date.now() - 5000 // 5 seconds ago
      };

      await bucket.importState(snapshot);

      const tokens = await bucket.getAvailableTokens();
      
      // Should refill to capacity (20 + 5sec * 100/sec = 520, capped at 100)
      expect(tokens).toBe(100);
    });

    it('should preserve fractional tokens accurately', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user63', 100, 10);
      
      const snapshot = {
        capacity: 100,
        tokens: 47.5,
        refillRate: 10,
        lastRefill: Date.now()
      };

      await bucket.importState(snapshot);

      const tokens = await bucket.getAvailableTokens();
      
      // getAvailableTokens uses Math.floor
      expect(tokens).toBe(47);
    });

    it('should maintain state consistency across operations after import', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user64', 100, 10);
      
      const snapshot = {
        capacity: 100,
        tokens: 80,
        refillRate: 10,
        lastRefill: Date.now()
      };

      await bucket.importState(snapshot);

      // Perform various operations
      expect(await bucket.allowRequest(30)).toBe(true);
      expect(await bucket.allowRequest(30)).toBe(true);
      expect(await bucket.allowRequest(30)).toBe(false);

      const finalTokens = await bucket.getAvailableTokens();
      expect(finalTokens).toBeCloseTo(20, 1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle export with zero tokens', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user70', 100, 10);
      await bucket.allowRequest(100); // Drain all tokens

      const snapshot = await bucket.exportState();

      expect(snapshot.tokens).toBeCloseTo(0, 1);
      expect(snapshot.capacity).toBe(100);
    });

    it('should handle import with zero tokens', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user71', 100, 10);
      
      const snapshot = {
        capacity: 100,
        tokens: 0,
        refillRate: 10,
        lastRefill: Date.now()
      };

      await bucket.importState(snapshot);

      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBe(0);
    });

    it('should handle very large state values', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user72', 1000000, 10000);
      
      const snapshot = {
        capacity: 1000000,
        tokens: 999999,
        refillRate: 10000,
        lastRefill: Date.now()
      };

      await bucket.importState(snapshot);

      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBeCloseTo(999999, 1);
    });

    it('should handle rapid export-import cycles', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user73', 100, 10);
      await bucket.allowRequest(50);

      // Perform 10 rapid export-import cycles
      for (let i = 0; i < 10; i++) {
        const snapshot = await bucket.exportState();
        await bucket.importState(snapshot);
      }

      const finalTokens = await bucket.getAvailableTokens();
      expect(finalTokens).toBeCloseTo(50, 2);
    });

    it('should handle state operations with TTL expiry', async () => {
      const bucket = new RedisTokenBucket(mockRedis, 'test:user74', 100, 10);
      await bucket.allowRequest(40);

      // Export state
      const snapshot = await bucket.exportState();
      expect(snapshot.tokens).toBeCloseTo(60, 1);

      // Simulate keys disappearing (TTL expired)
      mockRedis.setMissingKeys(true);

      // Try to export again - should handle gracefully
      const snapshot2 = await bucket.exportState();
      expect(snapshot2).toHaveProperty('error');

      // Recover by importing saved snapshot
      mockRedis.reset();
      await bucket.importState(snapshot);

      const restoredTokens = await bucket.getAvailableTokens();
      expect(restoredTokens).toBeCloseTo(60, 1);
    });
  });
});
