# 🎮 Playground Overview

Welcome to the Rate Limiter Playground! This interactive environment lets you test, visualize, and understand different rate limiting algorithms in real-time.

## 📁 Structure

```
playground/
├── web/                    # Web-based interactive playground
│   ├── public/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── algorithms/    # Algorithm implementations
│   │   └── visualizers/   # Visualization logic
│   └── package.json
│
└── cli/                    # Command-line playground
    ├── index.js           # Main CLI entry
    ├── demos/             # Demo scenarios
    └── package.json
```

## 🌐 Web Playground

### Features

- **Interactive Visualization**: See algorithms in action
- **Real-time Testing**: Send virtual requests and see responses
- **Algorithm Comparison**: Run multiple algorithms side-by-side
- **Customizable Parameters**: Adjust limits, windows, and rates
- **Performance Metrics**: View throughput, latency, rejection rates
- **Scenario Testing**: Pre-built scenarios (DDoS, burst, steady)

### Quick Start

```bash
cd playground/web
npm install
npm start
# Open http://localhost:3000
```

### Usage

1. **Select Algorithm**: Choose from dropdown
2. **Configure**: Set capacity, rate, window size
3. **Send Requests**: Click or use auto-sender
4. **Observe**: Watch real-time visualization
5. **Compare**: Add another algorithm to compare

### Screenshots

```
[Token Bucket Visualization]
Capacity: ████████░░  80/100
Rate: 10 tokens/sec
Requests: 45 allowed, 5 rejected

[Request Timeline]
0s  ✅✅✅✅✅
1s  ✅✅✅✅❌
2s  ✅✅✅✅✅
```

## 💻 CLI Playground

### Features

- **Interactive Prompts**: Guided experience
- **Multiple Scenarios**: Pre-built test scenarios
- **ASCII Visualization**: Terminal-based graphs
- **Benchmarking**: Performance testing
- **Scripting Support**: Automated testing

### Quick Start

```bash
cd playground/cli
npm install
npm run playground
```

### Available Commands

```bash
# Start interactive mode
npm run playground

# Run specific demo
npm run demo:burst
npm run demo:ddos
npm run demo:steady

# Run benchmarks
npm run benchmark

# Compare algorithms
npm run compare
```

### Interactive Mode

```
🚦 Rate Limiter Playground

Select an algorithm:
  1. Token Bucket
  2. Leaky Bucket
  3. Fixed Window Counter
  4. Sliding Window Log
  5. Sliding Window Counter

> 1

Configure Token Bucket:
  Capacity (tokens): 100
  Refill rate (tokens/sec): 10

Select test scenario:
  1. Steady traffic (10 req/sec)
  2. Burst traffic (100 req at once, then steady)
  3. DDoS simulation (1000 req/sec)
  4. Custom

> 2

Running burst scenario...

[████████████████████████████████] 100%

Results:
✅ Allowed: 145 requests
❌ Rejected: 55 requests
📊 Success Rate: 72.5%
⏱️  Duration: 10 seconds
```

## 🎯 Pre-built Scenarios

### 1. Steady Traffic

Simulates normal, consistent traffic patterns.

```javascript
// 10 requests per second for 60 seconds
// Expected: All requests allowed (if limit >= 10/sec)
```

### 2. Burst Traffic

Simulates sudden spike followed by normal traffic.

```javascript
// 100 requests at t=0
// Then 5 requests per second
// Tests: Burst handling capability
```

### 3. DDoS Simulation

Simulates denial of service attack.

```javascript
// 1000 requests per second
// Tests: Protection under extreme load
```

### 4. Thundering Herd

Simulates many clients starting simultaneously.

```javascript
// 50 clients, each sending 20 requests
// All starting at the same time
// Tests: Fairness and stability
```

### 5. Gradual Ramp-Up

Simulates gradually increasing traffic.

```javascript
// Start: 1 req/sec
// Increase: +1 req/sec every 10 seconds
// Tests: Dynamic scaling behavior
```

## 📊 Metrics & Analytics

### Tracked Metrics

- **Throughput**: Requests processed per second
- **Rejection Rate**: Percentage of rejected requests
- **Latency**: Time to process each request
- **Memory Usage**: Algorithm memory consumption
- **Fairness**: Distribution across users (multi-tenant)

### Example Output

