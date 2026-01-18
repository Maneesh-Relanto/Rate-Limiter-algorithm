/**
 * Rate Limiter REST API Server
 * 
 * Language-agnostic rate limiting via HTTP API
 * Supports: Python, Java, Go, PHP, Ruby, C#, and any HTTP client
 * 
 * @author Rate Limiter Contributors
 * @license MIT
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

// Import rate limiter
const TokenBucket = require('../src/algorithms/javascript/token-bucket');

const app = express();
const PORT = process.env.PORT || 8080;

// ==============================================
// MIDDLEWARE
// ==============================================

app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS for all origins
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ==============================================
// RATE LIMITER STORAGE
// ==============================================

// In-memory storage (for stateless deployments, consider Redis)
const limiters = new Map();
const limiterConfigs = new Map();

// Metrics
let metrics = {
  totalRequests: 0,
  allowedRequests: 0,
  blockedRequests: 0,
  penaltiesApplied: 0,
  rewardsApplied: 0
};

/**
 * Get or create a rate limiter for a key
 */
function getLimiter(key, config = {}) {
  if (!limiters.has(key)) {
    const capacity = config.capacity || 100;
    const refillRate = config.refillRate || 10;
    const limiter = new TokenBucket(capacity, refillRate);
    limiters.set(key, limiter);
    limiterConfigs.set(key, { capacity, refillRate });
  }
  return limiters.get(key);
}

// ==============================================
// API ROUTES
// ==============================================

/**
 * Health Check
 * GET /api/health
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    activeLimiters: limiters.size
  });
});

/**
 * Get Metrics
 * GET /api/metrics
 */
app.get('/api/metrics', (req, res) => {
  const successRate = metrics.totalRequests > 0 
    ? ((metrics.allowedRequests / metrics.totalRequests) * 100).toFixed(2)
    : 100;

  res.json({
    ...metrics,
    successRate: `${successRate}%`,
    activeLimiters: limiters.size,
    timestamp: new Date().toISOString()
  });
});

/**
 * Check Rate Limit
 * POST /api/v1/limiter/check
 * 
 * Body:
 * {
 *   "key": "user-123",
 *   "cost": 1,  // optional, default 1
 *   "capacity": 100,  // optional, for new limiters
 *   "refillRate": 10  // optional, for new limiters
 * }
 */
