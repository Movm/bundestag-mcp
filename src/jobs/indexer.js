/**
 * Background Document Indexer for Bundestag MCP Server
 * Fetches documents from DIP API and indexes them in Qdrant
 *
 * Optimizations:
 * - Pipelined fetch/embed/upsert operations
 * - Larger embedding batches (64 docs)
 * - Skip already-indexed documents (incremental indexing)
 */

import { config } from '../config.js';
import * as api from '../api/bundestag.js';
import * as embedding from '../services/embeddingService.js';
import * as qdrant from '../services/qdrantService.js';
import * as logger from '../utils/logger.js';
import { parseProtokoll } from '../services/protokollParser.js';

let indexerInterval = null;
let isRunning = false;
let lastIndexTime = null;
let lastSuccessfulIndexTime = null; // For incremental updates
let stats = {
  totalIndexed: 0,
  lastRunDuration: 0,
  lastRunDocuments: 0,
  lastRunSkipped: 0,
  errors: 0,
  mode: 'full' // 'full' or 'incremental'
};

/**
 * Generate a unique point ID from document type and ID
 * Uses deterministic hash for consistent IDs across runs
 */
function generatePointId(docType, docId) {
  const combined = `${docType}:${docId}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Check which documents are already indexed in Qdrant
 * Returns Set of existing point IDs
 */
async function getExistingPointIds(pointIds) {
  try {
    const existing = await qdrant.getPoints(pointIds);
    return new Set(existing.map(p => p.id));
  } catch (err) {
    logger.warn('INDEXER', `Could not check existing points: ${err.message}`);
    return new Set();
  }
}

/**
 * Process a batch of documents: filter, embed, upsert
 * Returns count of newly indexed documents
 */
async function processBatch(batch, docType, wahlperiode) {
  const pointIds = batch.map(doc => generatePointId(docType, doc.id));

  // Check which docs are already indexed (skip them)
  const existingIds = await getExistingPointIds(pointIds);
  const newDocs = batch.filter((_, idx) => !existingIds.has(pointIds[idx]));

  if (newDocs.length === 0) {
    return { indexed: 0, skipped: batch.length };
  }

  // Generate embeddings for new docs only
  const textsToEmbed = newDocs.map(doc => embedding.prepareDocumentText(doc));

  let embeddings;
  try {
    embeddings = await embedding.embedBatch(textsToEmbed);
  } catch (err) {
    logger.error('INDEXER', `Embedding failed: ${err.message}`);
    stats.errors++;
    return { indexed: 0, skipped: existingIds.size };
  }

  // Build points for Qdrant
  const points = newDocs.map((doc, idx) => ({
    id: generatePointId(docType, doc.id),
    vector: embeddings[idx],
    payload: {
      doc_id: String(doc.id),
      doc_type: docType,
      entity_type: doc.drucksachetyp || doc.vorgangstyp || doc.aktivitaetsart || null,
      wahlperiode: doc.wahlperiode || wahlperiode,
      date: doc.datum || doc.aktualisiert || null,
      title: doc.titel || null,
      abstract: doc.abstract || null,
      dokumentnummer: doc.dokumentnummer || null,
      authors: doc.autoren || doc.urheber || [],
      descriptors: doc.deskriptoren || [],
      sachgebiet: doc.sachgebiet || null,
      initiative: doc.initiative || null,
      fraktion: doc.fraktion || null,
      ressort: doc.ressort || null
    }
  }));

  // Upsert to Qdrant
  try {
    await qdrant.upsertPoints(points);
    return { indexed: points.length, skipped: existingIds.size };
  } catch (err) {
    logger.error('INDEXER', `Qdrant upsert failed: ${err.message}`);
    stats.errors++;
    return { indexed: 0, skipped: existingIds.size };
  }
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Index documents of a specific type
 * Supports incremental mode using f.aktualisiert.start parameter
 */
async function indexDocumentType(docType, searchFn, wahlperiode, updatedSince = null) {
  const BATCH_SIZE = 64;
  const API_DELAY_MS = 500; // Delay between API calls to avoid rate limits
  let cursor = null;
  let indexed = 0;
  let skipped = 0;
  let hasMore = true;

  const mode = updatedSince ? 'incremental' : 'full';
  logger.info('INDEXER', `Indexing ${docType} for WP${wahlperiode} (${mode})`,
    updatedSince ? { since: updatedSince } : {});

  while (hasMore) {
    try {
      // Build query params - use aktualisiert filter for incremental mode
      const queryParams = { wahlperiode, limit: 100, cursor };
      if (updatedSince) {
        queryParams.aktualisiert_start = updatedSince;
      }

      const currentResult = await searchFn(queryParams, { useCache: false });

      if (!currentResult.documents || currentResult.documents.length === 0) {
        hasMore = false;
        continue;
      }

      const documents = currentResult.documents;
      cursor = currentResult.cursor;
      hasMore = !!cursor && documents.length > 0;

      // Process current page in batches
      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE);
        const result = await processBatch(batch, docType, wahlperiode);
        indexed += result.indexed;
        skipped += result.skipped;
      }

      if (indexed > 0 || skipped > 0) {
        logger.debug('INDEXER', `${docType} WP${wahlperiode}: ${indexed} indexed, ${skipped} skipped`);
      }

      // Delay before next API call to avoid rate limits
      if (hasMore) {
        await sleep(API_DELAY_MS);
      }

    } catch (err) {
      logger.error('INDEXER', `Failed to fetch ${docType}: ${err.message}`);
      stats.errors++;
      // On rate limit, wait longer before giving up
      if (err.message.includes('Rate-Limit') || err.message.includes('Enodia')) {
        logger.warn('INDEXER', 'Rate limited, waiting 30s before retry...');
        await sleep(30000);
      }
      hasMore = false;
    }
  }

  logger.info('INDEXER', `Completed ${docType} WP${wahlperiode}: ${indexed} new, ${skipped} skipped`);
  return { indexed, skipped };
}

/**
 * Run an indexing pass (full or incremental)
 * First run is full, subsequent runs use f.aktualisiert.start for incremental updates
 */
async function runIndexingPass() {
  if (isRunning) {
    logger.warn('INDEXER', 'Indexing already in progress, skipping');
    return;
  }

  if (!embedding.isAvailable()) {
    logger.warn('INDEXER', 'Embedding service not available (MISTRAL_API_KEY not set)');
    return;
  }

  if (!qdrant.isAvailable()) {
    logger.warn('INDEXER', 'Qdrant not available, attempting to reconnect');
    const connected = await qdrant.ensureCollection();
    if (!connected) {
      logger.error('INDEXER', 'Failed to connect to Qdrant, skipping indexing');
      return;
    }
  }

  isRunning = true;
  const startTime = Date.now();
  let totalIndexed = 0;
  let totalSkipped = 0;

  // Use incremental mode if we have a previous successful run
  // DIP API has 15 min delay, so subtract 20 min for safety overlap
  let updatedSince = null;
  if (lastSuccessfulIndexTime) {
    const overlapMs = 20 * 60 * 1000; // 20 minutes overlap
    const sinceDate = new Date(lastSuccessfulIndexTime.getTime() - overlapMs);
    updatedSince = sinceDate.toISOString();
    stats.mode = 'incremental';
  } else {
    stats.mode = 'full';
  }

  logger.info('INDEXER', `Starting ${stats.mode} indexing pass`, {
    wahlperioden: config.indexer.wahlperioden,
    ...(updatedSince && { since: updatedSince })
  });

  try {
    for (const wp of config.indexer.wahlperioden) {
      // Index each document type for this wahlperiode
      for (const [docType, searchFn] of [
        ['drucksache', api.searchDrucksachen],
        ['vorgang', api.searchVorgaenge],
        ['aktivitaet', api.searchAktivitaeten]
      ]) {
        const result = await indexDocumentType(docType, searchFn, wp, updatedSince);
        totalIndexed += result.indexed;
        totalSkipped += result.skipped;
      }
    }

    const duration = Date.now() - startTime;

    stats.totalIndexed += totalIndexed;
    stats.lastRunDuration = duration;
    stats.lastRunDocuments = totalIndexed;
    stats.lastRunSkipped = totalSkipped;
    lastIndexTime = new Date();
    lastSuccessfulIndexTime = new Date(); // Mark successful run for incremental mode

    logger.info('INDEXER', `Indexing pass complete (${stats.mode})`, {
      newDocuments: totalIndexed,
      skipped: totalSkipped,
      durationMs: duration,
      durationMinutes: (duration / 60000).toFixed(2)
    });

  } catch (err) {
    logger.error('INDEXER', `Indexing pass failed: ${err.message}`);
    stats.errors++;
  } finally {
    isRunning = false;
  }
}

/**
 * Start the background indexer
 */
export async function start() {
  if (!config.indexer.enabled) {
    logger.info('INDEXER', 'Background indexer disabled');
    return;
  }

  if (!config.mistral.apiKey) {
    logger.warn('INDEXER', 'Cannot start indexer: MISTRAL_API_KEY not set');
    return;
  }

  logger.info('INDEXER', `Starting background indexer`, {
    intervalMinutes: config.indexer.intervalMinutes,
    wahlperioden: config.indexer.wahlperioden
  });

  const connected = await qdrant.ensureCollection();
  if (!connected) {
    logger.error('INDEXER', 'Failed to connect to Qdrant on startup');
    return;
  }

  // Start first indexing pass
  runIndexingPass();

  // Schedule periodic runs
  const intervalMs = config.indexer.intervalMinutes * 60 * 1000;
  indexerInterval = setInterval(runIndexingPass, intervalMs);
}

/**
 * Stop the background indexer
 */
export function stop() {
  if (indexerInterval) {
    clearInterval(indexerInterval);
    indexerInterval = null;
    logger.info('INDEXER', 'Background indexer stopped');
  }
}

/**
 * Get indexer statistics
 */
export function getStats() {
  return {
    enabled: config.indexer.enabled,
    running: isRunning,
    mode: stats.mode,
    lastIndexTime: lastIndexTime?.toISOString() || null,
    lastSuccessfulIndexTime: lastSuccessfulIndexTime?.toISOString() || null,
    totalIndexed: stats.totalIndexed,
    lastRunDuration: stats.lastRunDuration,
    lastRunDocuments: stats.lastRunDocuments,
    lastRunSkipped: stats.lastRunSkipped,
    errors: stats.errors,
    wahlperioden: config.indexer.wahlperioden,
    intervalMinutes: config.indexer.intervalMinutes
  };
}

/**
 * Trigger a manual indexing run
 */
export async function triggerManualRun() {
  if (isRunning) {
    return { success: false, message: 'Indexing already in progress' };
  }

  runIndexingPass();
  return { success: true, message: 'Indexing started' };
}

// ============================================================================
// Protocol Chunk Indexing
// ============================================================================

let protocolStats = {
  totalProtocols: 0,
  totalChunks: 0,
  lastRunProtocols: 0,
  lastRunChunks: 0,
  errors: 0
};

/**
 * Generate a unique point ID for a protocol chunk
 */
function generateChunkPointId(protokollId, chunkIndex, chunkPart = 0) {
  const combined = `protocol:${protokollId}:${chunkIndex}:${chunkPart}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Process a single protocol: fetch text, parse, embed, upsert
 */
async function indexProtocol(protokoll) {
  const protokollId = protokoll.id;

  // Check if already indexed
  const exists = await qdrant.protocolChunksExist(protokollId);
  if (exists) {
    logger.debug('INDEXER', `Protocol ${protokollId} already indexed, skipping`);
    return { chunks: 0, skipped: true };
  }

  // Fetch full text
  let textResult;
  try {
    textResult = await api.getPlenarprotokollText(protokollId, { useCache: false });
    if (!textResult || !textResult.text) {
      logger.warn('INDEXER', `No text found for protocol ${protokollId}`);
      return { chunks: 0, skipped: false };
    }
  } catch (err) {
    logger.error('INDEXER', `Failed to fetch protocol text ${protokollId}: ${err.message}`);
    protocolStats.errors++;
    return { chunks: 0, skipped: false };
  }

  // Parse into speeches
  const parsed = parseProtokoll(textResult.text, {
    id: protokollId,
    dokumentnummer: protokoll.dokumentnummer,
    wahlperiode: protokoll.wahlperiode,
    datum: protokoll.datum || protokoll.fundstelle?.datum,
    herausgeber: protokoll.herausgeber,
    titel: protokoll.titel
  });

  if (parsed.speeches.length === 0) {
    logger.warn('INDEXER', `No speeches found in protocol ${protokollId}`);
    return { chunks: 0, skipped: false };
  }

  logger.debug('INDEXER', `Parsed ${parsed.speeches.length} chunks from protocol ${protokollId}`);

  // Generate embeddings for all chunks
  const EMBED_BATCH_SIZE = 32;
  const allPoints = [];

  for (let i = 0; i < parsed.speeches.length; i += EMBED_BATCH_SIZE) {
    const batch = parsed.speeches.slice(i, i + EMBED_BATCH_SIZE);
    const textsToEmbed = batch.map(chunk => {
      // Create embedding text with context
      const parts = [chunk.text];
      if (chunk.speaker) parts.unshift(`Redner: ${chunk.speaker}`);
      if (chunk.speaker_party) parts.unshift(`Fraktion: ${chunk.speaker_party}`);
      if (chunk.top) parts.unshift(`${chunk.top}`);
      return parts.join(' | ');
    });

    let embeddings;
    try {
      embeddings = await embedding.embedBatch(textsToEmbed);
    } catch (err) {
      logger.error('INDEXER', `Embedding failed for protocol ${protokollId}: ${err.message}`);
      protocolStats.errors++;
      continue;
    }

    // Build points
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const pointId = generateChunkPointId(protokollId, chunk.chunk_index, chunk.chunk_part || 0);

      allPoints.push({
        id: pointId,
        vector: embeddings[j],
        payload: {
          protokoll_id: protokollId,
          dokumentnummer: parsed.metadata.dokumentnummer,
          wahlperiode: parsed.metadata.wahlperiode,
          datum: parsed.metadata.datum,
          herausgeber: parsed.metadata.herausgeber,
          chunk_index: chunk.chunk_index,
          chunk_part: chunk.chunk_part || 0,
          chunk_type: chunk.chunk_type,
          speaker: chunk.speaker,
          speaker_party: chunk.speaker_party,
          speaker_state: chunk.speaker_state,
          speaker_role: chunk.speaker_role,
          top: chunk.top,
          top_title: chunk.top_title,
          text: chunk.text,
          text_length: chunk.text_length
        }
      });
    }
  }

  // Upsert to Qdrant
  if (allPoints.length > 0) {
    try {
      // Upsert in batches
      const UPSERT_BATCH_SIZE = 64;
      for (let i = 0; i < allPoints.length; i += UPSERT_BATCH_SIZE) {
        const batch = allPoints.slice(i, i + UPSERT_BATCH_SIZE);
        await qdrant.upsertProtocolChunks(batch);
      }
      logger.info('INDEXER', `Indexed protocol ${protokollId}: ${allPoints.length} chunks`);
      return { chunks: allPoints.length, skipped: false };
    } catch (err) {
      logger.error('INDEXER', `Failed to upsert protocol ${protokollId}: ${err.message}`);
      protocolStats.errors++;
      return { chunks: 0, skipped: false };
    }
  }

  return { chunks: 0, skipped: false };
}

