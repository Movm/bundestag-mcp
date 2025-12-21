/**
 * Retry logic with exponential backoff and jitter
 */

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determines if an error is retryable (transient)
 * @param {Error} error - The error to check
 * @returns {boolean} - Whether the error is retryable
 */
function isRetryable(error) {
  // Network errors
  if (error.code === 'ETIMEDOUT' ||
      error.code === 'ECONNRESET' ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ENOTFOUND' ||
      error.name === 'AbortError') {
    return true;
  }

  // HTTP 5xx server errors are retryable
  if (error.status >= 500 && error.status < 600) {
    return true;
  }

  // Rate limiting (429) is retryable
  if (error.status === 429) {
    return true;
  }

  // Client errors (4xx except 429) are not retryable
  if (error.status >= 400 && error.status < 500) {
    return false;
  }

  return false;
}

/**
 * Execute a function with retry logic and exponential backoff
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Retry options
 * @param {number} options.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} options.baseDelay - Initial delay in ms (default: 100)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 5000)
 * @param {Function} options.onRetry - Callback called before each retry
 * @returns {Promise<any>} - Result of the function
 */
export async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 100,
    maxDelay = 5000,
    onRetry = null
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if we've exhausted attempts or error isn't retryable
      if (attempt > maxRetries || !isRetryable(error)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
      const cappedDelay = Math.min(exponentialDelay, maxDelay);

      // Add jitter (0-100ms) to prevent thundering herd
      const jitter = Math.random() * 100;
      const delay = cappedDelay + jitter;

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry({
          attempt,
          maxRetries,
          delay,
          error
        });
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create a retry wrapper with preset options
 *
 * @param {Object} defaultOptions - Default retry options
 * @returns {Function} - withRetry function with preset options
 */
export function createRetryWrapper(defaultOptions = {}) {
  return (fn, options = {}) => withRetry(fn, { ...defaultOptions, ...options });
}

export { isRetryable };
