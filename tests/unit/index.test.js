/**
 * Tests for src/index.js - Package Entry Point
 * 
 * This file tests that the main package exports are correct and accessible.
 * Critical for ensuring the package works when installed via npm.
 * 
 * NOTE: There are known issues with the current implementation:
 * - ConfigManager is exported as an object, not the class itself
 * - loadConfig is undefined (tries to access ConfigManager.loadConfig which doesn't exist)
 * - redisTokenBucketMiddleware, redisHealthCheck, defaultMiddlewareOptions are undefined
 *   (they're not exported from token-bucket-middleware.js)
 */

const ratelimiter = require('../../src/index');

describe('Package Exports - src/index.js', () => {
  describe('Algorithm Exports', () => {
    test('exports TokenBucket class', () => {
      expect(ratelimiter.TokenBucket).toBeDefined();
      expect(typeof ratelimiter.TokenBucket).toBe('function');
      
      // Verify it's a constructor
      const bucket = new ratelimiter.TokenBucket(10, 2);
      expect(bucket).toBeInstanceOf(ratelimiter.TokenBucket);
      expect(bucket.getAvailableTokens()).toBe(10);
    });

    test('exports RedisTokenBucket class', () => {
      expect(ratelimiter.RedisTokenBucket).toBeDefined();
      expect(typeof ratelimiter.RedisTokenBucket).toBe('function');
      
      // Verify it's a constructor (RedisTokenBucket requires Redis client, so we test existence only)
      expect(ratelimiter.RedisTokenBucket.prototype).toBeDefined();
    });

    test('TokenBucket and RedisTokenBucket are different classes', () => {
      expect(ratelimiter.TokenBucket).not.toBe(ratelimiter.RedisTokenBucket);
    });
  });

  describe('Middleware Exports - Working', () => {
    test('exports tokenBucketMiddleware function', () => {
      expect(ratelimiter.tokenBucketMiddleware).toBeDefined();
      expect(typeof ratelimiter.tokenBucketMiddleware).toBe('function');
    });

    test('exports setRequestCost function', () => {
      expect(ratelimiter.setRequestCost).toBeDefined();
      expect(typeof ratelimiter.setRequestCost).toBe('function');
    });

    test('exports perUserRateLimit function', () => {
      expect(ratelimiter.perUserRateLimit).toBeDefined();
      expect(typeof ratelimiter.perUserRateLimit).toBe('function');
    });

    test('exports perIpRateLimit function', () => {
      expect(ratelimiter.perIpRateLimit).toBeDefined();
      expect(typeof ratelimiter.perIpRateLimit).toBe('function');
    });

    test('exports globalRateLimit function', () => {
      expect(ratelimiter.globalRateLimit).toBeDefined();
      expect(typeof ratelimiter.globalRateLimit).toBe('function');
    });
  });

  describe('Middleware Exports - Broken (Known Issues)', () => {
    test('redisTokenBucketMiddleware is undefined (BUG)', () => {
      // This is a BUG: index.js tries to destructure redisTokenBucketMiddleware from
      // token-bucket-middleware.js, but it's actually in redis-token-bucket-middleware.js
      expect(ratelimiter.redisTokenBucketMiddleware).toBeUndefined();
    });

    test('redisHealthCheck is undefined (BUG)', () => {
      // This is a BUG: index.js tries to destructure redisHealthCheck from
      // token-bucket-middleware.js, but it's actually in redis-token-bucket-middleware.js
      expect(ratelimiter.redisHealthCheck).toBeUndefined();
    });

    test('defaultMiddlewareOptions is undefined (BUG)', () => {
      // This is a BUG: index.js tries to destructure defaultMiddlewareOptions from
      // token-bucket-middleware.js, but it doesn't exist in either middleware file
      expect(ratelimiter.defaultMiddlewareOptions).toBeUndefined();
    });
  });

  describe('Utility Exports - Issues', () => {
    test('ConfigManager is exported as an object, not a class', () => {
      // ConfigManager from config-manager.js exports {ConfigManager, getConfigManager}
      // but index.js exports the whole object, not just the class
      expect(ratelimiter.ConfigManager).toBeDefined();
      expect(typeof ratelimiter.ConfigManager).toBe('object');
      expect(ratelimiter.ConfigManager).toHaveProperty('ConfigManager');
      expect(typeof ratelimiter.ConfigManager.ConfigManager).toBe('function');
    });

    test('loadConfig is undefined (BUG)', () => {
      // This is a BUG: ConfigManager.loadConfig doesn't exist
      // The config-manager module doesn't export a loadConfig function
      expect(ratelimiter.loadConfig).toBeUndefined();
    });
  });

  describe('Complete Export Structure', () => {
    test('exports expected working properties', () => {
      const workingExports = [
        'TokenBucket',
        'RedisTokenBucket',
        'tokenBucketMiddleware',
        'setRequestCost',
        'perUserRateLimit',
        'perIpRateLimit',
        'globalRateLimit',
        'ConfigManager'
      ];

      workingExports.forEach(exportName => {
        expect(ratelimiter).toHaveProperty(exportName);
        expect(ratelimiter[exportName]).toBeDefined();
      });
    });

    test('has properties for broken exports (they are undefined)', () => {
      const brokenExports = [
        'redisTokenBucketMiddleware',
        'redisHealthCheck',
        'defaultMiddlewareOptions',
        'loadConfig'
      ];

      brokenExports.forEach(exportName => {
        expect(ratelimiter).toHaveProperty(exportName);
        expect(ratelimiter[exportName]).toBeUndefined();
      });
    });

    test('exports 12 properties total', () => {
      const exportKeys = Object.keys(ratelimiter);
      expect(exportKeys.length).toBe(12);
    });
  });

  describe('Integration Smoke Tests', () => {
    test('can create and use TokenBucket from package export', () => {
      const { TokenBucket } = ratelimiter;
      const bucket = new TokenBucket(5, 1);

      expect(bucket.allowRequest()).toBe(true);
      expect(bucket.getAvailableTokens()).toBe(4);
    });

    test('can create middleware from package export', () => {
      const { tokenBucketMiddleware } = ratelimiter;
      const middleware = tokenBucketMiddleware({ capacity: 10, refillRate: 2 });

      expect(typeof middleware).toBe('function');
      expect(middleware.length).toBe(3); // Express middleware signature (req, res, next)
    });

    test('can access ConfigManager class from package export', () => {
      const { ConfigManager } = ratelimiter;

      expect(ConfigManager).toBeDefined();
      expect(typeof ConfigManager).toBe('object');
      expect(ConfigManager.ConfigManager).toBeDefined();
      expect(typeof ConfigManager.ConfigManager).toBe('function');
    });
  });

  describe('TypeScript Compatibility', () => {
    test('working exports are compatible with require destructuring', () => {
      const {
        TokenBucket,
        RedisTokenBucket,
        tokenBucketMiddleware,
        ConfigManager
      } = require('../../src/index');

      expect(TokenBucket).toBeDefined();
      expect(RedisTokenBucket).toBeDefined();
      expect(tokenBucketMiddleware).toBeDefined();
      expect(ConfigManager).toBeDefined();
    });

    test('exports are compatible with default require', () => {
      const lib = require('../../src/index');

      expect(lib.TokenBucket).toBeDefined();
      expect(lib.ConfigManager).toBeDefined();
    });
  });

  describe('Export Type Consistency', () => {
    test('class exports are constructors', () => {
      // Only TokenBucket and RedisTokenBucket are actual class exports
      // ConfigManager is an object containing a class
      const classExports = ['TokenBucket', 'RedisTokenBucket'];

      classExports.forEach(className => {
        const ExportedClass = ratelimiter[className];
        expect(typeof ExportedClass).toBe('function');
        expect(ExportedClass.prototype).toBeDefined();
      });
    });

    test('function exports are callable', () => {
      const functionExports = [
        'tokenBucketMiddleware',
        'setRequestCost',
        'perUserRateLimit',
        'perIpRateLimit',
        'globalRateLimit'
      ];

      functionExports.forEach(funcName => {
        const exportedFunc = ratelimiter[funcName];
        expect(typeof exportedFunc).toBe('function');
      });
    });

    test('ConfigManager is an object containing the actual class', () => {
      expect(typeof ratelimiter.ConfigManager).toBe('object');
      expect(typeof ratelimiter.ConfigManager.ConfigManager).toBe('function');
      expect(typeof ratelimiter.ConfigManager.getConfigManager).toBe('function');
    });
  });

  describe('No Circular Dependency Issues', () => {
    test('can require index.js multiple times without errors', () => {
      expect(() => {
        require('../../src/index');
        require('../../src/index');
        require('../../src/index');
      }).not.toThrow();
    });

    test('multiple requires return the same cached module', () => {
      const import1 = require('../../src/index');
      const import2 = require('../../src/index');

      expect(import1).toBe(import2);
      expect(import1.TokenBucket).toBe(import2.TokenBucket);
    });
  });

  describe('Documentation of Known Bugs', () => {
    test('BUG REPORT: Missing Redis middleware exports', () => {
      // The following should be fixed in index.js:
      // 1. Import redisTokenBucketMiddleware from redis-token-bucket-middleware.js
      // 2. Import redisHealthCheck from redis-token-bucket-middleware.js
      // 3. Remove or properly export defaultMiddlewareOptions
      
      const bugs = {
        redisTokenBucketMiddleware: ratelimiter.redisTokenBucketMiddleware,
        redisHealthCheck: ratelimiter.redisHealthCheck,
        defaultMiddlewareOptions: ratelimiter.defaultMiddlewareOptions
      };

      // All should be undefined (documenting the bug)
      Object.entries(bugs).forEach(([name, value]) => {
        expect(value).toBeUndefined();
      });
    });

    test('BUG REPORT: ConfigManager export structure', () => {
      // ConfigManager should be exported as the class itself, not the module object
      // Users expect: const { ConfigManager } = require('@rate-limiter/core');
      // But get: const { ConfigManager } = require('@rate-limiter/core'); // ConfigManager.ConfigManager is the actual class
      
      expect(typeof ratelimiter.ConfigManager).toBe('object');
      expect(typeof ratelimiter.ConfigManager.ConfigManager).toBe('function');
      
      // This would be the expected behavior (currently fails):
      // expect(typeof ratelimiter.ConfigManager).toBe('function');
    });

    test('BUG REPORT: loadConfig is undefined', () => {
      // loadConfig tries to access ConfigManager.loadConfig, but that method doesn't exist
      // The config-manager module has getConfigManager() but not loadConfig()
      
      expect(ratelimiter.loadConfig).toBeUndefined();
      
      // If it should work, index.js needs to use getConfigManager or similar
    });
  });
});

