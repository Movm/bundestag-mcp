/**
 * Protocol Collection - Operations for bundestag-protocol-chunks collection
 * Stores speech chunks from Plenarprotokolle for semantic search
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

// Index definitions for the protocol collection
const INDEXES = [
  { field: 'protokoll_id', type: 'integer' },
  { field: 'speaker', type: 'keyword' },
  { field: 'speaker_party', type: 'keyword' },
  { field: 'speaker_state', type: 'keyword' },
  { field: 'top', type: 'keyword' },
  { field: 'wahlperiode', type: 'integer' },
  { field: 'datum', type: 'keyword' },
  { field: 'herausgeber', type: 'keyword' },
  { field: 'chunk_type', type: 'keyword' },
  // Enhanced speech parsing indexes (Phase 2)
  { field: 'speech_type', type: 'keyword' },
  { field: 'category', type: 'keyword' },
  { field: 'is_government', type: 'bool' }
];

/**
 * Check if protocol collection is available
 */
export function isProtocolCollectionAvailable() {
  return config.qdrant.enabled && isHealthy;
}

/**
 * Initialize the protocol collection if it doesn't exist
 */
export async function ensureProtocolCollection() {
  const success = await ensureCollectionExists(
    config.qdrant.protocolCollection,
    INDEXES,
    LOG_PREFIX
  );
  isHealthy = success;
  return success;
}

/**
 * Delete and recreate protocol collection for full re-indexing
 * WARNING: This deletes ALL protocol data!
 * @returns {Promise<boolean>} Success status
 */
export async function recreateProtocolCollection() {
  const qdrant = getClient();
  if (!qdrant) return false;

  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === config.qdrant.protocolCollection);

    if (exists) {
      await qdrant.deleteCollection(config.qdrant.protocolCollection);
      logger.info(LOG_PREFIX, `Deleted protocol collection: ${config.qdrant.protocolCollection}`);
    }

    // Reset health status to force recreation
    isHealthy = false;

    // Recreate with fresh schema
    return await ensureProtocolCollection();
  } catch (err) {
    logger.error(LOG_PREFIX, `Failed to recreate protocol collection: ${err.message}`);
    return false;
  }
}

// Create search function using factory
const searchInternal = createSearcher(config.qdrant.protocolCollection, LOG_PREFIX);

/**
 * Search for protocol chunks
 * @param {number[]} vector - Query embedding
 * @param {object} options - Search options
 * @returns {Promise<Array<{id: number, score: number, payload: object}>>}
 */
export async function searchProtocolChunks(vector, options = {}) {
  return searchInternal(vector, options);
}

/**
 * Hybrid search for protocol chunks with keyword boosting
 * Combines vector similarity with keyword matching for improved precision
 * @param {number[]} vector - Query embedding
 * @param {object} options - Search options
 * @returns {Promise<Array<{id: number, score: number, boostedScore: number, payload: object, keywordMatches: string[]}>>}
 */
export async function hybridSearchProtocolChunks(vector, options = {}) {
  const {
    limit = 10,
    filter = null,
    scoreThreshold = 0.0,
    keywords = [],
    excludeKeywords = [],
    keywordBoost = 0.5,
    oversampling = 3
  } = options;

  const startTime = Date.now();

  // 1. Get more candidates via vector search
  const candidates = await searchProtocolChunks(vector, {
    limit: limit * oversampling,
    filter,
    scoreThreshold
  });

  // 2. Apply exclude filter and keyword boosting
  const processed = candidates
    .filter(result => {
      if (excludeKeywords.length === 0) return true;
      const text = result.payload.text.toLowerCase();
      return !excludeKeywords.some(ex => text.includes(ex.toLowerCase()));
    })
    .map(result => {
      let boost = 1.0;
      const text = result.payload.text.toLowerCase();
      const matches = [];

      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          boost += keywordBoost;
          matches.push(keyword);
        }
      }

      return {
        ...result,
        originalScore: result.score,
        boostedScore: result.score * boost,
        keywordMatches: matches
      };
    });

  // 3. Re-rank by boosted score
  const results = processed
    .sort((a, b) => b.boostedScore - a.boostedScore)
    .slice(0, limit);

  const elapsed = Date.now() - startTime;
  const boostedCount = results.filter(r => r.keywordMatches.length > 0).length;
  logger.debug(LOG_PREFIX, `Hybrid search: ${results.length} results (${boostedCount} boosted) in ${elapsed}ms`);

  return results;
}

// Create upsert function using factory
const upsertInternal = createUpserter(config.qdrant.protocolCollection, LOG_PREFIX);

/**
 * Upsert protocol chunks
 * @param {Array<{id: number, vector: number[], payload: object}>} points
 */
export async function upsertProtocolChunks(points) {
  return upsertInternal(points);
}

// Create collection info function using factory
const getInfoInternal = createCollectionInfo(config.qdrant.protocolCollection, LOG_PREFIX);

/**
 * Get protocol collection statistics
 */
export async function getProtocolCollectionInfo() {
  return getInfoInternal();
}

// Create exists checker using factory
const existsInternal = createExistsChecker(config.qdrant.protocolCollection, 'protokoll_id');

/**
 * Check if protocol chunks exist for a given protokoll_id
 * @param {number} protokollId
 * @returns {Promise<boolean>}
 */
export async function protocolChunksExist(protokollId) {
  return existsInternal(protokollId);
}

/**
 * Build a Qdrant filter for protocol chunk search
 * @param {object} params - Search parameters
 * @returns {object|null} - Qdrant filter or null
 */
export function buildProtocolFilter(params) {
  const conditions = [];

  if (params.speaker) {
    conditions.push({
      key: 'speaker',
      match: { value: params.speaker }
    });
  }

  if (params.speakerParty) {
    conditions.push({
      key: 'speaker_party',
      match: { value: params.speakerParty }
    });
  }

  if (params.speakerState) {
    conditions.push({
      key: 'speaker_state',
      match: { value: params.speakerState }
    });
  }

  if (params.top) {
    conditions.push({
      key: 'top',
      match: { value: params.top }
    });
  }

  if (params.wahlperiode) {
    conditions.push({
      key: 'wahlperiode',
      match: { value: params.wahlperiode }
    });
  }

  if (params.herausgeber) {
    conditions.push({
      key: 'herausgeber',
      match: { value: params.herausgeber }
    });
  }

  if (params.chunkType) {
    conditions.push({
      key: 'chunk_type',
      match: { value: params.chunkType }
    });
  }

  if (params.protokollId) {
    conditions.push({
      key: 'protokoll_id',
      match: { value: params.protokollId }
    });
  }

  // Filters for enhanced speech parsing
  if (params.speechType) {
    conditions.push({
      key: 'speech_type',
      match: { value: params.speechType }
    });
  }

  if (params.speechTypes && params.speechTypes.length > 0) {
    conditions.push({
      key: 'speech_type',
      match: { any: params.speechTypes }
    });
  }

  if (typeof params.isGovernment === 'boolean') {
    conditions.push({
      key: 'is_government',
      match: { value: params.isGovernment }
    });
  }

  if (params.category) {
    conditions.push({
      key: 'category',
      match: { value: params.category }
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
