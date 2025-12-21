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

// ============================================================================
// Protocol Chunks Collection
// ============================================================================

let isProtocolCollectionHealthy = false;

/**
 * Initialize the protocol chunks collection if it doesn't exist
 */
export async function ensureProtocolCollection() {
  const qdrant = getClient();
  if (!qdrant) return false;

  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === config.qdrant.protocolCollection);

    if (!exists) {
      await qdrant.createCollection(config.qdrant.protocolCollection, {
        vectors: {
          size: config.qdrant.vectorSize,
          distance: 'Cosine'
        }
      });
      logger.info('QDRANT', `Created protocol collection: ${config.qdrant.protocolCollection}`);

      // Create indexes for protocol-specific fields
      await qdrant.createPayloadIndex(config.qdrant.protocolCollection, {
        field_name: 'protokoll_id',
        field_schema: 'integer'
      });
      await qdrant.createPayloadIndex(config.qdrant.protocolCollection, {
        field_name: 'speaker',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.protocolCollection, {
        field_name: 'speaker_party',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.protocolCollection, {
        field_name: 'speaker_state',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.protocolCollection, {
        field_name: 'top',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.protocolCollection, {
        field_name: 'wahlperiode',
        field_schema: 'integer'
      });
      await qdrant.createPayloadIndex(config.qdrant.protocolCollection, {
        field_name: 'datum',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.protocolCollection, {
        field_name: 'herausgeber',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.protocolCollection, {
        field_name: 'chunk_type',
        field_schema: 'keyword'
      });
      logger.info('QDRANT', 'Created protocol collection indexes');
    }

    isProtocolCollectionHealthy = true;
    return true;
  } catch (err) {
    logger.error('QDRANT', `Failed to ensure protocol collection: ${err.message}`);
    isProtocolCollectionHealthy = false;
    return false;
  }
}

/**
 * Check if protocol collection is available
 */
export function isProtocolCollectionAvailable() {
  return config.qdrant.enabled && isProtocolCollectionHealthy;
}

/**
 * Upsert protocol chunks
 * @param {Array<{id: number, vector: number[], payload: object}>} points
 */
export async function upsertProtocolChunks(points) {
  const qdrant = getClient();
  if (!qdrant) {
    throw new Error('Qdrant not available');
  }

  const startTime = Date.now();

  try {
    await qdrant.upsert(config.qdrant.protocolCollection, {
      wait: true,
      points: points.map(p => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload
      }))
    });

    const elapsed = Date.now() - startTime;
    logger.debug('QDRANT', `Upserted ${points.length} protocol chunks in ${elapsed}ms`);
  } catch (err) {
    logger.error('QDRANT', `Failed to upsert protocol chunks: ${err.message}`);
    throw err;
  }
}

/**
 * Search for protocol chunks
 * @param {number[]} vector - Query embedding
 * @param {object} options - Search options
 * @returns {Promise<Array<{id: number, score: number, payload: object}>>}
 */
export async function searchProtocolChunks(vector, options = {}) {
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
    const results = await qdrant.search(config.qdrant.protocolCollection, {
      vector,
      limit,
      filter,
      score_threshold: scoreThreshold,
      with_payload: true
    });

    const elapsed = Date.now() - startTime;
    logger.debug('QDRANT', `Protocol search returned ${results.length} results in ${elapsed}ms`);

    return results.map(r => ({
      id: r.id,
      score: r.score,
      payload: r.payload
    }));
  } catch (err) {
    logger.error('QDRANT', `Protocol search failed: ${err.message}`);
    throw err;
  }
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

/**
 * Get protocol collection statistics
 */
export async function getProtocolCollectionInfo() {
  const qdrant = getClient();
  if (!qdrant) {
    return null;
  }

  try {
    const info = await qdrant.getCollection(config.qdrant.protocolCollection);
    return {
      pointsCount: info.points_count,
      vectorsCount: info.vectors_count,
      status: info.status,
      optimizerStatus: info.optimizer_status
    };
  } catch (err) {
    logger.warn('QDRANT', `Failed to get protocol collection info: ${err.message}`);
    return null;
  }
}

/**
 * Check if protocol chunks exist for a given protokoll_id
 * @param {number} protokollId
 * @returns {Promise<boolean>}
 */
export async function protocolChunksExist(protokollId) {
  const qdrant = getClient();
  if (!qdrant) return false;

  try {
    const results = await qdrant.scroll(config.qdrant.protocolCollection, {
      filter: {
        must: [{ key: 'protokoll_id', match: { value: protokollId } }]
      },
      limit: 1,
      with_payload: false,
      with_vector: false
    });
    return results.points && results.points.length > 0;
  } catch (err) {
    return false;
  }
}

// ============================================================================
// Document Chunks Collection (Drucksachen)
// ============================================================================

let isDocumentCollectionHealthy = false;

/**
 * Initialize the document chunks collection if it doesn't exist
 */
export async function ensureDocumentCollection() {
  const qdrant = getClient();
  if (!qdrant) return false;

  try {
    const collections = await qdrant.getCollections();
    const exists = collections.collections.some(c => c.name === config.qdrant.documentCollection);

    if (!exists) {
      await qdrant.createCollection(config.qdrant.documentCollection, {
        vectors: {
          size: config.qdrant.vectorSize,
          distance: 'Cosine'
        }
      });
      logger.info('QDRANT', `Created document collection: ${config.qdrant.documentCollection}`);

      // Create indexes for document-specific fields
      await qdrant.createPayloadIndex(config.qdrant.documentCollection, {
        field_name: 'drucksache_id',
        field_schema: 'integer'
      });
      await qdrant.createPayloadIndex(config.qdrant.documentCollection, {
        field_name: 'dokumentnummer',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.documentCollection, {
        field_name: 'drucksachetyp',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.documentCollection, {
        field_name: 'chunk_type',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.documentCollection, {
        field_name: 'wahlperiode',
        field_schema: 'integer'
      });
      await qdrant.createPayloadIndex(config.qdrant.documentCollection, {
        field_name: 'datum',
        field_schema: 'keyword'
      });
      await qdrant.createPayloadIndex(config.qdrant.documentCollection, {
        field_name: 'urheber',
        field_schema: 'keyword'
      });
      logger.info('QDRANT', 'Created document collection indexes');
    }

    isDocumentCollectionHealthy = true;
    return true;
  } catch (err) {
    logger.error('QDRANT', `Failed to ensure document collection: ${err.message}`);
    isDocumentCollectionHealthy = false;
    return false;
  }
}

/**
 * Check if document collection is available
 */
export function isDocumentCollectionAvailable() {
  return config.qdrant.enabled && isDocumentCollectionHealthy;
}

/**
 * Upsert document chunks
 * @param {Array<{id: number, vector: number[], payload: object}>} points
 */
export async function upsertDocumentChunks(points) {
  const qdrant = getClient();
  if (!qdrant) {
    throw new Error('Qdrant not available');
  }

  const startTime = Date.now();

  try {
    await qdrant.upsert(config.qdrant.documentCollection, {
      wait: true,
      points: points.map(p => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload
      }))
    });

    const elapsed = Date.now() - startTime;
    logger.debug('QDRANT', `Upserted ${points.length} document chunks in ${elapsed}ms`);
  } catch (err) {
    logger.error('QDRANT', `Failed to upsert document chunks: ${err.message}`);
    throw err;
  }
}

/**
 * Search for document chunks
 * @param {number[]} vector - Query embedding
 * @param {object} options - Search options
 * @returns {Promise<Array<{id: number, score: number, payload: object}>>}
 */
export async function searchDocumentChunks(vector, options = {}) {
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
    const results = await qdrant.search(config.qdrant.documentCollection, {
      vector,
      limit,
      filter,
      score_threshold: scoreThreshold,
      with_payload: true
    });

    const elapsed = Date.now() - startTime;
    logger.debug('QDRANT', `Document search returned ${results.length} results in ${elapsed}ms`);

    return results.map(r => ({
      id: r.id,
      score: r.score,
      payload: r.payload
    }));
  } catch (err) {
    logger.error('QDRANT', `Document search failed: ${err.message}`);
    throw err;
  }
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

/**
 * Get document collection statistics
 */
export async function getDocumentCollectionInfo() {
  const qdrant = getClient();
  if (!qdrant) {
    return null;
  }

  try {
    const info = await qdrant.getCollection(config.qdrant.documentCollection);
    return {
      pointsCount: info.points_count,
      vectorsCount: info.vectors_count,
      status: info.status,
      optimizerStatus: info.optimizer_status
    };
  } catch (err) {
    logger.warn('QDRANT', `Failed to get document collection info: ${err.message}`);
    return null;
  }
}

/**
 * Check if document chunks exist for a given drucksache_id
 * @param {number} drucksacheId
 * @returns {Promise<boolean>}
 */
export async function documentChunksExist(drucksacheId) {
  const qdrant = getClient();
  if (!qdrant) return false;

  try {
    const results = await qdrant.scroll(config.qdrant.documentCollection, {
      filter: {
        must: [{ key: 'drucksache_id', match: { value: drucksacheId } }]
      },
      limit: 1,
      with_payload: false,
      with_vector: false
    });
    return results.points && results.points.length > 0;
  } catch (err) {
    return false;
  }
}
