/**
 * Document Collection - Operations for bundestag-document-chunks collection
 * Stores section chunks from Drucksachen for semantic search
 */

import { getClient } from './client.js';
import { config } from '../../config.js';
import * as logger from '../../utils/logger.js';
import {
  createSearcher,
  createUpserter,
  createCollectionInfo,
  createExistsChecker,
  ensureCollectionExists
} from './baseOperations.js';

const LOG_PREFIX = 'QDRANT';

let isHealthy = false;

// Index definitions for the document collection
const INDEXES = [
  { field: 'drucksache_id', type: 'integer' },
  { field: 'dokumentnummer', type: 'keyword' },
  { field: 'drucksachetyp', type: 'keyword' },
  { field: 'chunk_type', type: 'keyword' },
  { field: 'wahlperiode', type: 'integer' },
  { field: 'datum', type: 'keyword' },
  { field: 'urheber', type: 'keyword' }
];

/**
 * Check if document collection is available
 */
export function isDocumentCollectionAvailable() {
  return config.qdrant.enabled && isHealthy;
}

/**
 * Initialize the document collection if it doesn't exist
 */
export async function ensureDocumentCollection() {
  const success = await ensureCollectionExists(
    config.qdrant.documentCollection,
    INDEXES,
    LOG_PREFIX
  );
  isHealthy = success;
  return success;
}

// Create search function using factory
const searchInternal = createSearcher(config.qdrant.documentCollection, LOG_PREFIX);

/**
 * Search for document chunks
 * @param {number[]} vector - Query embedding
 * @param {object} options - Search options
 * @returns {Promise<Array<{id: number, score: number, payload: object}>>}
 */
export async function searchDocumentChunks(vector, options = {}) {
  return searchInternal(vector, options);
}

// Create upsert function using factory
const upsertInternal = createUpserter(config.qdrant.documentCollection, LOG_PREFIX);

/**
 * Upsert document chunks
 * @param {Array<{id: number, vector: number[], payload: object}>} points
 */
export async function upsertDocumentChunks(points) {
  return upsertInternal(points);
}

// Create collection info function using factory
const getInfoInternal = createCollectionInfo(config.qdrant.documentCollection, LOG_PREFIX);

/**
 * Get document collection statistics
 */
export async function getDocumentCollectionInfo() {
  return getInfoInternal();
}

// Create exists checker using factory
const existsInternal = createExistsChecker(config.qdrant.documentCollection, 'drucksache_id');

/**
 * Check if document chunks exist for a given drucksache_id
 * @param {number} drucksacheId
 * @returns {Promise<boolean>}
 */
export async function documentChunksExist(drucksacheId) {
  return existsInternal(drucksacheId);
}

/**
 * Build a Qdrant filter for document chunk search
 * @param {object} params - Search parameters
 * @returns {object|null} - Qdrant filter or null
 */
export function buildDocumentFilter(params) {
  const conditions = [];

  if (params.drucksachetyp) {
    conditions.push({
      key: 'drucksachetyp',
      match: { value: params.drucksachetyp }
    });
  }

  if (params.drucksachetypen && params.drucksachetypen.length > 0) {
    conditions.push({
      key: 'drucksachetyp',
      match: { any: params.drucksachetypen }
    });
  }

  if (params.chunkType) {
    conditions.push({
      key: 'chunk_type',
      match: { value: params.chunkType }
    });
  }

  if (params.chunkTypes && params.chunkTypes.length > 0) {
    conditions.push({
      key: 'chunk_type',
      match: { any: params.chunkTypes }
    });
  }

  if (params.wahlperiode) {
    conditions.push({
      key: 'wahlperiode',
      match: { value: params.wahlperiode }
    });
  }

  if (params.urheber) {
    conditions.push({
      key: 'urheber',
      match: { value: params.urheber }
    });
  }

  if (params.drucksacheId) {
    conditions.push({
      key: 'drucksache_id',
      match: { value: params.drucksacheId }
    });
  }

  if (params.dateFrom || params.dateTo) {
    const dateCondition = { key: 'datum' };
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
