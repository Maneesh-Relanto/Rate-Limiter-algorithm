/**
 * Express API with Rate Limiting Example
 * 
 * Demonstrates various rate limiting strategies in a real Express application.
 * Includes per-user, per-IP, per-endpoint, and cost-based rate limiting.
 */

const express = require('express');
const {
  tokenBucketMiddleware,
  perUserRateLimit,
  perIpRateLimit,
  perEndpointRateLimit,
  globalRateLimit,
  setRequestCost
} = require('../../src/middleware/express/token-bucket-middleware');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.json());

// Example 1: Global Rate Limiting
// Limits all requests across the entire API
console.log('\n📊 Example 1: Global Rate Limiting');
console.log('   All requests limited to 1000 per minute globally\n');

app.use('/api/public', globalRateLimit({
  capacity: 1000,
  refillRate: 16.67 // 1000 per minute
}));

app.get('/api/public/status', (req, res) => {
  res.json({ status: 'ok', message: 'Public API' });
});

// Example 2: Per-IP Rate Limiting
// Each IP address has its own rate limit
console.log('📊 Example 2: Per-IP Rate Limiting');
console.log('   Each IP limited to 100 requests per minute\n');

app.use('/api/guest', perIpRateLimit({
  capacity: 100,
  refillRate: 1.67 // 100 per minute
}));

app.get('/api/guest/data', (req, res) => {
  res.json({
    message: 'Guest data',
    rateLimit: req.rateLimit
  });
});

// Example 3: Per-User Rate Limiting
// Authenticated users have their own rate limits
console.log('📊 Example 3: Per-User Rate Limiting');
console.log('   Each authenticated user limited to 500 requests per minute\n');

// Simple auth middleware (for demo purposes)
function mockAuth(req, res, next) {
  req.user = { id: req.headers['x-user-id'] || null };
  next();
}

app.use('/api/user', mockAuth, perUserRateLimit({
  capacity: 500,
  refillRate: 8.33, // 500 per minute
  getUserId: (req) => req.user?.id
}));

app.get('/api/user/profile', (req, res) => {
  res.json({
    user: req.user,
    rateLimit: req.rateLimit
  });
});

// Example 4: Per-Endpoint Rate Limiting
// Different endpoints have different limits
console.log('📊 Example 4: Per-Endpoint Rate Limiting');
console.log('   Each endpoint has independent rate limits\n');

// Sensitive endpoint with stricter limits
app.post('/api/auth/login',
  perEndpointRateLimit({
    capacity: 5,
    refillRate: 0.083 // 5 per hour
  }),
  (req, res) => {
    res.json({ token: 'mock-jwt-token' });
  }
);

// Password reset with moderate limits
app.post('/api/auth/reset-password',
  perEndpointRateLimit({
    capacity: 3,
    refillRate: 0.017 // 3 per hour  
  }),
  (req, res) => {
    res.json({ message: 'Password reset email sent' });
  }
);

// Example 5: Cost-Based Rate Limiting
// Different operations consume different amounts of tokens
console.log('📊 Example 5: Cost-Based Rate Limiting');
console.log('   Operations have different costs in tokens\n');

app.use('/api/operations', tokenBucketMiddleware({
  capacity: 1000,
  refillRate: 16.67
}));

// Cheap operation: 1 token
app.get('/api/operations/read', setRequestCost(1), (req, res) => {
  res.json({
    operation: 'read',
    cost: 1,
    rateLimit: req.rateLimit
  });
});

// Moderate operation: 5 tokens
app.post('/api/operations/write', setRequestCost(5), (req, res) => {
  res.json({
    operation: 'write',
    cost: 5,
    rateLimit: req.rateLimit
  });
});

// Expensive operation: 20 tokens
app.post('/api/operations/analytics', setRequestCost(20), (req, res) => {
  res.json({
    operation: 'analytics',
    cost: 20,
    rateLimit: req.rateLimit
  });
});

// Bulk operation: 100 tokens
app.post('/api/operations/bulk-import', setRequestCost(100), (req, res) => {
  res.json({
    operation: 'bulk-import',
    cost: 100,
    rateLimit: req.rateLimit
  });
});

// Example 6: Skip Rate Limiting for Certain Requests
console.log('📊 Example 6: Conditional Rate Limiting');
console.log('   Health checks and admin requests skip rate limiting\n');

