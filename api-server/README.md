# Rate Limiter API Server

**Universal REST API wrapper for the Rate Limiter library** - enabling ANY programming language to use token bucket rate limiting via simple HTTP requests.

## 🌟 Why This Matters

The Rate Limiter library is powerful but was limited to Node.js/JavaScript developers. This REST API wrapper makes it **universally accessible** to:

- 🐍 **Python** developers
- ☕ **Java** developers  
- 🐹 **Go** developers
- 🐘 **PHP** developers
- 💎 **Ruby** developers
- #️⃣ **C#** developers
- 🦀 **Rust** developers
- ...and **any language with HTTP client support**

## ✨ Features

- **RESTful API** - Standard HTTP methods (GET, POST, DELETE)
- **Token Bucket Algorithm** - Smooth traffic shaping with configurable capacity and refill rate
- **Adaptive Behavior** - Apply penalties for abuse, rewards for good behavior
- **Temporary Blocking** - Ban keys for specified durations
- **Health Checks** - Monitor server status and metrics
- **Docker Support** - One-command deployment with health checks
- **Production Ready** - Security headers, CORS, error handling, request logging
- **🎨 Interactive Showcase** - [Live web demo](./examples/web-showcase/) with 8+ language examples

## 🚀 Quick Start

### Option 1: Docker (Recommended)

```bash
# Clone the repository
git clone <repository-url>
cd rate-limiter-algorithm/api-server

# Start with Docker Compose
docker-compose up -d

# Verify it's running
curl http://localhost:8080/api/health
```

### Option 2: Node.js

```bash
# Install dependencies
npm install

# Start the server
npm start

# For development with auto-reload
npm run dev
```

The server will start on `http://localhost:8080` (configurable via `PORT` environment variable).

## 🎨 Interactive Showcase

**Try the live demo!** Open the [interactive web showcase](./examples/web-showcase/index.html) in your browser to:

- ✅ Test all API endpoints with live buttons
- ✅ View code examples in 8+ programming languages
- ✅ Copy-paste ready integration code
- ✅ See real-time API responses
- ✅ Learn best practices for each language

Languages included: JavaScript, Python, cURL, Java, Go, PHP, Ruby, C#

**Quick start:**
```bash
# Start the API server (in api-server directory)
node server.js

# Open showcase in browser
open examples/web-showcase/index.html
```

[📖 Full showcase documentation](./examples/web-showcase/README.md)

## 📖 API Reference

### Base URL

```
http://localhost:8080/api
```

All endpoints return JSON responses with the following structure:

```json
{
  "success": true,
  "key": "user-123",
  "tokens": 8.5,
  "capacity": 10,
  "timestamp": 1704067200000
}
```

Error responses include:

```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE",
  "timestamp": 1704067200000
}
```

---

### Health & Monitoring

#### `GET /api/health`

