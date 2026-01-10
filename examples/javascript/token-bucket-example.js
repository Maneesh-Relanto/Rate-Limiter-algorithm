/**
 * Token Bucket Rate Limiter - Basic Example
 * 
 * This example demonstrates how to use the Token Bucket algorithm
 * for rate limiting in a simple application.
 */

const TokenBucket = require('../../src/algorithms/javascript/token-bucket');

// Example 1: Basic API Rate Limiting
console.log('='.repeat(60));
console.log('Example 1: Basic API Rate Limiting');
console.log('='.repeat(60));

// Create a rate limiter: 10 requests per second
const apiLimiter = new TokenBucket(10, 10);

console.log('\nSimulating 15 API requests...\n');

for (let i = 1; i <= 15; i++) {
  const allowed = apiLimiter.allowRequest();
  const state = apiLimiter.getState();
  
  console.log(`Request ${i.toString().padStart(2)}: ${allowed ? '✅ ALLOWED' : '❌ REJECTED'} | ` +
              `Available tokens: ${state.availableTokens}`);
}

// Example 2: User-specific Rate Limiting
console.log('\n' + '='.repeat(60));
console.log('Example 2: User-specific Rate Limiting');
console.log('='.repeat(60));

// Store rate limiters per user
const userLimiters = new Map();

function getUserLimiter(userId) {
  if (!userLimiters.has(userId)) {
    // Each user gets 100 requests per minute
    userLimiters.set(userId, new TokenBucket(100, 100 / 60));
  }
  return userLimiters.get(userId);
}

function handleRequest(userId, action) {
  const limiter = getUserLimiter(userId);
  
  if (limiter.allowRequest()) {
    console.log(`✅ User ${userId}: ${action} - ALLOWED`);
    return true;
  } else {
    const retryAfter = limiter.getTimeUntilNextToken();
    console.log(`❌ User ${userId}: ${action} - RATE LIMITED (retry after ${retryAfter}ms)`);
    return false;
  }
}

console.log('\nSimulating multiple users:\n');
handleRequest('user_1', 'GET /api/data');
handleRequest('user_2', 'POST /api/create');
handleRequest('user_1', 'GET /api/profile');
handleRequest('user_3', 'DELETE /api/item');

// Example 3: Burst Traffic Handling
console.log('\n' + '='.repeat(60));
console.log('Example 3: Burst Traffic Handling');
console.log('='.repeat(60));

const burstLimiter = new TokenBucket(50, 5); // 50 capacity, 5 per second

console.log('\nSimulating burst of 60 requests:\n');

let allowed = 0;
let rejected = 0;

for (let i = 1; i <= 60; i++) {
  if (burstLimiter.allowRequest()) {
    allowed++;
  } else {
    rejected++;
  }
}

console.log(`Results: ${allowed} allowed, ${rejected} rejected`);
console.log(`Bucket state:`, burstLimiter.getState());

// Example 4: Multi-token Requests (e.g., file uploads)
console.log('\n' + '='.repeat(60));
console.log('Example 4: Multi-token Requests (Cost-based)');
console.log('='.repeat(60));

// Different operations cost different amounts
const costLimiter = new TokenBucket(100, 10);

const operations = [
  { name: 'Small query', cost: 1 },
  { name: 'Medium operation', cost: 5 },
  { name: 'Large operation', cost: 10 },
  { name: 'Expensive query', cost: 20 }
];

console.log('\nProcessing operations with different costs:\n');

operations.forEach(op => {
  const allowed = costLimiter.allowRequest(op.cost);
  const state = costLimiter.getState();
  
  console.log(`${op.name} (cost: ${op.cost}): ${allowed ? '✅ ALLOWED' : '❌ REJECTED'} | ` +
              `Tokens remaining: ${state.availableTokens}`);
});

// Example 5: Real-world API with Retry Logic
console.log('\n' + '='.repeat(60));
console.log('Example 5: API Client with Retry Logic');
console.log('='.repeat(60));

class APIClient {
  constructor(requestsPerSecond) {
    this.limiter = new TokenBucket(requestsPerSecond * 10, requestsPerSecond);
  }

  async makeRequest(endpoint) {
    if (this.limiter.allowRequest()) {
      console.log(`✅ Making request to ${endpoint}`);
      return { success: true, data: 'Response data' };
    } else {
      const retryAfter = this.limiter.getTimeUntilNextToken();
      console.log(`⏳ Rate limited. Waiting ${retryAfter}ms before retry...`);
      
      await sleep(retryAfter);
      
      if (this.limiter.allowRequest()) {
        console.log(`✅ Retry successful for ${endpoint}`);
        return { success: true, data: 'Response data' };
      }
      
      console.log(`❌ Retry failed for ${endpoint}`);
      return { success: false, error: 'Rate limit exceeded' };
    }
  }
}

const client = new APIClient(5); // 5 requests per second

console.log('\nSimulating API client with retry:\n');

// Simulate rapid requests
(async () => {
  await client.makeRequest('/api/endpoint1');
  await client.makeRequest('/api/endpoint2');
  await client.makeRequest('/api/endpoint3');
})();

// Example 6: Monitoring and Metrics
console.log('\n' + '='.repeat(60));
console.log('Example 6: Monitoring Rate Limiter State');
console.log('='.repeat(60));

const monitoredLimiter = new TokenBucket(100, 10);

function logMetrics(limiter, label) {
  const state = limiter.getState();
  console.log(`\n[${label}]`);
  console.log(`  Capacity: ${state.capacity}`);
  console.log(`  Available: ${state.availableTokens}`);
  console.log(`  Refill Rate: ${state.refillRate}/sec`);
  console.log(`  Utilization: ${state.utilizationPercent.toFixed(2)}%`);
}

logMetrics(monitoredLimiter, 'Initial State');

// Simulate some traffic
for (let i = 0; i < 30; i++) {
  monitoredLimiter.allowRequest();
}

logMetrics(monitoredLimiter, 'After 30 Requests');

// Reset for new window
monitoredLimiter.reset();
logMetrics(monitoredLimiter, 'After Reset');

// Example 7: Best Practices Summary
console.log('\n' + '='.repeat(60));
console.log('Best Practices Summary');
console.log('='.repeat(60));

console.log(`
📝 Key Takeaways:

1. **Choose appropriate capacity**: 
   - Small capacity (10-50): Strict control
   - Medium capacity (100-500): General APIs
   - Large capacity (1000+): High-traffic services

2. **Set refill rate based on your system capacity**:
   - Match your server's processing capability
   - Use 70-80% of max capacity for safety

3. **Handle rejections gracefully**:
   - Return clear error messages
   - Include retry-after time
   - Log for monitoring

4. **Use multi-token for different costs**:
   - Small operations: 1 token
   - Medium operations: 5-10 tokens
   - Expensive operations: 20+ tokens

5. **Monitor and adjust**:
   - Track rejection rates
   - Watch utilization
   - Adjust limits based on real usage

6. **Per-user vs global limits**:
   - Use per-user for fairness
   - Use global to protect infrastructure
   - Often combine both approaches

For more information, see the documentation:
- docs/ALGORITHM_COMPARISON.md
- docs/BEST_PRACTICES.md
`);

// Helper function
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
