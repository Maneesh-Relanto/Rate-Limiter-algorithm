# 📁 Configuration System

## Overview

The Rate Limiter now supports **external configuration files** for scalable, production-ready deployments.

## Why Configuration Files?

❌ **Before (Hard-coded)**:
```javascript
const limiter = new TokenBucket(100, 10); // Hard-coded values
```

✅ **After (Configurable)**:
```javascript
const config = configManager.getRateLimit('api.free');
const limiter = new TokenBucket(config.capacity, config.refillRate);
```

**Benefits**:
- 🔧 Change limits without code changes
- 🌍 Environment-specific settings (dev/staging/prod)
- 👥 Multi-tier systems (free/pro/enterprise)
- 💰 Cost-based operations
- ⚙️ Environment variable overrides
- 📊 Centralized configuration management

---

## Configuration Structure

### File: `config/rate-limits.json`

```json
{
  "rateLimits": {
    "api": {
      "free": {
        "capacity": 100,
        "refillRate": 1.67,
        "description": "Free tier: 100 requests per minute"
      }
    }
  },
  "environment": {
    "development": { "multiplier": 2.0 },
    "production": { "multiplier": 1.0 }
  }
}
```

---

## Usage

### Basic Usage

```javascript
const { getConfigManager } = require('./src/utils/config-manager');
const TokenBucket = require('./src/algorithms/javascript/token-bucket');

// Get config manager
const configManager = getConfigManager();

// Load configuration
const config = configManager.getRateLimit('api.free');

// Create rate limiter
const limiter = new TokenBucket(config.capacity, config.refillRate);
```

### Multi-Tier System

```javascript
// Free tier user
const freeConfig = configManager.getRateLimit('api.free');
// Returns: { capacity: 100, refillRate: 1.67 }

// Pro tier user
const proConfig = configManager.getRateLimit('api.pro');
// Returns: { capacity: 1000, refillRate: 16.67 }

// Enterprise tier user
const enterpriseConfig = configManager.getRateLimit('api.enterprise');
// Returns: { capacity: 10000, refillRate: 166.67 }
```

### Cost-Based Operations

```javascript
const readConfig = configManager.getRateLimit('operations.read');
// { capacity: 1000, refillRate: 100, cost: 1 }

const writeConfig = configManager.getRateLimit('operations.write');
// { capacity: 500, refillRate: 50, cost: 5 }

// Heavy operation costs more tokens
limiter.allowRequest(writeConfig.cost); // Consumes 5 tokens
```

### Environment Variables

```bash
# Set environment variables
export RATE_LIMIT_CAPACITY=500
export RATE_LIMIT_REFILL=50
```

```javascript
// Use environment variable, fallback to config
const config = configManager.getRateLimitFromEnv(
  'RATE_LIMIT',
  'api.free'  // fallback
);
```

### Environment-Specific Multipliers

```javascript
// Development: 2x limits
configManager.setEnvironment('development');
const devConfig = configManager.getRateLimit('api.free');
// Returns: { capacity: 200, refillRate: 3.34 }

// Production: Normal limits
configManager.setEnvironment('production');
const prodConfig = configManager.getRateLimit('api.free');
// Returns: { capacity: 100, refillRate: 1.67 }
```

---

## Available Configurations

### API Tiers
- `api.free` - 100 requests/minute
- `api.pro` - 1000 requests/minute
- `api.enterprise` - 10000 requests/minute

### Authentication
- `authentication.login` - 5 attempts/hour
- `authentication.passwordReset` - 3 attempts/hour
- `authentication.registration` - 10/hour

### Operations (Cost-based)
- `operations.read` - 1 token per operation
- `operations.write` - 5 tokens per operation
- `operations.bulkOperation` - 10 tokens per operation
- `operations.heavyQuery` - 20 tokens per operation

### File Uploads
- `fileUpload.small` - <1MB files
- `fileUpload.medium` - 1-10MB files
- `fileUpload.large` - 10-100MB files