/**
 * Index all protocols for a wahlperiode
 */
async function indexProtocolsForWahlperiode(wahlperiode, herausgeber = 'BT') {
  const API_DELAY_MS = 500;
  let cursor = null;
  let hasMore = true;
  let totalChunks = 0;
  let totalProtocols = 0;
  let skipped = 0;

  logger.info('INDEXER', `Indexing protocols for WP${wahlperiode} (${herausgeber})`);

  while (hasMore) {
    try {
      const result = await api.searchPlenarprotokolle({
        wahlperiode,
        limit: 20,
        cursor
      }, { useCache: false });

      if (!result.documents || result.documents.length === 0) {
        hasMore = false;
        continue;
      }

      // Filter by herausgeber
      const protocols = result.documents.filter(p => p.herausgeber === herausgeber);
      cursor = result.cursor;
      hasMore = !!cursor && result.documents.length > 0;

      for (const protokoll of protocols) {
        const indexResult = await indexProtocol(protokoll);
        if (indexResult.skipped) {
          skipped++;
        } else if (indexResult.chunks > 0) {
          totalChunks += indexResult.chunks;
          totalProtocols++;
        }

        // Delay between protocols
        await sleep(API_DELAY_MS);
      }

    } catch (err) {
      logger.error('INDEXER', `Failed to fetch protocols: ${err.message}`);
      protocolStats.errors++;
      hasMore = false;
    }
  }

  logger.info('INDEXER', `Completed protocols WP${wahlperiode}: ${totalProtocols} new, ${skipped} skipped, ${totalChunks} chunks`);
  return { protocols: totalProtocols, chunks: totalChunks, skipped };
}

