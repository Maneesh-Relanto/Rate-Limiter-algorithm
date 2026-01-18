/**
 * Enhanced Interactive Demo - Client-Side Application
 * 
 * Provides full interactivity for testing all rate limiter features
 */

// State
let eventStreamSource = null;
let metricsInterval = null;
let currentLimiterKey = 'demo-user';

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  currentLimiterKey = document.getElementById('limiter-key').value;
  
  // Start metrics polling
  startMetricsPolling();
  
  // Refresh limiter state
  refreshLimiterState();
  
  // Add event listener for limiter key input
  document.getElementById('limiter-key').addEventListener('change', (e) => {
    currentLimiterKey = e.target.value;
    refreshLimiterState();
  });
});

// ==============================================
// CATEGORY SWITCHING
// ==============================================

function switchCategory(category, button) {
  // Update active button
  document.querySelectorAll('.category-btn').forEach(btn => btn.classList.remove('active'));
  button.classList.add('active');
  
  // Update active panel
  document.querySelectorAll('.category-panel').forEach(panel => panel.classList.remove('active'));
  document.getElementById(`${category}-category`).classList.add('active');
}

// ==============================================
// BASIC ENDPOINTS
// ==============================================

async function testEndpoint(method, path, body = null) {
  updateResponseStatus('Loading...', 'loading');
  
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(path, options);
    const data = await response.json();
    
    // Determine user-friendly status message
    let statusText = 'Success';
    let statusType = 'success';
    
    if (!response.ok) {
      if (response.status === 429) {
        statusText = '🚫 Rate Limited (This is expected!)';
        statusType = 'error';
      } else if (response.status === 403) {
        statusText = '🔒 Blocked';
        statusType = 'error';
      } else {
        statusText = 'Error';
        statusType = 'error';
      }
    } else if (data.success) {
      statusText = '✅ Success';
    }
    
    updateResponseStatus(statusText, statusType);
    displayResponse(data, response);
    
    if (data.feature) {
      displayFeature(data.feature);
    }
    
    return data;
  } catch (error) {
    updateResponseStatus('Error', 'error');
    displayResponse({ error: error.message }, { ok: false });
  }
}

// ==============================================
// PENALTY & REWARD SYSTEM
// ==============================================

async function applyPenalty() {
  const amount = parseInt(document.getElementById('penalty-amount').value);
  const response = await testEndpoint('POST', '/api/penalty/apply', {
    key: currentLimiterKey,
    amount
  });
  
  if (response) {
    refreshLimiterState();
    refreshMetrics();
  }
}

async function applyReward() {
  const amount = parseInt(document.getElementById('reward-amount').value);
  const response = await testEndpoint('POST', '/api/reward/apply', {
    key: currentLimiterKey,
    amount
  });
  
  if (response) {
    refreshLimiterState();
    refreshMetrics();
  }
}

async function testAdaptive(message) {
  if (!message) {
    message = document.getElementById('adaptive-message').value;
  } else {
    document.getElementById('adaptive-message').value = message;
  }
  
  const response = await testEndpoint('POST', '/api/adaptive/submit', {
    message,
    userId: currentLimiterKey
  });
  
  if (response) {
    refreshLimiterState();
    refreshMetrics();
  }
}

// ==============================================
// BLOCK DURATION
// ==============================================

async function applyBlock() {
  const duration = parseInt(document.getElementById('block-duration').value) * 1000;
  const response = await testEndpoint('POST', '/api/block/apply', {
    key: currentLimiterKey,
    duration
  });
  
  if (response) {
    refreshLimiterState();
    refreshMetrics();
  }
}

async function removeBlock() {
  const response = await testEndpoint('POST', '/api/block/remove', {
    key: currentLimiterKey
  });
  
  if (response) {
    refreshLimiterState();
    refreshMetrics();
  }
}

