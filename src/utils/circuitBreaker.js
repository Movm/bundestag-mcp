/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by fast-failing when an upstream service
 * is unhealthy. Three states: CLOSED (normal), OPEN (failing), HALF_OPEN (testing).
 */

const STATES = {
  CLOSED: 'CLOSED',     // Normal operation, requests pass through
  OPEN: 'OPEN',         // Circuit tripped, requests fail fast
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

export class CircuitBreakerError extends Error {
  constructor(message, state) {
    super(message);
    this.name = 'CircuitBreakerError';
    this.state = state;
    this.code = 'CIRCUIT_OPEN';
    this.status = 503;
  }
}

export class CircuitBreaker {
  /**
   * Create a new circuit breaker
   *
   * @param {Object} options - Circuit breaker options
   * @param {number} options.failureThreshold - Failures before opening (default: 5)
   * @param {number} options.resetTimeout - Time in OPEN state before testing (default: 30000ms)
   * @param {number} options.halfOpenMaxRequests - Requests allowed in HALF_OPEN (default: 3)
   * @param {Function} options.isFailure - Custom failure detection (default: any error)
   */
  constructor(options = {}) {
    const {
      failureThreshold = 5,
      resetTimeout = 30000,
      halfOpenMaxRequests = 3,
      isFailure = () => true
    } = options;

    this.failureThreshold = failureThreshold;
    this.resetTimeout = resetTimeout;
    this.halfOpenMaxRequests = halfOpenMaxRequests;
    this.isFailure = isFailure;

    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.halfOpenRequests = 0;

    // Statistics
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      stateChanges: []
    };
  }

  /**
   * Get current state
   */
  getState() {
    // Check if we should transition from OPEN to HALF_OPEN
    if (this.state === STATES.OPEN && this.lastFailureTime) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.resetTimeout) {
        this.transition(STATES.HALF_OPEN);
      }
    }
    return this.state;
  }

  /**
   * Transition to a new state
   */
  transition(newState) {
    if (this.state !== newState) {
      this.stats.stateChanges.push({
        from: this.state,
        to: newState,
        timestamp: new Date().toISOString()
      });
      this.state = newState;

      // Reset counters on state change
      if (newState === STATES.CLOSED) {
        this.failures = 0;
        this.successes = 0;
      } else if (newState === STATES.HALF_OPEN) {
        this.halfOpenRequests = 0;
        this.successes = 0;
      }
    }
  }

  /**
   * Record a successful request
   */
  onSuccess() {
    this.stats.successfulRequests++;

    if (this.state === STATES.HALF_OPEN) {
      this.successes++;
      // If enough successes in half-open, close the circuit
      if (this.successes >= this.halfOpenMaxRequests) {
        this.transition(STATES.CLOSED);
      }
    } else if (this.state === STATES.CLOSED) {
      // Reset failure count on success
      this.failures = 0;
    }
  }

  /**
   * Record a failed request
   */
  onFailure() {
    this.stats.failedRequests++;
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === STATES.HALF_OPEN) {
      // Any failure in half-open reopens the circuit
      this.transition(STATES.OPEN);
    } else if (this.state === STATES.CLOSED) {
      // Check if we should open the circuit
      if (this.failures >= this.failureThreshold) {
        this.transition(STATES.OPEN);
      }
    }
  }

  /**
   * Execute a function through the circuit breaker
   *
   * @param {Function} fn - Async function to execute
   * @returns {Promise<any>} - Result of the function
   * @throws {CircuitBreakerError} - If circuit is open
   */
  async execute(fn) {
    this.stats.totalRequests++;
    const currentState = this.getState();

    // OPEN state - fail fast
    if (currentState === STATES.OPEN) {
      this.stats.rejectedRequests++;
      throw new CircuitBreakerError(
        'Circuit breaker is OPEN - service temporarily unavailable',
        currentState
      );
    }

    // HALF_OPEN state - limit requests
    if (currentState === STATES.HALF_OPEN) {
      if (this.halfOpenRequests >= this.halfOpenMaxRequests) {
        this.stats.rejectedRequests++;
        throw new CircuitBreakerError(
          'Circuit breaker is HALF_OPEN - waiting for test requests to complete',
          currentState
        );
      }
      this.halfOpenRequests++;
    }

    // Execute the function
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      // Check if this error should count as a failure
      if (this.isFailure(error)) {
        this.onFailure();
      } else {
        // Non-failure errors (e.g., 404) don't trip the circuit
        this.onSuccess();
      }
      throw error;
    }
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return {
      state: this.getState(),
      failures: this.failures,
      failureThreshold: this.failureThreshold,
      ...this.stats,
      recentStateChanges: this.stats.stateChanges.slice(-5)
    };
  }

  /**
   * Reset the circuit breaker
   */
  reset() {
    this.state = STATES.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.halfOpenRequests = 0;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rejectedRequests: 0,
      stateChanges: []
    };
  }

  /**
   * Force the circuit to a specific state (for testing/admin)
   */
  forceState(state) {
    if (Object.values(STATES).includes(state)) {
      this.transition(state);
    }
  }
}

// Singleton instance for API circuit breaker
let apiCircuitBreaker = null;

/**
 * Get or create the API circuit breaker
 *
 * @param {Object} options - Circuit breaker options
 * @returns {CircuitBreaker}
 */
export function getApiCircuitBreaker(options = {}) {
  if (!apiCircuitBreaker) {
    apiCircuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 30000,
      halfOpenMaxRequests: 3,
      // Only count server errors and timeouts as failures
      isFailure: (error) => {
        if (error.name === 'AbortError') return true;
        if (error.code === 'ETIMEDOUT') return true;
        if (error.status >= 500) return true;
        return false;
      },
      ...options
    });
  }
  return apiCircuitBreaker;
}

/**
 * Wrap an async function with circuit breaker
 *
 * @param {Function} fn - Async function to wrap
 * @param {CircuitBreaker} breaker - Circuit breaker to use
 * @returns {Function} - Circuit-protected function
 */
export function withCircuitBreaker(fn, breaker = getApiCircuitBreaker()) {
  return (...args) => breaker.execute(() => fn(...args));
}

export { STATES };
