/**
 * Rate Limiter Demo - Frontend Application
 */

// State
let endpoints = [];
let metricsInterval = null;
let currentTab = 'response';

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  loadEndpoints();
  startMetricsPolling();
  updateStats();
});

// Load available endpoints
async function loadEndpoints() {
  try {
    const response = await fetch('/api/info');
    const data = await response.json();
    endpoints = data.endpoints;
    renderEndpoints();
  } catch (error) {
    console.error('Failed to load endpoints:', error);
  }
}

// Render endpoints as cards
function renderEndpoints() {
  const grid = document.getElementById('endpoints-grid');
  grid.innerHTML = endpoints.map(endpoint => `
    <div class="endpoint-card">
      <div class="endpoint-header">
        <span class="method ${endpoint.method.toLowerCase()}">${endpoint.method}</span>
        <span class="path">${endpoint.path}</span>
      </div>
      <div class="endpoint-body">
        <p class="strategy">${endpoint.strategy}</p>
        <p class="limit">${endpoint.limit}</p>
        <p class="description">${endpoint.description}</p>
      </div>
      <button class="btn btn-small btn-test" onclick="testEndpoint('${endpoint.path}', '${endpoint.method}')">
        Test Endpoint
      </button>
    </div>
  `).join('');
}

// Test a specific endpoint
async function testEndpoint(path, method = 'GET') {
  updateResponseStatus('Loading...', 'loading');
  
  try {
    const options = { method };
    
    // Handle POST requests with body
    if (method === 'POST') {
      options.headers = { 'Content-Type': 'application/json' };
      
      if (path === '/api/process') {
        const complexity = Math.random() > 0.5 ? 'complex' : 'simple';
        options.body = JSON.stringify({ complexity });
      }
    }
    
    // Replace :userId with a random user ID
    const testPath = path.replace(':userId', `user${Math.floor(Math.random() * 3) + 1}`);
    
    const startTime = Date.now();
    const response = await fetch(testPath, options);
    const duration = Date.now() - startTime;
    const data = await response.json();
    
    // Update response display
    if (response.ok) {
      updateResponseStatus(`✅ Success (${duration}ms)`, 'success');
      displayRateLimitInfo(data.rateLimit);
    } else {
      updateResponseStatus(`❌ Rate Limited (${response.status})`, 'error');
      displayRateLimitInfo(data.rateLimit || {});
    }
    
    displayResponseBody(data, response.status);
    updateStats();
    
  } catch (error) {
    updateResponseStatus(`❌ Error: ${error.message}`, 'error');
    console.error('Request failed:', error);
  }
}

// Update response status indicator
function updateResponseStatus(text, type) {
  const statusEl = document.getElementById('response-status');
  statusEl.textContent = text;
  statusEl.className = `response-status ${type}`;
}

// Display rate limit information
function displayRateLimitInfo(rateLimit) {
  if (!rateLimit) return;
  
  document.getElementById('limit-value').textContent = rateLimit.limit || '-';
  document.getElementById('remaining-value').textContent = rateLimit.remaining ?? '-';
  document.getElementById('used-value').textContent = rateLimit.used ?? '-';
  
  if (rateLimit.resetTime) {
    const resetIn = Math.max(0, Math.ceil((rateLimit.resetTime - Date.now()) / 1000));
    document.getElementById('reset-value').textContent = `${resetIn}s`;
  } else {
    document.getElementById('reset-value').textContent = '-';
  }
}

// Display response body
function displayResponseBody(data, status) {
  const bodyEl = document.getElementById('response-body');
  bodyEl.textContent = JSON.stringify(data, null, 2);
  bodyEl.className = `response-body ${status >= 400 ? 'error' : 'success'}`;
}

// Switch tabs
function switchTab(tabName, clickedElement) {
  currentTab = tabName;
  
  // Update tab buttons
  document.querySelectorAll('.tab').forEach(tab => {
    tab.classList.remove('active');
  });
  clickedElement.classList.add('active');
  
  // Update tab content
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`${tabName}-tab`).classList.add('active');
  
  // Load tab-specific data
  if (tabName === 'metrics') {
    updateMetrics();
  } else if (tabName === 'events') {
    updateEvents();
  }
}

