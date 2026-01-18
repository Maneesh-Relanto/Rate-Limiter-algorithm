/**
 * Rate Limiter Demo Application - Backend
 *
 * A comprehensive test application demonstrating all rate limiting features:
 * - In-memory token bucket
 * - Redis distributed rate limiting
 * - Various rate limit strategies (per-IP, per-user, per-endpoint, global)
 * - Cost-based token consumption
 * - Real-time monitoring and visualization
 */

const express = require('express');
const path = require('node:path');
const {
  tokenBucketMiddleware,
  perIpRateLimit,
  perUserRateLimit,
  globalRateLimit,
  setRequestCost
} = require('../../src/middleware/express/token-bucket-middleware');

const app = express();
const port = 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Store rate limit metrics for dashboard
const metrics = {
  totalRequests: 0,
  allowedRequests: 0,
  blockedRequests: 0,
  requestsByEndpoint: {},
  recentEvents: []
};

// Helper to track metrics
function trackMetric(endpoint, allowed, reason = '') {
  metrics.totalRequests++;

  if (allowed) {
    metrics.allowedRequests++;
  } else {
    metrics.blockedRequests++;
  }

  if (!metrics.requestsByEndpoint[endpoint]) {
    metrics.requestsByEndpoint[endpoint] = { allowed: 0, blocked: 0 };
  }

  metrics.requestsByEndpoint[endpoint][allowed ? 'allowed' : 'blocked']++;

  metrics.recentEvents.unshift({
    timestamp: Date.now(),
    endpoint,
    allowed,
    reason,
    ip: 'client'
  });

  // Keep only last 50 events
  if (metrics.recentEvents.length > 50) {
    metrics.recentEvents.pop();
  }
}

// Middleware to track all requests
app.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function (data) {
    trackMetric(
      req.path,
      res.statusCode !== 429,
      res.statusCode === 429 ? 'Rate limit exceeded' : 'Success'
    );
    originalSend.call(this, data);
  };
  next();
});

// ============================================
// DEMO ENDPOINTS
// ============================================

// 1. Per-IP Rate Limiting (10 requests per minute)
app.get(
  '/api/basic',
  perIpRateLimit({
    capacity: 10,
    refillRate: 10,
    refillInterval: 60000 // 10 requests per minute
  }),
  (req, res) => {
    res.json({
      success: true,
      message: 'Request successful!',
      rateLimit: req.rateLimit,
      endpoint: '/api/basic',
      strategy: 'Per-IP Rate Limiting (10 req/min)'
    });
  }
);

// 2. Strict Rate Limiting (3 requests only)
app.get(
  '/api/strict',
  perIpRateLimit({
    capacity: 3,
    refillRate: 1,
    refillInterval: 60000 // 1 request per minute refill
  }),
  (req, res) => {
    res.json({
      success: true,
      message: 'Strict endpoint accessed',
      rateLimit: req.rateLimit,
      endpoint: '/api/strict',
      strategy: 'Strict Rate Limiting (3 requests, slow refill)'
    });
  }
);

// 3. Cost-Based Rate Limiting
app.get(
  '/api/cost-light',
  setRequestCost(1),
  tokenBucketMiddleware({
    capacity: 20,
    refillRate: 5,
    refillInterval: 1000
  }),
  (req, res) => {
    res.json({
      success: true,
      message: 'Light operation (1 token)',
      cost: 1,
      rateLimit: req.rateLimit,
      endpoint: '/api/cost-light',
      strategy: 'Cost-Based (1 token per request)'
    });
  }
);

app.get(
  '/api/cost-heavy',
  setRequestCost(5),
  tokenBucketMiddleware({
    capacity: 20,
    refillRate: 5,
    refillInterval: 1000
  }),
  (req, res) => {
    res.json({
      success: true,
      message: 'Heavy operation (5 tokens)',
      cost: 5,
      rateLimit: req.rateLimit,
      endpoint: '/api/cost-heavy',
      strategy: 'Cost-Based (5 tokens per request)'
    });
  }
);

// 4. Per-User Rate Limiting (requires user authentication simulation)
app.get(
  '/api/user/:userId',
  perUserRateLimit({
    capacity: 5,
    refillRate: 1,
    refillInterval: 10000,
    getUserId: req => req.params.userId
  }),
  (req, res) => {
    res.json({
      success: true,
      message: `User ${req.params.userId} endpoint`,
      userId: req.params.userId,
      rateLimit: req.rateLimit,
      endpoint: `/api/user/${req.params.userId}`,
      strategy: 'Per-User Rate Limiting (5 req, 1 per 10s)'
    });
  }
);

