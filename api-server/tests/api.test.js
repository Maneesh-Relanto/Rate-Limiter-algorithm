const request = require('supertest');
const app = require('../server');

describe('Rate Limiter API Server', () => {
  describe('Health & Metrics', () => {
    test('GET /api/health - should return healthy status', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'healthy');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('version');
      expect(res.body).toHaveProperty('activeLimiters');
    });

    test('GET /api/metrics - should return metrics', async () => {
      const res = await request(app).get('/api/metrics');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalRequests');
      expect(res.body).toHaveProperty('allowedRequests');
      expect(res.body).toHaveProperty('blockedRequests');
      expect(res.body).toHaveProperty('successRate');
    });
  });

  describe('Rate Limit Check', () => {
    test('POST /api/v1/limiter/check - should allow request with tokens', async () => {
      const res = await request(app).post('/api/v1/limiter/check').send({
        key: 'test-user-1',
        capacity: 10,
        refillRate: 1
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('allowed', true);
      expect(res.body).toHaveProperty('key', 'test-user-1');
      expect(res.body.tokens).toBeLessThanOrEqual(10);
    });

    test('POST /api/v1/limiter/check - should block when no tokens', async () => {
      const key = 'test-user-exhaust';

      // Exhaust all tokens
      for (let i = 0; i < 11; i++) {
        await request(app).post('/api/v1/limiter/check').send({ key, capacity: 10, refillRate: 1 });
      }

      // This should be blocked
      const res = await request(app).post('/api/v1/limiter/check').send({ key });

      expect(res.status).toBe(429);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('allowed', false);
      expect(res.body.retryAfter).toBeGreaterThan(0);
    });

    test('POST /api/v1/limiter/check - should require key', async () => {
      const res = await request(app).post('/api/v1/limiter/check').send({});

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('success', false);
      expect(res.body).toHaveProperty('code', 'MISSING_KEY');
    });
  });

  describe('Penalty System', () => {
    test('POST /api/v1/limiter/penalty - should apply penalty', async () => {
      const key = 'test-penalty-user';

      // Create limiter first
      await request(app).post('/api/v1/limiter/check').send({ key, capacity: 100, refillRate: 10 });

      // Apply penalty
      const res = await request(app).post('/api/v1/limiter/penalty').send({ key, points: 10 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('penaltyApplied', 10);
      expect(res.body).toHaveProperty('remainingTokens');
    });

    test('POST /api/v1/limiter/penalty - should require key', async () => {
      const res = await request(app).post('/api/v1/limiter/penalty').send({ points: 5 });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('code', 'MISSING_KEY');
    });
  });

  describe('Reward System', () => {
    test('POST /api/v1/limiter/reward - should apply reward', async () => {
      const key = 'test-reward-user';

      // Create limiter first
      await request(app).post('/api/v1/limiter/check').send({ key, capacity: 100, refillRate: 10 });

      // Apply reward
      const res = await request(app).post('/api/v1/limiter/reward').send({ key, points: 15 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('rewardApplied');
      expect(res.body).toHaveProperty('remainingTokens');
    });
  });

  describe('Block System', () => {
    test('POST /api/v1/limiter/block - should block key', async () => {
      const key = 'test-block-user';

      const res = await request(app).post('/api/v1/limiter/block').send({ key, duration: 5000 });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('blocked', true);
      expect(res.body).toHaveProperty('blockedUntil');
    });

    test('POST /api/v1/limiter/unblock - should unblock key', async () => {
      const key = 'test-unblock-user';

      // Block first
      await request(app).post('/api/v1/limiter/block').send({ key, duration: 10000 });

      // Unblock
      const res = await request(app).post('/api/v1/limiter/unblock').send({ key });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('unblocked', true);
    });
  });

  describe('Limiter Status', () => {
    test('GET /api/v1/limiter/status/:key - should return limiter status', async () => {
      const key = 'test-status-user';

      // Create limiter
      await request(app).post('/api/v1/limiter/check').send({ key, capacity: 50, refillRate: 5 });

      // Get status
      const res = await request(app).get(`/api/v1/limiter/status/${key}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('key', key);
      expect(res.body).toHaveProperty('tokens');
      expect(res.body).toHaveProperty('capacity', 50);
      expect(res.body).toHaveProperty('isBlocked');
    });

    test('GET /api/v1/limiter/status/:key - should return 404 for non-existent', async () => {
      const res = await request(app).get('/api/v1/limiter/status/non-existent-key');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    });
  });

  describe('Limiter Management', () => {
    test('POST /api/v1/limiter/reset/:key - should reset limiter', async () => {
      const key = 'test-reset-user';

      // Create and use limiter
      await request(app).post('/api/v1/limiter/check').send({ key, capacity: 10, refillRate: 1 });

      // Reset
      const res = await request(app).post(`/api/v1/limiter/reset/${key}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('reset', true);
    });

    test('DELETE /api/v1/limiter/:key - should delete limiter', async () => {
      const key = 'test-delete-user';

      // Create limiter
      await request(app).post('/api/v1/limiter/check').send({ key });

      // Delete
      const res = await request(app).delete(`/api/v1/limiter/${key}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('deleted', true);
    });

    test('GET /api/v1/limiters - should list all limiters', async () => {
      const res = await request(app).get('/api/v1/limiters');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
      expect(res.body).toHaveProperty('count');
      expect(res.body).toHaveProperty('limiters');
      expect(Array.isArray(res.body.limiters)).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown endpoint', async () => {
      const res = await request(app).get('/api/unknown');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('code', 'NOT_FOUND');
    });
  });
});
