/**
 * Tests for Token Bucket State Persistence
 * Testing toJSON(), fromJSON(), and clone() methods
 */

const TokenBucket = require('../../src/algorithms/javascript/token-bucket');

describe('TokenBucket State Persistence', () => {
  describe('toJSON()', () => {
    it('should serialize bucket state to JSON', () => {
      const bucket = new TokenBucket(100, 10);
      const json = bucket.toJSON();

      expect(json).toHaveProperty('version', 1);
      expect(json).toHaveProperty('capacity', 100);
      expect(json).toHaveProperty('tokens');
      expect(json).toHaveProperty('refillRate', 10);
      expect(json).toHaveProperty('lastRefill');
      expect(json).toHaveProperty('timestamp');
      expect(json).toHaveProperty('metadata');
      expect(json.metadata.className).toBe('TokenBucket');
    });

    it('should include current token count after consumption', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.allowRequest(30); // Consume 30 tokens

      const json = bucket.toJSON();
      expect(json.tokens).toBeCloseTo(70, 1); // Should have ~70 tokens left
    });

    it('should include accurate lastRefill timestamp', () => {
      const bucket = new TokenBucket(100, 10);
      const before = Date.now();
      const json = bucket.toJSON();
      const after = Date.now();

      expect(json.lastRefill).toBeGreaterThanOrEqual(before);
      expect(json.lastRefill).toBeLessThanOrEqual(after);
    });

    it('should be serializable to JSON string', () => {
      const bucket = new TokenBucket(100, 10);
      const json = bucket.toJSON();
      
      const jsonString = JSON.stringify(json);
      expect(() => JSON.parse(jsonString)).not.toThrow();
      
      const parsed = JSON.parse(jsonString);
      expect(parsed.capacity).toBe(100);
      expect(parsed.refillRate).toBe(10);
    });

    it('should include metadata with ISO timestamp', () => {
      const bucket = new TokenBucket(100, 10);
      const json = bucket.toJSON();

      expect(json.metadata.serializedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
      expect(new Date(json.metadata.serializedAt)).toBeInstanceOf(Date);
    });
  });

  describe('fromJSON()', () => {
    it('should restore bucket from serialized state', () => {
      const original = new TokenBucket(100, 10);
      original.allowRequest(30);

      const json = original.toJSON();
      const restored = TokenBucket.fromJSON(json);

      expect(restored.capacity).toBe(original.capacity);
      expect(restored.refillRate).toBe(original.refillRate);
      expect(Math.floor(restored.tokens)).toBe(Math.floor(original.tokens));
    });

    it('should throw error for null input', () => {
      expect(() => TokenBucket.fromJSON(null)).toThrow('Invalid JSON');
    });

    it('should throw error for non-object input', () => {
      expect(() => TokenBucket.fromJSON('invalid')).toThrow('Invalid JSON');
      expect(() => TokenBucket.fromJSON(123)).toThrow('Invalid JSON');
      expect(() => TokenBucket.fromJSON([])).toThrow('Invalid JSON');
    });

    it('should throw error for missing required fields', () => {
      expect(() => TokenBucket.fromJSON({})).toThrow('Missing required fields');
      expect(() => TokenBucket.fromJSON({ capacity: 100 })).toThrow('Missing required fields');
      expect(() => TokenBucket.fromJSON({ capacity: 100, tokens: 50 })).toThrow('Missing required fields');
    });

    it('should throw error for invalid capacity', () => {
      const json = { capacity: -10, tokens: 50, refillRate: 10, lastRefill: Date.now() };
      expect(() => TokenBucket.fromJSON(json)).toThrow('Invalid capacity');

      const json2 = { capacity: 0, tokens: 0, refillRate: 10, lastRefill: Date.now() };
      expect(() => TokenBucket.fromJSON(json2)).toThrow('Invalid capacity');

      const json3 = { capacity: 'invalid', tokens: 50, refillRate: 10, lastRefill: Date.now() };
      expect(() => TokenBucket.fromJSON(json3)).toThrow('Invalid capacity');
    });

    it('should throw error for invalid refillRate', () => {
      const json = { capacity: 100, tokens: 50, refillRate: -5, lastRefill: Date.now() };
      expect(() => TokenBucket.fromJSON(json)).toThrow('Invalid refillRate');

      const json2 = { capacity: 100, tokens: 50, refillRate: 0, lastRefill: Date.now() };
      expect(() => TokenBucket.fromJSON(json2)).toThrow('Invalid refillRate');
    });

    it('should throw error for invalid tokens', () => {
      const json = { capacity: 100, tokens: -10, refillRate: 10, lastRefill: Date.now() };
      expect(() => TokenBucket.fromJSON(json)).toThrow('Invalid tokens');

      const json2 = { capacity: 100, tokens: 'invalid', refillRate: 10, lastRefill: Date.now() };
      expect(() => TokenBucket.fromJSON(json2)).toThrow('Invalid tokens');
    });

    it('should throw error for invalid lastRefill', () => {
      const json = { capacity: 100, tokens: 50, refillRate: 10, lastRefill: -1 };
      expect(() => TokenBucket.fromJSON(json)).toThrow('Invalid lastRefill');

      const json2 = { capacity: 100, tokens: 50, refillRate: 10, lastRefill: 'invalid' };
      expect(() => TokenBucket.fromJSON(json2)).toThrow('Invalid lastRefill');
    });

    it('should throw error when tokens exceed capacity', () => {
      const json = { capacity: 100, tokens: 150, refillRate: 10, lastRefill: Date.now() };
      expect(() => TokenBucket.fromJSON(json)).toThrow('tokens (150) cannot exceed capacity (100)');
    });

    it('should restore bucket that continues to work correctly', () => {
      const original = new TokenBucket(100, 10);
      original.allowRequest(40);

      const json = original.toJSON();
      const restored = TokenBucket.fromJSON(json);

      // Should be able to consume tokens
      expect(restored.allowRequest(30)).toBe(true);
      expect(restored.allowRequest(50)).toBe(false); // Not enough tokens left
    });

    it('should handle fractional token values', () => {
      const json = {
        capacity: 100,
        tokens: 45.7,
        refillRate: 10,
        lastRefill: Date.now()
      };

      const restored = TokenBucket.fromJSON(json);
      expect(restored.tokens).toBeCloseTo(45.7, 1);
    });
  });

  describe('clone()', () => {
    it('should create independent copy of bucket', () => {
      const original = new TokenBucket(100, 10);
      original.allowRequest(20);

      const clone = original.clone();

      // Same initial state
      expect(clone.capacity).toBe(original.capacity);
      expect(clone.refillRate).toBe(original.refillRate);
      expect(Math.floor(clone.tokens)).toBe(Math.floor(original.tokens));

      // But independent
      clone.allowRequest(30);
      expect(Math.floor(clone.tokens)).not.toBe(Math.floor(original.tokens));
    });

    it('should clone bucket with full capacity', () => {
      const original = new TokenBucket(100, 10);
      const clone = original.clone();

      expect(clone.getAvailableTokens()).toBe(100);
    });

    it('should clone bucket with partially consumed tokens', () => {
      const original = new TokenBucket(100, 10);
      original.allowRequest(60);

      const clone = original.clone();
      expect(clone.getAvailableTokens()).toBeCloseTo(40, 1);
    });
  });

  describe('Round-trip serialization', () => {
    it('should maintain state through serialize-deserialize cycle', () => {
      const original = new TokenBucket(100, 10);
      original.allowRequest(35);

      const json = original.toJSON();
      const jsonString = JSON.stringify(json);
      const parsed = JSON.parse(jsonString);
      const restored = TokenBucket.fromJSON(parsed);

      expect(restored.capacity).toBe(original.capacity);
      expect(restored.refillRate).toBe(original.refillRate);
      expect(Math.floor(restored.tokens)).toBe(Math.floor(original.tokens));
    });

    it('should work with multiple serialize-deserialize cycles', () => {
      let bucket = new TokenBucket(100, 10);
      
      for (let i = 0; i < 5; i++) {
        bucket.allowRequest(10);
        const json = JSON.parse(JSON.stringify(bucket.toJSON()));
        bucket = TokenBucket.fromJSON(json);
      }

      // After consuming 50 tokens total, should have ~50 left
      expect(bucket.getAvailableTokens()).toBeCloseTo(50, 1);
    });
  });

  describe('Edge cases', () => {
    it('should handle bucket with zero tokens', () => {
      const bucket = new TokenBucket(100, 10);
      bucket.allowRequest(100); // Consume all tokens

      const json = bucket.toJSON();
      const restored = TokenBucket.fromJSON(json);

      expect(restored.getAvailableTokens()).toBe(0);
      expect(restored.allowRequest(1)).toBe(false);
    });

    it('should handle very large capacity values', () => {
      const bucket = new TokenBucket(1000000, 10000);
      const json = bucket.toJSON();
      const restored = TokenBucket.fromJSON(json);

      expect(restored.capacity).toBe(1000000);
      expect(restored.refillRate).toBe(10000);
    });

    it('should handle very small refill rates', () => {
      const bucket = new TokenBucket(100, 0.1);
      const json = bucket.toJSON();
      const restored = TokenBucket.fromJSON(json);

      expect(restored.refillRate).toBe(0.1);
    });

    it('should handle bucket after refill occurred', async () => {
      const bucket = new TokenBucket(100, 100); // 100 tokens per second
      bucket.allowRequest(50);

      // Wait for some refill
      await new Promise(resolve => setTimeout(resolve, 100)); // 100ms = 10 tokens

      const json = bucket.toJSON();
      const restored = TokenBucket.fromJSON(json);

      // Should have refilled some tokens
      expect(restored.getAvailableTokens()).toBeGreaterThan(50);
    });
  });

  describe('Real-world scenarios', () => {
    it('should save and restore rate limiter state for crash recovery', () => {
      // Simulate a rate limiter in use
      const limiter = new TokenBucket(1000, 100);
      
      // Process some requests
      for (let i = 0; i < 300; i++) {
        limiter.allowRequest();
      }

      // Save state before "crash"
      const savedState = limiter.toJSON();
      const stateJson = JSON.stringify(savedState);

      // Simulate restart - restore from saved state
      const parsedState = JSON.parse(stateJson);
      const restoredLimiter = TokenBucket.fromJSON(parsedState);

      // Should continue with ~700 tokens
      expect(restoredLimiter.getAvailableTokens()).toBeCloseTo(700, 1);
      expect(restoredLimiter.allowRequest()).toBe(true);
    });

    it('should transfer state between processes', () => {
      // Process A
      const processA = new TokenBucket(500, 50);
      processA.allowRequest(100);
      const transferData = JSON.stringify(processA.toJSON());

      // Transfer data to Process B (e.g., via IPC or network)
      const processB = TokenBucket.fromJSON(JSON.parse(transferData));

      // Process B should continue with same state
      expect(processB.getAvailableTokens()).toBeCloseTo(400, 1);
    });

    it('should support state snapshots for monitoring', () => {
      const bucket = new TokenBucket(1000, 100);
      
      const snapshots = [];
      for (let i = 0; i < 5; i++) {
        bucket.allowRequest(50);
        snapshots.push(bucket.toJSON());
      }

      // Each snapshot should show decreasing tokens
      expect(snapshots[0].tokens).toBeGreaterThan(snapshots[4].tokens);
      
      // All snapshots should have metadata
      snapshots.forEach(snapshot => {
        expect(snapshot.metadata.serializedAt).toBeDefined();
        expect(snapshot.version).toBe(1);
      });
    });
  });
});
