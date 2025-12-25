/**
 * Main Collection - Operations for bundestag-docs collection
 * Stores entity metadata (drucksachen, vorgaenge, aktivitaeten, personen)
 */

import { getClient } from './client.js';
import { config } from '../../config.js';
import * as logger from '../../utils/logger.js';
import {
  createSearcher,
  createUpserter,
  createCollectionInfo,
  ensureCollectionExists
} from './baseOperations.js';

const LOG_PREFIX = 'QDRANT';

let isHealthy = false;

// Index definitions for the main collection
const INDEXES = [
  { field: 'doc_type', type: 'keyword' },
  { field: 'wahlperiode', type: 'integer' },
  { field: 'date', type: 'keyword' },
  { field: 'entity_type', type: 'keyword' },
  { field: 'sachgebiet', type: 'keyword' },
  { field: 'initiative', type: 'keyword' },
  { field: 'fraktion', type: 'keyword' }
];

/**
 * Check if main collection is available
 */
export function isAvailable() {
  return config.qdrant.enabled && isHealthy;
}

/**
 * Initialize the main collection if it doesn't exist
 */
export async function ensureCollection() {
  const success = await ensureCollectionExists(
    config.qdrant.collection,
    INDEXES,
    LOG_PREFIX
  );
  isHealthy = success;
  return success;
}

// Create search function using factory
const searchInternal = createSearcher(config.qdrant.collection, LOG_PREFIX);

/**
 * Search for similar documents
 * @param {number[]} vector - Query embedding
 * @param {object} options - Search options
 * @returns {Promise<Array<{id: string, score: number, payload: object}>>}
 */
export async function search(vector, options = {}) {
  return searchInternal(vector, options);
}

// Create upsert function using factory
const upsertInternal = createUpserter(config.qdrant.collection, LOG_PREFIX);

/**
 * Upsert documents with their embeddings
 * @param {Array<{id: string, vector: number[], payload: object}>} points
 */
export async function upsertPoints(points) {
  return upsertInternal(points);
}

// Create collection info function using factory
const getInfoInternal = createCollectionInfo(config.qdrant.collection, LOG_PREFIX);

/**
 * Get collection statistics
 */
export async function getCollectionInfo() {
  return getInfoInternal();
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
    logger.debug(LOG_PREFIX, `getPoints failed: ${err.message}`);
    return [];
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
    logger.debug(LOG_PREFIX, `Deleted ${ids.length} points`);
  } catch (err) {
    logger.error(LOG_PREFIX, `Failed to delete points: ${err.message}`);
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
