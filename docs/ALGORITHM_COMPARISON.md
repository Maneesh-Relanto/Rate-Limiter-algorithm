# 🔬 Rate Limiting Algorithms: Comprehensive Comparison

## Table of Contents
1. [Overview](#overview)
2. [Token Bucket](#token-bucket)
3. [Leaky Bucket](#leaky-bucket)
4. [Fixed Window Counter](#fixed-window-counter)
5. [Sliding Window Log](#sliding-window-log)
6. [Sliding Window Counter](#sliding-window-counter)
6. [Algorithm Selection Guide](#algorithm-selection-guide)
7. [Performance Benchmarks](#performance-benchmarks)

---

## Overview

Each rate limiting algorithm has unique characteristics, trade-offs, and ideal use cases. This guide provides deep technical analysis to help you choose the right one.

## Comparison Matrix

| Algorithm | Complexity | Memory | Burst Handling | Accuracy | Best For |
|-----------|------------|--------|----------------|----------|----------|
| Token Bucket | O(1) | Low | ✅ Excellent | High | APIs, general use |
| Leaky Bucket | O(1) | Low | ❌ Limited | Perfect | Smooth traffic |
| Fixed Window | O(1) | Very Low | ⚠️ Boundary issue | Medium | Simple cases |
| Sliding Log | O(n) | High | ✅ Good | Perfect | Accuracy critical |
| Sliding Counter | O(1) | Low | ✅ Good | High | Best balance |

---

## Token Bucket

### Concept

Imagine a bucket that holds tokens. Tokens are added at a constant rate, and each request consumes one token. If the bucket is empty, requests are rejected.

```
Bucket Capacity: 100 tokens
Refill Rate: 10 tokens/second

[=====>>>>>] ← Bucket
  ^       ^
  Used  Available
```

### How It Works

```
1. Bucket initialized with capacity (e.g., 100 tokens)
2. Tokens refill at fixed rate (e.g., 10/sec)
3. Request arrives:
   - If tokens available: consume token, allow request
   - If no tokens: reject request
4. Max tokens = bucket capacity (prevents unlimited accumulation)
```

### Detailed Example

```
Capacity: 100 tokens
Rate: 10 tokens/second
Current: 50 tokens

Time | Event           | Tokens Before | Tokens After | Result
-----|-----------------|---------------|--------------|--------
0.0s | Request arrives | 50            | 49           | ✅ Allow
0.1s | Request arrives | 49            | 48           | ✅ Allow
0.5s | Refill (+5)     | 48            | 53           | -
1.0s | 20 requests     | 53            | 33           | ✅ Allow all
1.5s | Refill (+5)     | 33            | 38           | -
2.0s | 50 requests     | 38            | 0            | ✅ 38, ❌ 12
```

### Pros & Cons

**Advantages:**
- ✅ Handles burst traffic efficiently
- ✅ Simple to implement
- ✅ Memory efficient (O(1) space)
- ✅ Fast (O(1) time complexity)
- ✅ Allows temporary spikes

**Disadvantages:**
- ❌ Can allow burst equal to bucket size
- ❌ May cause temporary overload
- ❌ Requires clock synchronization in distributed systems

### Use Cases

- **REST APIs**: Allows occasional bursts from legitimate users
- **Web Servers**: Handles traffic spikes gracefully
- **User Authentication**: Permits retries for typos
- **File Uploads**: Allows burst uploads then throttles

### Implementation Pseudocode

```python
class TokenBucket:
    def __init__(self, capacity, refill_rate):
        self.capacity = capacity
        self.tokens = capacity
        self.refill_rate = refill_rate
        self.last_refill = now()
    
    def allow_request(self):
        self._refill()
        if self.tokens >= 1:
            self.tokens -= 1
            return True
        return False
    
    def _refill(self):
        now = current_time()
        elapsed = now - self.last_refill
        tokens_to_add = elapsed * self.refill_rate
        self.tokens = min(self.capacity, self.tokens + tokens_to_add)
        self.last_refill = now
```

---

## Leaky Bucket

### Concept

A bucket with a leak at the bottom. Requests enter the bucket, and leak out at a constant rate. If the bucket overflows, requests are rejected.

```
Requests → [=====] → Constant Rate
           Bucket    10 req/sec
             ↓ leak
```

### How It Works

```
1. Requests enter queue (bucket)
2. Requests process at constant rate
3. If queue full: reject request
4. If queue has space: accept and queue

Key: Output rate is ALWAYS constant
```

### Detailed Example

```
Capacity: 10 requests
Process Rate: 2 req/second
Queue: []

Time | Event              | Queue Before | Queue After  | Result
-----|--------------------|--------------|--------------|---------
0.0s | 5 requests arrive  | []           | [1,2,3,4,5]  | ✅ All
0.5s | Process (-1)       | [1,2,3,4,5]  | [2,3,4,5]    | Output: 1
1.0s | Process (-1)       | [2,3,4,5]    | [3,4,5]      | Output: 2
1.0s | 10 requests arrive | [3,4,5]      | [3,4,5,...,10] | ✅ 7, ❌ 3
```

### Pros & Cons

**Advantages:**
- ✅ Perfectly smooth output rate
- ✅ Predictable performance
- ✅ Simple to understand
- ✅ No burst-induced overload

**Disadvantages:**
- ❌ No burst handling (strict)
- ❌ May reject legitimate burst traffic
- ❌ Requires queue management
- ❌ Added latency for queued requests

### Use Cases

- **Video Streaming**: Constant bitrate required
- **Network Traffic Shaping**: ISP bandwidth control
- **Background Jobs**: Smooth processing rate
- **Database Writes**: Prevent write bursts

### Implementation Pseudocode

```python
class LeakyBucket:
    def __init__(self, capacity, leak_rate):
        self.capacity = capacity
        self.queue = []
        self.leak_rate = leak_rate
        self.last_leak = now()
    
    def allow_request(self):
        self._leak()
        if len(self.queue) < self.capacity:
            self.queue.append(current_time())
            return True
        return False
    
    def _leak(self):
        now = current_time()
        elapsed = now - self.last_leak
        requests_to_leak = int(elapsed * self.leak_rate)
        self.queue = self.queue[requests_to_leak:]
        self.last_leak = now
```

---

## Fixed Window Counter

### Concept

Divide time into fixed windows (e.g., every minute) and count requests in each window.

```
Window 1    Window 2    Window 3
[100 req]   [100 req]   [100 req]
|-------|   |-------|   |-------|
0-60s       60-120s     120-180s
```

### How It Works

```
1. Define window size (e.g., 60 seconds)
2. Count requests in current window
3. If count < limit: allow request
4. If count >= limit: reject request
5. At window boundary: reset counter
```

### Detailed Example

```
Limit: 100 requests per minute
Window: 60 seconds

Time  | Requests | Counter | Result
------|----------|---------|--------
0:00  | 50       | 50      | ✅ Allow
0:30  | 40       | 90      | ✅ Allow
0:59  | 20       | 110     | ✅ 10, ❌ 10 (limit hit)
1:00  | RESET    | 0       | Counter reset
1:00  | 100      | 100     | ✅ Allow
```

### The Boundary Problem

**Critical Issue:**
```
Limit: 100 req/min

Scenario:
0:59 - 100 requests (allowed)
1:00 - Window resets
1:01 - 100 requests (allowed)

Result: 200 requests in 2 seconds! (2x over limit)
```

### Pros & Cons

**Advantages:**
- ✅ Extremely simple
- ✅ Very low memory usage
- ✅ Fast (O(1) operations)
- ✅ Easy to understand and debug

**Disadvantages:**
- ❌ Boundary problem (can exceed limit by 2x)
- ❌ Unfair at window boundaries
- ❌ Doesn't handle bursts well
- ❌ Not accurate for strict limits

### Use Cases

- **Internal APIs**: Where approximation is acceptable
- **Logging Systems**: Rough traffic monitoring
- **Basic Protection**: Simple DDoS mitigation
- **Low-Stakes Applications**: Where precision isn't critical

### Implementation Pseudocode

```python
class FixedWindowCounter:
    def __init__(self, limit, window_size):
        self.limit = limit
        self.window_size = window_size
        self.counter = 0
        self.window_start = now()
    
    def allow_request(self):
        current = current_time()
        
        # Check if window expired
        if current - self.window_start >= self.window_size:
            self.counter = 0
            self.window_start = current
        
        if self.counter < self.limit:
            self.counter += 1
            return True
        return False
```

---

## Sliding Window Log

### Concept

Store timestamp of every request and count requests within the sliding time window.

```
Current Time: 1:00:30
Window: 60 seconds
Valid Range: 0:59:30 - 1:00:30

Stored timestamps:
[0:59:32, 0:59:45, 1:00:10, 1:00:15, 1:00:28]
         ↑ Valid requests in window
```

### How It Works

```
1. Store timestamp of every request
2. On new request:
   a. Remove timestamps older than window
   b. Count remaining timestamps
   c. If count < limit: allow and store
   d. If count >= limit: reject
```

### Detailed Example

```
Limit: 5 requests per 60 seconds
Current Time: 1:00:30

Timestamps: [0:58:00, 0:59:35, 0:59:50, 1:00:10, 1:00:20]

Step 1: Remove old timestamps
Window start: 1:00:30 - 60s = 0:59:30
Remove: 0:58:00 (too old)
Keep: [0:59:35, 0:59:50, 1:00:10, 1:00:20]

Step 2: Count = 4 requests

Step 3: New request at 1:00:30
Count < Limit (4 < 5)
Result: ✅ Allow
New timestamps: [0:59:35, 0:59:50, 1:00:10, 1:00:20, 1:00:30]
```

### Pros & Cons

**Advantages:**
- ✅ Perfectly accurate
- ✅ No boundary problem
- ✅ True sliding window
- ✅ Fair to all users

**Disadvantages:**
- ❌ High memory usage (O(n) where n = request count)
- ❌ Slower (O(n) to clean old entries)
- ❌ Not scalable for high traffic
- ❌ Requires timestamp storage

### Use Cases

- **Payment APIs**: Accuracy is critical
- **Financial Systems**: Precise rate limiting required
- **Low-Traffic Endpoints**: Memory usage acceptable
- **Compliance Requirements**: Audit trail needed

### Implementation Pseudocode

```python
class SlidingWindowLog:
    def __init__(self, limit, window_size):
        self.limit = limit
        self.window_size = window_size
        self.log = []
    
    def allow_request(self):
        now = current_time()
        window_start = now - self.window_size
        
        # Remove old timestamps
        self.log = [ts for ts in self.log if ts > window_start]
        
        if len(self.log) < self.limit:
            self.log.append(now)
            return True
        return False
```

---

## Sliding Window Counter

### Concept

Combines Fixed Window and Sliding Log - uses two counters and weighted calculation.

```
Previous Window    Current Window
[80 requests]      [40 requests]
|---------|        |---------|
0-60s              60-120s
                   ↑ We're at 90s (50% through)

Calculation:
Previous weight: (60-90)/60 = 50% → 80 * 0.5 = 40
Current weight: 100% → 40 * 1.0 = 40
Total: 40 + 40 = 80 requests
```

### How It Works

```
1. Maintain current and previous window counters
2. Calculate position in current window (0-100%)
3. Weighted sum:
   estimated_count = (prev_count * remaining_prev%) + curr_count
4. If estimated_count < limit: allow
5. If estimated_count >= limit: reject
```

### Detailed Example

```
Limit: 100 requests per 60 seconds

Time: 90 seconds (30s into window 2)
Window 1 (0-60s): 80 requests
Window 2 (60-120s): 40 requests so far

Calculation:
- Progress in current window: 30/60 = 50%
- Remaining from previous: 50%
- Weighted previous: 80 * 0.5 = 40
- Current: 40
- Total estimate: 40 + 40 = 80 requests

New request?
80 < 100 → ✅ Allow
```

### Pros & Cons

**Advantages:**
- ✅ Good accuracy (solves boundary problem)
- ✅ Low memory usage O(1)
- ✅ Fast O(1) operations
- ✅ Handles bursts reasonably
- ✅ Best of both worlds

**Disadvantages:**
- ❌ Slightly more complex implementation
- ❌ Not 100% accurate (uses estimation)
- ❌ Requires clock synchronization

### Use Cases

- **Production APIs**: Best general-purpose algorithm
- **High-Traffic Services**: Scalable and accurate
- **Microservices**: Distributed systems friendly
- **SaaS Platforms**: Multi-tenant fairness

### Implementation Pseudocode

```python
class SlidingWindowCounter:
    def __init__(self, limit, window_size):
        self.limit = limit
        self.window_size = window_size
        self.prev_count = 0
        self.curr_count = 0
        self.curr_window_start = now()
    
    def allow_request(self):
        now = current_time()
        time_in_curr_window = now - self.curr_window_start
        
        # Check if we need to slide the window
        if time_in_curr_window >= self.window_size:
            self.prev_count = self.curr_count
            self.curr_count = 0
            self.curr_window_start = now
            time_in_curr_window = 0
        
        # Calculate weighted count
        prev_window_weight = 1 - (time_in_curr_window / self.window_size)
        estimated_count = (self.prev_count * prev_window_weight) + self.curr_count
        
        if estimated_count < self.limit:
            self.curr_count += 1
            return True
        return False
```

---

## Algorithm Selection Guide

### Decision Tree

```
Start: Choose Rate Limiting Algorithm

Q1: Need perfect accuracy?
├─ YES → Sliding Window Log
└─ NO → Q2

Q2: Can handle bursts?
├─ YES → Q3
└─ NO → Leaky Bucket

Q3: High traffic volume?
├─ YES → Q4
└─ NO → Token Bucket

Q4: Need distributed system support?
├─ YES → Sliding Window Counter
└─ NO → Token Bucket
```

### By Use Case

| Use Case | Recommended Algorithm | Reason |
|----------|----------------------|---------|
| REST API | Token Bucket or Sliding Window Counter | Handles bursts, scalable |
| Payments | Sliding Window Log | Perfect accuracy required |
| Video Streaming | Leaky Bucket | Constant rate needed |
| Authentication | Token Bucket | Allow retry typos |
| Background Jobs | Leaky Bucket | Smooth processing |
| Public API | Sliding Window Counter | Best balance |
| Internal API | Fixed Window | Simple, good enough |
| High Traffic | Sliding Window Counter | Memory efficient + accurate |

### By Requirements

**If you need:**
- **Burst handling** → Token Bucket, Sliding Window Counter
- **Perfect accuracy** → Sliding Window Log
- **Constant rate** → Leaky Bucket
- **Simplicity** → Fixed Window Counter
- **Low memory** → Token Bucket, Sliding Window Counter
- **Distributed** → Sliding Window Counter (Redis-friendly)

---

## Performance Benchmarks

### Memory Usage

```
Requests per second: 10,000
Window size: 60 seconds

Token Bucket: ~100 bytes
Leaky Bucket: ~8KB (queue storage)
Fixed Window: ~100 bytes
Sliding Window Log: ~4.8 MB (10K * 60s * 8 bytes)
Sliding Window Counter: ~200 bytes
```

### CPU Operations

```
Per request operation cost:

Token Bucket: 5-10 arithmetic operations
Leaky Bucket: 10-20 operations (queue management)
Fixed Window: 3-5 operations
Sliding Window Log: 100-1000 operations (cleanup)
Sliding Window Counter: 8-15 operations
```

### Accuracy Comparison

```
Test: Boundary case (1000 req/min limit)

Scenario: 1000 at 0:59, 1000 at 1:01

Token Bucket: ~1200-1500 (burst allowed)
Leaky Bucket: 1000 exactly
Fixed Window: 2000 (boundary issue!)
Sliding Window Log: 1000 exactly
Sliding Window Counter: 1000-1050 (estimated)
```

---

## Conclusion

**Best Overall**: **Sliding Window Counter**
- Combines efficiency and accuracy
- Production-ready for most cases
- Scalable and distributed-friendly

**Most Accurate**: **Sliding Window Log**
- Use when accuracy is critical
- Accept higher memory cost

**Simplest**: **Token Bucket** or **Fixed Window**
- Quick implementation
- Good for internal tools

**Smoothest**: **Leaky Bucket**
- Constant rate applications
- No burst tolerance needed

---

*Next: [Implementation Guide](guides/IMPLEMENTATION_GUIDE.md)*
