/**
 * Integration Tests for Penalty & Reward Middleware
 */

const express = require('express');
const request = require('supertest');
const {
  tokenBucketMiddleware,
  perUserRateLimit,
  applyPenalty,
  applyReward
} = require('../../src/middleware/express/token-bucket-middleware');

describe('Penalty and Reward Middleware Integration', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('applyPenalty', () => {
    it('should apply penalty to reduce available tokens', async () => {
      let penaltyInfo;
      
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));
      
      app.post('/failed-login', applyPenalty({ points: 3 }), (req, res) => {
        penaltyInfo = req.penaltyApplied;
        res.json({ success: true });
      });

      app.get('/status', (req, res) => {
        res.json({ remaining: req.rateLimit.remaining });
      });

      const res1 = await request(app).post('/failed-login');
      expect(res1.status).toBe(200);
      expect(penaltyInfo).toBeDefined();
      expect(penaltyInfo.points).toBe(3);
      expect(penaltyInfo.remainingTokens).toBeLessThanOrEqual(6);
    });

    it('should handle penalty leading to negative tokens', async () => {
      let penaltyInfo;
      
      app.use(tokenBucketMiddleware({
        capacity: 5,
        refillRate: 1
      }));
      
      app.post('/severe-violation', applyPenalty({ points: 10 }), (req, res) => {
        penaltyInfo = req.penaltyApplied;
        res.json({ success: true });
      });

      const res = await request(app).post('/severe-violation');
      expect(res.status).toBe(200);
      expect(penaltyInfo.remainingTokens).toBeLessThan(0);
    });

    it('should support dynamic penalty based on request', async () => {
      const penalties = [];
      
      app.use(tokenBucketMiddleware({
        capacity: 20,
        refillRate: 2
      }));
      
      app.post('/action', applyPenalty({
        points: (req) => req.body.severity === 'high' ? 5 : 2
      }), (req, res) => {
        penalties.push(req.penaltyApplied);
        res.json({ success: true });
      });

      const res1 = await request(app)
        .post('/action')
        .send({ severity: 'high' });
      expect(res1.status).toBe(200);
      expect(penalties[0].points).toBe(5);

      const res2 = await request(app)
        .post('/action')
        .send({ severity: 'low' });
      expect(res2.status).toBe(200);
      expect(penalties[1].points).toBe(2);
    });

    it('should work with per-user rate limiting', async () => {
      let user1Penalty, user2Penalty;
      
      app.use(perUserRateLimit({
        capacity: 10,
        refillRate: 1,
        getUserId: (req) => req.headers['x-user-id']
      }));
      
      app.post('/penalty', applyPenalty({ 
        points: 3,
        keyGenerator: (req) => `user:${req.headers['x-user-id']}`
      }), (req, res) => {
        if (req.headers['x-user-id'] === 'user1') {
          user1Penalty = req.penaltyApplied;
        } else {
          user2Penalty = req.penaltyApplied;
        }
        res.json({ penalized: true });
      });

      await request(app).post('/penalty').set('X-User-Id', 'user1');
      expect(user1Penalty.remainingTokens).toBeLessThanOrEqual(6);

      await request(app).post('/penalty').set('X-User-Id', 'user2');
      expect(user2Penalty.remainingTokens).toBeLessThanOrEqual(6);
      expect(user2Penalty.beforePenalty).toBeGreaterThanOrEqual(9);
    });
  });

  describe('applyReward', () => {
    it('should apply reward to increase available tokens', async () => {
      let rewardInfo;
      
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));
      
      app.get('/use-tokens', (req, res) => res.json({ ok: true }));
      
      app.post('/captcha-solved', applyReward({ points: 5 }), (req, res) => {
        rewardInfo = req.rewardApplied;
        res.json({ success: true });
      });

      await request(app).get('/use-tokens');
      await request(app).get('/use-tokens');
      await request(app).get('/use-tokens');

      const res = await request(app).post('/captcha-solved');
      expect(res.status).toBe(200);
      expect(rewardInfo).toBeDefined();
      expect(rewardInfo.points).toBe(5);
      expect(rewardInfo.remainingTokens).toBeGreaterThan(7);
    });

    it('should not exceed capacity when applying reward', async () => {
      let rewardInfo;
      
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));
      
      app.post('/bonus', applyReward({ points: 20 }), (req, res) => {
        rewardInfo = req.rewardApplied;
        res.json({ success: true });
      });

      const res = await request(app).post('/bonus');
      expect(res.status).toBe(200);
      expect(rewardInfo.remainingTokens).toBeLessThanOrEqual(10);
      expect(rewardInfo.cappedAtCapacity).toBe(true);
    });
  });

  describe('Combined Penalty and Reward Workflow', () => {
    it('should combine penalty and reward operations', async () => {
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));
      
      app.post('/bad-action', applyPenalty({ points: 5 }), (req, res) => {
        res.json({ penalized: true, remaining: req.penaltyApplied.remainingTokens });
      });
      
      app.post('/good-action', applyReward({ points: 3 }), (req, res) => {
        res.json({ rewarded: true, remaining: req.rewardApplied.remainingTokens });
      });
      
      app.get('/check', (req, res) => {
        res.json({ remaining: req.rateLimit.remaining });
      });

      // Apply penalty
      const bad = await request(app).post('/bad-action');
      expect(bad.status).toBe(200);
      expect(bad.body.remaining).toBeLessThanOrEqual(4);

      // Apply reward
      const good = await request(app).post('/good-action');
      expect(good.status).toBe(200);
      expect(good.body.remaining).toBeGreaterThan(bad.body.remaining);
    });

    it('should handle failed login scenario with eventual success', async () => {
      const events = [];
      
      app.use(tokenBucketMiddleware({
        capacity: 10,
        refillRate: 1
      }));
      
      app.post('/login', (req, res, _next) => {
        if (req.body.password === 'wrong') {
          applyPenalty({ points: 2 })(req, res, () => {
            events.push({ type: 'penalty', tokens: req.penaltyApplied.remainingTokens });
            res.json({ success: false, message: 'Wrong password' });
          });
        } else {
          applyReward({ points: 1 })(req, res, () => {
            events.push({ type: 'reward', tokens: req.rewardApplied.remainingTokens });
            res.json({ success: true });
          });
        }
      });

      // Failed attempt
      await request(app).post('/login').send({ password: 'wrong' });
      expect(events[0].type).toBe('penalty');

      // Failed attempt
      await request(app).post('/login').send({ password: 'wrong' });
      expect(events[1].type).toBe('penalty');

      // Successful login
      await request(app).post('/login').send({ password: 'correct' });
      expect(events[2].type).toBe('reward');
      
      // Reward should restore some tokens (or at least not be less)
      expect(events[2].tokens).toBeGreaterThanOrEqual(events[1].tokens);
    });
  });
});
