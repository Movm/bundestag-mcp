import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '../../src/utils/rateLimiter.js';

describe('RateLimiter', () => {
  let limiter;

  beforeEach(() => {
    limiter = new RateLimiter({
      requestsPerMinute: 60,
      burstSize: 5,
      maxWaitTime: 1000
    });
  });

  describe('constructor', () => {
    it('should initialize with correct defaults', () => {
      const defaultLimiter = new RateLimiter();
      expect(defaultLimiter.maxTokens).toBe(10);
      expect(defaultLimiter.tokens).toBe(10);
    });

    it('should accept custom options', () => {
      expect(limiter.maxTokens).toBe(5);
      expect(limiter.tokens).toBe(5);
    });
  });

  describe('canProceed', () => {
    it('should return true when tokens available', () => {
      expect(limiter.canProceed()).toBe(true);
    });

    it('should return false when no tokens', () => {
      limiter.tokens = 0;
      expect(limiter.canProceed()).toBe(false);
    });
  });

  describe('acquire', () => {
    it('should succeed immediately with available tokens', async () => {
      const start = Date.now();
      const result = await limiter.acquire();
      const elapsed = Date.now() - start;

      expect(result).toBe(true);
      expect(elapsed).toBeLessThan(50);
      expect(limiter.tokens).toBe(4);
    });

    it('should consume all burst tokens', async () => {
      for (let i = 0; i < 5; i++) {
        await limiter.acquire();
      }
      expect(limiter.tokens).toBeLessThan(1);
    });

    it('should return false on timeout', async () => {
      limiter.tokens = 0;
      limiter.maxWaitTime = 10;

      const result = await limiter.acquire();
      expect(result).toBe(false);
    });
  });

  describe('refill', () => {
    it('should refill tokens over time', async () => {
      limiter.tokens = 0;

      // Wait for some refill
      await new Promise(r => setTimeout(r, 100));

      limiter.refill();
      expect(limiter.tokens).toBeGreaterThan(0);
    });

    it('should not exceed max tokens', () => {
      limiter.tokens = 4;
      limiter.lastRefill = Date.now() - 60000; // 1 minute ago

      limiter.refill();
      expect(limiter.tokens).toBe(limiter.maxTokens);
    });
  });

  describe('getStats', () => {
    it('should track statistics', async () => {
      await limiter.acquire();
      await limiter.acquire();

      const stats = limiter.getStats();
      expect(stats.totalRequests).toBe(2);
      expect(stats.currentTokens).toBeLessThan(4);
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      await limiter.acquire();
      await limiter.acquire();

      limiter.reset();

      expect(limiter.tokens).toBe(limiter.maxTokens);
      expect(limiter.getStats().totalRequests).toBe(0);
    });
  });
});
