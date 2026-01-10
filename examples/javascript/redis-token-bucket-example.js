/**
 * Redis Token Bucket Example
 * 
 * Demonstrates distributed rate limiting using Redis backend.
 * This allows rate limiting to work across multiple server instances.
 * 
 * Prerequisites:
 * 1. Install Redis: https://redis.io/download
 * 2. Install ioredis: npm install ioredis
 * 3. Start Redis server: redis-server
 */

const Redis = require('ioredis');
const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

// Example 1: Basic Usage
console.log('='.repeat(70));
console.log('Example 1: Basic Redis Token Bucket Usage');
console.log('='.repeat(70));

async function basicExample() {
  // Connect to Redis
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    }
  });

  // Create rate limiter for a specific user
  const limiter = new RedisTokenBucket(
    redis,
    'rate_limit:user:alice',
    10,  // 10 tokens capacity
    1    // 1 token per second refill
  );

  console.log('\nSimulating API requests for user Alice:\n');

  // Make some requests
  for (let i = 1; i <= 12; i++) {
    const allowed = await limiter.allowRequest();
    const state = await limiter.getState();
    
    console.log(`Request ${i}: ${allowed ? '✅ ALLOWED' : '❌ REJECTED'} | ` +
                `Tokens: ${state.availableTokens}`);
    
    if (!allowed) {
      const waitTime = await limiter.getTimeUntilNextToken();
      console.log(`  ⏰ Wait ${Math.ceil(waitTime)}ms for next token`);
    }
  }

  await redis.quit();
}

// Example 2: Multi-Server Scenario
console.log('\n' + '='.repeat(70));
console.log('Example 2: Multi-Server Distributed Rate Limiting');
console.log('='.repeat(70));

async function multiServerExample() {
  // Simulate two server instances
  const redis1 = new Redis({ host: 'localhost', port: 6379 });
  const redis2 = new Redis({ host: 'localhost', port: 6379 });

  // Both servers use the same key = shared state
  const server1Limiter = new RedisTokenBucket(redis1, 'api:shared', 20, 2);
  const server2Limiter = new RedisTokenBucket(redis2, 'api:shared', 20, 2);

  console.log('\nSimulating requests across 2 server instances:\n');

  // Requests come to different servers but share the same limit
  console.log('Server 1: Processing 10 requests');
  for (let i = 0; i < 10; i++) {
    await server1Limiter.allowRequest();
  }

  const state1 = await server1Limiter.getState();
  console.log(`Server 1 view: ${state1.availableTokens} tokens remaining\n`);

  console.log('Server 2: Processing 10 requests');
  for (let i = 0; i < 10; i++) {
    await server2Limiter.allowRequest();
  }

  const state2 = await server2Limiter.getState();
  console.log(`Server 2 view: ${state2.availableTokens} tokens remaining\n`);

  // Next request should be rejected on either server
  const allowed1 = await server1Limiter.allowRequest();
  const allowed2 = await server2Limiter.allowRequest();

  console.log(`Server 1 next request: ${allowed1 ? '✅ ALLOWED' : '❌ REJECTED'}`);
  console.log(`Server 2 next request: ${allowed2 ? '✅ ALLOWED' : '❌ REJECTED'}`);

  await redis1.quit();
  await redis2.quit();
}

// Example 3: Per-User Rate Limiting
console.log('\n' + '='.repeat(70));
console.log('Example 3: Per-User Rate Limiting');
console.log('='.repeat(70));

async function perUserExample() {
  const redis = new Redis({ host: 'localhost', port: 6379 });

  class APIServer {
    constructor(redis) {
      this.redis = redis;
      this.limiters = new Map();
    }

    getUserLimiter(userId, tier = 'free') {
      const key = `api:${tier}:${userId}`;
      
      if (!this.limiters.has(key)) {
        // Different tiers have different limits
        const limits = {
          free: { capacity: 10, refillRate: 1 },
          pro: { capacity: 100, refillRate: 10 },
          enterprise: { capacity: 1000, refillRate: 100 }
        };
        
        const config = limits[tier];
        this.limiters.set(key, new RedisTokenBucket(
          this.redis,
          key,
          config.capacity,
          config.refillRate
        ));
      }
      
      return this.limiters.get(key);
    }

    async handleRequest(userId, tier) {
      const limiter = this.getUserLimiter(userId, tier);
      const allowed = await limiter.allowRequest();
      const state = await limiter.getState();
      
      return {
        allowed,
        remaining: state.availableTokens,
        tier
      };
    }
  }

  const server = new APIServer(redis);

  console.log('\nSimulating requests from different user tiers:\n');

  // Free tier user
  const freeResult = await server.handleRequest('user_1', 'free');
  console.log(`Free user: ${freeResult.allowed ? '✅' : '❌'} | Remaining: ${freeResult.remaining}`);

  // Pro tier user
  const proResult = await server.handleRequest('user_2', 'pro');
  console.log(`Pro user:  ${proResult.allowed ? '✅' : '❌'} | Remaining: ${proResult.remaining}`);

  // Enterprise tier user
  const entResult = await server.handleRequest('user_3', 'enterprise');
  console.log(`Enterprise: ${entResult.allowed ? '✅' : '❌'} | Remaining: ${entResult.remaining}`);

  await redis.quit();
}