// Update statistics
async function updateStats() {
  try {
    const response = await fetch('/api/metrics');
    const data = await response.json();
    
    document.getElementById('total-requests').textContent = data.totalRequests;
    document.getElementById('allowed-requests').textContent = data.allowedRequests;
    document.getElementById('blocked-requests').textContent = data.blockedRequests;
    
    const successRate = data.totalRequests > 0 
      ? ((data.allowedRequests / data.totalRequests) * 100).toFixed(1)
      : 100;
    document.getElementById('success-rate').textContent = `${successRate}%`;
    
    // Update events if on that tab
    if (currentTab === 'events') {
      updateEvents(data.recentEvents);
    }
    
    // Update metrics if on that tab
    if (currentTab === 'metrics') {
      updateMetricsDisplay(data);
    }
    
  } catch (error) {
    console.error('Failed to update stats:', error);
  }
}

// Update metrics display
function updateMetricsDisplay(data) {
  const metricsList = document.getElementById('metrics-list');
  
  const html = Object.entries(data.requestsByEndpoint)
    .map(([endpoint, stats]) => `
      <div class="metric-item">
        <div class="metric-header">
          <span class="metric-endpoint">${endpoint}</span>
        </div>
        <div class="metric-stats">
          <span class="metric-allowed">✅ ${stats.allowed}</span>
          <span class="metric-blocked">❌ ${stats.blocked}</span>
          <span class="metric-total">Total: ${stats.allowed + stats.blocked}</span>
        </div>
      </div>
    `)
    .join('');
  
  metricsList.innerHTML = html || '<p class="no-data">No metrics available yet</p>';
}

// Update events display
function updateEvents(events) {
  if (!events) return;
  
  const eventsList = document.getElementById('events-list');
  
  const html = events
    .map(event => {
      const time = new Date(event.timestamp).toLocaleTimeString();
      const statusClass = event.allowed ? 'success' : 'error';
      const statusIcon = event.allowed ? '✅' : '❌';
      
      return `
        <div class="event-item ${statusClass}">
          <span class="event-time">${time}</span>
          <span class="event-status">${statusIcon}</span>
          <span class="event-endpoint">${event.endpoint}</span>
          <span class="event-reason">${event.reason}</span>
        </div>
      `;
    })
    .join('');
  
  eventsList.innerHTML = html || '<p class="no-data">No events yet</p>';
}

// Clear events
async function clearEvents() {
  document.getElementById('events-list').innerHTML = '<p class="no-data">No events yet</p>';
}

// Reset metrics
async function resetMetrics() {
  if (!confirm('Are you sure you want to reset all metrics?')) return;
  
  try {
    await fetch('/api/metrics/reset', { method: 'POST' });
    updateStats();
    alert('✅ Metrics reset successfully!');
  } catch (error) {
    alert('❌ Failed to reset metrics');
    console.error('Reset failed:', error);
  }
}

// Run load test
async function runLoadTest() {
  const endpoint = prompt('Enter endpoint to test (e.g., /api/basic):', '/api/basic');
  if (!endpoint) return;
  
  const count = 10;
  updateResponseStatus(`Running load test: ${count} requests to ${endpoint}...`, 'loading');
  
  let success = 0;
  let blocked = 0;
  
  for (let i = 0; i < count; i++) {
    try {
      const response = await fetch(endpoint);
      if (response.ok) {
        success++;
      } else {
        blocked++;
      }
      
      // Update progress
      updateResponseStatus(
        `Load test progress: ${i + 1}/${count} (✅ ${success} | ❌ ${blocked})`,
        'loading'
      );
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Request failed:', error);
    }
  }
  
  updateResponseStatus(
    `✅ Load test complete: ${success} allowed, ${blocked} blocked`,
    success > blocked ? 'success' : 'error'
  );
  
  updateStats();
}

// Test all endpoints
async function testAllEndpoints() {
  updateResponseStatus('Testing all endpoints...', 'loading');
  
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint.path, endpoint.method);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  updateResponseStatus('✅ All endpoints tested', 'success');
}

// Start polling metrics
function startMetricsPolling() {
  metricsInterval = setInterval(updateStats, 2000);
}

// Stop polling metrics
function stopMetricsPolling() {
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopMetricsPolling();
});