app.post('/api/v1/limiter/check', (req, res) => {
  try {
    const { key, cost = 1, capacity, refillRate } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Key is required',
        code: 'MISSING_KEY'
      });
    }

    const limiter = getLimiter(key, { capacity, refillRate });
    const allowed = limiter.allowRequest(cost);

    metrics.totalRequests++;
    if (allowed) {
      metrics.allowedRequests++;
    } else {
      metrics.blockedRequests++;
    }

    const state = limiter.getState();

    res.status(allowed ? 200 : 429).json({
      success: allowed,
      allowed,
      key,
      tokens: state.availableTokens,
      capacity: state.capacity,
      retryAfter: allowed ? 0 : limiter.getTimeUntilNextToken(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Apply Penalty
 * POST /api/v1/limiter/penalty
 * 
 * Body:
 * {
 *   "key": "user-123",
 *   "points": 5  // tokens to remove
 * }
 */
app.post('/api/v1/limiter/penalty', (req, res) => {
  try {
    const { key, points = 1 } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Key is required',
        code: 'MISSING_KEY'
      });
    }

    const limiter = getLimiter(key);
    const result = limiter.penalty(points);
    metrics.penaltiesApplied++;

    res.json({
      success: true,
      key,
      penaltyApplied: result.penaltyApplied,
      remainingTokens: result.remainingTokens,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Apply Reward
 * POST /api/v1/limiter/reward
 * 
 * Body:
 * {
 *   "key": "user-123",
 *   "points": 10  // tokens to add
 * }
 */
app.post('/api/v1/limiter/reward', (req, res) => {
  try {
    const { key, points = 1 } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Key is required',
        code: 'MISSING_KEY'
      });
    }

    const limiter = getLimiter(key);
    const result = limiter.reward(points);
    metrics.rewardsApplied++;

    res.json({
      success: true,
      key,
      rewardApplied: result.rewardApplied,
      remainingTokens: result.remainingTokens,
      cappedAtCapacity: result.cappedAtCapacity,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Block a Key
 * POST /api/v1/limiter/block
 * 
 * Body:
 * {
 *   "key": "user-123",
 *   "duration": 60000  // milliseconds
 * }
 */
app.post('/api/v1/limiter/block', (req, res) => {
  try {
    const { key, duration = 60000 } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Key is required',
        code: 'MISSING_KEY'
      });
    }

    const limiter = getLimiter(key);
    const result = limiter.block(duration);

    res.json({
      success: true,
      key,
      blocked: true,
      blockDuration: duration,
      blockedUntil: new Date(result.blockUntil).toISOString(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Unblock a Key
 * POST /api/v1/limiter/unblock
 * 
 * Body:
 * {
 *   "key": "user-123"
 * }
 */
app.post('/api/v1/limiter/unblock', (req, res) => {
  try {
    const { key } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        error: 'Key is required',
        code: 'MISSING_KEY'
      });
    }

    const limiter = getLimiter(key);
    const result = limiter.unblock();

    res.json({
      success: true,
      key,
      unblocked: true,
      wasBlocked: result.wasBlocked,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Get Limiter Status
 * GET /api/v1/limiter/status/:key
 */
app.get('/api/v1/limiter/status/:key', (req, res) => {
  try {
    const { key } = req.params;

    if (!limiters.has(key)) {
      return res.status(404).json({
        success: false,
        error: 'Limiter not found',
        code: 'NOT_FOUND',
        key
      });
    }

    const limiter = getLimiter(key);
    const state = limiter.getState(true);  // Get detailed state with isBlocked
    const config = limiterConfigs.get(key);

    res.json({
      success: true,
      key,
      tokens: state.availableTokens,
      capacity: state.capacity,
      isBlocked: state.isBlocked,
      blockTimeRemaining: state.isBlocked ? limiter.getBlockTimeRemaining() : 0,
      config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Reset Limiter
 * POST /api/v1/limiter/reset/:key
 */
app.post('/api/v1/limiter/reset/:key', (req, res) => {
  try {
    const { key } = req.params;
    const { tokens } = req.body || {};

    if (!limiters.has(key)) {
      return res.status(404).json({
        success: false,
        error: 'Limiter not found',
        code: 'NOT_FOUND',
        key
      });
    }

    const limiter = getLimiter(key);
    const result = limiter.reset(tokens);

    res.json({
      success: true,
      key,
      reset: true,
      tokens: result.newTokens,
      capacity: result.capacity,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Reset error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * Delete Limiter
 * DELETE /api/v1/limiter/:key
 */
app.delete('/api/v1/limiter/:key', (req, res) => {
  try {
    const { key } = req.params;

    if (!limiters.has(key)) {
      return res.status(404).json({
        success: false,
        error: 'Limiter not found',
        code: 'NOT_FOUND',
        key
      });
    }

    limiters.delete(key);
    limiterConfigs.delete(key);

    res.json({
      success: true,
      key,
      deleted: true,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

/**
 * List All Limiters
 * GET /api/v1/limiters
 */
app.get('/api/v1/limiters', (req, res) => {
  try {
    const allLimiters = [];

    for (const [key, limiter] of limiters.entries()) {
      const state = limiter.getState();
      const config = limiterConfigs.get(key);

      allLimiters.push({
        key,
        tokens: Math.floor(state.tokens),
        capacity: state.capacity,
        isBlocked: state.isBlocked,
        config
      });
    }

    res.json({
      success: true,
      count: allLimiters.length,
      limiters: allLimiters,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// ==============================================
// ERROR HANDLERS
// ==============================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ==============================================
// SERVER START
// ==============================================

if (require.main === module) {
  app.listen(PORT, () => {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║   🚦 Rate Limiter API Server                              ║');
    console.log('║   Language-Agnostic Rate Limiting via HTTP                ║');
    console.log('║                                                           ║');
    console.log(`║   Server: http://localhost:${PORT}                          ║`);
    console.log(`║   Health: http://localhost:${PORT}/api/health              ║`);
    console.log(`║   Metrics: http://localhost:${PORT}/api/metrics            ║`);
    console.log('║                                                           ║');
    console.log('║   📚 API Docs: See README.md                              ║');
    console.log('║   🐳 Docker: docker-compose up                            ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');
  });
}

module.exports = app; // For testing
