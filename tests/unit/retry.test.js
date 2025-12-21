import { describe, it, expect, vi } from 'vitest';
import { withRetry, isRetryable } from '../../src/utils/retry.js';

describe('retry', () => {
  describe('isRetryable', () => {
    it('should return true for network errors', () => {
      expect(isRetryable({ code: 'ETIMEDOUT' })).toBe(true);
      expect(isRetryable({ code: 'ECONNRESET' })).toBe(true);
      expect(isRetryable({ code: 'ECONNREFUSED' })).toBe(true);
      expect(isRetryable({ code: 'ENOTFOUND' })).toBe(true);
    });

    it('should return true for AbortError', () => {
      expect(isRetryable({ name: 'AbortError' })).toBe(true);
    });

    it('should return true for 5xx errors', () => {
      expect(isRetryable({ status: 500 })).toBe(true);
      expect(isRetryable({ status: 502 })).toBe(true);
      expect(isRetryable({ status: 503 })).toBe(true);
      expect(isRetryable({ status: 504 })).toBe(true);
    });

    it('should return true for 429 rate limit', () => {
      expect(isRetryable({ status: 429 })).toBe(true);
    });

    it('should return false for 4xx client errors (except 429)', () => {
      expect(isRetryable({ status: 400 })).toBe(false);
      expect(isRetryable({ status: 401 })).toBe(false);
      expect(isRetryable({ status: 403 })).toBe(false);
      expect(isRetryable({ status: 404 })).toBe(false);
    });

    it('should return false for unknown errors', () => {
      expect(isRetryable({ message: 'unknown error' })).toBe(false);
      expect(isRetryable({})).toBe(false);
    });
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on retryable error and succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValue('success');

      const result = await withRetry(fn, { baseDelay: 1 });
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const error = { code: 'ETIMEDOUT', message: 'timeout' };
      const fn = vi.fn().mockRejectedValue(error);

      await expect(withRetry(fn, { maxRetries: 2, baseDelay: 1 }))
        .rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const error = { status: 404, message: 'not found' };
      const fn = vi.fn().mockRejectedValue(error);

      await expect(withRetry(fn, { baseDelay: 1 }))
        .rejects.toEqual(error);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValue('success');

      await withRetry(fn, { baseDelay: 1, onRetry });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        expect.objectContaining({
          attempt: 1,
          maxRetries: 3,
          error: { code: 'ETIMEDOUT' }
        })
      );
    });

    it('should respect maxDelay cap', async () => {
      const onRetry = vi.fn();
      const fn = vi.fn()
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockRejectedValueOnce({ code: 'ETIMEDOUT' })
        .mockResolvedValue('success');

      await withRetry(fn, {
        baseDelay: 1000,
        maxDelay: 100,
        maxRetries: 3,
        onRetry
      });

      // All delays should be capped at maxDelay (100) + jitter (0-100)
      for (const call of onRetry.mock.calls) {
        expect(call[0].delay).toBeLessThanOrEqual(200);
      }
    });
  });
});
