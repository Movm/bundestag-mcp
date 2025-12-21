/**
 * Prometheus Metrics for Bundestag MCP Server
 *
 * Exports metrics in Prometheus format for monitoring.
 * prom-client is an optional dependency - metrics are disabled if not installed.
 */

let promClient = null;
let registry = null;
let metricsEnabled = false;

// Try to load prom-client (optional dependency)
try {
  promClient = await import('prom-client');
  registry = new promClient.Registry();
  metricsEnabled = true;

  // Add default metrics (CPU, memory, event loop)
  promClient.collectDefaultMetrics({ register: registry });
} catch (e) {
  // prom-client not installed, metrics disabled
}

// Metric definitions (only created if prom-client is available)
let httpRequestsTotal = null;
let httpRequestDuration = null;
let apiRequestsTotal = null;
let apiRequestDuration = null;
let cacheHitsTotal = null;
let cacheMissesTotal = null;
let circuitBreakerState = null;
let activeSessions = null;

if (metricsEnabled) {
  httpRequestsTotal = new promClient.Counter({
    name: 'bundestag_http_requests_total',
    help: 'Total HTTP requests',
    labelNames: ['method', 'path', 'status'],
    registers: [registry]
  });

  httpRequestDuration = new promClient.Histogram({
    name: 'bundestag_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'path'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    registers: [registry]
  });

  apiRequestsTotal = new promClient.Counter({
    name: 'bundestag_api_requests_total',
    help: 'Total DIP API requests',
    labelNames: ['endpoint', 'entity', 'status'],
    registers: [registry]
  });

  apiRequestDuration = new promClient.Histogram({
    name: 'bundestag_api_request_duration_seconds',
    help: 'DIP API request duration in seconds',
    labelNames: ['endpoint', 'entity'],
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
    registers: [registry]
  });

  cacheHitsTotal = new promClient.Counter({
    name: 'bundestag_cache_hits_total',
    help: 'Total cache hits',
    labelNames: ['cache_type'],
    registers: [registry]
  });

  cacheMissesTotal = new promClient.Counter({
    name: 'bundestag_cache_misses_total',
    help: 'Total cache misses',
    labelNames: ['cache_type'],
    registers: [registry]
  });

  circuitBreakerState = new promClient.Gauge({
    name: 'bundestag_circuit_breaker_state',
    help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
    registers: [registry]
  });

  activeSessions = new promClient.Gauge({
    name: 'bundestag_active_sessions',
    help: 'Number of active MCP sessions',
    registers: [registry]
  });
}

/**
 * Record an HTTP request
 */
export function recordHttpRequest(method, path, status, durationMs) {
  if (!metricsEnabled) return;

  httpRequestsTotal.inc({ method, path, status: String(status) });
  httpRequestDuration.observe({ method, path }, durationMs / 1000);
}

/**
 * Record a DIP API request
 */
export function recordApiRequest(endpoint, entity, status, durationMs) {
  if (!metricsEnabled) return;

  apiRequestsTotal.inc({ endpoint, entity, status });
  apiRequestDuration.observe({ endpoint, entity }, durationMs / 1000);
}

/**
 * Record a cache hit
 */
export function recordCacheHit(cacheType) {
  if (!metricsEnabled) return;
  cacheHitsTotal.inc({ cache_type: cacheType });
}

/**
 * Record a cache miss
 */
export function recordCacheMiss(cacheType) {
  if (!metricsEnabled) return;
  cacheMissesTotal.inc({ cache_type: cacheType });
}

/**
 * Update circuit breaker state metric
 */
export function updateCircuitBreakerState(state) {
  if (!metricsEnabled) return;

  const stateValue = {
    'CLOSED': 0,
    'HALF_OPEN': 1,
    'OPEN': 2
  }[state] ?? 0;

  circuitBreakerState.set(stateValue);
}

/**
 * Update active sessions count
 */
export function updateActiveSessions(count) {
  if (!metricsEnabled) return;
  activeSessions.set(count);
}

/**
 * Get metrics in Prometheus format
 */
export async function getMetrics() {
  if (!metricsEnabled) {
    return '# Prometheus metrics disabled (prom-client not installed)\n';
  }
  return registry.metrics();
}

/**
 * Get content type for metrics response
 */
export function getMetricsContentType() {
  if (!metricsEnabled) {
    return 'text/plain';
  }
  return registry.contentType;
}

/**
 * Check if metrics are enabled
 */
export function isMetricsEnabled() {
  return metricsEnabled;
}

/**
 * Express middleware to record HTTP metrics
 */
export function metricsMiddleware() {
  return (req, res, next) => {
    if (!metricsEnabled) {
      return next();
    }

    const start = Date.now();

    res.on('finish', () => {
      const duration = Date.now() - start;
      const path = req.route?.path || req.path || 'unknown';
      recordHttpRequest(req.method, path, res.statusCode, duration);
    });

    next();
  };
}