async function checkBlockStatus() {
  const response = await testEndpoint('GET', `/api/block/status/${currentLimiterKey}`);
  
  if (response) {
    refreshLimiterState();
  }
}

async function testLogin() {
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  const response = await testEndpoint('POST', '/api/auth/login', {
    username,
    password
  });
  
  if (response) {
    refreshMetrics();
  }
}

// ==============================================
// STATE PERSISTENCE & MANUAL CONTROL
// ==============================================

async function saveState() {
  const response = await testEndpoint('POST', `/api/state/save/${currentLimiterKey}`);
  
  if (response) {
    alert(`State saved successfully!\nFile: ${response.filename}`);
  }
}

async function restoreState() {
  const response = await testEndpoint('POST', `/api/state/restore/${currentLimiterKey}`);
  
  if (response && response.success) {
    alert('State restored successfully!');
    refreshLimiterState();
  } else {
    alert('Failed to restore state. No saved state found.');
  }
}

async function getState() {
  const response = await testEndpoint('GET', `/api/state/${currentLimiterKey}`);
  
  if (response) {
    refreshLimiterState();
  }
}

async function manualControl() {
  const action = document.getElementById('manual-action').value;
  const amount = parseInt(document.getElementById('manual-amount').value);
  
  const response = await testEndpoint('POST', '/api/manual/tokens', {
    key: currentLimiterKey,
    action,
    amount
  });
  
  if (response) {
    refreshLimiterState();
  }
}

// ==============================================
// EVENT MONITORING
// ==============================================

function startEventStream() {
  if (eventStreamSource) {
    return;
  }
  
  eventStreamSource = new EventSource('/api/events/stream');
  
  eventStreamSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    displayEvent(data);
  };
  
  eventStreamSource.onerror = (error) => {
    console.error('Event stream error:', error);
    stopEventStream();
  };
  
  document.getElementById('start-stream').disabled = true;
  document.getElementById('stop-stream').disabled = false;
  
  // Also update event type counts
  updateEventTypeCounts();
}

function stopEventStream() {
  if (eventStreamSource) {
    eventStreamSource.close();
    eventStreamSource = null;
  }
  
  document.getElementById('start-stream').disabled = false;
  document.getElementById('stop-stream').disabled = true;
}

