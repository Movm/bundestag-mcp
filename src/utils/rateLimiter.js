/**
 * Token Bucket Rate Limiter
 *
 * Allows controlled bursts while enforcing average rate limits.
 * Tokens refill continuously; requests consume tokens or wait.
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export class RateLimiter {
  /**
   * Create a new rate limiter
   *
   * @param {Object} options - Rate limiter options
   * @param {number} options.requestsPerMinute - Maximum requests per minute (default: 60)
   * @param {number} options.burstSize - Maximum burst size (default: 10)
   * @param {number} options.maxWaitTime - Maximum time to wait for a token in ms (default: 30000)
   */
  constructor(options = {}) {
    const {
      requestsPerMinute = 60,
      burstSize = 10,
      maxWaitTime = 30000
    } = options;

    this.maxTokens = burstSize;
    this.tokens = burstSize;
    this.refillRate = requestsPerMinute / 60000; // tokens per ms
    this.maxWaitTime = maxWaitTime;
    this.lastRefill = Date.now();

    // Statistics
    this.stats = {
      totalRequests: 0,
      throttledRequests: 0,
      totalWaitTime: 0
    };
  }

  /**
   * Refill tokens based on elapsed time
   */
  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Try to acquire a token, waiting if necessary
   *
   * @returns {Promise<boolean>} - True if token acquired, false if timeout
   */
  async acquire() {
    this.stats.totalRequests++;
    this.refill();

    // If we have tokens, consume one immediately
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }

    // Calculate wait time
    const tokensNeeded = 1 - this.tokens;
    const waitTime = tokensNeeded / this.refillRate;

    // Check if wait time exceeds maximum
    if (waitTime > this.maxWaitTime) {
      this.stats.throttledRequests++;
      return false;
    }

    // Wait for tokens to become available
    this.stats.throttledRequests++;
    this.stats.totalWaitTime += waitTime;

    await sleep(waitTime);

    // Refill and consume
    this.refill();
    this.tokens--;
    return true;
  }

  /**
   * Check if a request can proceed without waiting
   *
   * @returns {boolean} - True if token available immediately
   */
  canProceed() {
    this.refill();
    return this.tokens >= 1;
  }

  /**
   * Get rate limiter statistics
   */
  getStats() {
    return {
      ...this.stats,
      currentTokens: Math.floor(this.tokens * 100) / 100,
      maxTokens: this.maxTokens,
      refillRatePerSecond: Math.round(this.refillRate * 1000 * 100) / 100,
      avgWaitTimeMs: this.stats.throttledRequests > 0
        ? Math.round(this.stats.totalWaitTime / this.stats.throttledRequests)
        : 0
    };
  }

  /**
   * Reset the rate limiter
   */
  reset() {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    this.stats = {
      totalRequests: 0,
      throttledRequests: 0,
      totalWaitTime: 0
    };
  }
}

// Singleton instance for API rate limiting
let apiRateLimiter = null;

/**
 * Get or create the API rate limiter
 *
 * @param {Object} options - Rate limiter options (only used on first call)
 * @returns {RateLimiter}
 */
export function getApiRateLimiter(options = {}) {
  if (!apiRateLimiter) {
    apiRateLimiter = new RateLimiter({
      requestsPerMinute: 60,  // Conservative default for DIP API
      burstSize: 10,
      maxWaitTime: 30000,
      ...options
    });
  }
  return apiRateLimiter;
}

/**
 * Wrap an async function with rate limiting
 *
 * @param {Function} fn - Async function to wrap
 * @param {RateLimiter} limiter - Rate limiter to use
 * @returns {Function} - Rate-limited function
 */
export function withRateLimit(fn, limiter = getApiRateLimiter()) {
  return async (...args) => {
    const acquired = await limiter.acquire();

    if (!acquired) {
      const error = new Error('Rate limit exceeded - request timed out waiting for capacity');
      error.code = 'RATE_LIMITED';
      error.status = 429;
      throw error;
    }

    return fn(...args);
  };
}