Check server health status.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600.5,
  "version": "1.0.0",
  "timestamp": 1704067200000,
  "activeLimiters": 15
}
```

#### `GET /api/metrics`

Get system metrics.

**Response:**
```json
{
  "totalRequests": 1000,
  "allowedRequests": 950,
  "blockedRequests": 50,
  "penaltiesApplied": 25,
  "rewardsApplied": 10,
  "successRate": 95.0
}
```

---

### Rate Limiting

#### `POST /api/v1/limiter/check`

Check if a request is allowed by the rate limiter.

**Request Body:**
```json
{
  "key": "user-123",
  "capacity": 100,
  "refillRate": 10
}
```

**Parameters:**
- `key` (required): Unique identifier (user ID, API key, IP address, etc.)
- `capacity` (optional): Maximum tokens (default: 100)
- `refillRate` (optional): Tokens refilled per second (default: 10)

**Success Response (200):**
```json
{
  "success": true,
  "allowed": true,
  "key": "user-123",
  "tokens": 99.0,
  "capacity": 100,
  "timestamp": 1704067200000
}
```

**Rate Limited Response (429):**
```json
{
  "success": false,
  "allowed": false,
  "key": "user-123",
  "tokens": 0,
  "capacity": 100,
  "retryAfter": 1.5,
  "timestamp": 1704067200000
}
```

#### `GET /api/v1/limiter/status/:key`

Get current status of a limiter.

**Response:**
```json
{
  "success": true,
  "key": "user-123",
  "tokens": 85.5,
  "capacity": 100,
  "isBlocked": false,
  "timestamp": 1704067200000
}
```

#### `GET /api/v1/limiters`

List all active limiters.

**Response:**
```json
{
  "success": true,
  "count": 3,
  "limiters": [
    {
      "key": "user-123",
      "tokens": 85.5,
      "capacity": 100,
      "isBlocked": false
    },
    {
      "key": "user-456",
      "tokens": 50.0,
      "capacity": 100,
      "isBlocked": false
    }
  ]
}
```

---

### Adaptive Behavior

#### `POST /api/v1/limiter/penalty`

Apply penalty for bad behavior (removes tokens).

**Request Body:**
```json
{
  "key": "user-123",
  "points": 10
}
```

**Response:**
```json
{
  "success": true,
  "key": "user-123",
  "penaltyApplied": 10,
  "remainingTokens": 80.0,
  "capacity": 100,
  "timestamp": 1704067200000
}
```

**Use Cases:**
- Failed login attempts
- Invalid requests
- Suspicious activity
- Spam detection

#### `POST /api/v1/limiter/reward`

Apply reward for good behavior (adds tokens).

**Request Body:**
```json
{
  "key": "user-123",
  "points": 5
}
```

**Response:**
```json
{
  "success": true,
  "key": "user-123",
  "rewardApplied": 5,
  "remainingTokens": 95.0,
  "capacity": 100,
  "timestamp": 1704067200000
}
```

**Use Cases:**
- Successful authentication
- Completing captcha
- Premium users
- Trusted behavior

---

### Blocking

#### `POST /api/v1/limiter/block`

Temporarily block a key.

**Request Body:**
```json
{
  "key": "spammer-123",
  "duration": 60000
}
```

**Parameters:**
- `key` (required): Identifier to block
- `duration` (required): Block duration in milliseconds

**Response:**
```json
{
  "success": true,
  "key": "spammer-123",
  "blocked": true,
  "blockedUntil": 1704067260000,
  "duration": 60000,
  "timestamp": 1704067200000
}
```

**Use Cases:**
- Spam detection
- Brute force protection
- Abuse prevention
- Temporary bans

#### `POST /api/v1/limiter/unblock`

Remove block from a key.

**Request Body:**
```json
{
  "key": "spammer-123"
}
```

**Response:**
```json
{
  "success": true,
  "key": "spammer-123",
  "unblocked": true,
  "timestamp": 1704067200000
}
```

---

### Management

#### `POST /api/v1/limiter/reset/:key`

Reset limiter to full capacity.

**Response:**
```json
{
  "success": true,
  "key": "user-123",
  "reset": true,
  "tokens": 100,
  "capacity": 100,
  "timestamp": 1704067200000
}
```

#### `DELETE /api/v1/limiter/:key`

Delete a limiter.

**Response:**
```json
{
  "success": true,
  "key": "user-123",
  "deleted": true,
  "timestamp": 1704067200000
}
```

---

## 📝 Examples

### curl

```bash
# Check rate limit
curl -X POST http://localhost:8080/api/v1/limiter/check \
  -H "Content-Type: application/json" \
  -d '{"key": "user-123", "capacity": 10, "refillRate": 2}'

# Apply penalty
curl -X POST http://localhost:8080/api/v1/limiter/penalty \
  -H "Content-Type: application/json" \
  -d '{"key": "user-123", "points": 5}'

# Block spammer
curl -X POST http://localhost:8080/api/v1/limiter/block \
  -H "Content-Type: application/json" \
  -d '{"key": "spammer-456", "duration": 60000}'

# Get status
curl http://localhost:8080/api/v1/limiter/status/user-123
```

**Full examples:** See [curl-examples.sh](examples/curl-examples.sh)

### Python

```python
import requests

# Initialize client
base_url = "http://localhost:8080"

# Check rate limit
response = requests.post(
    f"{base_url}/api/v1/limiter/check",
    json={"key": "user-123", "capacity": 10, "refillRate": 2}
)
result = response.json()
print(f"Allowed: {result['allowed']}, Tokens: {result['tokens']}")

# Apply penalty
response = requests.post(
    f"{base_url}/api/v1/limiter/penalty",
    json={"key": "user-123", "points": 5}
)
penalty = response.json()
print(f"Penalty applied: {penalty['penaltyApplied']}")
```

**Full client:** See [python-client.py](examples/python-client.py)

### Java

```java
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;

HttpClient client = HttpClient.newHttpClient();

// Check rate limit
String json = "{\"key\":\"user-123\",\"capacity\":10,\"refillRate\":2}";
HttpRequest request = HttpRequest.newBuilder()
    .uri(URI.create("http://localhost:8080/api/v1/limiter/check"))
    .header("Content-Type", "application/json")
    .POST(HttpRequest.BodyPublishers.ofString(json))
    .build();

HttpResponse<String> response = client.send(request, 
    HttpResponse.BodyHandlers.ofString());
System.out.println(response.body());
```

**Full client:** See [java-client.java](examples/java-client.java)

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```env
PORT=8080
NODE_ENV=production

# Optional: Redis for distributed rate limiting
# REDIS_URL=redis://localhost:6379
```

### Docker Configuration

**Dockerfile** - Uses Node 18 Alpine for minimal image size:
- Health checks every 30 seconds
- Runs as non-root user for security
- Production optimized (`npm ci --only=production`)

**docker-compose.yml** - Simple one-service setup:
- Auto-restart on failure
- Health checks enabled
- Optional Redis service (commented out)

To enable Redis for distributed rate limiting:
1. Uncomment the Redis service in `docker-compose.yml`
2. Set `REDIS_URL` environment variable
3. Restart the service

---

## 🧪 Testing

### Run Test Suite

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm test -- --coverage
```

### Manual Testing

```bash
# Start server
npm start

# In another terminal, run curl examples
bash examples/curl-examples.sh

# Or use Python client
python examples/python-client.py
```

---

