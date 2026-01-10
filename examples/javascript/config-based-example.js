/**
 * Configuration-based Token Bucket Example
 * 
 * Demonstrates how to use configuration files for scalable rate limiting
 */

const TokenBucket = require('../../src/algorithms/javascript/token-bucket');
const { getConfigManager } = require('../../src/utils/config-manager');

// Initialize configuration manager
const configManager = getConfigManager();

console.log('='.repeat(70));
console.log('Configuration-Based Rate Limiting Examples');
console.log('='.repeat(70));

// Example 1: Using Preset Configurations
console.log('\n📋 Example 1: Using Preset Configurations\n');

// Free tier API
const freeConfig = configManager.getRateLimit('api.free');
const freeLimiter = new TokenBucket(freeConfig.capacity, freeConfig.refillRate);

console.log(`Free Tier Config: ${freeConfig.description}`);
console.log(`  Capacity: ${freeConfig.capacity}`);
console.log(`  Refill Rate: ${freeConfig.refillRate}/sec`);
console.log(`  Request: ${freeLimiter.allowRequest() ? '✅ ALLOWED' : '❌ REJECTED'}\n`);

// Pro tier API
const proConfig = configManager.getRateLimit('api.pro');
const proLimiter = new TokenBucket(proConfig.capacity, proConfig.refillRate);

console.log(`Pro Tier Config: ${proConfig.description}`);
console.log(`  Capacity: ${proConfig.capacity}`);
console.log(`  Refill Rate: ${proConfig.refillRate}/sec`);
console.log(`  Request: ${proLimiter.allowRequest() ? '✅ ALLOWED' : '❌ REJECTED'}\n`);

// Example 2: Authentication Rate Limiting
console.log('='.repeat(70));
console.log('🔐 Example 2: Authentication Endpoints\n');

const loginConfig = configManager.getRateLimit('authentication.login');
const loginLimiter = new TokenBucket(loginConfig.capacity, loginConfig.refillRate);

console.log(`Login Config: ${loginConfig.description}`);
console.log(`Simulating login attempts:\n`);

for (let i = 1; i <= 7; i++) {
  const allowed = loginLimiter.allowRequest();
  console.log(`  Attempt ${i}: ${allowed ? '✅ ALLOWED' : '❌ BLOCKED - Too many attempts'}`);
}

// Example 3: Cost-Based Operations
console.log('\n' + '='.repeat(70));
console.log('💰 Example 3: Cost-Based Operations\n');

const readConfig = configManager.getRateLimit('operations.read');
const writeConfig = configManager.getRateLimit('operations.write');
const heavyConfig = configManager.getRateLimit('operations.heavyQuery');

const operationsLimiter = new TokenBucket(1000, 100); // Shared bucket

console.log('Operation costs:');
console.log(`  Read: ${readConfig.cost} token(s)`);
console.log(`  Write: ${writeConfig.cost} token(s)`);
console.log(`  Heavy Query: ${heavyConfig.cost} token(s)\n`);

console.log('Processing operations:');
console.log(`  5 reads (5 tokens): ${operationsLimiter.allowRequest(5 * readConfig.cost) ? '✅' : '❌'}`);
console.log(`  3 writes (15 tokens): ${operationsLimiter.allowRequest(3 * writeConfig.cost) ? '✅' : '❌'}`);
console.log(`  1 heavy query (20 tokens): ${operationsLimiter.allowRequest(heavyConfig.cost) ? '✅' : '❌'}`);
console.log(`  Remaining tokens: ${operationsLimiter.getAvailableTokens()}`);

// Example 4: Environment-Based Configuration
console.log('\n' + '='.repeat(70));
console.log('🌍 Example 4: Environment-Based Limits\n');

// Show how limits change based on environment
const environments = ['development', 'staging', 'production'];

console.log('API limits across environments:\n');

environments.forEach(env => {
  configManager.setEnvironment(env);
  const config = configManager.getRateLimit('api.free');
  console.log(`  ${env.padEnd(12)}: ${config.capacity} capacity, ${config.refillRate.toFixed(2)}/sec`);
});

// Reset to production
configManager.setEnvironment(process.env.NODE_ENV || 'production');

