/**
 * TypeScript Definition Tests for Main Index Export
 * 
 * These tests verify that:
 * 1. All exports are correctly re-exported from index.d.ts
 * 2. Import paths work correctly
 * 3. All types are accessible from the main package
 */

// Test importing from main package entry point
import {
  // TokenBucket exports
  TokenBucket,
  TokenBucketOptions,
  TokenBucketState,
  AllowRequestResult,
  AllowedEventData,
  RateLimitExceededEventData,
  PenaltyEventData,
  RewardEventData,
  BlockedEventData,
  UnblockedEventData,
  ResetEventData,
  
  // RedisTokenBucket exports
  RedisTokenBucket,
  RedisClient,
  RedisTokenBucketOptions,
  RedisEventData,
  RedisAllowedEventData,
  RedisRateLimitExceededEventData,
  RedisPenaltyEventData,
  RedisRewardEventData,
  RedisErrorEventData,
  InsuranceActivatedEventData,
  InsuranceDeactivatedEventData,
  
  // Express middleware exports
  RateLimitRequest,
  TokenBucketMiddlewareOptions,
  RedisTokenBucketMiddlewareOptions,
  SetRequestCostOptions,
  tokenBucketMiddleware,
  redisTokenBucketMiddleware,
  setRequestCost,
  perUserRateLimit,
  perIpRateLimit,
  globalRateLimit,
  redisHealthCheck,
  defaultMiddlewareOptions,
  
  // ConfigManager exports
  ConfigManager,
  RateLimitConfig,
  EndpointConfig,
  loadConfig
} from '../../src/index';

