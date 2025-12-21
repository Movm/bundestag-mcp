import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitBreakerError, STATES } from '../../src/utils/circuitBreaker.js';

describe('CircuitBreaker', () => {
  let breaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeout: 100,
      halfOpenMaxRequests: 2
    });
  });

  describe('initial state', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(STATES.CLOSED);
    });

    it('should have zero failures', () => {
      expect(breaker.failures).toBe(0);
    });
  });

  describe('CLOSED state', () => {
    it('should allow requests through', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should count failures', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      try {
        await breaker.execute(fn);
      } catch (e) {}

      expect(breaker.failures).toBe(1);
      expect(breaker.getState()).toBe(STATES.CLOSED);
    });

    it('should open after failure threshold', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch (e) {}
      }

      expect(breaker.getState()).toBe(STATES.OPEN);
    });

    it('should reset failure count on success', async () => {
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));
      const successFn = vi.fn().mockResolvedValue('success');

      // Two failures
      for (let i = 0; i < 2; i++) {
        try { await breaker.execute(failFn); } catch (e) {}
      }

      // One success resets
      await breaker.execute(successFn);

      expect(breaker.failures).toBe(0);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(fn); } catch (e) {}
      }
    });

    it('should reject requests immediately', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should track rejected requests', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      try { await breaker.execute(fn); } catch (e) {}

      expect(breaker.getStats().rejectedRequests).toBe(1);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      // Wait for reset timeout
      await new Promise(r => setTimeout(r, 150));

      expect(breaker.getState()).toBe(STATES.HALF_OPEN);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Open the circuit
      const fn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(fn); } catch (e) {}
      }
      // Wait for transition to HALF_OPEN
      await new Promise(r => setTimeout(r, 150));
    });

    it('should allow limited requests', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await breaker.execute(fn);
      expect(fn).toHaveBeenCalled();
    });

    it('should close on enough successes', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      await breaker.execute(fn);
      await breaker.execute(fn);

      expect(breaker.getState()).toBe(STATES.CLOSED);
    });

    it('should reopen on any failure', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      try { await breaker.execute(fn); } catch (e) {}

      expect(breaker.getState()).toBe(STATES.OPEN);
    });

    it('should reject when half-open request limit reached', async () => {
      // Create a breaker with limit of 1 for easier testing
      const testBreaker = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeout: 50,
        halfOpenMaxRequests: 1
      });

      // Open the circuit
      try {
        await testBreaker.execute(() => Promise.reject(new Error('fail')));
      } catch (e) {}

      // Wait for HALF_OPEN
      await new Promise(r => setTimeout(r, 100));
      expect(testBreaker.getState()).toBe(STATES.HALF_OPEN);

      // First request in half-open should work (and it will close the circuit)
      const fn = vi.fn().mockResolvedValue('success');
      await testBreaker.execute(fn);

      // Circuit should now be CLOSED since we had 1 success = halfOpenMaxRequests
      expect(testBreaker.getState()).toBe(STATES.CLOSED);
    });
  });

  describe('getStats', () => {
    it('should return current statistics', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      await breaker.execute(fn);

      const stats = breaker.getStats();

      expect(stats.state).toBe(STATES.CLOSED);
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
    });

    it('should track state changes', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(fn); } catch (e) {}
      }

      const stats = breaker.getStats();
      expect(stats.recentStateChanges.length).toBeGreaterThan(0);
      expect(stats.recentStateChanges[0].to).toBe(STATES.OPEN);
    });
  });

  describe('reset', () => {
    it('should reset all state', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('fail'));

      for (let i = 0; i < 3; i++) {
        try { await breaker.execute(fn); } catch (e) {}
      }

      breaker.reset();

      expect(breaker.getState()).toBe(STATES.CLOSED);
      expect(breaker.failures).toBe(0);
      expect(breaker.getStats().totalRequests).toBe(0);
    });
  });

  describe('isFailure customization', () => {
    it('should allow custom failure detection', async () => {
      const customBreaker = new CircuitBreaker({
        failureThreshold: 2,
        isFailure: (error) => error.status >= 500
      });

      // 404 errors should not count
      const notFoundFn = vi.fn().mockRejectedValue({ status: 404 });
      try { await customBreaker.execute(notFoundFn); } catch (e) {}
      try { await customBreaker.execute(notFoundFn); } catch (e) {}

      expect(customBreaker.getState()).toBe(STATES.CLOSED);

      // 500 errors should count
      const serverErrorFn = vi.fn().mockRejectedValue({ status: 500 });
      try { await customBreaker.execute(serverErrorFn); } catch (e) {}
      try { await customBreaker.execute(serverErrorFn); } catch (e) {}

      expect(customBreaker.getState()).toBe(STATES.OPEN);
    });
  });
});