// Example 5: Environment Variables Override
console.log('\n' + '='.repeat(70));
console.log('⚙️  Example 5: Environment Variable Override\n');

// Simulate environment variables
process.env.CUSTOM_LIMIT_CAPACITY = '500';
process.env.CUSTOM_LIMIT_REFILL = '50';

const envConfig = configManager.getRateLimitFromEnv('CUSTOM_LIMIT', 'default');

console.log('Using environment variables:');
console.log(`  CUSTOM_LIMIT_CAPACITY=${process.env.CUSTOM_LIMIT_CAPACITY}`);
console.log(`  CUSTOM_LIMIT_REFILL=${process.env.CUSTOM_LIMIT_REFILL}`);
console.log(`\nResolved config:`);
console.log(`  Capacity: ${envConfig.capacity}`);
console.log(`  Refill Rate: ${envConfig.refillRate}/sec`);

// Example 6: Multi-Tier System
console.log('\n' + '='.repeat(70));
console.log('🏢 Example 6: Multi-Tier User System\n');

class RateLimitedAPI {
  constructor() {
    this.userLimiters = new Map();
    this.configManager = getConfigManager();
  }

  getUserLimiter(userId, tier = 'free') {
    if (!this.userLimiters.has(userId)) {
      const config = this.configManager.getRateLimit(`api.${tier}`);
      this.userLimiters.set(
        userId,
        new TokenBucket(config.capacity, config.refillRate)
      );
    }
    return this.userLimiters.get(userId);
  }

  handleRequest(userId, tier, endpoint) {
    const limiter = this.getUserLimiter(userId, tier);
    const allowed = limiter.allowRequest();
    
    return {
      userId,
      tier,
      endpoint,
      allowed,
      remaining: limiter.getAvailableTokens()
    };
  }
}

const api = new RateLimitedAPI();

console.log('Simulating requests from different user tiers:\n');

const requests = [
  { userId: 'user_1', tier: 'free', endpoint: '/api/data' },
  { userId: 'user_2', tier: 'pro', endpoint: '/api/data' },
  { userId: 'user_3', tier: 'enterprise', endpoint: '/api/data' },
  { userId: 'user_1', tier: 'free', endpoint: '/api/users' }
];

requests.forEach(req => {
  const result = api.handleRequest(req.userId, req.tier, req.endpoint);
  console.log(`  ${req.userId} (${req.tier}): ${req.endpoint} - ${result.allowed ? '✅ ALLOWED' : '❌ REJECTED'} | Remaining: ${result.remaining}`);
});

// Example 7: List All Available Configurations
console.log('\n' + '='.repeat(70));
console.log('📚 Example 7: Available Configurations\n');

const configs = configManager.listConfigurations();

console.log('All available rate limit configurations:\n');

configs.slice(0, 10).forEach(config => {
  console.log(`  ${config.name.padEnd(30)} - ${config.description}`);
});

console.log(`\n  ... and ${configs.length - 10} more configurations`);

// Best Practices Summary
console.log('\n' + '='.repeat(70));
console.log('✨ Best Practices for Configuration-Based Rate Limiting');
console.log('='.repeat(70));

console.log(`
1. **Use Configuration Files**:
   - Centralize all rate limits in config/rate-limits.json
   - Easy to update without code changes
   - Version control your configurations

2. **Environment-Specific Settings**:
   - Development: Higher limits for testing
   - Staging: Close to production
   - Production: Strict, well-tested limits

3. **Tiered Systems**:
   - Free tier: Basic limits
   - Pro tier: Generous limits
   - Enterprise: Very high limits

4. **Cost-Based Limiting**:
   - Assign token costs to operations
   - Heavy operations = more tokens
   - Light operations = fewer tokens

5. **Environment Variables for Runtime**:
   - Override configs with env vars
   - Useful for quick adjustments
   - No code deployment needed

6. **Document Your Configurations**:
   - Add descriptions to each limit
   - Explain the reasoning
   - Include examples

7. **Monitor and Adjust**:
   - Track rejection rates per config
   - Adjust based on real usage
   - A/B test different limits

📖 See config/rate-limits.json for all available configurations
📖 See docs/BEST_PRACTICES.md for more details
`);
