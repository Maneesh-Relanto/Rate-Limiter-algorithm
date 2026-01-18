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

    it('should set token cost from function', () => {
      const req = { body: { size: 10 } };
      const res = {};
      const next = jest.fn();

      const middleware = setRequestCost((req) => req.body.size * 2);
      middleware(req, res, next);

      expect(req.tokenCost).toBe(20);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('Branch Coverage Tests', () => {
    beforeEach(() => {
      app = express();
    });

    it('should use skip function to bypass rate limiting', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 1,
        refillRate: 1,
        skip: (req) => req.path === '/health'
      }));
      
      app.get('/health', (req, res) => res.json({ status: 'ok' }));
      app.get('/api', (req, res) => res.json({ success: true }));

      // Health endpoint should skip rate limiting
      await request(app).get('/health');
      await request(app).get('/health');
      const res1 = await request(app).get('/health');
      expect(res1.status).toBe(200);

      // API endpoint should enforce rate limiting
      await request(app).get('/api');
      const res2 = await request(app).get('/api');
      expect(res2.status).toBe(429);
    });

    it('should use custom handler for rate limit exceeded', async () => {
      const customHandler = jest.fn((req, res) => {
        res.status(503).json({ custom: 'error', service: 'unavailable' });
      });

      app.use(tokenBucketMiddleware({
        capacity: 1,
        refillRate: 1,
        handler: customHandler
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      const res = await request(app).get('/test');
      
      expect(res.status).toBe(503);
      expect(res.body.custom).toBe('error');
      expect(customHandler).toHaveBeenCalled();
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

    it('should use standard headers (draft spec)', async () => {
      app.use(tokenBucketMiddleware({
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

    it('should use legacy headers only', async () => {
      app.use(tokenBucketMiddleware({
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

    it('should disable all headers', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1,
        headers: { standard: false, legacy: false }
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.headers['ratelimit-limit']).toBeUndefined();
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    });

    it('should use deprecated standardHeaders option', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1,
        standardHeaders: true
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.headers['ratelimit-limit']).toBe('10');
    });

    it('should use deprecated legacyHeaders option', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1,
        legacyHeaders: true
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      const res = await request(app).get('/test');
      
      expect(res.headers['x-ratelimit-limit']).toBe('10');
    });

    it('should fail open on error', async () => {
      const badKeyGenerator = jest.fn(() => {
        throw new Error('Key generator error');
      });

      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1,
        keyGenerator: badKeyGenerator
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // Should allow request despite error
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(badKeyGenerator).toHaveBeenCalled();
    });

    it('should handle perUserRateLimit with fallbackToIp=false', async () => {
      app.use(perUserRateLimit({
        capacity: 2,
        refillRate: 1,
        getUserId: (req) => req.headers['x-user-id'],
        fallbackToIp: false
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // No user ID should use 'anonymous' key
      await request(app).get('/test');
      await request(app).get('/test');
      
      const res = await request(app).get('/test');
      expect(res.status).toBe(429);
    });

    it('should handle perEndpointRateLimit with getUserId function', async () => {
      app.use(perEndpointRateLimit({
        capacity: 2,
        refillRate: 1,
        getUserId: (req) => req.headers['x-user-id']
      }));
      
      app.get('/endpoint1', (req, res) => res.json({ endpoint: 1 }));

      // User 1 can make 2 requests to endpoint1
      await request(app).get('/endpoint1').set('X-User-Id', 'user1');
      await request(app).get('/endpoint1').set('X-User-Id', 'user1');
      
      const res1 = await request(app).get('/endpoint1').set('X-User-Id', 'user1');
      expect(res1.status).toBe(429);

      // User 2 can still access endpoint1
      const res2 = await request(app).get('/endpoint1').set('X-User-Id', 'user2');
      expect(res2.status).toBe(200);
    });

    it('should handle perEndpointRateLimit without getUserId', async () => {
      app.use(perEndpointRateLimit({
        capacity: 2,
        refillRate: 1
      }));
      
      app.get('/endpoint1', (req, res) => res.json({ endpoint: 1 }));

      // Should use IP address
      await request(app).get('/endpoint1');
      await request(app).get('/endpoint1');
      
      const res = await request(app).get('/endpoint1');
      expect(res.status).toBe(429);
    });

    it('should use null/undefined options with perUserRateLimit', async () => {
      app.use(perUserRateLimit({
        getUserId: (req) => req.headers['x-user-id'],
        fallbackToIp: false,
        capacity: 2,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // User with valid ID
      await request(app).get('/test').set('X-User-Id', 'user1');
      await request(app).get('/test').set('X-User-Id', 'user1');
      
      const res1 = await request(app).get('/test').set('X-User-Id', 'user1');
      expect(res1.status).toBe(429);

      // Empty user ID should use 'anonymous'
      const res2 = await request(app).get('/test');
      expect(res2.status).toBe(200);
    });

    it('should handle perUserRateLimit with valid userId', async () => {
      app.use(perUserRateLimit({
        getUserId: (req) => req.headers['x-user-id'],
        capacity: 2,
        refillRate: 1
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      // First user
      await request(app).get('/test').set('X-User-Id', 'validuser');
      
      const res = await request(app).get('/test').set('X-User-Id', 'validuser');
      expect(res.status).toBe(200); // Still under limit
    });

    it('should use request.tokenCost over config.cost', async () => {
      app.use('/heavy', setRequestCost(8)); // Set cost before middleware

      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1,
        cost: 5 // Default cost
      }));
      
      app.get('/heavy', (req, res) => {
        res.json({ remaining: req.rateLimit.remaining });
      });

      const res = await request(app).get('/heavy');
      expect(res.body.remaining).toBe(2); // 10 - 8 = 2
    });

    it('should use skip function with custom logic', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 1,
        refillRate: 1,
        skip: (req) => req.path === '/health' || req.path === '/status'
      }));
      
      app.get('/health', (req, res) => res.json({ status: 'ok' }));
      app.get('/api', (req, res) => res.json({ success: true }));

      // Health should skip
      await request(app).get('/health');
      await request(app).get('/health');
      const res1 = await request(app).get('/health');
      expect(res1.status).toBe(200);

      // API should enforce
      await request(app).get('/api');
      const res2 = await request(app).get('/api');
      expect(res2.status).toBe(429);
    });

    it('should use default keyGenerator when not provided', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 2,
        refillRate: 1
        // No keyGenerator provided
      }));
      
      app.get('/test', (req, res) => res.json({ 
        key: req.rateLimit.key 
      }));

      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      // Should use IP address as key
      expect(res.body.key).toMatch(/\d+\.\d+\.\d+\.\d+|::ffff:\d+\.\d+\.\d+\.\d+|global/);
    });

    it('should use default handler when not provided', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 1,
        refillRate: 1
        // No handler provided
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      const res = await request(app).get('/test');
      
      // Should use default 429 response
      expect(res.status).toBe(429);
      expect(res.body.error).toBeDefined();
    });

    it('should use default onLimitReached when not provided', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 1,
        refillRate: 1
        // No onLimitReached provided
      }));
      
      app.get('/test', (req, res) => res.json({ success: true }));

      await request(app).get('/test');
      const res = await request(app).get('/test');
      
      expect(res.status).toBe(429);
      // Should not crash without callback
    });

    it('should use default cost when not specified', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
        // No cost specified
      }));
      
      app.get('/test', (req, res) => {
        res.json({ remaining: req.rateLimit.remaining });
      });

      const res = await request(app).get('/test');
      expect(res.body.remaining).toBe(9); // Default cost is 1
    });
  });

  describe('applyPenalty', () => {
    const { applyPenalty } = require('../../src/middleware/express/token-bucket-middleware');

    beforeEach(() => {
      app = express();
    });

    it('should apply penalty to rate limiter', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));

      app.use('/bad', applyPenalty({ points: 5 }));
      
      app.get('/good', (req, res) => {
        res.json({ remaining: req.rateLimit.remaining });
      });

      app.get('/bad', (req, res) => {
        res.json({ 
          penaltyApplied: req.penaltyApplied,
          remaining: req.rateLimit.remaining
        });
      });

      // Check initial state
      const res1 = await request(app).get('/good');
      expect(res1.body.remaining).toBe(9);

      // Apply penalty
      const res2 = await request(app).get('/bad');
      expect(res2.body.penaltyApplied.points).toBe(5);

      // Check reduced tokens
      const res3 = await request(app).get('/good');
      expect(res3.body.remaining).toBeLessThan(9);
    });

    it('should apply penalty using function', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));

      app.use('/dynamic', applyPenalty({ 
        points: (req) => parseInt(req.query.penalty) || 1
      }));
      
      app.get('/dynamic', (req, res) => {
        res.json({ penaltyApplied: req.penaltyApplied });
      });

      const res = await request(app).get('/dynamic?penalty=7');
      expect(res.body.penaltyApplied.points).toBe(7);
    });

    it('should apply penalty with custom keyGenerator', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));

      app.use('/penalty', applyPenalty({ 
        points: 5,
        keyGenerator: (req) => `user:${req.headers['x-user-id'] || 'anonymous'}`
      }));
      
      app.get('/penalty', (req, res) => {
        res.json({ penaltyApplied: req.penaltyApplied });
      });

      const res = await request(app).get('/penalty').set('X-User-Id', 'test');
      expect(res.body.penaltyApplied.points).toBe(5);
    });

    it('should handle error in applyPenalty gracefully', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));

      // Mock penalty to throw error
      app.use('/test', (req, res, next) => {
        req.rateLimiter.penalty = jest.fn(() => {
          throw new Error('Penalty error');
        });
        next();
      });

      app.use('/test', applyPenalty({ points: 5 }));
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Should not crash despite error
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    });
  });

  describe('applyReward', () => {
    const { applyReward } = require('../../src/middleware/express/token-bucket-middleware');

    beforeEach(() => {
      app = express();
    });

    it('should apply reward to rate limiter', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));

      // Consume some tokens first
      app.use('/consume', (req, res, next) => {
        req.rateLimiter.penalty(5);
        next();
      });

      app.use('/good', applyReward({ points: 3 }));
      
      app.get('/consume', (req, res) => {
        res.json({ remaining: req.rateLimit.remaining });
      });

      app.get('/good', (req, res) => {
        res.json({ 
          rewardApplied: req.rewardApplied,
          remaining: req.rateLimit.remaining
        });
      });

      // Consume tokens
      await request(app).get('/consume');

      // Apply reward
      const res = await request(app).get('/good');
      expect(res.body.rewardApplied.points).toBe(3);
      expect(res.body.rewardApplied.cappedAtCapacity).toBeDefined();
    });

    it('should apply reward using function', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));

      app.use('/dynamic', applyReward({ 
        points: (req) => parseInt(req.query.reward) || 1
      }));
      
      app.get('/dynamic', (req, res) => {
        res.json({ rewardApplied: req.rewardApplied });
      });

      const res = await request(app).get('/dynamic?reward=4');
      expect(res.body.rewardApplied.points).toBe(4);
    });

    it('should apply reward with custom keyGenerator', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));

      app.use('/reward', applyReward({ 
        points: 3,
        keyGenerator: (req) => `user:${req.headers['x-user-id'] || 'anonymous'}`
      }));
      
      app.get('/reward', (req, res) => {
        res.json({ rewardApplied: req.rewardApplied });
      });

      const res = await request(app).get('/reward').set('X-User-Id', 'test');
      expect(res.body.rewardApplied.points).toBe(3);
    });

    it('should handle error in applyReward gracefully', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));

      // Mock reward to throw error
      app.use('/test', (req, res, next) => {
        req.rateLimiter.reward = jest.fn(() => {
          throw new Error('Reward error');
        });
        next();
      });

      app.use('/test', applyReward({ points: 5 }));
      
      app.get('/test', (req, res) => {
        res.json({ success: true });
      });

      // Should not crash despite error
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
    });
  });
});