app.use('/api/protected', tokenBucketMiddleware({
  capacity: 100,
  refillRate: 1.67,
  skip: (req) => {
    // Skip health checks
    if (req.path === '/health') {return true;}
    // Skip admin users
    if (req.headers['x-admin'] === 'true') {return true;}
    return false;
  }
}));

app.get('/api/protected/health', (req, res) => {
  res.json({ healthy: true, rateLimited: false });
});

app.get('/api/protected/data', (req, res) => {
  res.json({
    data: 'protected content',
    rateLimit: req.rateLimit
  });
});

// Example 7: Custom Error Handler
console.log('📊 Example 7: Custom Error Handling');
console.log('   Custom response when rate limit is exceeded\n');

app.use('/api/custom', tokenBucketMiddleware({
  capacity: 10,
  refillRate: 1,
  handler: (req, res) => {
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'You have exceeded the rate limit. Please slow down.',
        retryAfter: res.getHeader('Retry-After'),
        limit: req.rateLimit.limit,
        remaining: req.rateLimit.remaining,
        resetTime: new Date(req.rateLimit.resetTime).toISOString()
      }
    });
  }
}));

app.get('/api/custom/data', (req, res) => {
  res.json({ data: 'custom error handler demo' });
});

// Example 8: Monitoring and Callbacks
console.log('📊 Example 8: Monitoring with Callbacks');
console.log('   Log when rate limits are reached\n');

const rateLimitMetrics = {
  exceeded: 0,
  totalRequests: 0
};

app.use('/api/monitored', tokenBucketMiddleware({
  capacity: 50,
  refillRate: 5,
  onLimitReached: (req, res) => {
    rateLimitMetrics.exceeded++;
    console.log(`⚠️  Rate limit exceeded for ${req.ip} at ${new Date().toISOString()}`);
    console.log(`   Endpoint: ${req.method} ${req.path}`);
    console.log(`   Total exceeded: ${rateLimitMetrics.exceeded}`);
  }
}));

// Middleware to count all requests
app.use('/api/monitored', (req, res, next) => {
  rateLimitMetrics.totalRequests++;
  next();
});

app.get('/api/monitored/resource', (req, res) => {
  res.json({
    resource: 'monitored data',
    rateLimit: req.rateLimit
  });
});

app.get('/api/monitored/metrics', (req, res) => {
  res.json({
    metrics: rateLimitMetrics,
    rejectionRate: ((rateLimitMetrics.exceeded / rateLimitMetrics.totalRequests) * 100).toFixed(2) + '%'
  });
});

// Root endpoint with API information
app.get('/', (req, res) => {
  res.json({
    message: 'Rate Limiting Demo API',
    examples: [
      { path: '/api/public/status', description: 'Global rate limiting' },
      { path: '/api/guest/data', description: 'Per-IP rate limiting' },
      { path: '/api/user/profile', description: 'Per-user rate limiting (add X-User-Id header)' },
      { path: 'POST /api/auth/login', description: 'Strict endpoint limits' },
      { path: '/api/operations/read', description: 'Cost-based: 1 token' },
      { path: 'POST /api/operations/write', description: 'Cost-based: 5 tokens' },
      { path: 'POST /api/operations/analytics', description: 'Cost-based: 20 tokens' },
      { path: 'POST /api/operations/bulk-import', description: 'Cost-based: 100 tokens' },
      { path: '/api/protected/health', description: 'Skips rate limiting' },
      { path: '/api/custom/data', description: 'Custom error handler' },
      { path: '/api/monitored/resource', description: 'With monitoring callbacks' },
      { path: '/api/monitored/metrics', description: 'View monitoring metrics' }
    ],
    headers: {
      'RateLimit-Limit': 'Maximum requests allowed',
      'RateLimit-Remaining': 'Requests remaining in current window',
      'RateLimit-Reset': 'Unix timestamp when limit resets',
      'Retry-After': 'Seconds to wait before retry (on 429 error)'
    }
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 Rate Limiting Demo Server running on http://localhost:${PORT}`);
    console.log(`${'='.repeat(70)}\n`);
    console.log('Test the API with curl or your browser:');
    console.log(`  curl http://localhost:${PORT}/api/public/status`);
    console.log(`  curl http://localhost:${PORT}/api/guest/data`);
    console.log(`  curl -H "X-User-Id: user123" http://localhost:${PORT}/api/user/profile`);
    console.log('\nPress Ctrl+C to stop the server\n');
  });
}

module.exports = app;