function displayEvent(event) {
  const container = document.getElementById('events-list-display');
  
  // Remove placeholder
  const placeholder = container.querySelector('.placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  const eventEl = document.createElement('div');
  eventEl.className = `event-item event-${event.type}`;
  
  const time = new Date(event.timestamp).toLocaleTimeString();
  
  eventEl.innerHTML = `
    <div class="event-header">
      <span class="event-type">${event.type}</span>
      <span class="event-time">${time}</span>
    </div>
    <div class="event-body">
      <span class="event-key">${event.limiterKey || 'unknown'}</span>
      <pre>${JSON.stringify(event.data, null, 2)}</pre>
    </div>
  `;
  
  container.insertBefore(eventEl, container.firstChild);
  
  // Keep only last 20 events
  while (container.children.length > 20) {
    container.removeChild(container.lastChild);
  }
  
  // Update event type pill
  const pill = document.querySelector(`.event-pill[data-type="${event.type}"]`);
  if (pill) {
    pill.classList.add('active');
    setTimeout(() => pill.classList.remove('active'), 2000);
  }
}

function clearEventsDisplay() {
  const container = document.getElementById('events-list-display');
  container.innerHTML = '<p class="placeholder">Events cleared. Stream is still active.</p>';
}

async function updateEventTypeCounts() {
  try {
    const response = await fetch('/api/events?limit=100');
    const data = await response.json();
    
    // Update pill counts
    Object.entries(data.eventsByType || {}).forEach(([type, count]) => {
      const pill = document.querySelector(`.event-pill[data-type="${type}"]`);
      if (pill) {
        pill.setAttribute('data-count', count);
      }
    });
  } catch (error) {
    console.error('Failed to update event counts:', error);
  }
}

// ==============================================
// LIMITER STATE MANAGEMENT
// ==============================================

async function refreshLimiterState() {
  try {
    const response = await fetch(`/api/state/${currentLimiterKey}`);
    const data = await response.json();
    
    if (data.state) {
      document.getElementById('state-tokens').textContent = Math.floor(data.availableTokens);
      document.getElementById('state-capacity').textContent = data.state.capacity;
      document.getElementById('state-blocked').textContent = data.state.blocked ? 'Yes' : 'No';
      
      // Update blocked indicator color
      const blockedEl = document.getElementById('state-blocked');
      blockedEl.className = data.state.blocked ? 'blocked' : 'unblocked';
    }
  } catch (error) {
    console.error('Failed to refresh limiter state:', error);
  }
}

// ==============================================
// METRICS & DISPLAY
// ==============================================

function startMetricsPolling() {
  refreshMetrics();
  metricsInterval = setInterval(refreshMetrics, 2000);
}

async function refreshMetrics() {
  try {
    const response = await fetch('/api/metrics');
    const data = await response.json();
    
    // Update stats bar
    document.getElementById('total-requests').textContent = data.totalRequests;
    document.getElementById('allowed-requests').textContent = data.allowedRequests;
    document.getElementById('blocked-requests').textContent = data.blockedRequests;
    document.getElementById('penalties-applied').textContent = data.penaltiesApplied || 0;
    document.getElementById('rewards-applied').textContent = data.rewardsApplied || 0;
    document.getElementById('blocks-applied').textContent = data.blocksApplied || 0;
    document.getElementById('events-emitted').textContent = data.eventsEmitted || 0;
    
    // Update success rate
    const successRate = data.totalRequests > 0 
      ? ((data.allowedRequests / data.totalRequests) * 100).toFixed(1)
      : 100;
    document.getElementById('success-rate').textContent = `${successRate}%`;
    
  } catch (error) {
    console.error('Failed to refresh metrics:', error);
  }
}

function updateResponseStatus(text, status) {
  const statusEl = document.getElementById('response-status');
  statusEl.textContent = text;
  statusEl.className = `response-status ${status}`;
}

function displayResponse(data, response) {
  const bodyEl = document.getElementById('response-body');
  
  // Create user-friendly message
  let message = '';
  
  // Add human-readable explanation
  if (data.message) {
    message += `📝 ${data.message}\n\n`;
  }
  
  // Add feature highlight if present
  if (data.feature) {
    message += `🎯 Feature: ${data.feature}\n\n`;
  }
  
  // Explain what happened based on endpoint
  if (data.endpoint) {
    if (data.endpoint.includes('penalty')) {
      message += `⚡ Penalty Applied: Removed ${data.penalty?.penaltyApplied || data.amount || 'some'} tokens\n`;
      message += `   Tokens Remaining: ${data.state?.tokens || data.penalty?.remainingTokens || 'N/A'}\n\n`;
    } else if (data.endpoint.includes('reward')) {
      message += `⭐ Reward Applied: Added ${data.reward?.rewardApplied || data.amount || 'some'} tokens\n`;
      message += `   Tokens Remaining: ${data.state?.tokens || data.reward?.remainingTokens || 'N/A'}\n\n`;
    } else if (data.endpoint.includes('block/apply')) {
      message += `🔒 User Blocked: ${data.message}\n`;
      message += `   Blocked Until: ${data.blockedUntil || 'N/A'}\n\n`;
    } else if (data.endpoint.includes('block/remove')) {
      message += `🔓 User Unblocked: Access restored\n\n`;
    }
  }
  
  // Handle rate limit responses
  if (response && !response.ok && response.status === 429) {
    message += `🚨 SPAM DETECTED! 🚨\n\n`;
    message += `The adaptive rate limiter detected suspicious behavior\n`;
    message += `and blocked this request to protect the system.\n\n`;
    message += `This demonstrates that the spam detection is working! ✅\n\n`;
    if (data.error) {
      message += `Reason: ${data.error}\n`;
    }
  }
  
  // Add state information
  if (data.state) {
    message += `📊 Current State:\n`;
    message += `   • Tokens: ${Math.floor(data.state.tokens)}\n`;
    message += `   • Capacity: ${data.state.capacity}\n`;
    message += `   • Blocked: ${data.state.isBlocked ? '🔴 Yes' : '🟢 No'}\n\n`;
  }
  
  // Add raw JSON for technical details
  message += `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `Technical Details (JSON):\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += JSON.stringify(data, null, 2);
  
  bodyEl.textContent = message;
  
  // Update rate limit info if available
  if (data.rateLimit) {
    document.getElementById('limit-value').textContent = data.rateLimit.limit || '-';
    document.getElementById('remaining-value').textContent = data.rateLimit.remainingTokens || '-';
    document.getElementById('used-value').textContent = 
      data.rateLimit.limit ? (data.rateLimit.limit - data.rateLimit.remainingTokens) : '-';
    document.getElementById('reset-value').textContent = 
      data.rateLimit.retryAfter ? `${Math.ceil(data.rateLimit.retryAfter / 1000)}s` : '-';
  }
  
  // Update state info if available
  if (data.state) {
    document.getElementById('state-tokens').textContent = Math.floor(data.state.tokens);
    document.getElementById('state-capacity').textContent = data.state.capacity;
    document.getElementById('state-blocked').textContent = data.state.blocked ? 'Yes' : 'No';
  }
}

function displayFeature(feature) {
  document.getElementById('feature-text').textContent = feature;
  
  // Highlight if unique feature
  const indicator = document.getElementById('feature-indicator');
  if (feature.includes('🎯') || feature.includes('UNIQUE')) {
    indicator.classList.add('unique-feature');
  } else {
    indicator.classList.remove('unique-feature');
  }
}

// ==============================================
// QUICK ACTIONS
// ==============================================

async function runLoadTest() {
  updateResponseStatus('Running load test...', 'loading');
  
  const results = {
    total: 0,
    allowed: 0,
    blocked: 0
  };
  
  // Send 10 requests per second for 3 seconds (30 total)
  for (let i = 0; i < 3; i++) {
    const promises = [];
    for (let j = 0; j < 10; j++) {
      promises.push(
        fetch('/api/basic')
          .then(r => {
            results.total++;
            if (r.ok) results.allowed++;
            else results.blocked++;
          })
          .catch(() => results.total++)
      );
    }
    await Promise.all(promises);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  updateResponseStatus('Load test complete', 'success');
  displayResponse({
    loadTest: true,
    results,
    message: `Sent ${results.total} requests: ${results.allowed} allowed, ${results.blocked} blocked`
  }, { ok: true });
  
  refreshMetrics();
}

async function testAllEndpoints() {
  const endpoints = [
    { method: 'GET', path: '/api/basic' },
    { method: 'GET', path: '/api/strict' },
    { method: 'GET', path: '/api/cost-light' },
    { method: 'GET', path: '/api/cost-heavy' }
  ];
  
  updateResponseStatus('Testing all endpoints...', 'loading');
  
  for (const endpoint of endpoints) {
    await testEndpoint(endpoint.method, endpoint.path);
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  updateResponseStatus('All tests complete', 'success');
  refreshMetrics();
}

async function demonstrateUniqueFeatures() {
  updateResponseStatus('🎬 Starting Demo...', 'loading');
  document.getElementById('response-body').textContent = '🎯 Demonstrating all unique features...\n\nThis will show:\n1. Penalty System\n2. Reward System\n3. Spam Detection (rate limit expected!)\n4. Block Duration\n5. State Persistence\n6. Event Monitoring\n\nWatch the response panel! 👇';
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const key = currentLimiterKey;
  
  // 1. Apply penalty
  updateResponseStatus('Step 1/7: Penalty System', 'loading');
  await testEndpoint('POST', '/api/penalty/apply', { key, amount: 3 });
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // 2. Apply reward
  updateResponseStatus('Step 2/7: Reward System', 'loading');
  await testEndpoint('POST', '/api/reward/apply', { key, amount: 5 });
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // 3. Test adaptive with spam
  updateResponseStatus('Step 3/7: Testing Spam Detection...', 'loading');
  document.getElementById('response-body').textContent = '🔍 Sending suspicious message: "BUY NOW SPAM"\n\nThe adaptive system should detect this as spam...\n\nExpect a 429 Rate Limit response! 🚨';
  await new Promise(resolve => setTimeout(resolve, 1500));
  await testEndpoint('POST', '/api/adaptive/submit', { 
    userId: key, 
    message: 'BUY NOW SPAM' 
  });
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // 4. Apply block
  updateResponseStatus('Step 4/7: Block Duration', 'loading');
  await testEndpoint('POST', '/api/block/apply', { key, duration: 5000 });
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // 5. Check block status
  updateResponseStatus('Step 5/7: Checking Block Status', 'loading');
  await testEndpoint('GET', `/api/block/status/${key}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // 6. Unblock
  updateResponseStatus('Step 6/7: Removing Block', 'loading');
  await testEndpoint('POST', '/api/block/remove', { key });
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // 7. Save state
  updateResponseStatus('Step 7/7: Saving State', 'loading');
  await testEndpoint('POST', `/api/state/save/${key}`);
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // Show completion message
  updateResponseStatus('✅ Demo Complete!', 'success');
  document.getElementById('response-body').textContent = `✅ DEMO COMPLETE! ✅\n\n🎉 All unique features demonstrated successfully!\n\n📋 What you just saw:\n\n1. ⚡ Penalty System - Reduced tokens for bad behavior\n2. ⭐ Reward System - Added tokens for good behavior\n3. 🚨 Spam Detection - Blocked suspicious message (429)\n4. 🔒 Block Duration - Temporary ban applied\n5. 📊 Block Status - Checked if user is blocked\n6. 🔓 Unblock - Removed the block\n7. 💾 State Persistence - Saved limiter state\n\n💡 The 429 error you saw was INTENTIONAL and proves\n   that the spam detection is working correctly!\n\n🎯 Try testing individual features from the categories\n   on the left to explore more! →`;
  
  showModal(
    '✅',
    'Demo Complete!',
    `🎉 All unique features demonstrated successfully!\n\n💡 The 429 "Rate Limited" response was intentional - it proves the spam detection works!\n\n👉 Explore individual features using the category buttons on the left to test them individually.`
  );
  
  refreshMetrics();
  refreshLimiterState();
}

async function resetMetrics() {
  if (!confirm('Reset all metrics and limiters?')) {
    return;
  }
  
  try {
    await fetch('/api/metrics/reset', { method: 'POST' });
    refreshMetrics();
    refreshLimiterState();
    clearEventsDisplay();
    
    updateResponseStatus('Metrics reset', 'success');
    displayResponse({
      reset: true,
      message: 'All metrics and limiters have been reset'
    }, { ok: true });
  } catch (error) {
    console.error('Failed to reset metrics:', error);
  }
}

// ==============================================
// UTILITIES
// ==============================================

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  stopEventStream();
  if (metricsInterval) {
    clearInterval(metricsInterval);
  }
});

// ==============================================
// CUSTOM MODAL
// ==============================================

function showModal(icon, title, body) {
  const modal = document.getElementById('custom-modal');
  document.getElementById('modal-icon').textContent = icon;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').textContent = body;
  modal.classList.add('show');
}

function closeModal() {
  const modal = document.getElementById('custom-modal');
  modal.classList.remove('show');
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('custom-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'custom-modal') {
      closeModal();
    }
  });
  
  // Close modal with Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
    }
  });
});