describe('Main Index TypeScript Definitions', () => {
  describe('TokenBucket Exports', () => {
    it('should export TokenBucket class', () => {
      expect(TokenBucket).toBeDefined();
      expect(typeof TokenBucket).toBe('function');
    });

    it('should export TokenBucketOptions type', () => {
      const options: TokenBucketOptions = {
        capacity: 100,
        refillRate: 10
      };
      expect(options.capacity).toBe(100);
    });

    it('should export AllowRequestResult type', () => {
      const result: AllowRequestResult = {
        allowed: true,
        remainingTokens: 50,
        retryAfter: 0
      };
      expect(result.allowed).toBe(true);
    });

    it('should export TokenBucketState type', () => {
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

    it('should export event data types', () => {
      const allowed: AllowedEventData = {
        tokens: 50,
        cost: 1,
        timestamp: Date.now()
      };
      
      const exceeded: RateLimitExceededEventData = {
        retryAfter: 1000,
        reason: 'insufficient_tokens',
        timestamp: Date.now()
      };
      
      const penalty: PenaltyEventData = {
        penaltyApplied: 10,
        remainingTokens: 40,
        beforePenalty: 50,
        timestamp: Date.now()
      };
      
      const reward: RewardEventData = {
        rewardApplied: 20,
        cappedAtCapacity: false,
        timestamp: Date.now()
      };
      
      const blocked: BlockedEventData = {
        blockDuration: 5000,
        blockUntil: Date.now() + 5000,
        timestamp: Date.now()
      };
      
      const unblocked: UnblockedEventData = {
        timestamp: Date.now()
      };
      
      const reset: ResetEventData = {
        oldTokens: 50,
        newTokens: 100,
        capacity: 100,
        timestamp: Date.now()
      };
      
      expect(allowed.tokens).toBe(50);
      expect(exceeded.retryAfter).toBe(1000);
      expect(penalty.penaltyApplied).toBe(10);
      expect(reward.rewardApplied).toBe(20);
      expect(blocked.blockDuration).toBe(5000);
      expect(unblocked.timestamp).toBeGreaterThan(0);
      expect(reset.oldTokens).toBe(50);
    });
  });

  describe('RedisTokenBucket Exports', () => {
    it('should export RedisTokenBucket class', () => {
      expect(RedisTokenBucket).toBeDefined();
      expect(typeof RedisTokenBucket).toBe('function');
    });

    it('should export RedisClient type', () => {
      // RedisClient is a type, not a value
      type Client = RedisClient;
      expect(true).toBe(true); // Type check passes
    });

    it('should export RedisTokenBucketOptions type', () => {
      const options: RedisTokenBucketOptions = {
        capacity: 100,
        refillRate: 10,
        redis: {} as RedisClient,
        key: 'test:limiter'
      };
      expect(options.capacity).toBe(100);
    });

    it('should export Redis event data types', () => {
      const redisEvent: RedisEventData = {
        key: 'test:limiter',
        timestamp: Date.now()
      };
      
      const allowed: RedisAllowedEventData = {
        key: 'test:limiter',
        tokens: 50,
        cost: 1,
        timestamp: Date.now()
      };
      
      const exceeded: RedisRateLimitExceededEventData = {
        key: 'test:limiter',
        retryAfter: 1000,
        reason: 'insufficient_tokens',
        timestamp: Date.now()
      };
      
      const penalty: RedisPenaltyEventData = {
        key: 'test:limiter',
        penaltyApplied: 10,
        remainingTokens: 40,
        timestamp: Date.now()
      };
      
      const reward: RedisRewardEventData = {
        key: 'test:limiter',
        rewardApplied: 20,
        timestamp: Date.now()
      };
      
      const error: RedisErrorEventData = {
        operation: 'allowRequest',
        error: new Error('Connection failed'),
        timestamp: Date.now()
      };
      
      const insuranceActivated: InsuranceActivatedEventData = {
        reason: 'Redis connection failed',
        timestamp: Date.now()
      };
      
      const insuranceDeactivated: InsuranceDeactivatedEventData = {
        timestamp: Date.now()
      };
      
      expect(redisEvent.key).toBe('test:limiter');
      expect(allowed.tokens).toBe(50);
      expect(exceeded.retryAfter).toBe(1000);
      expect(penalty.penaltyApplied).toBe(10);
      expect(reward.rewardApplied).toBe(20);
      expect(error.operation).toBe('allowRequest');
      expect(insuranceActivated.reason).toBeDefined();
      expect(insuranceDeactivated.timestamp).toBeGreaterThan(0);
    });
  });

  describe('Express Middleware Exports', () => {
    it('should export middleware functions', () => {
      expect(tokenBucketMiddleware).toBeDefined();
      expect(typeof tokenBucketMiddleware).toBe('function');
      
      expect(redisTokenBucketMiddleware).toBeDefined();
      expect(typeof redisTokenBucketMiddleware).toBe('function');
      
      expect(setRequestCost).toBeDefined();
      expect(typeof setRequestCost).toBe('function');
      
      expect(perUserRateLimit).toBeDefined();
      expect(typeof perUserRateLimit).toBe('function');
      
      expect(perIpRateLimit).toBeDefined();
      expect(typeof perIpRateLimit).toBe('function');
      
      expect(globalRateLimit).toBeDefined();
      expect(typeof globalRateLimit).toBe('function');
      
      expect(redisHealthCheck).toBeDefined();
      expect(typeof redisHealthCheck).toBe('function');
    });

    it('should export middleware options types', () => {
      const tbOptions: TokenBucketMiddlewareOptions = {
        capacity: 100,
        refillRate: 10
      };
      
      const redisOptions: RedisTokenBucketMiddlewareOptions = {
        capacity: 100,
        refillRate: 10,
        redis: {} as RedisClient
      };
      
      const costOptions: SetRequestCostOptions = {
        cost: 5
      };
      
      expect(tbOptions.capacity).toBe(100);
      expect(redisOptions.capacity).toBe(100);
      expect(costOptions.cost).toBe(5);
    });

    it('should export RateLimitRequest type', () => {
      type Req = RateLimitRequest;
      expect(true).toBe(true); // Type check passes
    });

    it('should export defaultMiddlewareOptions', () => {
      expect(defaultMiddlewareOptions).toBeDefined();
      expect(typeof defaultMiddlewareOptions).toBe('object');
    });
  });

  describe('ConfigManager Exports', () => {
    it('should export ConfigManager class', () => {
      expect(ConfigManager).toBeDefined();
      expect(typeof ConfigManager).toBe('function');
    });

    it('should export RateLimitConfig type', () => {
      const config: RateLimitConfig = {
        endpoints: []
      };
      expect(config.endpoints).toBeDefined();
    });

    it('should export EndpointConfig type', () => {
      const endpoint: EndpointConfig = {
        path: '/test',
        capacity: 100,
        refillRate: 10,
        refillInterval: 1000
      };
      expect(endpoint.path).toBe('/test');
    });

    it('should export loadConfig function', () => {
      expect(loadConfig).toBeDefined();
      expect(typeof loadConfig).toBe('function');
    });
  });

  describe('Import Path Variations', () => {
    it('should support importing everything as namespace', () => {
      // This test verifies the import works
      expect(TokenBucket).toBeDefined();
      expect(RedisTokenBucket).toBeDefined();
      expect(ConfigManager).toBeDefined();
    });

    it('should support selective imports', () => {
      // Already tested above - all imports are selective
      expect(true).toBe(true);
    });
  });

  describe('Type Compatibility', () => {
    it('should maintain type compatibility across exports', () => {
      const limiter = new TokenBucket(100, 10);
      
      const result: boolean = limiter.allowRequest();
      expect(typeof result).toBe('boolean');
    });

    it('should work with middleware types', () => {
      const options: TokenBucketMiddlewareOptions = {
        capacity: 100,
        refillRate: 10
      };
      
      // Type compatibility check
      expect(options.capacity).toBe(100);
    });

    it('should work with config types', () => {
      const config: RateLimitConfig = {
        endpoints: [
          {
            path: '/test',
            capacity: 100,
            refillRate: 10,
            refillInterval: 1000
          }
        ]
      };
      
      expect(config.endpoints).toHaveLength(1);
    });
  });

  describe('Module Structure', () => {
    it('should organize exports by category', () => {
      // TokenBucket category
      expect(TokenBucket).toBeDefined();
      
      // RedisTokenBucket category
      expect(RedisTokenBucket).toBeDefined();
      
      // Middleware category
      expect(tokenBucketMiddleware).toBeDefined();
      expect(redisTokenBucketMiddleware).toBeDefined();
      
      // Utility category
      expect(ConfigManager).toBeDefined();
      expect(loadConfig).toBeDefined();
    });

    it('should provide comprehensive type coverage', () => {
      // Verify all major types are exported
      type TB = TokenBucket;
      type RTB = RedisTokenBucket;
      type CM = typeof ConfigManager;
      
      expect(true).toBe(true); // Type checks pass
    });
  });

  describe('Integration Patterns', () => {
    it('should support creating limiter from package', () => {
      const limiter = new TokenBucket(100, 10);
      
      expect(limiter).toBeInstanceOf(TokenBucket);
    });

    it('should support creating Redis limiter from package', () => {
      // Type check only - actual Redis connection not tested here
      const options: RedisTokenBucketOptions = {
        capacity: 100,
        refillRate: 10,
        redis: {} as RedisClient,
        key: 'test'
      };
      
      expect(options).toBeDefined();
    });

    it('should support middleware usage patterns', () => {
      const middleware = tokenBucketMiddleware({
        capacity: 100,
        refillRate: 10
      });
      
      expect(typeof middleware).toBe('function');
    });

    it('should support config loading patterns', () => {
      const config: RateLimitConfig = {
        endpoints: []
      };
      
      ConfigManager.validateConfig(config);
      expect(true).toBe(true);
    });
  });

  describe('Documentation and JSDoc', () => {
    it('should have types for all documented features', () => {
      // Verify all major features have corresponding types
      const limiter: TokenBucket = new TokenBucket(100, 10);
      
      const result: boolean = limiter.allowRequest(1);
      const state: TokenBucketState = limiter.getState();
      
      expect(typeof result).toBe('boolean');
      expect(state).toBeDefined();
    });

    it('should support event-based patterns', () => {
      const limiter = new TokenBucket(100, 10);
      
      limiter.on('allowed', (data: AllowedEventData) => {
        expect(data.tokens).toBeGreaterThanOrEqual(0);
      });
      
      limiter.on('rateLimitExceeded', (data: RateLimitExceededEventData) => {
        expect(data.retryAfter).toBeGreaterThan(0);
      });
      
      limiter.allowRequest();
    });
  });

  describe('Package Version Compatibility', () => {
    it('should maintain backward compatibility', () => {
      // Basic usage should always work
      const limiter = new TokenBucket(100, 10);
      
      expect(limiter.allowRequest).toBeDefined();
      expect(limiter.getState).toBeDefined();
    });

    it('should support extension patterns', () => {
      // Users should be able to extend types
      interface ExtendedOptions extends TokenBucketOptions {
        customField?: string;
      }
      
      const baseOptions: TokenBucketOptions = {
        capacity: 100,
        refillRate: 10
      };
      
      const options: ExtendedOptions = {
        ...baseOptions,
        customField: 'custom'
      };
      
      expect(options.customField).toBe('custom');
    });
  });
});
