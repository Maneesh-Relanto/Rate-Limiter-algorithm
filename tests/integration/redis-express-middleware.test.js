/**
 * Integration Tests for Redis Token Bucket Express Middleware
 */

const express = require('express');
const request = require('supertest');
const RedisMock = require('ioredis-mock');
const {
  redisTokenBucketMiddleware,
  perUserRateLimit,
  perIpRateLimit,
  perEndpointRateLimit,
  globalRateLimit,
  setRequestCost,
  redisHealthCheck
} = require('../../src/middleware/express/redis-token-bucket-middleware');

describe('Redis Token Bucket Express Middleware', () => {
  let app;
  let redis;

  beforeEach(() => {
    app = express();
    redis = new RedisMock();
  });

  afterEach(async () => {
    if (redis) {
      await redis.flushall();
      redis.disconnect();
    }
  });

  describe('redisTokenBucketMiddleware', () => {
    it('should throw error if redis client not provided', () => {
      expect(() => {
        redisTokenBucketMiddleware({ capacity: 10, refillRate: 1 });
      }).toThrow('Redis client is required');
    });

    it('should throw error if capacity not provided', () => {
      expect(() => {
        redisTokenBucketMiddleware({ redis, refillRate: 1 });
      }).toThrow('Capacity and refillRate are required');
    });

    it('should throw error if refillRate not provided', () => {
      expect(() => {
        redisTokenBucketMiddleware({ redis, capacity: 10 });
      }).toThrow('Capacity and refillRate are required');
    });

    it('should allow requests within limit', async () => {
      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 10,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['x-ratelimit-limit']).toBe('10');
      expect(res.headers['x-ratelimit-remaining']).toBe('9');
    });

    it('should reject requests over limit', async () => {
      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 3,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // Make 3 requests (use up capacity)
      await request(app).get('/test');
      await request(app).get('/test');
      await request(app).get('/test');

      // 4th request should be rejected
      const res = await request(app).get('/test');
      
      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Too Many Requests');
      expect(res.headers['retry-after']).toBeDefined();
    });

    it('should add draft spec headers', async () => {
      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 10,
        refillRate: 1,
        headers: { standard: true, legacy: false }
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe('9');
      expect(res.headers['ratelimit-reset']).toBeDefined();
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    });

    it('should add legacy headers', async () => {
      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 10,
        refillRate: 1,
        headers: { standard: false, legacy: true }
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.headers['x-ratelimit-limit']).toBe('10');
      expect(res.headers['x-ratelimit-remaining']).toBe('9');
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
      expect(res.headers['ratelimit-limit']).toBeUndefined();
    });

    it('should use custom keyGenerator', async () => {
      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 5,
        refillRate: 1,
        keyGenerator: (req) => req.headers['x-user-id'] || 'anonymous'
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // User 1 makes 5 requests
      for (let i = 0; i < 5; i++) {
        await request(app).get('/test').set('X-User-Id', 'user1');
      }

      // User 1's 6th request should be rejected
      const res1 = await request(app).get('/test').set('X-User-Id', 'user1');
      expect(res1.status).toBe(429);

      // User 2 should still be allowed
      const res2 = await request(app).get('/test').set('X-User-Id', 'user2');
      expect(res2.status).toBe(200);
    });

    it('should skip requests when skip function returns true', async () => {
      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 1,
        refillRate: 1,
        skip: (req) => req.path === '/health'
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));
      app.get('/health', (req, res) => res.json({ status: 'ok' }));

      // Exhaust limit on /test
      await request(app).get('/test');
      const res1 = await request(app).get('/test');
      expect(res1.status).toBe(429);

      // /health should not be rate limited
      const res2 = await request(app).get('/health');
      expect(res2.status).toBe(200);
    });

    it('should use custom handler', async () => {
      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 1,
        refillRate: 1,
        handler: (req, res) => {
          res.status(429).json({ custom: 'error', path: req.path });
        }
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      const res = await request(app).get('/test');
      
      expect(res.status).toBe(429);
      expect(res.body.custom).toBe('error');
      expect(res.body.path).toBe('/test');
    });

    it('should call onLimitReached callback', async () => {
      const callback = jest.fn();
      
      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 1,
        refillRate: 1,
        onLimitReached: callback
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      await request(app).get('/test');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should attach rateLimit info to request', async () => {
      let capturedReq;

      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 10,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => {
        capturedReq = req;
        res.json({ success: true });
      });

      await request(app).get('/test');

      expect(capturedReq.rateLimit).toBeDefined();
      expect(capturedReq.rateLimit.limit).toBe(10);
      expect(capturedReq.rateLimit.remaining).toBe(9);
      expect(capturedReq.rateLimit.resetTime).toBeDefined();
      expect(capturedReq.rateLimit.key).toBeDefined();
    });

    it('should handle cost-based token consumption', async () => {
      app.use(setRequestCost((req) => {
        // Different costs for different endpoints
        if (req.path === '/expensive') return 5;
        return 1;
      }));

      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 10,
        refillRate: 1
      }));

      app.get('/cheap', (req, res) => {
        res.json({ success: true });
      });

      app.get('/expensive', (req, res) => {
        res.json({ success: true });
      });

      const res1 = await request(app).get('/expensive');
      expect(res1.status).toBe(200);
      expect(res1.headers['x-ratelimit-remaining']).toBe('5');

      const res2 = await request(app).get('/expensive');
      expect(res2.status).toBe(200);
      expect(res2.headers['x-ratelimit-remaining']).toBe('0');

      const res3 = await request(app).get('/expensive');
      expect(res3.status).toBe(429);

      // Cheap request should still be blocked (0 tokens remaining)
      const res4 = await request(app).get('/cheap');
      expect(res4.status).toBe(429);
    });

    it('should share state across multiple middleware instances with same key', async () => {
      // Create two separate app instances with same Redis and key generator
      const app1 = express();
      const app2 = express();

      const keyGen = (req) => 'shared-key';

      app1.use(redisTokenBucketMiddleware({
        redis,
        capacity: 5,
        refillRate: 1,
        keyGenerator: keyGen
      }));
      app1.get('/test', (req, res) => res.json({ server: 1 }));

      app2.use(redisTokenBucketMiddleware({
        redis,
        capacity: 5,
        refillRate: 1,
        keyGenerator: keyGen
      }));
      app2.get('/test', (req, res) => res.json({ server: 2 }));

      // Make 3 requests to app1
      await request(app1).get('/test');
      await request(app1).get('/test');
      await request(app1).get('/test');

      // Make 2 requests to app2 (should only have 2 tokens left from shared bucket)
      await request(app2).get('/test');
      await request(app2).get('/test');

      // Next request to either app should be rejected
      const res1 = await request(app1).get('/test');
      expect(res1.status).toBe(429);

      const res2 = await request(app2).get('/test');
      expect(res2.status).toBe(429);
    });

    it('should fail open when Redis connection fails', async () => {
      // Create a Redis client that will fail
      const brokenRedis = new RedisMock();
      
      app.use(redisTokenBucketMiddleware({
        redis: brokenRedis,
        capacity: 1,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // Force Redis to fail
      brokenRedis.eval = jest.fn().mockRejectedValue(new Error('Redis connection error'));

      // Request should still succeed (fail open)
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      brokenRedis.disconnect();
    });

    it('should use custom prefix for Redis keys', async () => {
      const customPrefix = 'myapp:ratelimit:';
      
      app.use(redisTokenBucketMiddleware({
        redis,
        capacity: 10,
        refillRate: 1,
        prefix: customPrefix,
        keyGenerator: (req) => 'testkey'
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');

      // Check that key exists with custom prefix
      const keys = await redis.keys(`${customPrefix}*`);
      expect(keys.length).toBeGreaterThan(0);
      expect(keys[0]).toContain(customPrefix);
    });
  });

  describe('perUserRateLimit', () => {
    beforeEach(() => {
      app = express();
    });

    it('should throw error if getUserId not provided', () => {
      expect(() => {
        perUserRateLimit({ redis, capacity: 10, refillRate: 1 });
      }).toThrow('getUserId function is required');
    });

    it('should rate limit per user', async () => {
      app.use(perUserRateLimit({
        redis,
        capacity: 2,
        refillRate: 1,
        getUserId: (req) => req.headers['x-user-id']
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // User 1 makes 2 requests
      await request(app).get('/test').set('X-User-Id', 'user1');
      await request(app).get('/test').set('X-User-Id', 'user1');

      // User 1's 3rd request blocked
      const res1 = await request(app).get('/test').set('X-User-Id', 'user1');
      expect(res1.status).toBe(429);

      // User 2's request still allowed
      const res2 = await request(app).get('/test').set('X-User-Id', 'user2');
      expect(res2.status).toBe(200);
    });

    it('should fallback to IP if no user ID', async () => {
      app.use(perUserRateLimit({
        redis,
        capacity: 2,
        refillRate: 1,
        getUserId: (req) => req.headers['x-user-id'],
        fallbackToIp: true
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      await request(app).get('/test');
      
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });

    it('should use anonymous key if fallbackToIp is false', async () => {
      app.use(perUserRateLimit({
        redis,
        capacity: 2,
        refillRate: 1,
        getUserId: (req) => req.headers['x-user-id'],
        fallbackToIp: false
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      await request(app).get('/test');
      
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });
  });

  describe('perIpRateLimit', () => {
    beforeEach(() => {
      app = express();
    });

    it('should rate limit per IP', async () => {
      app.use(perIpRateLimit({
        redis,
        capacity: 2,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      await request(app).get('/test');
      
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });

    it('should use default capacity from config', async () => {
      app.use(perIpRateLimit({ redis }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
    });
  });

  describe('perEndpointRateLimit', () => {
    beforeEach(() => {
      app = express();
    });

    it('should rate limit per endpoint', async () => {
      app.use(perEndpointRateLimit({
        redis,
        capacity: 2,
        refillRate: 1
      }));
      
      app.get('/endpoint1', (req, res) => res.json({ endpoint: 1 }));
      app.get('/endpoint2', (req, res) => res.json({ endpoint: 2 }));

      // Exhaust endpoint1
      await request(app).get('/endpoint1');
      await request(app).get('/endpoint1');
      
      const res1 = await request(app).get('/endpoint1');
      expect(res1.status).toBe(429);

      // endpoint2 still available
      const res2 = await request(app).get('/endpoint2');
      expect(res2.status).toBe(200);
    });

    it('should include user ID in key if provided', async () => {
      app.use(perEndpointRateLimit({
        redis,
        capacity: 2,
        refillRate: 1,
        getUserId: (req) => req.headers['x-user-id']
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // User 1 exhausts limit
      await request(app).get('/test').set('X-User-Id', 'user1');
      await request(app).get('/test').set('X-User-Id', 'user1');
      
      const res1 = await request(app).get('/test').set('X-User-Id', 'user1');
      expect(res1.status).toBe(429);

      // User 2 still has access to same endpoint
      const res2 = await request(app).get('/test').set('X-User-Id', 'user2');
      expect(res2.status).toBe(200);
    });
  });

  describe('globalRateLimit', () => {
    beforeEach(() => {
      app = express();
    });

    it('should rate limit globally across all requests', async () => {
      app.use(globalRateLimit({
        redis,
        capacity: 2,
        refillRate: 1
      }));
      
      app.get('/endpoint1', (req, res) => res.json({ endpoint: 1 }));
      app.get('/endpoint2', (req, res) => res.json({ endpoint: 2 }));

      await request(app).get('/endpoint1');
      await request(app).get('/endpoint2');
      
      // Both endpoints should be rate limited now
      const res1 = await request(app).get('/endpoint1');
      expect(res1.status).toBe(429);

      const res2 = await request(app).get('/endpoint2');
      expect(res2.status).toBe(429);
    });

    it('should use default capacity from config', async () => {
      app.use(globalRateLimit({ redis }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.status).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
    });
  });

  describe('setRequestCost', () => {
    it('should set token cost on request', () => {
      const req = {};
      const res = {};
      const next = jest.fn();

      const middleware = setRequestCost(5);
      middleware(req, res, next);

      expect(req.tokenCost).toBe(5);
      expect(next).toHaveBeenCalled();
    });

    it('should support function-based cost calculation', () => {
      const req = { method: 'POST' };
      const res = {};
      const next = jest.fn();

      const middleware = setRequestCost((req) => req.method === 'POST' ? 10 : 1);
      middleware(req, res, next);

      expect(req.tokenCost).toBe(10);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('redisHealthCheck', () => {
    beforeEach(() => {
      app = express();
    });

    it('should throw error if redis client not provided', () => {
      expect(() => {
        redisHealthCheck({});
      }).toThrow('Redis client is required');
    });

    it('should set redisHealthy to true when Redis is responding', async () => {
      let capturedReq;

      app.use(redisHealthCheck({ redis }));
      app.get('/health', (req, res) => {
        capturedReq = req;
        res.json({ healthy: req.redisHealthy });
      });

      const res = await request(app).get('/health');
      
      expect(res.status).toBe(200);
      expect(capturedReq.redisHealthy).toBe(true);
    });

    it('should set redisHealthy to false when Redis fails', async () => {
      const brokenRedis = new RedisMock();
      brokenRedis.ping = jest.fn().mockRejectedValue(new Error('Connection failed'));

      let capturedReq;

      app.use(redisHealthCheck({ redis: brokenRedis }));
      app.get('/health', (req, res) => {
        capturedReq = req;
        res.json({ healthy: req.redisHealthy });
      });

      const res = await request(app).get('/health');
      
      expect(res.status).toBe(200);
      expect(capturedReq.redisHealthy).toBe(false);

      brokenRedis.disconnect();
    });

    it('should not block request flow if health check fails', async () => {
      const brokenRedis = new RedisMock();
      brokenRedis.ping = jest.fn().mockRejectedValue(new Error('Connection failed'));

      app.use(redisHealthCheck({ redis: brokenRedis }));
      app.get('/test', (req, res) => {
        res.json({ success: true, healthy: req.redisHealthy });
      });

      const res = await request(app).get('/test');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.healthy).toBe(false);

      brokenRedis.disconnect();
    });
  });
});