// Example 4: Cost-Based Operations
console.log('\n' + '='.repeat(70));
console.log('Example 4: Cost-Based Rate Limiting');
console.log('='.repeat(70));

async function costBasedExample() {
  const redis = new Redis({ host: 'localhost', port: 6379 });
  const limiter = new RedisTokenBucket(redis, 'api:operations', 100, 10);

  const operations = [
    { name: 'Read', cost: 1 },
    { name: 'Write', cost: 5 },
    { name: 'Delete', cost: 10 },
    { name: 'Bulk Import', cost: 50 }
  ];

  console.log('\nProcessing operations with different costs:\n');

  for (const op of operations) {
    const allowed = await limiter.allowRequest(op.cost);
    const state = await limiter.getState();
    
    console.log(`${op.name} (cost: ${op.cost}): ${allowed ? '✅ ALLOWED' : '❌ REJECTED'} | ` +
                `Tokens: ${state.availableTokens}`);
  }

  await redis.quit();
}

// Example 5: Health Check and Failover
console.log('\n' + '='.repeat(70));
console.log('Example 5: Health Check and Error Handling');
console.log('='.repeat(70));

async function healthCheckExample() {
  const redis = new Redis({
    host: 'localhost',
    port: 6379,
    retryStrategy: () => null // Don't retry for this demo
  });

  const limiter = new RedisTokenBucket(redis, 'health:check', 10, 1);

  // Check Redis health
  const healthy = await limiter.isHealthy();
  console.log(`\nRedis Status: ${healthy ? '✅ Connected' : '❌ Disconnected'}`);

  if (healthy) {
    console.log('Processing requests normally...');
    const allowed = await limiter.allowRequest();
    console.log(`Request: ${allowed ? '✅ ALLOWED' : '❌ REJECTED'}`);
  }

  // Simulate Redis disconnection
  await redis.disconnect();

  console.log('\n⚠️  Simulating Redis failure...\n');
  
  const stillHealthy = await limiter.isHealthy();
  console.log(`Redis Status: ${stillHealthy ? '✅ Connected' : '❌ Disconnected'}`);

  // Limiter fails open (allows requests) on errors
  const allowedOnError = await limiter.allowRequest();
  console.log(`Request during failure: ${allowedOnError ? '✅ ALLOWED (fail-open)' : '❌ REJECTED'}`);
  console.log('\n💡 Tip: Fail-open strategy prevents complete outage when Redis is down');
}

// Example 6: Cleanup and Management
console.log('\n' + '='.repeat(70));
console.log('Example 6: Bucket Management');
console.log('='.repeat(70));

async function managementExample() {
  const redis = new Redis({ host: 'localhost', port: 6379 });
  const limiter = new RedisTokenBucket(redis, 'managed:bucket', 10, 1);

  // Use some tokens
  await limiter.allowRequest(7);
  console.log('\nAfter consuming 7 tokens:');
  console.log(await limiter.getState());

  // Reset bucket
  await limiter.reset();
  console.log('\nAfter reset:');
  console.log(await limiter.getState());

  // Delete bucket
  await limiter.delete();
  console.log('\nBucket deleted from Redis ✅');

  await redis.quit();
}

// Run all examples
(async () => {
  try {
    await basicExample();
    await multiServerExample();
    await perUserExample();
    await costBasedExample();
    await healthCheckExample();
    await managementExample();
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ All examples completed successfully!');
    console.log('='.repeat(70));
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\n💡 Make sure Redis is running: redis-server');
    console.error('💡 Install ioredis: npm install ioredis');
    process.exit(1);
  }
})();
