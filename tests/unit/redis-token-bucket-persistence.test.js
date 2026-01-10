/**
 * Tests for Redis Token Bucket State Persistence
 * Testing exportState(), importState(), toJSON(), and fromJSON() methods
 */

const Redis = require('ioredis-mock');
const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

describe('RedisTokenBucket State Persistence', () => {
  let redis;

  beforeEach(() => {
    redis = new Redis();
  });

  afterEach(async () => {
    await redis.flushall();
    redis.disconnect();
  });

  describe('toJSON()', () => {
    it('should export configuration without state', () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const json = bucket.toJSON();

      expect(json).toHaveProperty('version', 1);
      expect(json).toHaveProperty('key', 'test:bucket');
      expect(json).toHaveProperty('capacity', 100);
      expect(json).toHaveProperty('refillRate', 10);
      expect(json).toHaveProperty('metadata');
      expect(json.metadata.className).toBe('RedisTokenBucket');
      
      // Should NOT include tokens or lastRefill (those are in Redis)
      expect(json).not.toHaveProperty('tokens');
      expect(json).not.toHaveProperty('lastRefill');
    });

    it('should be serializable to JSON string', () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const json = bucket.toJSON();
      
      const jsonString = JSON.stringify(json);
      expect(() => JSON.parse(jsonString)).not.toThrow();
      
      const parsed = JSON.parse(jsonString);
      expect(parsed.capacity).toBe(100);
      expect(parsed.key).toBe('test:bucket');
    });

    it('should include metadata with ISO timestamp', () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const json = bucket.toJSON();

      expect(json.metadata.serializedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(new Date(json.metadata.serializedAt)).toBeInstanceOf(Date);
    });
  });

  describe('fromJSON()', () => {
    it('should reconnect to existing Redis bucket from config', () => {
      const original = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const json = original.toJSON();
      
      const restored = RedisTokenBucket.fromJSON(redis, json);

      expect(restored.key).toBe('test:bucket');
      expect(restored.capacity).toBe(100);
      expect(restored.refillRate).toBe(10);
    });

    it('should throw error for null Redis client', () => {
      const json = { key: 'test', capacity: 100, refillRate: 10 };
      expect(() => RedisTokenBucket.fromJSON(null, json)).toThrow('Invalid Redis client');
    });

    it('should throw error for null JSON', () => {
      expect(() => RedisTokenBucket.fromJSON(redis, null)).toThrow('Invalid JSON');
    });

    it('should throw error for non-object JSON', () => {
      expect(() => RedisTokenBucket.fromJSON(redis, 'invalid')).toThrow('Invalid JSON');
      expect(() => RedisTokenBucket.fromJSON(redis, 123)).toThrow('Invalid JSON');
    });

    it('should throw error for missing required fields', () => {
      expect(() => RedisTokenBucket.fromJSON(redis, {})).toThrow('Missing required fields');
      expect(() => RedisTokenBucket.fromJSON(redis, { key: 'test' })).toThrow('Missing required fields');
      expect(() => RedisTokenBucket.fromJSON(redis, { key: 'test', capacity: 100 })).toThrow('Missing required fields');
    });

    it('should throw error for invalid key', () => {
      const json = { key: '', capacity: 100, refillRate: 10 };
      expect(() => RedisTokenBucket.fromJSON(redis, json)).toThrow('Invalid key');

      const json2 = { key: 123, capacity: 100, refillRate: 10 };
      expect(() => RedisTokenBucket.fromJSON(redis, json2)).toThrow('Invalid key');
    });

    it('should throw error for invalid capacity', () => {
      const json = { key: 'test', capacity: -10, refillRate: 10 };
      expect(() => RedisTokenBucket.fromJSON(redis, json)).toThrow('Invalid capacity');

      const json2 = { key: 'test', capacity: 0, refillRate: 10 };
      expect(() => RedisTokenBucket.fromJSON(redis, json2)).toThrow('Invalid capacity');
    });

    it('should throw error for invalid refillRate', () => {
      const json = { key: 'test', capacity: 100, refillRate: -5 };
      expect(() => RedisTokenBucket.fromJSON(redis, json)).toThrow('Invalid refillRate');

      const json2 = { key: 'test', capacity: 100, refillRate: 0 };
      expect(() => RedisTokenBucket.fromJSON(redis, json2)).toThrow('Invalid refillRate');
    });

    it('should reconnect to bucket with existing state', async () => {
      const original = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      await original.allowRequest(30); // Consume some tokens
      
      const json = original.toJSON();
      const restored = RedisTokenBucket.fromJSON(redis, json);

      // Should connect to same Redis key with remaining tokens
      const available = await restored.getAvailableTokens();
      expect(available).toBeCloseTo(70, 1);
    });
  });

  describe('exportState()', () => {
    it('should export complete state including Redis data', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      await bucket.allowRequest(40); // Consume tokens

      const snapshot = await bucket.exportState();

      expect(snapshot).toHaveProperty('version', 1);
      expect(snapshot).toHaveProperty('key', 'test:bucket');
      expect(snapshot).toHaveProperty('capacity', 100);
      expect(snapshot).toHaveProperty('refillRate', 10);
      expect(snapshot).toHaveProperty('tokens');
      expect(snapshot).toHaveProperty('lastRefill');
      expect(snapshot).toHaveProperty('metadata');
      
      expect(snapshot.tokens).toBeCloseTo(60, 1);
      expect(snapshot.metadata.className).toBe('RedisTokenBucket');
    });

    it('should export state with full capacity', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const snapshot = await bucket.exportState();

      expect(snapshot.tokens).toBe(100);
    });

    it('should export state with zero tokens', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      await bucket.allowRequest(100); // Consume all

      const snapshot = await bucket.exportState();
      expect(snapshot.tokens).toBe(0);
    });

    it('should be serializable to JSON string', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const snapshot = await bucket.exportState();
      
      const jsonString = JSON.stringify(snapshot);
      expect(() => JSON.parse(jsonString)).not.toThrow();
      
      const parsed = JSON.parse(jsonString);
      expect(parsed.capacity).toBe(100);
      expect(parsed.tokens).toBe(100);
    });

    it('should include accurate lastRefill timestamp', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const before = Date.now();
      const snapshot = await bucket.exportState();
      const after = Date.now();

      expect(snapshot.lastRefill).toBeGreaterThanOrEqual(before);
      expect(snapshot.lastRefill).toBeLessThanOrEqual(after);
    });
  });

  describe('importState()', () => {
    it('should restore complete state from snapshot', async () => {
      const original = new RedisTokenBucket(redis, 'test:original', 100, 10);
      await original.allowRequest(35);

      const snapshot = await original.exportState();
      
      const restored = new RedisTokenBucket(redis, 'test:restored', 100, 10);
      await restored.importState(snapshot);

      const tokens = await restored.getAvailableTokens();
      expect(tokens).toBeCloseTo(65, 1);
    });

    it('should throw error for null snapshot', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      await expect(bucket.importState(null)).rejects.toThrow('Invalid snapshot');
    });

    it('should throw error for non-object snapshot', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      await expect(bucket.importState('invalid')).rejects.toThrow('Invalid snapshot');
      await expect(bucket.importState(123)).rejects.toThrow('Invalid snapshot');
    });

    it('should throw error for missing required fields', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      await expect(bucket.importState({})).rejects.toThrow('Missing required fields');
      await expect(bucket.importState({ capacity: 100 })).rejects.toThrow('Missing required fields');
    });

    it('should throw error for invalid capacity', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const snapshot = { capacity: -10, tokens: 50, refillRate: 10, lastRefill: Date.now() };
      await expect(bucket.importState(snapshot)).rejects.toThrow('Invalid capacity');
    });

    it('should throw error for invalid refillRate', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const snapshot = { capacity: 100, tokens: 50, refillRate: -5, lastRefill: Date.now() };
      await expect(bucket.importState(snapshot)).rejects.toThrow('Invalid refillRate');
    });

    it('should throw error for invalid tokens', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const snapshot = { capacity: 100, tokens: -10, refillRate: 10, lastRefill: Date.now() };
      await expect(bucket.importState(snapshot)).rejects.toThrow('Invalid tokens');
    });

    it('should throw error for invalid lastRefill', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const snapshot = { capacity: 100, tokens: 50, refillRate: 10, lastRefill: -1 };
      await expect(bucket.importState(snapshot)).rejects.toThrow('Invalid lastRefill');
    });

    it('should throw error when tokens exceed capacity', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const snapshot = { capacity: 100, tokens: 150, refillRate: 10, lastRefill: Date.now() };
      await expect(bucket.importState(snapshot)).rejects.toThrow('tokens (150) cannot exceed capacity (100)');
    });

    it('should overwrite existing state', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      await bucket.allowRequest(20); // Current state: 80 tokens

      const snapshot = { capacity: 100, tokens: 50, refillRate: 10, lastRefill: Date.now() };
      await bucket.importState(snapshot);

      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBeCloseTo(50, 1);
    });

    it('should allow bucket to continue working after import', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const snapshot = { capacity: 100, tokens: 60, refillRate: 10, lastRefill: Date.now() };
      
      await bucket.importState(snapshot);

      // Should be able to consume tokens
      expect(await bucket.allowRequest(30)).toBe(true);
      expect(await bucket.allowRequest(40)).toBe(false); // Not enough left
    });
  });

  describe('Round-trip state export/import', () => {
    it('should maintain state through export-import cycle', async () => {
      const original = new RedisTokenBucket(redis, 'test:original', 100, 10);
      await original.allowRequest(45);

      const snapshot = await original.exportState();
      
      const restored = new RedisTokenBucket(redis, 'test:restored', 100, 10);
      await restored.importState(snapshot);

      const originalTokens = await original.getAvailableTokens();
      const restoredTokens = await restored.getAvailableTokens();

      expect(restoredTokens).toBeCloseTo(originalTokens, 1);
    });

    it('should work with JSON serialization', async () => {
      const original = new RedisTokenBucket(redis, 'test:original', 100, 10);
      await original.allowRequest(30);

      const snapshot = await original.exportState();
      const jsonString = JSON.stringify(snapshot);
      const parsed = JSON.parse(jsonString);

      const restored = new RedisTokenBucket(redis, 'test:restored', 100, 10);
      await restored.importState(parsed);

      const tokens = await restored.getAvailableTokens();
      expect(tokens).toBeCloseTo(70, 1);
    });

    it('should work with multiple export-import cycles', async () => {
      let bucket = new RedisTokenBucket(redis, 'test:bucket:0', 100, 10);

      for (let i = 0; i < 5; i++) {
        await bucket.allowRequest(10);
        const snapshot = await bucket.exportState();
        
        const newKey = `test:bucket:${i + 1}`;
        bucket = new RedisTokenBucket(redis, newKey, 100, 10);
        await bucket.importState(snapshot);
      }

      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBeCloseTo(50, 1);
    });
  });

  describe('Config-only serialization (toJSON/fromJSON)', () => {
    it('should reconnect to same bucket state', async () => {
      const original = new RedisTokenBucket(redis, 'test:shared', 100, 10);
      await original.allowRequest(25);

      const config = original.toJSON();
      const reconnected = RedisTokenBucket.fromJSON(redis, config);

      const tokens = await reconnected.getAvailableTokens();
      expect(tokens).toBeCloseTo(75, 1);
    });

    it('should work with JSON string serialization', async () => {
      const original = new RedisTokenBucket(redis, 'test:shared', 100, 10);
      await original.allowRequest(40);

      const configString = JSON.stringify(original.toJSON());
      const config = JSON.parse(configString);
      const reconnected = RedisTokenBucket.fromJSON(redis, config);

      const tokens = await reconnected.getAvailableTokens();
      expect(tokens).toBeCloseTo(60, 1);
    });
  });

  describe('Real-world scenarios', () => {
    it('should support backup and restore', async () => {
      const production = new RedisTokenBucket(redis, 'prod:limiter', 1000, 100);
      
      // Simulate usage
      for (let i = 0; i < 300; i++) {
        await production.allowRequest();
      }

      // Backup state
      const backup = await production.exportState();
      const backupJson = JSON.stringify(backup);

      // Simulate data loss - create new bucket
      await redis.del('prod:limiter:tokens', 'prod:limiter:lastRefill');

      // Restore from backup
      const restored = new RedisTokenBucket(redis, 'prod:limiter', 1000, 100);
      await restored.importState(JSON.parse(backupJson));

      const tokens = await restored.getAvailableTokens();
      // Should be around 700, but allow for refill time
      expect(tokens).toBeGreaterThanOrEqual(695);
      expect(tokens).toBeLessThanOrEqual(1000);
    });

    it('should support state migration between Redis instances', async () => {
      const redis1 = new Redis();
      const redis2 = new Redis();

      const source = new RedisTokenBucket(redis1, 'limiter', 500, 50);
      await source.allowRequest(150);

      // Export from redis1
      const snapshot = await source.exportState();

      // Import to redis2
      const target = new RedisTokenBucket(redis2, 'limiter', 500, 50);
      await target.importState(snapshot);

      const tokens = await target.getAvailableTokens();
      expect(tokens).toBeCloseTo(350, 1);

      redis1.disconnect();
      redis2.disconnect();
    });

    it('should support periodic state snapshots', async () => {
      const bucket = new RedisTokenBucket(redis, 'monitored', 1000, 100);
      
      const snapshots = [];
      for (let i = 0; i < 5; i++) {
        await bucket.allowRequest(50);
        snapshots.push(await bucket.exportState());
      }

      // Each snapshot should show decreasing tokens
      expect(snapshots[0].tokens).toBeGreaterThan(snapshots[4].tokens);
      
      // All snapshots should have complete data
      snapshots.forEach(snapshot => {
        expect(snapshot.metadata.serializedAt).toBeDefined();
        expect(snapshot.version).toBe(1);
        expect(snapshot.tokens).toBeGreaterThanOrEqual(0);
      });
    });

    it('should support cross-process state transfer', async () => {
      // Process 1
      const process1 = new RedisTokenBucket(redis, 'shared:limiter', 500, 50);
      await process1.allowRequest(100);
      
      const transferData = JSON.stringify(await process1.exportState());

      // Transfer to Process 2 via network/IPC
      const process2 = new RedisTokenBucket(redis, 'shared:limiter:copy', 500, 50);
      await process2.importState(JSON.parse(transferData));

      const tokens = await process2.getAvailableTokens();
      expect(tokens).toBeCloseTo(400, 1);
    });
  });

  describe('Edge cases', () => {
    it('should handle export with zero tokens', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:empty', 100, 10);
      await bucket.allowRequest(100);

      const snapshot = await bucket.exportState();
      expect(snapshot.tokens).toBe(0);

      const restored = new RedisTokenBucket(redis, 'test:restored', 100, 10);
      await restored.importState(snapshot);

      expect(await restored.getAvailableTokens()).toBe(0);
    });

    it('should handle import with fractional tokens', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 10);
      const snapshot = {
        capacity: 100,
        tokens: 45.7,
        refillRate: 10,
        lastRefill: Date.now()
      };

      await bucket.importState(snapshot);
      const tokens = await bucket.getAvailableTokens();
      // getAvailableTokens uses Math.floor, so 45.7 becomes 45
      expect(tokens).toBe(45);
    });

    it('should handle very large capacity values', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:large', 1000000, 10000);
      const snapshot = await bucket.exportState();

      expect(snapshot.capacity).toBe(1000000);
      expect(snapshot.tokens).toBe(1000000);

      const restored = new RedisTokenBucket(redis, 'test:restored', 1000000, 10000);
      await restored.importState(snapshot);

      expect(await restored.getAvailableTokens()).toBe(1000000);
    });

    it('should handle state with old lastRefill', async () => {
      const bucket = new RedisTokenBucket(redis, 'test:bucket', 100, 100);
      const snapshot = {
        capacity: 100,
        tokens: 50,
        refillRate: 100,
        lastRefill: Date.now() - 1000 // 1 second ago
      };

      await bucket.importState(snapshot);

      // Should refill based on time elapsed
      const tokens = await bucket.getAvailableTokens();
      expect(tokens).toBeGreaterThan(50);
      expect(tokens).toBeLessThanOrEqual(100);
    });
  });
});
