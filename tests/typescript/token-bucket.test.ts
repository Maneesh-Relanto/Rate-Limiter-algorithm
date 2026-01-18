/**
 * TypeScript Definition Tests for TokenBucket
 * 
 * These tests verify that:
 * 1. All exported types are correctly defined
 * 2. Class methods have correct signatures
 * 3. Event listeners are properly typed
 * 4. Type inference works correctly
 */

import { EventEmitter } from 'events';
import TokenBucket, {
  TokenBucketOptions,
  TokenBucketState,
  AllowRequestResult,
  AllowedEventData,
  RateLimitExceededEventData,
  PenaltyEventData,
  RewardEventData,
  BlockedEventData,
  UnblockedEventData,
  ResetEventData
} from '../../src/algorithms/javascript/token-bucket';

describe('TokenBucket TypeScript Definitions', () => {
  describe('Type Exports', () => {
    it('should export TokenBucketOptions interface', () => {
      const options: TokenBucketOptions = {
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000
      };
      expect(options.capacity).toBe(100);
    });

    it('should allow optional refillInterval in TokenBucketOptions', () => {
      const options: TokenBucketOptions = {
        capacity: 100,
        refillRate: 10
      };
      expect(options.refillInterval).toBeUndefined();
    });

    it('should export AllowRequestResult interface', () => {
      const result: AllowRequestResult = {
        allowed: true,
        remainingTokens: 50,
        retryAfter: 0
      };
      expect(result.allowed).toBe(true);
    });

    it('should export TokenBucketState interface', () => {
      const state: TokenBucketState = {
        capacity: 100,
        availableTokens: 50,
        refillRate: 10,
        refillInterval: 1000,
        lastRefillTime: Date.now(),
        isBlocked: false,
        blockUntil: null
      };
      expect(state.capacity).toBe(100);
    });

    it('should export AllowedEventData interface', () => {
      const eventData: AllowedEventData = {
        tokens: 50,
        cost: 1,
        timestamp: Date.now()
      };
      expect(eventData.tokens).toBe(50);
    });

    it('should export RateLimitExceededEventData interface', () => {
      const eventData: RateLimitExceededEventData = {
        retryAfter: 1000,
        reason: 'insufficient_tokens',
        timestamp: Date.now()
      };
      expect(eventData.retryAfter).toBe(1000);
    });

    it('should export PenaltyEventData interface', () => {
      const eventData: PenaltyEventData = {
        penaltyApplied: 10,
        remainingTokens: 40,
        beforePenalty: 50,
        timestamp: Date.now()
      };
      expect(eventData.penaltyApplied).toBe(10);
    });

    it('should export RewardEventData interface', () => {
      const eventData: RewardEventData = {
        rewardApplied: 20,
        cappedAtCapacity: false,
        timestamp: Date.now()
      };
      expect(eventData.rewardApplied).toBe(20);
    });

    it('should export BlockedEventData interface', () => {
      const eventData: BlockedEventData = {
        blockDuration: 5000,
        blockUntil: Date.now() + 5000,
        timestamp: Date.now()
      };
      expect(eventData.blockDuration).toBe(5000);
    });

    it('should export UnblockedEventData interface', () => {
      const eventData: UnblockedEventData = {
        timestamp: Date.now()
      };
      expect(eventData.timestamp).toBeGreaterThan(0);
    });

    it('should export ResetEventData interface', () => {
      const eventData: ResetEventData = {
        oldTokens: 50,
        newTokens: 100,
        capacity: 100,
        timestamp: Date.now()
      };
      expect(eventData.oldTokens).toBe(50);
    });
  });

  describe('TokenBucket Class', () => {
    let limiter: TokenBucket;

    beforeEach(() => {
      limiter = new TokenBucket(100, 10);
    });

    it('should extend EventEmitter', () => {
      expect(limiter).toBeInstanceOf(EventEmitter);
    });

    it('should accept capacity and refillRate parameters', () => {
      const bucket = new TokenBucket(50, 5);
      expect(bucket).toBeInstanceOf(TokenBucket);
    });

    describe('Method Signatures', () => {
      it('should have allowRequest method with correct signature', () => {
        const result: boolean = limiter.allowRequest();
        expect(typeof result).toBe('boolean');
      });

      it('should accept optional cost parameter in allowRequest', () => {
        const result: boolean = limiter.allowRequest(5);
        expect(typeof result).toBe('boolean');
      });

      it('should have penalty method returning object', () => {
        const result = limiter.penalty(10);
        expect(result).toHaveProperty('penaltyApplied');
        expect(result).toHaveProperty('remainingTokens');
        expect(typeof result.remainingTokens).toBe('number');
      });

      it('should have reward method returning object', () => {
        const result = limiter.reward(10);
        expect(result).toHaveProperty('rewardApplied');
        expect(result).toHaveProperty('remainingTokens');
        expect(typeof result.remainingTokens).toBe('number');
      });

      it('should have block method returning object', () => {
        const result = limiter.block(5000);
        expect(result).toHaveProperty('blocked');
        expect(result.blocked).toBe(true);
      });

      it('should have unblock method returning object', () => {
        const result = limiter.unblock();
        expect(result).toHaveProperty('unblocked');
        expect(result.unblocked).toBe(true);
      });

      it('should have isBlocked method returning boolean', () => {
        const blocked: boolean = limiter.isBlocked();
        expect(typeof blocked).toBe('boolean');
      });

      it('should have getAvailableTokens method returning number', () => {
        const tokens: number = limiter.getAvailableTokens();
        expect(typeof tokens).toBe('number');
      });

      it('should have getTimeUntilNextToken method returning number', () => {
        const time: number = limiter.getTimeUntilNextToken();
        expect(typeof time).toBe('number');
      });

      it('should have reset method with optional parameter', () => {
        limiter.reset();
        limiter.reset(50);
        expect(true).toBe(true); // Type check passes
      });

      it('should have getState method returning TokenBucketState', () => {
        const state: TokenBucketState = limiter.getState();
        expect(state).toHaveProperty('capacity');
        expect(state).toHaveProperty('availableTokens');
        expect(state).toHaveProperty('refillRate');
      });
    });

    describe('Event Listener Types', () => {
      it('should correctly type allowed event listener', () => {
        limiter.on('allowed', (data: AllowedEventData) => {
          expect(data).toHaveProperty('tokens');
          expect(data).toHaveProperty('cost');
          expect(data).toHaveProperty('timestamp');
        });
        limiter.allowRequest(1);
      });

      it('should correctly type rateLimitExceeded event listener', () => {
        limiter.on('rateLimitExceeded', (data: RateLimitExceededEventData) => {
          expect(data).toHaveProperty('retryAfter');
          expect(data).toHaveProperty('reason');
          expect(data).toHaveProperty('timestamp');
        });
        // Exhaust tokens
        for (let i = 0; i < 100; i++) {
          limiter.allowRequest(1);
        }
        limiter.allowRequest(1);
      });

      it('should correctly type penalty event listener', () => {
        limiter.on('penalty', (data: PenaltyEventData) => {
          expect(data).toHaveProperty('penaltyApplied');
          expect(data).toHaveProperty('remainingTokens');
          expect(data).toHaveProperty('beforePenalty');
        });
        limiter.penalty(10);
      });

      it('should correctly type reward event listener', () => {
        limiter.on('reward', (data: RewardEventData) => {
          expect(data).toHaveProperty('rewardApplied');
          expect(data).toHaveProperty('cappedAtCapacity');
        });
        limiter.reward(10);
      });

      it('should correctly type blocked event listener', () => {
        limiter.on('blocked', (data: BlockedEventData) => {
          expect(data).toHaveProperty('blockDuration');
          expect(data).toHaveProperty('blockUntil');
        });
        limiter.block(5000);
      });

      it('should correctly type unblocked event listener', () => {
        limiter.on('unblocked', (data: UnblockedEventData) => {
          expect(data).toHaveProperty('timestamp');
        });
        limiter.block(100);
        limiter.unblock();
      });

      it('should correctly type reset event listener', () => {
        limiter.on('reset', (data: ResetEventData) => {
          expect(data).toHaveProperty('oldTokens');
          expect(data).toHaveProperty('newTokens');
          expect(data).toHaveProperty('capacity');
        });
        limiter.reset();
      });

      it('should support off method for removing listeners', () => {
        const handler = (data: AllowedEventData) => {
          expect(data.tokens).toBeGreaterThan(0);
        };
        limiter.on('allowed', handler);
        limiter.off('allowed', handler);
        expect(true).toBe(true); // Type check passes
      });

      it('should support once method for one-time listeners', () => {
        limiter.once('allowed', (data: AllowedEventData) => {
          expect(data.tokens).toBeGreaterThan(0);
        });
        limiter.allowRequest(1);
      });
    });

    describe('Type Inference', () => {
      it('should infer boolean type from allowRequest', () => {
        const result = limiter.allowRequest();
        // TypeScript should infer result is boolean
        expect(typeof result).toBe('boolean');
      });

      it('should infer TokenBucketState type', () => {
        const state = limiter.getState();
        // TypeScript should infer all state properties
        const cap: number = state.capacity;
        const avail: number = state.availableTokens;
        const rate: number = state.refillRate;
        const interval: number = state.refillInterval;
        const lastRefill: number = state.lastRefillTime;
        const blocked: boolean = state.isBlocked;
        const blockUntil: number | null = state.blockUntil;
        expect(typeof cap).toBe('number');
      });
    });

    describe('Edge Cases and Type Safety', () => {
      it('should handle numeric types correctly', () => {
        const cost: number = 5;
        const result = limiter.allowRequest(cost);
        expect(typeof result).toBe('boolean');
      });

      it('should handle optional parameters', () => {
        // Should work without parameters
        limiter.reset();
        // Should work with parameter
        limiter.reset(50);
        expect(true).toBe(true);
      });

      it('should handle null values in state', () => {
        const state = limiter.getState();
        // State should have availableTokens and capacity
        expect(typeof state.availableTokens).toBe('number');
        expect(typeof state.capacity).toBe('number');
      });

      it('should preserve this context in methods', () => {
        const allowRequest = limiter.allowRequest.bind(limiter);
        const result = allowRequest(1);
        expect(typeof result).toBe('boolean');
      });
    });

    describe('Compatibility with JavaScript', () => {
      it('should work with dynamic typing', () => {
        const dynamicOptions: any = {
          capacity: 100,
          refillRate: 10
        };
        const bucket = new TokenBucket(100, 10);
        expect(bucket).toBeInstanceOf(TokenBucket);
      });

      it('should handle extra properties gracefully', () => {
        const options: TokenBucketOptions & { extra?: string } = {
          capacity: 100,
          refillRate: 10,
          extra: 'ignored'
        };
        const bucket = new TokenBucket(100, 10);
        expect(bucket).toBeInstanceOf(TokenBucket);
      });
    });
  });

  describe('Type Constraints', () => {
    it('should require required fields in TokenBucketOptions', () => {
      // @ts-expect-error - missing required fields
      const invalidOptions1: TokenBucketOptions = {
        capacity: 100
      };

      // @ts-expect-error - missing required fields
      const invalidOptions2: TokenBucketOptions = {
        refillRate: 10
      };

      // Valid options
      const validOptions: TokenBucketOptions = {
        capacity: 100,
        refillRate: 10
      };
      
      expect(validOptions).toBeDefined();
    });

    it('should enforce number types', () => {
      const options: TokenBucketOptions = {
        capacity: 100,
        refillRate: 10,
        // @ts-expect-error - wrong type
        refillInterval: '1000'
      };
      expect(true).toBe(true); // Compilation check
    });

    it('should enforce boolean types in result', () => {
      const limiter = new TokenBucket(100, 10);
      const result = limiter.allowRequest();
      
      // @ts-expect-error - result is boolean, not object
      const obj: {allowed: boolean} = result;
      
      expect(typeof result).toBe('boolean');
    });

    it('should enforce event data types', () => {
      const limiter = new TokenBucket(100, 10);
      
      limiter.on('allowed', (data) => {
        // @ts-expect-error - tokens is number, not string
        const str: string = data.tokens;
        
        expect(typeof data.tokens).toBe('number');
      });
      
      limiter.allowRequest();
    });
  });

  describe('Complex Usage Patterns', () => {
    it('should support chaining event listeners', () => {
      const limiter = new TokenBucket(100, 10);
      
      limiter
        .on('allowed', (data: AllowedEventData) => {
          expect(data.tokens).toBeGreaterThanOrEqual(0);
        })
        .on('rateLimitExceeded', (data: RateLimitExceededEventData) => {
          expect(data.retryAfter).toBeGreaterThan(0);
        });
        
      limiter.allowRequest();
    });

    it('should support array of limiters', () => {
      const limiters: TokenBucket[] = [
        new TokenBucket(100, 10),
        new TokenBucket(50, 5),
        new TokenBucket(200, 20)
      ];
      
      limiters.forEach(limiter => {
        const result = limiter.allowRequest();
        expect(result).toBe(true);
      });
    });

    it('should support limiter factory function', () => {
      function createLimiter(options: TokenBucketOptions): TokenBucket {
        return new TokenBucket(options.capacity, options.refillRate);
      }
      
      const limiter = createLimiter({ capacity: 100, refillRate: 10 });
      expect(limiter).toBeInstanceOf(TokenBucket);
    });

    it('should support conditional types', () => {
      const limiter = new TokenBucket(100, 10);
      const state = limiter.getState();
      
      type BlockUntilType = typeof state.blockUntil;
      const blockUntil: BlockUntilType = state.isBlocked ? Date.now() + 1000 : null;
      
      expect(blockUntil === null || typeof blockUntil === 'number').toBe(true);
    });
  });
});