```
═══════════════════════════════════════════════
Algorithm: Token Bucket
Configuration: 100 capacity, 10 tokens/sec
Scenario: Burst Traffic
═══════════════════════════════════════════════

Time Series:
0s  │████████████████████ 100 allowed, 0 rejected
1s  │█████░░░░░░░░░░░░░░░ 25 allowed, 75 rejected
2s  │██████████░░░░░░░░░░ 50 allowed, 50 rejected
5s  │████████████████████ 100 allowed, 0 rejected

Summary:
├─ Total Requests: 1000
├─ Allowed: 725 (72.5%)
├─ Rejected: 275 (27.5%)
├─ Avg Throughput: 72.5 req/sec
└─ Peak Throughput: 100 req/sec

Performance:
├─ Memory: 64 bytes
├─ Avg Latency: 0.15 ms
└─ CPU Time: 2.3 ms
```

## 🔬 Algorithm Comparison Mode

### Side-by-Side Testing

```bash
npm run compare
```

```
Comparing Algorithms: Burst Traffic Scenario
═══════════════════════════════════════════════════════════════

Token Bucket          Leaky Bucket         Sliding Window
═══════════════════  ═══════════════════  ═══════════════════
✅ 145 (72.5%)        ✅ 100 (50%)         ✅ 132 (66%)
❌ 55 (27.5%)         ❌ 100 (50%)         ❌ 68 (34%)
⏱️  0.12 ms           ⏱️  0.18 ms          ⏱️  0.15 ms
💾 64 bytes          💾 800 bytes        💾 128 bytes

Best for burst handling: Token Bucket ⭐
Most consistent: Leaky Bucket ⭐
Best balance: Sliding Window Counter ⭐
```

## 🎓 Learning Mode

### Interactive Tutorials

```bash
npm run tutorial
```

Features:
- Step-by-step algorithm explanations
- Interactive examples
- Quiz questions
- Visual animations

### Example Tutorial

```
═══════════════════════════════════════════════
Tutorial: Understanding Token Bucket
═══════════════════════════════════════════════

Step 1: The Bucket Concept
───────────────────────────
Imagine a bucket that holds tokens. Each request
needs 1 token. Tokens refill at a constant rate.

[Bucket Visualization]
Capacity: 5 tokens
Current: 3 tokens

[███░░] ← Your bucket

What happens if a request arrives now?
a) Request is rejected
b) Request is allowed, 2 tokens remain
c) Bucket refills first

> b
✅ Correct! The bucket has tokens available.

Press Enter to continue...
```

## 🚀 Usage Examples

### JavaScript API

```javascript
import { TokenBucket } from './algorithms/token-bucket.js';

// Create rate limiter
const limiter = new TokenBucket({
  capacity: 100,
  refillRate: 10 // tokens per second
});

// Check if request allowed
if (limiter.allowRequest()) {
  console.log('✅ Request allowed');
} else {
  console.log('❌ Request rejected');
}
```

### Python API

```python
from algorithms.token_bucket import TokenBucket

# Create rate limiter
limiter = TokenBucket(
    capacity=100,
    refill_rate=10  # tokens per second
)

# Check if request allowed
if limiter.allow_request():
    print("✅ Request allowed")
else:
    print("❌ Request rejected")
```

## 🎨 Customization

### Creating Custom Scenarios

```javascript
// playground/cli/demos/custom-scenario.js
export default {
  name: 'Custom Scenario',
  description: 'Your custom test scenario',
  duration: 60, // seconds
  
  generateRequests: (time) => {
    // Return number of requests at this time
    if (time < 5) return 100; // Heavy load first 5s
    return 5; // Normal load after
  },
  
  expectedBehavior: {
    tokenBucket: 'Should allow burst initially',
    leakyBucket: 'Should queue and process steadily'
  }
};
```

### Custom Visualizations

```javascript
// playground/web/src/visualizers/custom-viz.jsx
import React from 'react';

export const CustomVisualizer = ({ algorithm, data }) => {
  return (
    <div>
      {/* Your custom visualization */}
    </div>
  );
};
```

## 🧪 Testing & Development

### Running Tests

```bash
# Web playground tests
cd playground/web
npm test

# CLI playground tests
cd playground/cli
npm test
```

### Adding New Features

1. Create feature branch
2. Add implementation
3. Add tests
4. Update documentation
5. Submit PR

## 📝 Documentation

- **Web Components**: [web/README.md](web/README.md)
- **CLI Commands**: [cli/README.md](cli/README.md)
- **API Reference**: [../docs/API_REFERENCE.md](../docs/API_REFERENCE.md)

## 🤝 Contributing

We welcome contributions! Ideas for improvements:
- New visualization styles
- Additional scenarios
- Performance optimizations
- Better UX/UI
- More algorithms

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

---

**Have fun exploring rate limiting! 🎉**
