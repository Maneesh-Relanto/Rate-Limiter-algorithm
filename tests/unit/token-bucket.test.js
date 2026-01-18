/**
 * Unit tests for Token Bucket Rate Limiter
 */
const TokenBucket = require('../../src/algorithms/javascript/token-bucket');

describe('TokenBucket', () => {
  describe('Constructor', () => {
    it('should create a bucket with valid parameters', () => {
      const bucket = new TokenBucket(100, 10);
      expect(bucket.capacity).toBe(100);
      expect(bucket.refillRate).toBe(10);
      expect(bucket.tokens).toBe(100); // Starts full
    });

    it('should throw error for invalid capacity', () => {
      expect(() => new TokenBucket(0, 10)).toThrow('Capacity must be a positive number');
      expect(() => new TokenBucket(-10, 10)).toThrow('Capacity must be a positive number');
      expect(() => new TokenBucket(NaN, 10)).toThrow('Capacity must be a positive number');
      expect(() => new TokenBucket('100', 10)).toThrow('Capacity must be a positive number');
    });

    it('should throw error for invalid refill rate', () => {
      expect(() => new TokenBucket(100, 0)).toThrow('Refill rate must be a positive number');
      expect(() => new TokenBucket(100, -5)).toThrow('Refill rate must be a positive number');
      expect(() => new TokenBucket(100, NaN)).toThrow('Refill rate must be a positive number');
    });
  });

  describe('allowRequest', () => {
    it('should allow requests when tokens are available', () => {
      const bucket = new TokenBucket(10, 1);

      for (let i = 0; i < 10; i++) {
        expect(bucket.allowRequest()).toBe(true);
      }
    });

    it('should reject requests when bucket is empty', () => {
      const bucket = new TokenBucket(10, 1);

      // Exhaust all tokens
      for (let i = 0; i < 10; i++) {
        bucket.allowRequest();
      }

      // Next request should be rejected
      expect(bucket.allowRequest()).toBe(false);
    });

    it('should allow consuming multiple tokens at once', () => {
      const bucket = new TokenBucket(10, 1);

      expect(bucket.allowRequest(5)).toBe(true); // 5 tokens remaining
      expect(bucket.allowRequest(5)).toBe(true); // 0 tokens remaining
      expect(bucket.allowRequest(1)).toBe(false); // Rejected
    });

    it('should reject if not enough tokens for multi-token request', () => {
      const bucket = new TokenBucket(10, 1);

      expect(bucket.allowRequest(5)).toBe(true); // 5 remaining
      expect(bucket.allowRequest(10)).toBe(false); // Need 10, only have 5
      expect(bucket.allowRequest(5)).toBe(true); // Can still use remaining 5
    });

    it('should throw error for invalid tokens required', () => {
      const bucket = new TokenBucket(10, 1);
      expect(() => bucket.allowRequest(0)).toThrow('Tokens required must be a positive number');
      expect(() => bucket.allowRequest(-1)).toThrow('Tokens required must be a positive number');
    });
  });

  describe('Token Refilling', () => {
    it('should refill tokens over time', async () => {
      const bucket = new TokenBucket(10, 10); // 10 tokens per second

      // Exhaust bucket
      for (let i = 0; i < 10; i++) {
        bucket.allowRequest();
      }
      expect(bucket.allowRequest()).toBe(false);

      // Wait 1 second for refill
      await sleep(1000);

      // Should have ~10 new tokens
      expect(bucket.allowRequest()).toBe(true);
    });

    it('should not exceed capacity when refilling', async () => {
      const bucket = new TokenBucket(10, 5); // 5 tokens per second

      // Wait 3 seconds (would add 15 tokens without cap)
      await sleep(3000);

      const available = bucket.getAvailableTokens();
      expect(available).toBeLessThanOrEqual(10); // Should cap at capacity
    });

    it('should refill fractional tokens correctly', async () => {
      const bucket = new TokenBucket(100, 10); // 10 per second

      bucket.allowRequest(100); // Empty the bucket

      // Wait 0.5 seconds (should add 5 tokens)
      await sleep(500);

      expect(bucket.allowRequest(5)).toBe(true);
      expect(bucket.allowRequest(1)).toBe(false); // Only had 5 tokens
    });
  });

  describe('getAvailableTokens', () => {
    it('should return current token count', () => {
      const bucket = new TokenBucket(10, 1);

      expect(bucket.getAvailableTokens()).toBe(10);

      bucket.allowRequest(3);
      expect(bucket.getAvailableTokens()).toBe(7);
    });

    it('should return floor of fractional tokens', () => {
      const bucket = new TokenBucket(10, 1);
      bucket.tokens = 5.7;

      expect(bucket.getAvailableTokens()).toBe(5);
    });
  });

  describe('getTimeUntilNextToken', () => {
    it('should return 0 when tokens are available', () => {
      const bucket = new TokenBucket(10, 1);
      expect(bucket.getTimeUntilNextToken()).toBe(0);
    });

    it('should return time until next token when empty', () => {
      const bucket = new TokenBucket(10, 10); // 10 per second = 100ms per token

      // Exhaust bucket
      for (let i = 0; i < 10; i++) {
        bucket.allowRequest();
      }

      const timeUntilNext = bucket.getTimeUntilNextToken();
      expect(timeUntilNext).toBeGreaterThan(0);
      expect(timeUntilNext).toBeLessThanOrEqual(100); // Should be ~100ms
    });
  });

  describe('reset', () => {
    it('should reset bucket to full capacity', () => {
      const bucket = new TokenBucket(10, 1);

      // Use some tokens
      bucket.allowRequest(5);
      expect(bucket.getAvailableTokens()).toBe(5);

      // Reset
      bucket.reset();
      expect(bucket.getAvailableTokens()).toBe(10);
    });
  });

  describe('getState', () => {
    it('should return current state information', () => {
      const bucket = new TokenBucket(100, 10);

      const state = bucket.getState();

      expect(state).toHaveProperty('capacity', 100);
      expect(state).toHaveProperty('availableTokens', 100);
      expect(state).toHaveProperty('refillRate', 10);
      expect(state).toHaveProperty('utilizationPercent', 0);
    });

    it('should calculate utilization percentage correctly', () => {
      const bucket = new TokenBucket(100, 10);

      bucket.allowRequest(50); // Use 50 tokens

      const state = bucket.getState();
      // Allow for minor floating point differences
      expect(state.utilizationPercent).toBeGreaterThanOrEqual(49.9);
      expect(state.utilizationPercent).toBeLessThanOrEqual(50.1);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small refill rates', () => {
      const bucket = new TokenBucket(1, 0.1); // 0.1 per second
      expect(bucket.allowRequest()).toBe(true);
      expect(bucket.allowRequest()).toBe(false);
    });

    it('should handle very large capacities', () => {
      const bucket = new TokenBucket(1000000, 1000);
      expect(bucket.allowRequest(500000)).toBe(true);
      // Allow for tiny refill during execution
      expect(bucket.getAvailableTokens()).toBeGreaterThanOrEqual(500000);
      expect(bucket.getAvailableTokens()).toBeLessThan(500010);
    });

    it('should handle rapid successive requests', () => {
      const bucket = new TokenBucket(100, 10);

      // Fire 100 requests rapidly
      let allowed = 0;
      for (let i = 0; i < 100; i++) {
        if (bucket.allowRequest()) {allowed++;}
      }

      expect(allowed).toBe(100);
      expect(bucket.allowRequest()).toBe(false);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle burst traffic followed by normal traffic', async () => {
      const bucket = new TokenBucket(50, 10); // 50 capacity, 10/sec

      // Burst: 50 requests
      for (let i = 0; i < 50; i++) {
        expect(bucket.allowRequest()).toBe(true);
      }

      // Next request rejected
      expect(bucket.allowRequest()).toBe(false);

      // Wait 1 second
      await sleep(1000);

      // Should have ~10 tokens now
      let allowed = 0;
      for (let i = 0; i < 15; i++) {
        if (bucket.allowRequest()) {allowed++;}
      }
      expect(allowed).toBeGreaterThanOrEqual(9);
      expect(allowed).toBeLessThanOrEqual(11);
    });

    it('should handle API rate limit scenario (100 req/min)', async () => {
      const bucket = new TokenBucket(100, 100 / 60); // 100 per minute

      // User makes 50 requests
      for (let i = 0; i < 50; i++) {
        expect(bucket.allowRequest()).toBe(true);
      }

      // Wait 30 seconds (half minute, should get ~50 more)
      await sleep(30000);

      // Should be able to make ~100 total requests now
      let additionalAllowed = 0;
      for (let i = 0; i < 60; i++) {
        if (bucket.allowRequest()) {additionalAllowed++;}
      }

      // More lenient range to account for timing variations
      expect(additionalAllowed).toBeGreaterThanOrEqual(45);
      expect(additionalAllowed).toBeLessThanOrEqual(60);
    }, 35000); // Increase timeout for this test
  });

  describe('penalty', () => {
    it('should remove tokens as penalty', () => {
      const bucket = new TokenBucket(100, 10);
      
      // Start with 100 tokens
      expect(bucket.getAvailableTokens()).toBe(100);
      
      // Apply 10 token penalty
      const result = bucket.penalty(10);
      
      expect(result.penaltyApplied).toBe(10);
      expect(result.remainingTokens).toBe(90);
      expect(result.beforePenalty).toBe(100);
      expect(bucket.getAvailableTokens()).toBe(90);
    });

    it('should allow tokens to go below zero (debt)', () => {
      const bucket = new TokenBucket(50, 10);
      
      // Consume some tokens
      bucket.allowRequest(40);
      expect(bucket.getAvailableTokens()).toBe(10);
      
      // Apply heavy penalty
      const result = bucket.penalty(20);
      
      expect(result.remainingTokens).toBe(-10);
      expect(bucket.getAvailableTokens()).toBe(-10);
    });

    it('should throw error for invalid penalty points', () => {
      const bucket = new TokenBucket(100, 10);
      
      expect(() => bucket.penalty(0)).toThrow('Penalty points must be a positive number');
      expect(() => bucket.penalty(-5)).toThrow('Penalty points must be a positive number');
      expect(() => bucket.penalty(NaN)).toThrow('Penalty points must be a positive number');
      expect(() => bucket.penalty('10')).toThrow('Penalty points must be a positive number');
    });

    it('should use default penalty of 1 if no argument provided', () => {
      const bucket = new TokenBucket(50, 10);
      
      const result = bucket.penalty();
      
      expect(result.penaltyApplied).toBe(1);
      expect(result.remainingTokens).toBe(49);
    });

    it('should handle multiple consecutive penalties', () => {
      const bucket = new TokenBucket(100, 10);
      
      bucket.penalty(10);
      bucket.penalty(20);
      bucket.penalty(5);
      
      expect(bucket.getAvailableTokens()).toBe(65);
    });

    it('should apply penalty after refill', async () => {
      const bucket = new TokenBucket(100, 10);
      
      // Consume tokens
      bucket.allowRequest(50);
      expect(bucket.getAvailableTokens()).toBe(50);
      
      // Wait for refill
      await sleep(1000);
      expect(bucket.getAvailableTokens()).toBeGreaterThanOrEqual(59);
      
      // Apply penalty
      bucket.penalty(20);
      expect(bucket.getAvailableTokens()).toBeLessThan(45);
    });
  });

  describe('reward', () => {
    it('should add tokens as reward', () => {
      const bucket = new TokenBucket(100, 10);
      
      // Consume some tokens first
      bucket.allowRequest(40);
      const tokensAfterConsume = bucket.getAvailableTokens();
      expect(tokensAfterConsume).toBe(60);
      
      // Apply reward immediately (before any refill)
      const result = bucket.reward(10);
      
      // The reward should be applied
      expect(result.rewardApplied).toBeGreaterThanOrEqual(9); // Allow for small refill
      expect(result.rewardApplied).toBeLessThanOrEqual(10);
      expect(result.remainingTokens).toBeGreaterThanOrEqual(69);
      expect(result.remainingTokens).toBeLessThanOrEqual(70);
      expect(result.cappedAtCapacity).toBe(false);
      expect(bucket.getAvailableTokens()).toBeGreaterThanOrEqual(69);
    });

    it('should respect capacity limit (cap at max)', () => {
      const bucket = new TokenBucket(100, 10);
      
      // Start with full bucket
      expect(bucket.getAvailableTokens()).toBe(100);
      
      // Try to reward beyond capacity
      const result = bucket.reward(50);
      
      expect(result.rewardApplied).toBe(0); // Capped
      expect(result.remainingTokens).toBe(100);
      expect(result.cappedAtCapacity).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(100);
    });

    it('should partially reward when approaching capacity', () => {
      const bucket = new TokenBucket(100, 10);
      
      // Consume tokens to 95
      bucket.allowRequest(5);
      expect(bucket.getAvailableTokens()).toBe(95);
      
      // Try to reward 10 (should add at most 5, possibly less due to refill)
      const result = bucket.reward(10);
      
      // Allow for refill between operations: should add between 4-5 tokens
      expect(result.rewardApplied).toBeGreaterThanOrEqual(4);
      expect(result.rewardApplied).toBeLessThanOrEqual(5);
      expect(result.remainingTokens).toBe(100);
      expect(result.cappedAtCapacity).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(100);
    });

    it('should throw error for invalid reward points', () => {
      const bucket = new TokenBucket(100, 10);
      
      expect(() => bucket.reward(0)).toThrow('Reward points must be a positive number');
      expect(() => bucket.reward(-5)).toThrow('Reward points must be a positive number');
      expect(() => bucket.reward(NaN)).toThrow('Reward points must be a positive number');
      expect(() => bucket.reward('10')).toThrow('Reward points must be a positive number');
    });

    it('should use default reward of 1 if no argument provided', () => {
      const bucket = new TokenBucket(50, 10);
      
      bucket.allowRequest(10);
      const result = bucket.reward();
      
      expect(result.rewardApplied).toBe(1);
      expect(result.remainingTokens).toBe(41);
    });

    it('should handle reward bringing tokens from negative to positive', () => {
      const bucket = new TokenBucket(100, 10);
      
      // Apply heavy penalty
      bucket.penalty(120);
      expect(bucket.getAvailableTokens()).toBe(-20);
      
      // Reward to bring back positive
      const result = bucket.reward(30);
      
      expect(result.rewardApplied).toBe(30);
      expect(result.remainingTokens).toBe(10);
      expect(bucket.getAvailableTokens()).toBe(10);
    });

    it('should handle multiple consecutive rewards with capacity limit', () => {
      const bucket = new TokenBucket(100, 10);
      
      bucket.allowRequest(50);
      bucket.reward(20); // 70
      bucket.reward(20); // 90
      bucket.reward(20); // 100 (capped)
      
      expect(bucket.getAvailableTokens()).toBe(100);
    });
  });

  describe('penalty and reward combined', () => {
    it('should handle penalty then reward scenario', () => {
      const bucket = new TokenBucket(100, 10);
      
      bucket.allowRequest(50); // 50 tokens
      bucket.penalty(20);       // 30 tokens
      bucket.reward(10);        // 40 tokens
      
      expect(bucket.getAvailableTokens()).toBe(40);
    });

    it('should simulate failed login scenario with penalties and recovery', async () => {
      const bucket = new TokenBucket(10, 1); // 10 capacity, 1/sec refill
      
      // 3 failed login attempts - 5 token penalty each
      bucket.penalty(5);
      bucket.penalty(5);
      bucket.penalty(5);
      
      // User now has negative tokens (-5)
      expect(bucket.getAvailableTokens()).toBe(-5);
      expect(bucket.allowRequest()).toBe(false);
      
      // Wait 6 seconds for refill (should get 6 tokens)
      await sleep(6000);
      expect(bucket.getAvailableTokens()).toBeGreaterThanOrEqual(0);
      
      // Now successful login - reward 5 tokens
      bucket.reward(5);
      expect(bucket.getAvailableTokens()).toBeGreaterThanOrEqual(5);
      
      // User can now make requests
      expect(bucket.allowRequest()).toBe(true);
    }, 10000);

    it('should handle CAPTCHA verification scenario', () => {
      const bucket = new TokenBucket(50, 5);
      
      // Suspicious activity - multiple penalties
      bucket.penalty(10);
      bucket.penalty(10);
      bucket.penalty(10);
      
      // User completes CAPTCHA - reward tokens
      const result = bucket.reward(15);
      
      expect(result.rewardApplied).toBe(15);
      expect(bucket.getAvailableTokens()).toBeGreaterThan(0);
      expect(bucket.allowRequest()).toBe(true);
    });
  });
});

/**
 * Helper function to sleep for testing async behavior
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
