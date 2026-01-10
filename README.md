# 🚦 Rate Limiter Algorithms

> A comprehensive, well-documented collection of rate limiting algorithms with practical implementations, interactive playgrounds, and detailed analysis.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Documentation](https://img.shields.io/badge/docs-comprehensive-blue.svg)](docs/)

## 🎯 Project Mission

To provide the **simplest yet most practical** rate limiting implementations with **heavy documentation**, clear **setup guides**, and **interactive playgrounds** - making rate limiting accessible to developers at all levels.

## 🌟 Why This Project?

Our differentiating factors:
- ✨ **Simple & Practical**: Clean, production-ready code
- 📚 **Heavy Documentation**: Deep-dive into concepts, use cases, and trade-offs
- 🚀 **Setup Guides**: Step-by-step installation for all platforms
- 🎮 **Interactive Playgrounds**: Test and visualize algorithms in real-time
- 🏭 **Industry Standards**: Following best practices and folder structure
- 🔬 **Benchmarks**: Performance comparisons across algorithms

## ✅ Current Status

### Implemented Algorithms
- ✅ **Token Bucket** (JavaScript) - 100% tested, 100% coverage
  - Full implementation with cost-based operations
  - Configuration management system
  - 23 comprehensive unit tests
  
- ✅ **Redis Token Bucket** (JavaScript) - Distributed implementation
  - Multi-server shared state using Redis
  - Atomic operations with Lua scripts
  - Fail-open error handling
  - 38 comprehensive unit tests

### Testing
- **127/127 tests passing** ✅
- **98.59% code coverage** on all implementations
- Comprehensive test suites for algorithms and utilities
- Distributed scenarios tested
- Express middleware integration tests

### Configuration
- ✅ JSON-based configuration system
- ✅ Environment variable support
- ✅ Multi-tier presets (Free, Pro, Enterprise)
- ✅ Environment-specific multipliers (dev/staging/prod)
- ✅ Redis connection configuration
- ✅ 47 comprehensive tests for configuration management

### Distributed Systems
- ✅ Redis-based rate limiting for multi-server deployments
- ✅ Atomic operations preventing race conditions
- ✅ Health checks and graceful degradation
- ✅ Support for multiple Redis client libraries

### Express.js Integration
- ✅ Production-ready middleware for Express applications
- ✅ In-memory and Redis-backed implementations
- ✅ Helper functions (globalRateLimit, perIpRateLimit, perUserRateLimit, perEndpointRateLimit)
- ✅ Cost-based token consumption
- ✅ Custom error handlers and monitoring callbacks
- ✅ Standard RateLimit headers (draft spec) + legacy X-RateLimit headers
- ✅ 18 integration tests
- ✅ Complete example application with 8 real-world scenarios
- 📚 **[Express Middleware Guide →](EXPRESS_MIDDLEWARE_GUIDE.md)**

---

## 📚 What is Rate Limiting?

Rate limiting controls the rate at which users or services can access resources. It's essential for:
- Preventing system overload
- Protecting against DDoS attacks
- Ensuring fair resource distribution
- Managing API costs
- Maintaining service quality

**[Read the full deep-dive →](docs/WHY_RATE_LIMITING.md)**

## 🗂️ Project Structure

```
rate-limiter/
├── docs/                    # Comprehensive documentation
│   ├── WHY_RATE_LIMITING.md
│   ├── algorithms/          # Algorithm explanations
│   ├── guides/              # Setup and usage guides
│   └── benchmarks/          # Performance analysis
├── src/                     # Source implementations
│   ├── algorithms/          # Core algorithm implementations
│   ├── utils/               # Helper utilities
│   └── visualizers/         # Visualization tools
├── playground/              # Interactive examples
│   ├── web/                 # Web-based playground
│   └── cli/                 # Command-line playground
├── examples/                # Framework integrations
│   ├── express/
│   ├── flask/
│   └── spring-boot/
├── tests/                   # Test suites
└── benchmarks/              # Performance tests
```

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/rate-limiter.git
cd rate-limiter

# See detailed setup guide
# For documentation: see docs/guides/SETUP.md
```

## 🎮 Try the Playground

Interactive playground to test and visualize different rate limiting algorithms in action!

```bash
# Coming soon - web and CLI playgrounds
```

## 📖 Documentation

- **[Why Rate Limiting?](docs/WHY_RATE_LIMITING.md)** - Deep dive into the need and benefits
- **[Algorithm Comparison](docs/ALGORITHM_COMPARISON.md)** - Detailed analysis of each algorithm
- **[Setup Guide](docs/guides/SETUP.md)** - Installation instructions
- **[API Reference](docs/API_REFERENCE.md)** - Complete API documentation
- **[Best Practices](docs/BEST_PRACTICES.md)** - Production deployment guide
- **[Redis Distributed Guide](REDIS_DISTRIBUTED.md)** - Multi-server deployments with Redis
- **[Express Middleware Guide](EXPRESS_MIDDLEWARE_GUIDE.md)** - Express.js integration

## 🚀 Framework Integration

### Express.js

Quick example with Express:

```javascript
const express = require('express');
const { perIpRateLimit } = require('./src/middleware/express/token-bucket-middleware');

const app = express();

// Apply rate limiting to all routes
app.use(perIpRateLimit({
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000 // 10 requests per second per IP
}));

app.get('/api/data', (req, res) => {
  res.json({ 
    message: 'Success!',
    remaining: req.rateLimit.remaining 
  });
});

app.listen(3000);
```

**[See full Express guide →](EXPRESS_MIDDLEWARE_GUIDE.md)**

### Redis (Distributed)

For multi-server deployments:

```javascript
const Redis = require('ioredis');
const { tokenBucketMiddleware } = require('./src/middleware/express/redis-token-bucket-middleware');

const redis = new Redis();

app.use(tokenBucketMiddleware({
  redis,
  capacity: 100,
  refillRate: 10,
  refillInterval: 1000
}));
```

**[See full Redis guide →](REDIS_DISTRIBUTED.md)**

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with ❤️ for the open-source community.

---

**[⭐ Star this repo](https://github.com/yourusername/rate-limiter)** if you find it helpful!
