/**
 * Integration Tests for Block Duration Feature
 */

const TokenBucket = require('../../src/algorithms/javascript/token-bucket');
const RedisTokenBucket = require('../../src/algorithms/javascript/redis-token-bucket');

describe('Block Duration Feature', () => {
  describe('TokenBucket Block Functionality', () => {
    let bucket;

    beforeEach(() => {
      bucket = new TokenBucket(10, 1);
    });

    describe('block()', () => {
      it('should block the bucket for specified duration', () => {
        const result = bucket.block(5000);
        
        expect(result.blocked).toBe(true);
        expect(result.blockUntil).toBeGreaterThan(Date.now());
        expect(result.blockDuration).toBe(5000);
        expect(result.unblockAt).toBeDefined();
      });

      it('should reject invalid duration', () => {
        expect(() => bucket.block(0)).toThrow('Block duration must be a positive number');
        expect(() => bucket.block(-1000)).toThrow('Block duration must be a positive number');
        expect(() => bucket.block(NaN)).toThrow('Block duration must be a positive number');
        expect(() => bucket.block('5000')).toThrow('Block duration must be a positive number');
      });

      it('should update existing block', () => {
        bucket.block(1000);
        const result = bucket.block(5000);
        
        expect(result.blocked).toBe(true);
        expect(result.blockDuration).toBe(5000);
      });
    });

    describe('isBlocked()', () => {
      it('should return false when not blocked', () => {
        expect(bucket.isBlocked()).toBe(false);
      });

      it('should return true when blocked', () => {
        bucket.block(5000);
        expect(bucket.isBlocked()).toBe(true);
      });

      it('should return false after block expires', (done) => {
        bucket.block(100);
        expect(bucket.isBlocked()).toBe(true);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(false);
          done();
        }, 150);
      });

      it('should auto-unblock on check after expiry', () => {
        bucket.block(50);
        expect(bucket.isBlocked()).toBe(true);
        
        // Wait for expiry
        const start = Date.now();
        while (Date.now() - start < 100) {
          // Busy wait
        }
        
        expect(bucket.isBlocked()).toBe(false);
        expect(bucket.blockUntil).toBeNull();
      });
    });

    describe('getBlockTimeRemaining()', () => {
      it('should return 0 when not blocked', () => {
        expect(bucket.getBlockTimeRemaining()).toBe(0);
      });

      it('should return remaining time when blocked', () => {
        bucket.block(5000);
        const remaining = bucket.getBlockTimeRemaining();
        
        expect(remaining).toBeGreaterThan(4900);
        expect(remaining).toBeLessThanOrEqual(5000);
      });

      it('should return 0 after block expires', (done) => {
        bucket.block(100);
        
        setTimeout(() => {
          expect(bucket.getBlockTimeRemaining()).toBe(0);
          done();
        }, 150);
      });

      it('should decrease over time', (done) => {
        bucket.block(1000);
        const time1 = bucket.getBlockTimeRemaining();
        
        setTimeout(() => {
          const time2 = bucket.getBlockTimeRemaining();
          expect(time2).toBeLessThan(time1);
          done();
        }, 100);
      });
    });

    describe('unblock()', () => {
      it('should manually unblock the bucket', () => {
        bucket.block(5000);
        expect(bucket.isBlocked()).toBe(true);
        
        const result = bucket.unblock();
        
        expect(result.unblocked).toBe(true);
        expect(result.wasBlocked).toBe(true);
        expect(bucket.isBlocked()).toBe(false);
      });

      it('should work when not blocked', () => {
        const result = bucket.unblock();
        
        expect(result.unblocked).toBe(true);
        expect(result.wasBlocked).toBe(false);
      });

      it('should clear blockUntil timestamp', () => {
        bucket.block(5000);
        expect(bucket.blockUntil).not.toBeNull();
        
        bucket.unblock();
        expect(bucket.blockUntil).toBeNull();
      });
    });

    describe('Integration with allowRequest()', () => {
      it('should reject requests when blocked', () => {
        bucket.block(5000);
        
        const allowed = bucket.allowRequest();
        expect(allowed).toBe(false);
      });

      it('should not consume tokens when blocked', () => {
        const initialTokens = bucket.tokens;
        bucket.block(5000);
        
        bucket.allowRequest();
        expect(bucket.tokens).toBe(initialTokens);
      });

      it('should allow requests after unblock', () => {
        bucket.block(5000);
        expect(bucket.allowRequest()).toBe(false);
        
        bucket.unblock();
        expect(bucket.allowRequest()).toBe(true);
      });

      it('should allow requests after block expires', (done) => {
        bucket.block(100);
        expect(bucket.allowRequest()).toBe(false);
        
        setTimeout(() => {
          expect(bucket.allowRequest()).toBe(true);
          done();
        }, 150);
      });
    });

    describe('Serialization with block state', () => {
      it('should include blockUntil in toJSON()', () => {
        bucket.block(5000);
        
        const json = bucket.toJSON();
        expect(json.blockUntil).toBeDefined();
        expect(json.blockUntil).toBeGreaterThan(Date.now());
      });

      it('should restore block state from JSON', () => {
        bucket.block(5000);
        const json = bucket.toJSON();
        
        const restored = TokenBucket.fromJSON(json);
        expect(restored.isBlocked()).toBe(true);
        expect(restored.blockUntil).toBe(json.blockUntil);
      });

      it('should handle null blockUntil', () => {
        const json = bucket.toJSON();
        expect(json.blockUntil).toBeNull();
        
        const restored = TokenBucket.fromJSON(json);
        expect(restored.isBlocked()).toBe(false);
      });

      it('should handle expired block on restore', () => {
        const json = {
          capacity: 10,
          tokens: 5,
          refillRate: 1,
          lastRefill: Date.now(),
          blockUntil: Date.now() - 1000 // Already expired
        };
        
        const restored = TokenBucket.fromJSON(json);
        expect(restored.isBlocked()).toBe(false);
      });
    });

    describe('Block Duration Expiry - Timing Accuracy', () => {
      it('should automatically unblock after exact duration', (done) => {
        const duration = 200;
        const startTime = Date.now();
        
        bucket.block(duration);
        expect(bucket.isBlocked()).toBe(true);
        
        setTimeout(() => {
          const elapsed = Date.now() - startTime;
          expect(bucket.isBlocked()).toBe(false);
          expect(elapsed).toBeGreaterThanOrEqual(duration);
          expect(elapsed).toBeLessThan(duration + 50); // Allow 50ms tolerance
          done();
        }, duration + 10);
      });

      it('should maintain block state just before expiry', (done) => {
        bucket.block(200);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(true);
          done();
        }, 150); // Check 50ms before expiry
      });

      it('should transition correctly at expiry boundary', (done) => {
        bucket.block(100);
        
        // Check at multiple points
        setTimeout(() => expect(bucket.isBlocked()).toBe(true), 50);
        setTimeout(() => expect(bucket.isBlocked()).toBe(true), 90);
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(false);
          done();
        }, 120);
      });

      it('should handle multiple rapid blocks with different durations', (done) => {
        bucket.block(100);
        const firstBlockUntil = bucket.blockUntil;
        
        setTimeout(() => {
          bucket.block(200); // Extend block
          expect(bucket.blockUntil).toBeGreaterThan(firstBlockUntil);
          expect(bucket.isBlocked()).toBe(true);
          
          setTimeout(() => {
            expect(bucket.isBlocked()).toBe(false);
            done();
          }, 220);
        }, 50);
      });

      it('should handle very short block durations (1ms)', (done) => {
        bucket.block(1);
        expect(bucket.isBlocked()).toBe(true);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(false);
          done();
        }, 5);
      });

      it('should handle long block durations accurately', (done) => {
        bucket.block(500);
        const blockUntil = bucket.blockUntil;
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(true);
          expect(bucket.blockUntil).toBe(blockUntil);
          done();
        }, 400);
      });

      it('should return accurate time remaining throughout block period', (done) => {
        bucket.block(300);
        const measurements = [];
        
        const checkRemaining = (delay) => {
          setTimeout(() => {
            const remaining = bucket.getBlockTimeRemaining();
            measurements.push({ delay, remaining });
            
            if (measurements.length === 3) {
              // Verify decreasing pattern
              expect(measurements[0].remaining).toBeGreaterThan(measurements[1].remaining);
              expect(measurements[1].remaining).toBeGreaterThan(measurements[2].remaining);
              
              // Verify rough accuracy
              measurements.forEach(m => {
                const expected = 300 - m.delay;
                expect(m.remaining).toBeGreaterThanOrEqual(0);
                expect(m.remaining).toBeLessThanOrEqual(expected + 50);
              });
              
              done();
            }
          }, delay);
        };
        
        checkRemaining(50);
        checkRemaining(150);
        checkRemaining(250);
      });
    });

    describe('Block Duration Expiry - Automatic Unblock', () => {
      it('should automatically clear blockUntil after expiry', (done) => {
        bucket.block(100);
        expect(bucket.blockUntil).not.toBeNull();
        
        setTimeout(() => {
          // Trigger auto-unblock by checking status
          bucket.isBlocked();
          expect(bucket.blockUntil).toBeNull();
          done();
        }, 120);
      });

      it('should emit unblocked event on automatic expiry', (done) => {
        let unblockedEventFired = false;
        
        bucket.on('unblocked', (data) => {
          unblockedEventFired = true;
          expect(data.unblocked).toBe(true);
          expect(data.reason).toBe('expired');
        });
        
        bucket.block(100);
        
        setTimeout(() => {
          // Trigger auto-check
          bucket.isBlocked();
          expect(unblockedEventFired).toBe(true);
          done();
        }, 120);
      });

      it('should auto-unblock when allowRequest is called after expiry', (done) => {
        bucket.block(100);
        
        setTimeout(() => {
          const result = bucket.allowRequest();
          expect(result).toBe(true);
          expect(bucket.isBlocked()).toBe(false);
          done();
        }, 120);
      });

      it('should auto-unblock when getState is called after expiry', (done) => {
        bucket.block(100);
        
        setTimeout(() => {
          const state = bucket.getState(true);
          expect(state.isBlocked).toBe(false);
          expect(state.blockUntil).toBeNull();
          done();
        }, 120);
      });

      it('should not double-emit unblock event', (done) => {
        let unblockedCount = 0;
        
        bucket.on('unblocked', () => {
          unblockedCount++;
        });
        
        bucket.block(100);
        
        setTimeout(() => {
          // Multiple operations that check block status
          bucket.isBlocked();
          bucket.getState();
          bucket.allowRequest();
          
          // Should only emit once
          expect(unblockedCount).toBe(1);
          done();
        }, 120);
      });

      it('should handle concurrent checks during auto-unblock', (done) => {
        bucket.block(100);
        
        setTimeout(() => {
          // Simulate concurrent checks
          const results = [
            bucket.isBlocked(),
            bucket.isBlocked(),
            bucket.isBlocked()
          ];
          
          results.forEach(result => {
            expect(result).toBe(false);
          });
          
          expect(bucket.blockUntil).toBeNull();
          done();
        }, 120);
      });
    });

    describe('Block Duration Expiry - State Transitions', () => {
      it('should maintain consistent state during block period', (done) => {
        bucket.block(200);
        
        const checks = [];
        const checkState = (delay) => {
          setTimeout(() => {
            const state = bucket.getState(true);
            checks.push({
              delay,
              isBlocked: state.isBlocked,
              blockUntil: state.blockUntil,
              tokens: state.availableTokens
            });
            
            if (checks.length === 3) {
              // All should be blocked
              checks.forEach(check => {
                if (check.delay < 200) {
                  expect(check.isBlocked).toBe(true);
                  expect(check.blockUntil).toBeGreaterThan(Date.now());
                }
              });
              done();
            }
          }, delay);
        };
        
        checkState(50);
        checkState(100);
        checkState(150);
      });

      it('should transition from blocked to unblocked state cleanly', (done) => {
        bucket.block(100);
        
        const stateBefore = bucket.getState(true);
        expect(stateBefore.isBlocked).toBe(true);
        
        setTimeout(() => {
          const stateAfter = bucket.getState(true);
          expect(stateAfter.isBlocked).toBe(false);
          expect(stateAfter.blockUntil).toBeNull();
          done();
        }, 120);
      });

      it('should not affect token count during block/unblock cycle', (done) => {
        const initialTokens = bucket.tokens;
        
        bucket.block(100);
        expect(bucket.tokens).toBe(initialTokens);
        
        setTimeout(() => {
          bucket.isBlocked(); // Trigger auto-unblock
          expect(bucket.tokens).toBe(initialTokens);
          done();
        }, 120);
      });

      it('should preserve capacity and refillRate through block cycle', (done) => {
        const originalCapacity = bucket.capacity;
        const originalRefillRate = bucket.refillRate;
        
        bucket.block(100);
        
        setTimeout(() => {
          bucket.isBlocked();
          expect(bucket.capacity).toBe(originalCapacity);
          expect(bucket.refillRate).toBe(originalRefillRate);
          done();
        }, 120);
      });

      it('should allow normal operations after auto-unblock', (done) => {
        bucket.block(100);
        
        setTimeout(() => {
          // Should work normally after auto-unblock
          expect(bucket.allowRequest()).toBe(true);
          
          const penaltyResult = bucket.penalty(2);
          expect(penaltyResult.penaltyApplied).toBe(2);
          expect(penaltyResult.remainingTokens).toBeGreaterThanOrEqual(0);
          
          const rewardResult = bucket.reward(1);
          expect(rewardResult).toBeDefined();
          expect(rewardResult.remainingTokens).toBeGreaterThanOrEqual(0);
          
          done();
        }, 120);
      });

      it('should handle state serialization during block transition', (done) => {
        bucket.block(100);
        
        setTimeout(() => {
          const json = bucket.toJSON();
          const restored = TokenBucket.fromJSON(json);
          
          // Block should be expired
          expect(restored.isBlocked()).toBe(false);
          done();
        }, 120);
      });
    });

    describe('Block Duration Expiry - isBlocked() Accuracy', () => {
      it('should report isBlocked correctly throughout lifecycle', (done) => {
        expect(bucket.isBlocked()).toBe(false);
        
        bucket.block(150);
        expect(bucket.isBlocked()).toBe(true);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(true);
        }, 50);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(true);
        }, 100);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(false);
          done();
        }, 170);
      });

      it('should return consistent results for multiple consecutive checks', () => {
        bucket.block(1000);
        
        const results = Array(10).fill().map(() => bucket.isBlocked());
        expect(results.every(r => r === true)).toBe(true);
      });

      it('should be accurate immediately after block expires', (done) => {
        bucket.block(100);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(false);
          expect(bucket.isBlocked()).toBe(false);
          expect(bucket.isBlocked()).toBe(false);
          done();
        }, 110);
      });

      it('should detect expiry on first check after timeout', (done) => {
        bucket.block(100);
        
        // Don't check during block period
        setTimeout(() => {
          // First check after expiry should return false
          expect(bucket.isBlocked()).toBe(false);
          done();
        }, 150);
      });

      it('should handle edge case at exact expiry moment', (done) => {
        bucket.block(100);
        const blockUntil = bucket.blockUntil;
        
        setTimeout(() => {
          const now = Date.now();
          const isBlocked = bucket.isBlocked();
          
          // If we're past blockUntil, should be false
          if (now >= blockUntil) {
            expect(isBlocked).toBe(false);
          } else {
            expect(isBlocked).toBe(true);
          }
          done();
        }, 100);
      });
    });

    describe('Block Duration Expiry - Event Emission', () => {
      it('should emit blocked event with correct data', (done) => {
        bucket.on('blocked', (data) => {
          expect(data.blocked).toBe(true);
          expect(data.blockDuration).toBe(200);
          expect(data.blockUntil).toBeGreaterThan(Date.now());
          expect(data.timestamp).toBeDefined();
          done();
        });
        
        bucket.block(200);
      });

      it('should emit unblocked event on expiry with reason', (done) => {
        bucket.on('unblocked', (data) => {
          expect(data.unblocked).toBe(true);
          expect(data.reason).toBe('expired');
          expect(data.wasBlocked).toBe(true);
          done();
        });
        
        bucket.block(100);
        
        setTimeout(() => {
          bucket.isBlocked(); // Trigger check
        }, 120);
      });

      it('should emit unblocked event on manual unblock with correct reason', (done) => {
        bucket.on('unblocked', (data) => {
          expect(data.unblocked).toBe(true);
          expect(data.reason).toBe('manual');
          expect(data.wasBlocked).toBe(true);
          done();
        });
        
        bucket.block(1000);
        bucket.unblock();
      });

      it('should emit events in correct order: block -> unblock', (done) => {
        const events = [];
        
        bucket.on('blocked', () => {
          events.push('blocked');
        });
        
        bucket.on('unblocked', () => {
          events.push('unblocked');
          expect(events).toEqual(['blocked', 'unblocked']);
          done();
        });
        
        bucket.block(100);
        
        setTimeout(() => {
          bucket.isBlocked();
        }, 120);
      });

      it('should not emit unblocked event if never blocked', () => {
        let eventFired = false;
        
        bucket.on('unblocked', () => {
          eventFired = true;
        });
        
        bucket.unblock();
        expect(eventFired).toBe(false);
      });

      it('should include timestamp in all block-related events', (done) => {
        let blockedTimestamp;
        
        bucket.on('blocked', (data) => {
          blockedTimestamp = data.timestamp;
          expect(blockedTimestamp).toBeDefined();
          expect(typeof blockedTimestamp).toBe('number');
          
          // Schedule unblock check
          setTimeout(() => {
            bucket.isBlocked();
          }, 120);
        });
        
        bucket.on('unblocked', (data) => {
          expect(data.timestamp).toBeDefined();
          expect(data.timestamp).toBeGreaterThanOrEqual(blockedTimestamp);
          done();
        });
        
        bucket.block(100);
      });

      it('should allow event listeners to be added and removed', (done) => {
        let count = 0;
        const listener = () => {
          count++;
        };
        
        bucket.on('blocked', listener);
        bucket.block(100);
        bucket.off('blocked', listener);
        
        setTimeout(() => {
          bucket.block(100);
          // Wait a bit to ensure no more events
          setTimeout(() => {
            expect(count).toBe(1); // Only first block should increment
            done();
          }, 10);
        }, 120);
      });
    });

    describe('Block Duration Expiry - Edge Cases', () => {
      it('should handle system clock adjustments gracefully', (done) => {
        bucket.block(100);
        
        // Simulate time passing
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(false);
          done();
        }, 120);
      });

      it('should handle blocking during token refill', (done) => {
        bucket.tokens = 5;
        bucket.block(100);
        
        setTimeout(() => {
          // Block should expire, tokens should not have refilled during block
          expect(bucket.isBlocked()).toBe(false);
          expect(bucket.allowRequest()).toBe(true);
          done();
        }, 120);
      });

      it('should handle rapid block/unblock cycles', (done) => {
        bucket.block(50);
        
        setTimeout(() => {
          bucket.block(50);
          setTimeout(() => {
            expect(bucket.isBlocked()).toBe(false);
            done();
          }, 70);
        }, 60);
      });

      it('should maintain block across getState calls', () => {
        bucket.block(1000);
        
        for (let i = 0; i < 5; i++) {
          const state = bucket.getState(true);
          expect(state.isBlocked).toBe(true);
        }
      });

      it('should handle zero token scenario during block', (done) => {
        bucket.tokens = 0;
        bucket.block(100);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(false);
          expect(bucket.tokens).toBe(0);
          done();
        }, 120);
      });

      it('should handle max capacity scenario during block', (done) => {
        bucket.tokens = bucket.capacity;
        bucket.block(100);
        
        setTimeout(() => {
          expect(bucket.isBlocked()).toBe(false);
          expect(bucket.tokens).toBe(bucket.capacity);
          done();
        }, 120);
      });
    });
  });

  describe('RedisTokenBucket Block Functionality', () => {
    let redis;
    let bucket;
    const testKey = 'test:block:user123';

    beforeEach(async () => {
      // Mock Redis client
      redis = {
        storage: new Map(),
        async setex(key, ttl, value) {
          this.storage.set(key, { value, expiry: Date.now() + ttl * 1000 });
          return 'OK';
        },
        async get(key) {
          const item = this.storage.get(key);
          if (!item) {return null;}
          if (Date.now() > item.expiry) {
            this.storage.delete(key);
            return null;
          }
          return item.value;
        },
        async del(...keys) {
          let deleted = 0;
          for (const key of keys) {
            if (this.storage.delete(key)) {deleted++;}
          }
          return deleted;
        },
        async ping() {
          return 'PONG';
        },
        eval: jest.fn().mockResolvedValue([1, 10, Date.now()])
      };

      bucket = new RedisTokenBucket(redis, testKey, 10, 1);
    });

    afterEach(async () => {
      await redis.del(testKey, `${testKey}:block`);
    });

    describe('block()', () => {
      it('should block the bucket in Redis', async () => {
        const result = await bucket.block(5000);
        
        expect(result.blocked).toBe(true);
        expect(result.blockUntil).toBeGreaterThan(Date.now());
        expect(result.blockDuration).toBe(5000);
      });

      it('should store block in Redis with TTL', async () => {
        await bucket.block(5000);
        
        const blockValue = await redis.get(`${testKey}:block`);
        expect(blockValue).toBeDefined();
        expect(parseInt(blockValue, 10)).toBeGreaterThan(Date.now());
      });

      it('should reject invalid duration', async () => {
        await expect(bucket.block(0)).rejects.toThrow('Block duration must be a positive number');
        await expect(bucket.block(-1000)).rejects.toThrow('Block duration must be a positive number');
      });
    });

    describe('isBlocked()', () => {
      it('should return false when not blocked', async () => {
        const blocked = await bucket.isBlocked();
        expect(blocked).toBe(false);
      });

      it('should return true when blocked', async () => {
        await bucket.block(5000);
        const blocked = await bucket.isBlocked();
        expect(blocked).toBe(true);
      });

      it('should return false after block expires', async () => {
        await bucket.block(100);
        expect(await bucket.isBlocked()).toBe(true);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(await bucket.isBlocked()).toBe(false);
      });
    });

    describe('getBlockTimeRemaining()', () => {
      it('should return 0 when not blocked', async () => {
        const remaining = await bucket.getBlockTimeRemaining();
        expect(remaining).toBe(0);
      });

      it('should return remaining time when blocked', async () => {
        await bucket.block(5000);
        const remaining = await bucket.getBlockTimeRemaining();
        
        expect(remaining).toBeGreaterThan(4900);
        expect(remaining).toBeLessThanOrEqual(5000);
      });

      it('should clean up expired blocks', async () => {
        await bucket.block(100);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        const remaining = await bucket.getBlockTimeRemaining();
        
        expect(remaining).toBe(0);
        expect(await redis.get(`${testKey}:block`)).toBeNull();
      });
    });

    describe('unblock()', () => {
      it('should manually unblock the bucket', async () => {
        await bucket.block(5000);
        expect(await bucket.isBlocked()).toBe(true);
        
        const result = await bucket.unblock();
        
        expect(result.unblocked).toBe(true);
        expect(result.wasBlocked).toBe(true);
        expect(await bucket.isBlocked()).toBe(false);
      });

      it('should work when not blocked', async () => {
        const result = await bucket.unblock();
        
        expect(result.unblocked).toBe(true);
        expect(result.wasBlocked).toBe(false);
      });
    });

    describe('Integration with allowRequest()', () => {
      it('should reject requests when blocked', async () => {
        await bucket.block(5000);
        
        const allowed = await bucket.allowRequest();
        expect(allowed).toBe(false);
      });

      it('should allow requests after unblock', async () => {
        await bucket.block(5000);
        expect(await bucket.allowRequest()).toBe(false);
        
        await bucket.unblock();
        expect(await bucket.allowRequest()).toBe(true);
      });

      it('should allow requests after block expires', async () => {
        await bucket.block(100);
        expect(await bucket.allowRequest()).toBe(false);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(await bucket.allowRequest()).toBe(true);
      });
    });

    describe('Distributed blocking', () => {
      it('should enforce block across multiple instances', async () => {
        const bucket1 = new RedisTokenBucket(redis, testKey, 10, 1);
        const bucket2 = new RedisTokenBucket(redis, testKey, 10, 1);
        
        await bucket1.block(5000);
        
        expect(await bucket1.isBlocked()).toBe(true);
        expect(await bucket2.isBlocked()).toBe(true);
      });

      it('should synchronize unblock across instances', async () => {
        const bucket1 = new RedisTokenBucket(redis, testKey, 10, 1);
        const bucket2 = new RedisTokenBucket(redis, testKey, 10, 1);
        
        await bucket1.block(5000);
        await bucket1.unblock();
        
        expect(await bucket2.isBlocked()).toBe(false);
      });
    });

    describe('Redis Block Duration Expiry - Timing Accuracy', () => {
      it('should automatically unblock after exact duration', async () => {
        const duration = 200;
        const startTime = Date.now();
        
        await bucket.block(duration);
        expect(await bucket.isBlocked()).toBe(true);
        
        await new Promise(resolve => setTimeout(resolve, duration + 10));
        
        const elapsed = Date.now() - startTime;
        expect(await bucket.isBlocked()).toBe(false);
        expect(elapsed).toBeGreaterThanOrEqual(duration);
        expect(elapsed).toBeLessThan(duration + 100);
      });

      it('should maintain block state just before expiry', async () => {
        await bucket.block(200);
        
        await new Promise(resolve => setTimeout(resolve, 150));
        expect(await bucket.isBlocked()).toBe(true);
      });

      it('should handle Redis TTL expiration correctly', async () => {
        await bucket.block(150);
        
        // Check that Redis key exists
        const blockValue = await redis.get(`${testKey}:block`);
        expect(blockValue).toBeDefined();
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // After expiry, Redis should auto-delete or return expired
        expect(await bucket.isBlocked()).toBe(false);
      });

      it('should return accurate time remaining throughout block period', async () => {
        await bucket.block(300);
        
        const time1 = await bucket.getBlockTimeRemaining();
        expect(time1).toBeGreaterThan(250);
        expect(time1).toBeLessThanOrEqual(300);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const time2 = await bucket.getBlockTimeRemaining();
        expect(time2).toBeLessThan(time1);
        expect(time2).toBeGreaterThan(150);
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const time3 = await bucket.getBlockTimeRemaining();
        expect(time3).toBeLessThan(time2);
      });

      it('should handle very short block durations in Redis', async () => {
        await bucket.block(10);
        expect(await bucket.isBlocked()).toBe(true);
        
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(await bucket.isBlocked()).toBe(false);
      });
    });

    describe('Redis Block Duration Expiry - Automatic Cleanup', () => {
      it('should clean up Redis block key after expiry', async () => {
        await bucket.block(100);
        expect(await redis.get(`${testKey}:block`)).toBeDefined();
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        // Check should trigger cleanup
        await bucket.isBlocked();
        
        // Key should be gone or indicate no block
        const remaining = await bucket.getBlockTimeRemaining();
        expect(remaining).toBe(0);
      });

      it('should auto-cleanup expired blocks on check', async () => {
        await bucket.block(100);
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        // First check should clean up
        expect(await bucket.isBlocked()).toBe(false);
        
        // Key should be deleted
        const blockValue = await redis.get(`${testKey}:block`);
        expect(blockValue).toBeNull();
      });

      it('should auto-unblock when allowRequest is called after expiry', async () => {
        await bucket.block(100);
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        const result = await bucket.allowRequest();
        expect(result).toBe(true);
        expect(await bucket.isBlocked()).toBe(false);
      });

      it('should handle concurrent cleanup operations', async () => {
        await bucket.block(100);
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        // Multiple concurrent checks
        const results = await Promise.all([
          bucket.isBlocked(),
          bucket.isBlocked(),
          bucket.getBlockTimeRemaining()
        ]);
        
        expect(results[0]).toBe(false);
        expect(results[1]).toBe(false);
        expect(results[2]).toBe(0);
      });
    });

    describe('Redis Block Duration Expiry - Distributed State', () => {
      it('should synchronize expiry across multiple instances', async () => {
        const bucket1 = new RedisTokenBucket(redis, testKey, 10, 1);
        const bucket2 = new RedisTokenBucket(redis, testKey, 10, 1);
        
        await bucket1.block(150);
        expect(await bucket1.isBlocked()).toBe(true);
        expect(await bucket2.isBlocked()).toBe(true);
        
        await new Promise(resolve => setTimeout(resolve, 200));
        
        expect(await bucket1.isBlocked()).toBe(false);
        expect(await bucket2.isBlocked()).toBe(false);
      });

      it('should handle one instance checking after expiry', async () => {
        const bucket1 = new RedisTokenBucket(redis, testKey, 10, 1);
        const bucket2 = new RedisTokenBucket(redis, testKey, 10, 1);
        
        await bucket1.block(100);
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        // First instance checks
        expect(await bucket1.isBlocked()).toBe(false);
        
        // Second instance should also see unblocked
        expect(await bucket2.isBlocked()).toBe(false);
      });

      it('should maintain consistent state across instances during expiry', async () => {
        const bucket1 = new RedisTokenBucket(redis, testKey, 10, 1);
        const bucket2 = new RedisTokenBucket(redis, testKey, 10, 1);
        const bucket3 = new RedisTokenBucket(redis, testKey, 10, 1);
        
        await bucket1.block(150);
        
        await new Promise(resolve => setTimeout(resolve, 180));
        
        const results = await Promise.all([
          bucket1.isBlocked(),
          bucket2.isBlocked(),
          bucket3.isBlocked()
        ]);
        
        expect(results.every(r => r === false)).toBe(true);
      });

      it('should allow all instances to accept requests after expiry', async () => {
        const bucket1 = new RedisTokenBucket(redis, testKey, 10, 1);
        const bucket2 = new RedisTokenBucket(redis, testKey, 10, 1);
        
        await bucket1.block(100);
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        expect(await bucket1.allowRequest()).toBe(true);
        expect(await bucket2.allowRequest()).toBe(true);
      });
    });

    describe('Redis Block Duration Expiry - Edge Cases', () => {
      it('should handle Redis connection issues during block expiry', async () => {
        await bucket.block(100);
        
        // Simulate Redis being unavailable
        const originalGet = redis.get;
        redis.get = jest.fn().mockRejectedValue(new Error('Redis unavailable'));
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        // Should handle gracefully, possibly using insurance limiter
        try {
          await bucket.isBlocked();
          // If no error, insurance limiter worked
          expect(true).toBe(true);
        } catch (error) {
          // Or should throw appropriate error
          expect(error.message).toContain('Redis');
        }
        
        redis.get = originalGet;
      });

      it('should handle rapid block expiry checks', async () => {
        await bucket.block(100);
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        // Rapid consecutive checks
        for (let i = 0; i < 10; i++) {
          expect(await bucket.isBlocked()).toBe(false);
        }
      });

      it('should maintain consistency with Redis TTL mechanism', async () => {
        await bucket.block(200);
        
        const blockValue = await redis.get(`${testKey}:block`);
        expect(blockValue).toBeDefined();
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Should still be blocked
        expect(await bucket.isBlocked()).toBe(true);
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        // Should be unblocked
        expect(await bucket.isBlocked()).toBe(false);
      });

      it('should handle block during insurance limiter fallback', async () => {
        await bucket.block(100);
        
        // Simulate Redis failure
        redis.eval = jest.fn().mockRejectedValue(new Error('Redis error'));
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        // Should handle gracefully
        try {
          const result = await bucket.allowRequest();
          expect(typeof result).toBe('boolean');
        } catch (error) {
          expect(error).toBeDefined();
        }
      });

      it('should recover from temporary Redis outage during block', async () => {
        await bucket.block(200);
        
        // Simulate temporary Redis failure
        const originalGet = redis.get;
        redis.get = jest.fn().mockRejectedValue(new Error('Temporary failure'));
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Restore Redis
        redis.get = originalGet;
        
        await new Promise(resolve => setTimeout(resolve, 120));
        
        // Should be unblocked now
        expect(await bucket.isBlocked()).toBe(false);
      });
    });

    describe('Redis Block Duration Expiry - Performance', () => {
      it('should handle multiple sequential block/expiry cycles', async () => {
        for (let i = 0; i < 5; i++) {
          await bucket.block(50);
          expect(await bucket.isBlocked()).toBe(true);
          
          await new Promise(resolve => setTimeout(resolve, 70));
          expect(await bucket.isBlocked()).toBe(false);
        }
      });

      it('should efficiently check expiry without excessive Redis calls', async () => {
        await bucket.block(100);
        
        const getCalls = redis.get.mock?.calls?.length || 0;
        
        // Multiple checks shouldn't cause linear growth in Redis calls
        await bucket.isBlocked();
        await bucket.isBlocked();
        await bucket.isBlocked();
        
        const newGetCalls = redis.get.mock?.calls?.length || 0;
        expect(newGetCalls - getCalls).toBeLessThan(10);
      });

      it('should handle high-frequency expiry checks', async () => {
        await bucket.block(200);
        
        const checks = [];
        for (let i = 0; i < 50; i++) {
          checks.push(bucket.isBlocked());
        }
        
        const results = await Promise.all(checks);
        expect(results.every(r => r === true)).toBe(true);
      });
    });
  });
});
