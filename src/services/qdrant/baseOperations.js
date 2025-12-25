/**
 * Base Operations - Factory functions for common Qdrant operations
 * Reduces code duplication across collection modules
 */

import { getClient } from './client.js';
import { config } from '../../config.js';
import * as logger from '../../utils/logger.js';

/**
 * Create a search function for a specific collection
 * @param {string} collectionName - Name of the Qdrant collection
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Function} Search function
 */
export function createSearcher(collectionName, logPrefix) {
  return async function search(vector, options = {}) {
    const qdrant = getClient();
    if (!qdrant) {
      throw new Error('Qdrant not available');
    }

    const {
      limit = 10,
      filter = null,
      scoreThreshold = 0.0
    } = options;

    const startTime = Date.now();

    try {
      const results = await qdrant.search(collectionName, {
        vector,
        limit,
        filter,
        score_threshold: scoreThreshold,
        with_payload: true
      });

      const elapsed = Date.now() - startTime;
      logger.debug(logPrefix, `Search returned ${results.length} results in ${elapsed}ms`);

      return results.map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload
      }));
    } catch (err) {
      logger.error(logPrefix, `Search failed: ${err.message}`);
      throw err;
    }
  };
}

/**
 * Create an upsert function for a specific collection
 * @param {string} collectionName - Name of the Qdrant collection
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Function} Upsert function
 */
export function createUpserter(collectionName, logPrefix) {
  return async function upsert(points) {
    const qdrant = getClient();
    if (!qdrant) {
      throw new Error('Qdrant not available');
    }

    const startTime = Date.now();

    try {
      await qdrant.upsert(collectionName, {
        wait: true,
        points: points.map(p => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload
        }))
      });

      const elapsed = Date.now() - startTime;
      logger.debug(logPrefix, `Upserted ${points.length} points in ${elapsed}ms`);
    } catch (err) {
      logger.error(logPrefix, `Failed to upsert points: ${err.message}`);
      throw err;
    }
  };
}

/**
 * Create a collection info function for a specific collection
 * @param {string} collectionName - Name of the Qdrant collection
 * @param {string} logPrefix - Prefix for log messages
 * @returns {Function} Collection info function
 */
export function createCollectionInfo(collectionName, logPrefix) {
  return async function getInfo() {
    const qdrant = getClient();
    if (!qdrant) {
      return null;
    }

    try {
      const info = await qdrant.getCollection(collectionName);
      return {
        pointsCount: info.points_count,
        vectorsCount: info.vectors_count,
        status: info.status,
        optimizerStatus: info.optimizer_status
      };
    } catch (err) {
      logger.warn(logPrefix, `Failed to get collection info: ${err.message}`);
      return null;
    }
  };
}

/**
 * Create an exists checker function for a specific collection
 * @param {string} collectionName - Name of the Qdrant collection
 * @param {string} idFieldName - Field name to filter on (e.g., 'protokoll_id', 'drucksache_id')
 * @returns {Function} Exists checker function
 */
export function createExistsChecker(collectionName, idFieldName) {
  return async function exists(id) {
    const qdrant = getClient();
    if (!qdrant) return false;

    try {
      const results = await qdrant.scroll(collectionName, {
        filter: {
          must: [{ key: idFieldName, match: { value: id } }]
        },
        limit: 1,
        with_payload: false,
        with_vector: false
      });
      return results.points && results.points.length > 0;
    } catch (err) {
      return false;
    }
  };
}

/**
 * Create payload indexes for a collection
 * @param {QdrantClient} qdrant - Qdrant client
 * @param {string} collectionName - Collection name
 * @param {Array<{field: string, type: string}>} indexes - Index definitions
 * @param {string} logPrefix - Log prefix
 */
export async function createIndexes(qdrant, collectionName, indexes, logPrefix) {
  for (const { field, type } of indexes) {
    await qdrant.createPayloadIndex(collectionName, {
      field_name: field,
      field_schema: type
    });
  }
  logger.info(logPrefix, `Created ${indexes.length} payload indexes`);
}

/**
 * Ensure a collection exists, creating it if necessary
 * @param {string} collectionName - Collection name
 * @param {Array<{field: string, type: string}>} indexes - Index definitions
 * @param {string} logPrefix - Log prefix
 * @returns {Promise<boolean>} Success status
 */
export async function ensureCollectionExists(collectionName, indexes, logPrefix) {
  const qdrant = getClient();
  if (!qdrant) return false;

  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === collectionName);

    if (!exists) {
      await qdrant.createCollection(collectionName, {
        vectors: {
          size: config.qdrant.vectorSize,
          distance: 'Cosine'
        }
      });
      logger.info(logPrefix, `Created collection: ${collectionName}`);

      await createIndexes(qdrant, collectionName, indexes, logPrefix);
    }

    return true;
  } catch (err) {
    logger.error(logPrefix, `Failed to ensure collection: ${err.message}`);
    return false;
  }
}