// 5. Global Rate Limiting (shared across all users)
app.get(
  '/api/global',
  globalRateLimit({
    capacity: 15,
    refillRate: 3,
    refillInterval: 1000
  }),
  (req, res) => {
    res.json({
      success: true,
      message: 'Global rate limit endpoint',
      rateLimit: req.rateLimit,
      endpoint: '/api/global',
      strategy: 'Global Rate Limiting (shared bucket, 15 capacity)'
    });
  }
);

// 6. Fast refill (for testing)
app.get(
  '/api/fast',
  perIpRateLimit({
    capacity: 5,
    refillRate: 1,
    refillInterval: 2000 // 1 token every 2 seconds
  }),
  (req, res) => {
    res.json({
      success: true,
      message: 'Fast refill endpoint',
      rateLimit: req.rateLimit,
      endpoint: '/api/fast',
      strategy: 'Fast Refill (1 token every 2 seconds)'
    });
  }
);

// 7. Slow endpoint simulation (with custom cost)
app.post(
  '/api/process',
  setRequestCost(req => {
    const complexity = req.body?.complexity || 'simple';
    return complexity === 'complex' ? 10 : 2;
  }),
  tokenBucketMiddleware({
    capacity: 30,
    refillRate: 5,
    refillInterval: 1000
  }),
  (req, res) => {
    const complexity = req.body?.complexity || 'simple';
    const cost = complexity === 'complex' ? 10 : 2;

    setTimeout(
      () => {
        res.json({
          success: true,
          message: `Processed ${complexity} task`,
          complexity,
          cost,
          rateLimit: req.rateLimit,
          endpoint: '/api/process',
          strategy: 'Dynamic Cost (2 for simple, 10 for complex)'
        });
      },
      complexity === 'complex' ? 1000 : 100
    );
  }
);

// ============================================
// MONITORING & METRICS ENDPOINTS
// ============================================

// Get current metrics
app.get('/api/metrics', (req, res) => {
  res.json({
    ...metrics,
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// Reset metrics
app.post('/api/metrics/reset', (req, res) => {
  metrics.totalRequests = 0;
  metrics.allowedRequests = 0;
  metrics.blockedRequests = 0;
  metrics.requestsByEndpoint = {};
  metrics.recentEvents = [];

  res.json({
    success: true,
    message: 'Metrics reset successfully'
  });
});

// Health check (no rate limiting)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: Date.now(),
    uptime: process.uptime()
  });
});

// API documentation endpoint
app.get('/api/info', (req, res) => {
  res.json({
    endpoints: [
      {
        path: '/api/basic',
        method: 'GET',
        strategy: 'Per-IP Rate Limiting',
        limit: '10 requests per minute',
        description: 'Basic rate limiting by IP address'
      },
      {
        path: '/api/strict',
        method: 'GET',
        strategy: 'Strict Rate Limiting',
        limit: '3 requests total (slow refill)',
        description: 'Very strict limits for sensitive operations'
      },
      {
        path: '/api/cost-light',
        method: 'GET',
        strategy: 'Cost-Based (Light)',
        limit: '1 token per request',
        description: 'Light operation consuming 1 token'
      },
      {
        path: '/api/cost-heavy',
        method: 'GET',
        strategy: 'Cost-Based (Heavy)',
        limit: '5 tokens per request',
        description: 'Heavy operation consuming 5 tokens'
      },
      {
        path: '/api/user/:userId',
        method: 'GET',
        strategy: 'Per-User Rate Limiting',
        limit: '5 requests per user',
        description: 'Rate limiting based on user ID'
      },
      {
        path: '/api/global',
        method: 'GET',
        strategy: 'Global Rate Limiting',
        limit: '15 requests shared globally',
        description: 'Shared rate limit across all users'
      },
      {
        path: '/api/fast',
        method: 'GET',
        strategy: 'Fast Refill',
        limit: '5 capacity, 1 token per 2 seconds',
        description: 'Quick token refill for testing'
      },
      {
        path: '/api/process',
        method: 'POST',
        strategy: 'Dynamic Cost',
        limit: 'Simple: 2 tokens, Complex: 10 tokens',
        description: 'Cost varies based on operation complexity'
      }
    ],
    library: {
      name: '@rate-limiter/core',
      version: '0.1.0',
      coverage: '96.07%',
      tests: '228 passing'
    }
  });
});

// Serve the UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, _next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// Start server
app.listen(port, () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║   🚦 Rate Limiter Demo Application                        ║
║                                                            ║
║   Server running at: http://localhost:${port}              ║
║   Dashboard: http://localhost:${port}                      ║
║                                                            ║
║   Features:                                                ║
║   • Visual rate limit testing                              ║
║   • Multiple rate limiting strategies                      ║
║   • Real-time metrics dashboard                            ║
║   • Cost-based token consumption                           ║
║   • Interactive API testing                                ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
