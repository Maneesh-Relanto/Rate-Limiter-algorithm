/**
 * Tests for Express Token Bucket Middleware
 */

const express = require('express');
const request = require('supertest');
const {
  tokenBucketMiddleware,
  perUserRateLimit,
  perIpRateLimit,
  perEndpointRateLimit,
  globalRateLimit,
  setRequestCost
} = require('../../src/middleware/express/token-bucket-middleware');

describe('Express Token Bucket Middleware', () => {
  let app;

  describe('tokenBucketMiddleware', () => {
    beforeEach(() => {
      app = express();
    });

    it('should throw error if capacity not provided', () => {
      expect(() => {
        tokenBucketMiddleware({ refillRate: 1 });
      }).toThrow('Capacity and refillRate are required');
    });

    it('should throw error if refillRate not provided', () => {
      expect(() => {
        tokenBucketMiddleware({ capacity: 10 });
      }).toThrow('Capacity and refillRate are required');
    });

    it('should allow requests within limit', async () => {
      app.use(tokenBucketMiddleware({
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
      app.use(tokenBucketMiddleware({
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
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1,
        headers: { draft: true }
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe('9');
      expect(res.headers['ratelimit-reset']).toBeDefined();
    });

    it('should use custom keyGenerator', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 5,
        refillRate: 1,
        keyGenerator: (req) => req.headers['x-user-id'] || 'anonymous'
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // User 1 makes 5 requests
      for (let i = 0; i < 5; i++) {
        await request(app).get('/test').set('X-User-Id', 'user1');
      }

      // User 1's 6th request should be blocked
      const res1 = await request(app).get('/test').set('X-User-Id', 'user1');
      expect(res1.status).toBe(429);

      // User 2's first request should be allowed
      const res2 = await request(app).get('/test').set('X-User-Id', 'user2');
      expect(res2.status).toBe(200);
    });

    it('should skip requests when skip function returns true', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 1,
        refillRate: 1,
        skip: (req) => req.path === '/health'
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));
      app.get('/health', (req, res) => res.json({ healthy: true }));

      // First request to /test uses the token
      await request(app).get('/test');

      // Second request to /test should be blocked
      const res1 = await request(app).get('/test');
      expect(res1.status).toBe(429);

      // But /health should never be rate limited
      const res2 = await request(app).get('/health');
      expect(res2.status).toBe(200);
    });

    it('should use custom handler', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 1,
        refillRate: 1,
        handler: (req, res) => {
          res.status(503).json({ custom: 'error' });
        }
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      const res = await request(app).get('/test');
      
      expect(res.status).toBe(503);
      expect(res.body.custom).toBe('error');
    });

    it('should call onLimitReached callback', async () => {
      const onLimitReached = jest.fn();
      
      app.use(tokenBucketMiddleware({
        capacity: 1,
        refillRate: 1,
        onLimitReached
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      await request(app).get('/test');
      
      expect(onLimitReached).toHaveBeenCalled();
    });

    it('should attach rateLimit info to request', async () => {
      let rateLimitInfo;
      
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => {
        rateLimitInfo = req.rateLimit;
        res.json({ success: true });
      });

      await request(app).get('/test');
      
      expect(rateLimitInfo).toBeDefined();
      expect(rateLimitInfo.limit).toBe(10);
      expect(rateLimitInfo.remaining).toBe(9);
      expect(rateLimitInfo.used).toBe(1);
      expect(rateLimitInfo.resetTime).toBeDefined();
      expect(rateLimitInfo.key).toBeDefined();
    });

    it('should handle cost-based requests', async () => {
      app.use(setRequestCost(5));
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));
      
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
    });
  });

  describe('perUserRateLimit', () => {
    beforeEach(() => {
      app = express();
    });

    it('should throw error if getUserId not provided', () => {
      expect(() => {
        perUserRateLimit({ capacity: 10, refillRate: 1 });
      }).toThrow('getUserId function is required');
    });

    it('should rate limit per user', async () => {
      app.use(perUserRateLimit({
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
        capacity: 2,
        refillRate: 1,
        getUserId: (req) => req.headers['x-user-id']
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
        capacity: 2,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      await request(app).get('/test');
      
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });
  });

  describe('perEndpointRateLimit', () => {
    beforeEach(() => {
      app = express();
    });

    it('should rate limit per endpoint', async () => {
      app.use(perEndpointRateLimit({
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
  });

  describe('globalRateLimit', () => {
    beforeEach(() => {
      app = express();
    });

    it('should rate limit globally', async () => {
      app.use(globalRateLimit({
        capacity: 2,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      await request(app).get('/test');
      
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
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
  });
});
