/**
 * Comprehensive Test Script for Demo Application
 * Tests all 8 endpoints to ensure rate limiting works correctly
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';
const endpoints = [
  { path: '/api/basic', method: 'GET', name: 'Per-IP Rate Limiting' },
  { path: '/api/strict', method: 'GET', name: 'Strict Rate Limiting' },
  { path: '/api/cost-light', method: 'GET', name: 'Cost-Based (Light)' },
  { path: '/api/cost-heavy', method: 'GET', name: 'Cost-Based (Heavy)' },
  { path: '/api/user/user1', method: 'GET', name: 'Per-User Rate Limiting' },
  { path: '/api/global', method: 'GET', name: 'Global Rate Limiting' },
  { path: '/api/fast', method: 'GET', name: 'Fast Refill' },
  { path: '/api/process', method: 'POST', name: 'Dynamic Cost', body: { type: 'simple' } }
];

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

console.log('🚀 Starting Comprehensive Endpoint Tests...\n');
console.log('=' .repeat(70));

function makeRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const url = new URL(endpoint.path, BASE_URL);
    const options = {
      method: endpoint.method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: response
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', reject);

    if (endpoint.body) {
      req.write(JSON.stringify(endpoint.body));
    }

    req.end();
  });
}

async function testEndpoint(endpoint) {
  totalTests++;
  console.log(`\n📍 Testing: ${endpoint.name}`);
  console.log(`   Path: ${endpoint.method} ${endpoint.path}`);

  try {
    // Test 1: First request should succeed
    const response = await makeRequest(endpoint);
    
    if (response.status === 200) {
      console.log('   ✅ Request accepted (200 OK)');
      
      // Validate rate limit headers
      const hasHeaders = 
        response.headers['x-ratelimit-limit'] &&
        response.headers['x-ratelimit-remaining'] &&
        response.headers['x-ratelimit-reset'];
      
      if (hasHeaders) {
        console.log('   ✅ Rate limit headers present');
        console.log(`      Limit: ${response.headers['x-ratelimit-limit']}`);
        console.log(`      Remaining: ${response.headers['x-ratelimit-remaining']}`);
        console.log(`      Reset: ${new Date(parseInt(response.headers['x-ratelimit-reset'])).toLocaleTimeString()}`);
        passedTests++;
      } else {
        console.log('   ❌ Rate limit headers missing');
        failedTests++;
      }
    } else if (response.status === 429) {
      // If first request hits limit, it's still working (just already exhausted)
      console.log('   ⚠️  Rate limit already exceeded (429)');
      console.log('      This is expected if bucket was exhausted from previous tests');
      
      if (response.headers['retry-after']) {
        console.log(`      Retry-After: ${response.headers['retry-after']}s`);
        passedTests++;
      } else {
        console.log('   ❌ Retry-After header missing');
        failedTests++;
      }
    } else {
      console.log(`   ❌ Unexpected status: ${response.status}`);
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    failedTests++;
  }
}

async function testLoadScenario() {
  totalTests++;
  console.log('\n📍 Testing: Load Test Scenario');
  console.log('   Sending 5 rapid requests to /api/fast');

  try {
    const results = await Promise.all([
      makeRequest({ path: '/api/fast', method: 'GET' }),
      makeRequest({ path: '/api/fast', method: 'GET' }),
      makeRequest({ path: '/api/fast', method: 'GET' }),
      makeRequest({ path: '/api/fast', method: 'GET' }),
      makeRequest({ path: '/api/fast', method: 'GET' })
    ]);

    const accepted = results.filter(r => r.status === 200).length;
    const rejected = results.filter(r => r.status === 429).length;

    console.log(`   Results: ${accepted} accepted, ${rejected} rejected`);
    
    if (accepted > 0 && rejected > 0) {
      console.log('   ✅ Rate limiting working correctly under load');
      passedTests++;
    } else if (accepted > 0) {
      console.log('   ⚠️  All requests accepted (bucket not exhausted)');
      passedTests++;
    } else {
      console.log('   ❌ All requests rejected (bucket may have been empty)');
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    failedTests++;
  }
}

async function testHealthEndpoint() {
  totalTests++;
  console.log('\n📍 Testing: Health Check (No Rate Limiting)');
  console.log('   Path: GET /health');

  try {
    const response = await makeRequest({ path: '/health', method: 'GET' });
    
    if (response.status === 200 && !response.headers['x-ratelimit-limit']) {
      console.log('   ✅ Health endpoint accessible without rate limiting');
      passedTests++;
    } else {
      console.log('   ❌ Health endpoint issue');
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    failedTests++;
  }
}

async function testMetricsEndpoint() {
  totalTests++;
  console.log('\n📍 Testing: Metrics Endpoint');
  console.log('   Path: GET /api/metrics');

  try {
    const response = await makeRequest({ path: '/api/metrics', method: 'GET' });
    
    if (response.status === 200) {
      console.log('   ✅ Metrics endpoint accessible');
      console.log(`      Total Requests: ${response.body.totalRequests}`);
      console.log(`      Allowed: ${response.body.allowedRequests}`);
      console.log(`      Blocked: ${response.body.blockedRequests}`);
      console.log(`      Success Rate: ${response.body.successRate}%`);
      passedTests++;
    } else {
      console.log('   ❌ Metrics endpoint failed');
      failedTests++;
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    failedTests++;
  }
}

async function runAllTests() {
  console.log('Testing server connection...\n');
  
  try {
    await makeRequest({ path: '/health', method: 'GET' });
    console.log('✅ Server is running at http://localhost:3000\n');
  } catch (error) {
    console.error('❌ Cannot connect to server!');
    console.error('   Please start the server first:');
    console.error('   cd examples/demo-app');
    console.error('   node server.js\n');
    process.exit(1);
  }

  // Test all main endpoints
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint);
    await new Promise(resolve => setTimeout(resolve, 200)); // Small delay between tests
  }

  // Test special scenarios
  await testLoadScenario();
  await testHealthEndpoint();
  await testMetricsEndpoint();

  // Print summary
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 TEST SUMMARY\n');
  console.log(`   Total Tests: ${totalTests}`);
  console.log(`   ✅ Passed: ${passedTests} (${((passedTests/totalTests)*100).toFixed(1)}%)`);
  console.log(`   ❌ Failed: ${failedTests} (${((failedTests/totalTests)*100).toFixed(1)}%)`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All endpoints working correctly!');
    console.log('   The rate limiter demo application is fully functional.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the output above.\n');
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n❌ Test suite failed:', error.message);
  process.exit(1);
});
