/**
 * Cache for API responses
 * Caches API responses with TTL-based expiration
 */

import { config } from '../config.js';

// In-memory caches
const apiCache = new Map();
const entityCache = new Map();
const metadataCache = new Map();

// Cache statistics
const stats = {
  apiHits: 0,
  apiMisses: 0,
  entityHits: 0,
  entityMisses: 0
};

/**
 * Generate cache key for API request
 */
function getApiCacheKey(endpoint, params) {
  const sortedParams = Object.keys(params)
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
  return `${endpoint}?${sortedParams}`;
}

/**
 * Generate cache key for single entity
 */
function getEntityCacheKey(endpoint, id) {
  return `${endpoint}:${id}`;
}

/**
 * Clean expired entries from cache
 */
function cleanCache(cache, ttl) {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > ttl) {
      cache.delete(key);
    }
  }
}

/**
 * Evict oldest entries if cache is full
 */
function evictIfFull(cache, maxEntries) {
  if (cache.size >= maxEntries) {
    const sortedEntries = [...cache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = Math.ceil(maxEntries * 0.2);
    for (let i = 0; i < toRemove && i < sortedEntries.length; i++) {
      cache.delete(sortedEntries[i][0]);
    }
  }
}

/**
 * Get cached API response or null
 */
export function getCachedApiResponse(endpoint, params) {
  cleanCache(apiCache, config.cache.apiResponseTTL);

  const key = getApiCacheKey(endpoint, params);
  const entry = apiCache.get(key);

  if (entry && (Date.now() - entry.timestamp) < config.cache.apiResponseTTL) {
    stats.apiHits++;
    return entry.data;
  }

  stats.apiMisses++;
  return null;
}

/**
 * Cache an API response
 */
export function cacheApiResponse(endpoint, params, data) {
  evictIfFull(apiCache, config.cache.maxApiResponseEntries);

  const key = getApiCacheKey(endpoint, params);
  apiCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Get cached entity or null
 */
export function getCachedEntity(endpoint, id) {
  cleanCache(entityCache, config.cache.entityTTL);

  const key = getEntityCacheKey(endpoint, id);
  const entry = entityCache.get(key);

  if (entry && (Date.now() - entry.timestamp) < config.cache.entityTTL) {
    stats.entityHits++;
    return entry.data;
  }

  stats.entityMisses++;
  return null;
}

/**
 * Cache a single entity
 */
export function cacheEntity(endpoint, id, data) {
  evictIfFull(entityCache, config.cache.maxEntityEntries);

  const key = getEntityCacheKey(endpoint, id);
  entityCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Get cached metadata or null
 */
export function getCachedMetadata(key) {
  cleanCache(metadataCache, config.cache.metadataTTL);

  const entry = metadataCache.get(key);

  if (entry && (Date.now() - entry.timestamp) < config.cache.metadataTTL) {
    return entry.data;
  }

  return null;
}

/**
 * Cache metadata
 */
export function cacheMetadata(key, data) {
  evictIfFull(metadataCache, config.cache.maxMetadataEntries);

  metadataCache.set(key, {
    data,
    timestamp: Date.now()
  });
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  const apiHitRate = stats.apiHits + stats.apiMisses > 0
    ? (stats.apiHits / (stats.apiHits + stats.apiMisses) * 100).toFixed(1)
    : 0;

  const entityHitRate = stats.entityHits + stats.entityMisses > 0
    ? (stats.entityHits / (stats.entityHits + stats.entityMisses) * 100).toFixed(1)
    : 0;

  return {
    apiResponses: {
      entries: apiCache.size,
      hits: stats.apiHits,
      misses: stats.apiMisses,
      hitRate: `${apiHitRate}%`
    },
    entities: {
      entries: entityCache.size,
      hits: stats.entityHits,
      misses: stats.entityMisses,
      hitRate: `${entityHitRate}%`
    },
    metadata: {
      entries: metadataCache.size
    }
  };
}

/**
 * Clear all caches
 */
export function clearCaches() {
  apiCache.clear();
  entityCache.clear();
  metadataCache.clear();
  stats.apiHits = 0;
  stats.apiMisses = 0;
  stats.entityHits = 0;
  stats.entityMisses = 0;
}