## 🏗️ Architecture

### Storage Options

**In-Memory (Default)**
- Fast and simple
- Single server only
- Data lost on restart
- Perfect for development and small deployments

**Redis (Coming Soon)**
- Distributed rate limiting
- Survives server restarts
- Multiple servers share state
- Production recommended

### Token Bucket Algorithm

The API uses the **Token Bucket** algorithm:

1. Each limiter has a bucket with a maximum capacity
2. Tokens are added at a constant refill rate
3. Each request consumes 1 token
4. Requests are allowed if tokens are available
5. Requests are blocked (429) when bucket is empty

**Benefits:**
- Smooth traffic shaping
- Allows bursts up to capacity
- Fair rate limiting over time
- Configurable per key

---

## 🔒 Security

- **Helmet.js** - Sets security HTTP headers
- **CORS** - Cross-Origin Resource Sharing enabled
- **Non-root User** - Docker runs as 'node' user
- **Input Validation** - All requests validated
- **Error Handling** - No sensitive data in errors

---

## 📊 Use Cases

### API Rate Limiting

```javascript
// Before processing API request
const result = await fetch('http://localhost:8080/api/v1/limiter/check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: `api-key-${apiKey}`,
    capacity: 1000,
    refillRate: 10
  })
});

if (!result.allowed) {
  return { error: 'Rate limit exceeded', retryAfter: result.retryAfter };
}
```

### Login Protection

```javascript
// On failed login
await fetch('http://localhost:8080/api/v1/limiter/penalty', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: `login-${username}`,
    points: 10
  })
});

// Block after 5 failed attempts
const status = await fetch(`http://localhost:8080/api/v1/limiter/status/login-${username}`);
if (status.tokens < 1) {
  await fetch('http://localhost:8080/api/v1/limiter/block', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: `login-${username}`,
      duration: 3600000  // 1 hour
    })
  });
}
```

### Spam Detection

```javascript
// Check spam indicators
if (isSpam(message)) {
  // Apply heavy penalty
  await fetch('http://localhost:8080/api/v1/limiter/penalty', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: `user-${userId}`,
      points: 50
    })
  });
  
  // Block if tokens depleted
  const status = await checkStatus(userId);
  if (status.tokens < 1) {
    await blockKey(userId, 24 * 60 * 60 * 1000);  // 24 hours
  }
}
```

---

## 🚢 Deployment

### Docker

```bash
# Build image
docker build -t rate-limiter-api .

# Run container
docker run -p 8080:8080 rate-limiter-api

# Or use Docker Compose
docker-compose up -d
```

### Node.js (PM2)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start server.js --name rate-limiter-api

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rate-limiter-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rate-limiter-api
  template:
    metadata:
      labels:
        app: rate-limiter-api
    spec:
      containers:
      - name: rate-limiter-api
        image: rate-limiter-api:latest
        ports:
        - containerPort: 8080
        env:
        - name: PORT
          value: "8080"
        - name: NODE_ENV
          value: "production"
        livenessProbe:
          httpGet:
            path: /api/health
            port: 8080
          initialDelaySeconds: 30
          periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: rate-limiter-api
spec:
  selector:
    app: rate-limiter-api
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
```

---

## 🛠️ Development

### Project Structure

```
api-server/
├── server.js              # Main API server
├── package.json           # Dependencies and scripts
├── .env.example           # Environment variables template
├── Dockerfile             # Docker image definition
├── docker-compose.yml     # Docker Compose configuration
├── README.md              # This file
├── tests/
│   └── api.test.js        # Integration tests
└── examples/
    ├── curl-examples.sh   # curl command examples
    ├── python-client.py   # Python client wrapper
    └── java-client.java   # Java client wrapper
```

### Adding New Endpoints

1. Add route handler in `server.js`
2. Add corresponding test in `tests/api.test.js`
3. Update this README with documentation
4. Update examples in `examples/` folder

---

## 📚 Related Documentation

- [Algorithm Comparison](../docs/ALGORITHM_COMPARISON.md) - Compare rate limiting algorithms
- [Best Practices](../docs/BEST_PRACTICES.md) - Production deployment tips
- [Configuration Guide](../docs/CONFIGURATION.md) - Advanced configuration
- [Redis Distributed](../docs/guides/REDIS_DISTRIBUTED.md) - Redis setup guide

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Write tests for new functionality
4. Ensure all tests pass (`npm test`)
5. Commit changes (`git commit -m 'Add amazing feature'`)
6. Push to branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](../LICENSE) file for details.

---

## 💬 Support

- **Issues:** [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-repo/discussions)
- **Email:** support@example.com

---

## 🎯 Roadmap

- [x] RESTful API with 11 endpoints
- [x] Docker support with health checks
- [x] Comprehensive test suite
- [x] Python client example
- [x] Java client example
- [x] Interactive web showcase with 8+ languages
- [ ] Redis backend for distributed rate limiting
- [ ] WebSocket support for real-time updates
- [ ] Prometheus metrics export
- [ ] GraphQL API alternative
- [ ] Client SDKs (Go, Ruby, PHP, C#)

---

**Built with ❤️ by the Rate Limiter Team**
