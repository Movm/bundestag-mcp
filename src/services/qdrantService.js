/**
 * Qdrant Vector Database Service for Bundestag MCP Server
 * Handles vector storage and semantic search
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';

let client = null;
let isHealthy = false;

/**
 * Get or create the Qdrant client
 */
function getClient() {
  if (!client && config.qdrant.enabled) {
    client = new QdrantClient({ url: config.qdrant.url });
    logger.info('QDRANT', `Client initialized for ${config.qdrant.url}`);
  }
  return client;
}

/**
 * Check if Qdrant service is available
 */
export function isAvailable() {
  return config.qdrant.enabled && isHealthy;
}

/**
 * Initialize the collection if it doesn't exist
 */
export async function ensureCollection() {
  const qdrant = getClient();
  if (!qdrant) return false;

  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === config.qdrant.collection);

    if (!exists) {
      await qdrant.createCollection(config.qdrant.collection, {
        vectors: {
          size: config.qdrant.vectorSize,
          distance: 'Cosine'
        }
      });
      logger.info('QDRANT', `Created collection: ${config.qdrant.collection}`);

      await qdrant.createPayloadIndex(config.qdrant.collection, {
        field_name: 'doc_type',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.collection, {
        field_name: 'wahlperiode',
        field_schema: 'integer'
      });
      await qdrant.createPayloadIndex(config.qdrant.collection, {
        field_name: 'date',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.collection, {
        field_name: 'entity_type',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.collection, {
        field_name: 'sachgebiet',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.collection, {
        field_name: 'initiative',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.collection, {
        field_name: 'fraktion',
        field_schema: 'keyword'
      });
      logger.info('QDRANT', 'Created payload indexes');
    }

    isHealthy = true;
    return true;
  } catch (err) {
    logger.error('QDRANT', `Failed to ensure collection: ${err.message}`);
    isHealthy = false;
    return false;
  }
}

/**
 * Health check for Qdrant
 */
export async function healthCheck() {
  const qdrant = getClient();
  if (!qdrant) {
    isHealthy = false;
    return false;
  }

  try {
    await qdrant.getCollections();
    isHealthy = true;
    return true;
  } catch (err) {
    logger.warn('QDRANT', `Health check failed: ${err.message}`);
    isHealthy = false;
    return false;
  }
}

/**
 * Upsert documents with their embeddings
 * @param {Array<{id: string, vector: number[], payload: object}>} points
 */
export async function upsertPoints(points) {
  const qdrant = getClient();
  if (!qdrant) {
    throw new Error('Qdrant not available');
  }

  const startTime = Date.now();

  try {
    await qdrant.upsert(config.qdrant.collection, {
      wait: true,
      points: points.map(p => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload
      }))
    });

    const elapsed = Date.now() - startTime;
    logger.debug('QDRANT', `Upserted ${points.length} points in ${elapsed}ms`);
  } catch (err) {
    logger.error('QDRANT', `Failed to upsert points: ${err.message}`);
    throw err;
  }
}

/**
 * Check if points exist in the collection
 * @param {number[]} pointIds - Array of point IDs to check
 * @returns {Promise<Array<{id: number}>>} - Array of existing points
 */
export async function getPoints(pointIds) {
  const qdrant = getClient();
  if (!qdrant || pointIds.length === 0) {
    return [];
  }

  try {
    const result = await qdrant.retrieve(config.qdrant.collection, {
      ids: pointIds,
      with_payload: false,
      with_vector: false
    });
    return result || [];
  } catch (err) {
    logger.debug('QDRANT', `getPoints failed: ${err.message}`);
    return [];
  }
}

/**
 * Search for similar documents
 * @param {number[]} vector - Query embedding
 * @param {object} options - Search options
 * @returns {Promise<Array<{id: string, score: number, payload: object}>>}
 */
export async function search(vector, options = {}) {
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
    const results = await qdrant.search(config.qdrant.collection, {
      vector,
      limit,
      filter,
      score_threshold: scoreThreshold,
      with_payload: true
    });

    const elapsed = Date.now() - startTime;
    logger.debug('QDRANT', `Search returned ${results.length} results in ${elapsed}ms`);

    return results.map(r => ({
      id: r.id,
      score: r.score,
      payload: r.payload
    }));
  } catch (err) {
    logger.error('QDRANT', `Search failed: ${err.message}`);
    throw err;
  }
}

/**
 * Build a Qdrant filter from search parameters
 * @param {object} params - Search parameters
 * @returns {object|null} - Qdrant filter or null
 */
export function buildFilter(params) {
  const conditions = [];

  if (params.docTypes && params.docTypes.length > 0) {
    conditions.push({
      key: 'doc_type',
      match: { any: params.docTypes }
    });
  }

  if (params.entityTypes && params.entityTypes.length > 0) {
    conditions.push({
      key: 'entity_type',
      match: { any: params.entityTypes }
    });
  }

  if (params.wahlperiode) {
    conditions.push({
      key: 'wahlperiode',
      match: { value: params.wahlperiode }
    });
  }

  if (params.sachgebiet) {
    conditions.push({
      key: 'sachgebiet',
      match: { value: params.sachgebiet }
    });
  }

  if (params.initiative) {
    conditions.push({
      key: 'initiative',
      match: { value: params.initiative }
    });
  }

  if (params.fraktion) {
    conditions.push({
      key: 'fraktion',
      match: { value: params.fraktion }
    });
  }

  if (params.dateFrom || params.dateTo) {
    const dateCondition = { key: 'date' };
    if (params.dateFrom && params.dateTo) {
      dateCondition.range = { gte: params.dateFrom, lte: params.dateTo };
    } else if (params.dateFrom) {
      dateCondition.range = { gte: params.dateFrom };
    } else {
      dateCondition.range = { lte: params.dateTo };
    }
    conditions.push(dateCondition);
  }

  if (conditions.length === 0) {
    return null;
  }

  return { must: conditions };
}

/**
 * Get collection statistics
 */
export async function getCollectionInfo() {
  const qdrant = getClient();
  if (!qdrant) {
    return null;
  }

  try {
    const info = await qdrant.getCollection(config.qdrant.collection);
    return {
      pointsCount: info.points_count,
      vectorsCount: info.vectors_count,
      status: info.status,
      optimizerStatus: info.optimizer_status
    };
  } catch (err) {
    logger.warn('QDRANT', `Failed to get collection info: ${err.message}`);
    return null;
  }
}

/**
 * Check if a document exists by ID
 * @param {string} docId - Document ID
 * @returns {Promise<boolean>}
 */
export async function pointExists(docId) {
  const qdrant = getClient();
  if (!qdrant) return false;

  try {
    const result = await qdrant.retrieve(config.qdrant.collection, {
      ids: [docId],
      with_payload: false,
      with_vector: false
    });
    return result.length > 0;
  } catch (err) {
    return false;
  }
}

/**
 * Delete points by document IDs
 * @param {string[]} ids - Array of document IDs
 */
export async function deletePoints(ids) {
  const qdrant = getClient();
  if (!qdrant) return;

  try {
    await qdrant.delete(config.qdrant.collection, {
      wait: true,
      points: ids
    });
    logger.debug('QDRANT', `Deleted ${ids.length} points`);
  } catch (err) {
    logger.error('QDRANT', `Failed to delete points: ${err.message}`);
    throw err;
  }
}