/**
 * Run protocol indexing pass
 */
export async function runProtocolIndexing() {
  if (isRunning) {
    logger.warn('INDEXER', 'Indexing already in progress, skipping protocol indexing');
    return;
  }

  if (!embedding.isAvailable()) {
    logger.warn('INDEXER', 'Embedding service not available');
    return;
  }

  // Ensure protocol collection exists
  const connected = await qdrant.ensureProtocolCollection();
  if (!connected) {
    logger.error('INDEXER', 'Failed to connect to Qdrant protocol collection');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  let totalProtocols = 0;
  let totalChunks = 0;

  try {
    // Only index WP 20 for now (as specified by user)
    const wahlperiode = 20;

    // Index Bundestag protocols
    const btResult = await indexProtocolsForWahlperiode(wahlperiode, 'BT');
    totalProtocols += btResult.protocols;
    totalChunks += btResult.chunks;

    // Optionally index Bundesrat protocols
    // const brResult = await indexProtocolsForWahlperiode(wahlperiode, 'BR');
    // totalProtocols += brResult.protocols;
    // totalChunks += brResult.chunks;

    const duration = Date.now() - startTime;

    protocolStats.totalProtocols += totalProtocols;
    protocolStats.totalChunks += totalChunks;
    protocolStats.lastRunProtocols = totalProtocols;
    protocolStats.lastRunChunks = totalChunks;

    logger.info('INDEXER', 'Protocol indexing complete', {
      protocols: totalProtocols,
      chunks: totalChunks,
      durationMs: duration,
      durationMinutes: (duration / 60000).toFixed(2)
    });

  } catch (err) {
    logger.error('INDEXER', `Protocol indexing failed: ${err.message}`);
    protocolStats.errors++;
  } finally {
    isRunning = false;
  }
}

/**
 * Get protocol indexer statistics
 */
export function getProtocolStats() {
  return {
    totalProtocols: protocolStats.totalProtocols,
    totalChunks: protocolStats.totalChunks,
    lastRunProtocols: protocolStats.lastRunProtocols,
    lastRunChunks: protocolStats.lastRunChunks,
    errors: protocolStats.errors
  };
}

/**
 * Trigger manual protocol indexing
 */
export async function triggerProtocolIndexing() {
  if (isRunning) {
    return { success: false, message: 'Indexing already in progress' };
  }

  runProtocolIndexing();
  return { success: true, message: 'Protocol indexing started' };
}