### Endpoints
- `publicApi` - 60/minute
- `internalApi` - 10000/minute
- `webhook` - 1000/minute

---

## Examples

### Example 1: Multi-Tenant SaaS

```javascript
class SaaSAPI {
  constructor() {
    this.configManager = getConfigManager();
    this.limiters = new Map();
  }

  getLimiter(userId, tier) {
    const key = `${userId}:${tier}`;
    
    if (!this.limiters.has(key)) {
      const config = this.configManager.getRateLimit(`api.${tier}`);
      this.limiters.set(key, new TokenBucket(
        config.capacity,
        config.refillRate
      ));
    }
    
    return this.limiters.get(key);
  }

  async handleRequest(userId, tier, request) {
    const limiter = this.getLimiter(userId, tier);
    
    if (!limiter.allowRequest()) {
      throw new Error('Rate limit exceeded');
    }
    
    return this.processRequest(request);
  }
}
```

### Example 2: Cost-Based API

```javascript
class CostBasedAPI {
  constructor() {
    this.configManager = getConfigManager();
    this.limiters = new Map();
  }

  async handleRequest(userId, operation, data) {
    const config = this.configManager.getRateLimit(`operations.${operation}`);
    const limiter = this.getLimiterForUser(userId);
    
    if (!limiter.allowRequest(config.cost)) {
      const retryAfter = limiter.getTimeUntilNextToken();
      throw {
        error: 'Rate limit exceeded',
        retryAfter,
        cost: config.cost,
        operation
      };
    }
    
    return this.processOperation(operation, data);
  }
}
```

---

## Configuration Best Practices

### 1. Capacity Planning

```
requests_per_minute = capacity
OR
requests_per_minute = refillRate * 60

Example:
- Free tier: 100/min → capacity: 100, refillRate: 1.67
- Pro tier: 1000/min → capacity: 1000, refillRate: 16.67
```

### 2. Refill Rate Calculation

```javascript
// For X requests per minute:
refillRate = X / 60

// For X requests per hour:
refillRate = X / 3600

// Examples:
// 100 req/min: 100/60 = 1.67/sec
// 5 req/hour: 5/3600 = 0.00139/sec
```

### 3. Cost Assignment

```
Light operations (read, list):     1 token
Medium operations (create, update): 5 tokens
Heavy operations (bulk, complex):   10-20 tokens
Very heavy (exports, reports):      50+ tokens
```

### 4. Environment Multipliers

```
Development: 2.0x  (easier testing)
Staging:     1.5x  (close to prod)
Production:  1.0x  (actual limits)
```

---

## Run Example

```bash
# Run configuration-based example
npm run example:config
```

---

## API Reference

### ConfigManager

#### `getRateLimit(name)`
Get configuration by name (supports dot notation).

```javascript
configManager.getRateLimit('api.free');
configManager.getRateLimit('authentication.login');
```

#### `getRateLimitFromEnv(envVar, fallback)`
Get configuration from environment variables.

```javascript
configManager.getRateLimitFromEnv('RATE_LIMIT', 'default');
```

#### `listConfigurations()`
List all available configurations.

```javascript
const configs = configManager.listConfigurations();
```

#### `setEnvironment(env)`
Set environment for multiplier application.

```javascript
configManager.setEnvironment('development');
```

#### `reload()`
Reload configuration from file.

```javascript
configManager.reload();
```

---

## Deployment

### Docker

```dockerfile
# Copy config
COPY config/rate-limits.json /app/config/

# Or use environment variables
ENV RATE_LIMIT_CAPACITY=500
ENV RATE_LIMIT_REFILL=50
```

### Kubernetes

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: rate-limits
data:
  rate-limits.json: |
    {
      "rateLimits": {
        "api": { ... }
      }
    }
```

### AWS/Cloud

```bash
# Store in Parameter Store / Secrets Manager
aws ssm put-parameter \
  --name /app/rate-limits \
  --value file://config/rate-limits.json \
  --type String
```

---

**Next**: See [examples/javascript/config-based-example.js](examples/javascript/config-based-example.js) for full examples.
