# 🚦 Rate Limiter Demo Application

An interactive web application to test and visualize the rate limiting library in action.

## Features

✨ **8 Test Endpoints** with different rate limiting strategies:
- Basic per-IP rate limiting (10 req/min)
- Strict rate limiting (3 req with slow refill)
- Cost-based rate limiting (light & heavy operations)
- Per-user rate limiting
- Global rate limiting (shared bucket)
- Fast refill testing
- Dynamic cost calculation

📊 **Real-Time Monitoring**:
- Live request statistics
- Success/failure rates
- Request distribution by endpoint
- Live event stream

🎯 **Interactive Testing**:
- One-click endpoint testing
- Load testing (10 req/sec)
- Test all endpoints sequentially
- Visual rate limit feedback

## Quick Start

```bash
# From the demo-app directory
cd examples/demo-app

# Install dependencies (if not already installed from root)
npm install

# Start the demo server
node server.js

# Open your browser
# Visit: http://localhost:3000
```

## Usage

### Testing Individual Endpoints

1. Click on any endpoint card in the left panel
2. Watch the response appear in the right panel
3. See rate limit information update in real-time
4. Monitor remaining tokens and reset time

### Running Load Tests

1. Click "Run Load Test" button
2. Enter endpoint path (e.g., `/api/basic`)
3. Watch 10 requests execute at 10 req/sec
4. See how many pass vs get rate limited

### Monitoring Metrics

1. Switch to "Metrics" tab
2. View request distribution by endpoint
3. See allowed vs blocked requests

### Viewing Live Events

1. Switch to "Live Events" tab
2. Watch requests flow in real-time
3. See timestamps and success/failure status

## Available Endpoints

### 1. `/api/basic` (GET)
- **Strategy**: Per-IP Rate Limiting
- **Limit**: 10 requests per minute
- **Use Case**: Standard API endpoint protection

### 2. `/api/strict` (GET)
- **Strategy**: Strict Rate Limiting
- **Limit**: 3 requests total, slow refill (1 per minute)
- **Use Case**: Sensitive operations (e.g., password reset)

### 3. `/api/cost-light` (GET)
- **Strategy**: Cost-Based (Light)
- **Cost**: 1 token per request
- **Use Case**: Read operations

### 4. `/api/cost-heavy` (GET)
- **Strategy**: Cost-Based (Heavy)
- **Cost**: 5 tokens per request
- **Use Case**: Complex queries or write operations

### 5. `/api/user/:userId` (GET)
- **Strategy**: Per-User Rate Limiting
- **Limit**: 5 requests per user
- **Use Case**: User-specific quotas

### 6. `/api/global` (GET)
- **Strategy**: Global Rate Limiting
- **Limit**: 15 requests shared across all users
- **Use Case**: Limited resources (e.g., AI API calls)

### 7. `/api/fast` (GET)
- **Strategy**: Fast Refill
- **Limit**: 5 capacity, refills 1 token every 2 seconds
- **Use Case**: Quick testing

### 8. `/api/process` (POST)
- **Strategy**: Dynamic Cost
- **Cost**: 2 tokens (simple), 10 tokens (complex)
- **Use Case**: Variable-cost operations

## API Endpoints

### Monitoring

- `GET /api/metrics` - Get current metrics
- `POST /api/metrics/reset` - Reset all metrics
- `GET /api/info` - Get endpoint information
- `GET /health` - Health check (no rate limiting)

## Architecture

```
demo-app/
├── server.js          # Express backend with rate limiting
├── public/
│   ├── index.html    # Frontend UI
│   ├── app.js        # Frontend logic
│   └── styles.css    # Styling
└── README.md         # This file
```

## Rate Limiting Strategies Demonstrated

### 1. **Per-IP Rate Limiting**
```javascript
perIpRateLimit({
  capacity: 10,
  refillRate: 10,
  refillInterval: 60000
})
```

### 2. **Per-User Rate Limiting**
```javascript
perUserRateLimit({
  capacity: 5,
  refillRate: 1,
  getUserId: (req) => req.params.userId
})
```

### 3. **Global Rate Limiting**
```javascript
globalRateLimit({
  capacity: 15,
  refillRate: 3
})
```

### 4. **Cost-Based Rate Limiting**
```javascript
setRequestCost(5)  // Heavy operation
tokenBucketMiddleware({
  capacity: 20,
  refillRate: 5
})
```

## Testing Scenarios

### Scenario 1: Basic Rate Limiting
1. Click `/api/basic` 10 times quickly
2. 11th request should be blocked
3. Wait 6 seconds, try again (should succeed)

### Scenario 2: Cost-Based Limiting
1. Click `/api/cost-light` (costs 1 token)
2. Click `/api/cost-heavy` (costs 5 tokens)
3. Notice how heavy operations consume more tokens

### Scenario 3: Per-User Limits
1. Click `/api/user/user1` 5 times (exhausts limit)
2. Click `/api/user/user2` (should succeed - different user)

### Scenario 4: Global Limits
1. Run load test on `/api/global`
2. All users share the same bucket
3. Once limit is hit, everyone is blocked

## Metrics Tracked

- **Total Requests**: All requests made
- **Allowed Requests**: Requests that passed rate limiting
- **Blocked Requests**: Requests that were rate limited
- **Success Rate**: Percentage of allowed requests
- **Per-Endpoint Stats**: Distribution by endpoint
- **Live Events**: Real-time event stream

## Troubleshooting

### Port Already in Use
```bash
# Change port in server.js
const port = 3001;  // Use different port
```

### Rate Limits Not Resetting
```bash
# Click "Reset Metrics" button
# Or restart the server
```

## Next Steps

- Try modifying rate limits in `server.js`
- Add your own custom endpoints
- Test with multiple browser tabs
- Monitor behavior under load

## Learn More

- [Main Documentation](../../docs/)
- [Express Middleware Guide](../../EXPRESS_MIDDLEWARE_GUIDE.md)
- [Algorithm Comparison](../../docs/ALGORITHM_COMPARISON.md)
- [Best Practices](../../docs/BEST_PRACTICES.md)

---

Built with ❤️ using **@rate-limiter/core** | 96% Test Coverage | Production Ready
