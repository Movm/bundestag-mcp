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
import * as qdrant from '../services/qdrant/index.js';
import * as logger from '../utils/logger.js';
import { parseProtokoll } from '../services/protokollParser.js';
import { parseDrucksache } from '../services/drucksacheParser.js';
import * as analysisService from '../services/analysisService.js';
import * as indexerState from '../services/indexerState.js';

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
 * @param {boolean} isIncremental - Skip Qdrant check when true (DIP API already filtered)
 */
async function processBatch(batch, docType, wahlperiode, isIncremental = false) {
  const pointIds = batch.map(doc => generatePointId(docType, doc.id));

  let newDocs = batch;
  let skippedCount = 0;

  // In incremental mode, skip Qdrant check - DIP API already filtered by aktualisiert
  if (!isIncremental) {
    const existingIds = await getExistingPointIds(pointIds);
    newDocs = batch.filter((_, idx) => !existingIds.has(pointIds[idx]));
    skippedCount = existingIds.size;
  }

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
    return { indexed: 0, skipped: skippedCount };
  }

  // Build points for Qdrant
  const points = newDocs.map((doc, idx) => {
    // Build base payload
    const payload = {
      doc_id: String(doc.id),
      doc_type: docType,
      entity_type: doc.drucksachetyp || doc.vorgangstyp || doc.aktivitaetsart || null,
      wahlperiode: Array.isArray(doc.wahlperiode) ? doc.wahlperiode[0] : (doc.wahlperiode || wahlperiode),
      date: doc.datum || doc.aktualisiert || null,
      title: doc.titel || null,
      abstract: doc.abstract || null,
      dokumentnummer: doc.dokumentnummer || null,
      authors: doc.autoren || doc.urheber || [],
      descriptors: doc.deskriptoren || [],
      sachgebiet: doc.sachgebiet || null,
      initiative: doc.initiative || null,
      fraktion: Array.isArray(doc.fraktion) ? doc.fraktion[0] : (doc.fraktion || null),
      ressort: doc.ressort || null
    };

    // Add person-specific fields
    if (docType === 'person') {
      payload.person_name = `${doc.vorname || ''} ${doc.nachname || ''}`.trim();
      payload.person_vorname = doc.vorname || null;
      payload.person_nachname = doc.nachname || null;
      payload.person_funktion = Array.isArray(doc.funktion) ? doc.funktion : (doc.funktion ? [doc.funktion] : []);
      payload.person_wahlperioden = Array.isArray(doc.wahlperiode) ? doc.wahlperiode : [doc.wahlperiode];
    }

    return {
      id: generatePointId(docType, doc.id),
      vector: embeddings[idx],
      payload
    };
  });

  // Upsert to Qdrant
  try {
    await qdrant.upsertPoints(points);
    return { indexed: points.length, skipped: skippedCount };
  } catch (err) {
    logger.error('INDEXER', `Qdrant upsert failed: ${err.message}`);
    stats.errors++;
    return { indexed: 0, skipped: skippedCount };
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
      // In incremental mode, skip Qdrant checks - DIP API already filtered
      const isIncremental = !!updatedSince;
      for (let i = 0; i < documents.length; i += BATCH_SIZE) {
        const batch = documents.slice(i, i + BATCH_SIZE);
        const result = await processBatch(batch, docType, wahlperiode, isIncremental);
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
 * Uses per-WP+doctype timestamps from SQLite for incremental mode
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
  const OVERLAP_MS = 20 * 60 * 1000; // 20 minutes overlap for DIP API delay

  logger.info('INDEXER', `Starting indexing pass`, {
    wahlperioden: config.indexer.wahlperioden
  });

  try {
    for (const wp of config.indexer.wahlperioden) {
      // Index each document type for this wahlperiode
      for (const [docType, searchFn] of [
        ['drucksache', api.searchDrucksachen],
        ['vorgang', api.searchVorgaenge],
        ['aktivitaet', api.searchAktivitaeten],
        ['person', api.searchPersonen]
      ]) {
        // Get per-WP+doctype last indexed time from SQLite
        const lastTime = indexerState.getLastIndexTime(wp, docType);
        let updatedSince = null;

        if (lastTime) {
          const sinceDate = new Date(lastTime.getTime() - OVERLAP_MS);
          updatedSince = sinceDate.toISOString();
          stats.mode = 'incremental';
        } else {
          stats.mode = 'full';
        }

        const result = await indexDocumentType(docType, searchFn, wp, updatedSince);
        totalIndexed += result.indexed;
        totalSkipped += result.skipped;

        // Save per-WP+doctype timestamp after success
        indexerState.setLastIndexTime(wp, docType, new Date(), result.indexed);
      }
    }

    const duration = Date.now() - startTime;

    stats.totalIndexed += totalIndexed;
    stats.lastRunDuration = duration;
    stats.lastRunDocuments = totalIndexed;
    stats.lastRunSkipped = totalSkipped;
    lastIndexTime = new Date();
    lastSuccessfulIndexTime = new Date();

    logger.info('INDEXER', `Indexing pass complete`, {
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

  // Initialize persistent state (needed for bootstrap even without embedding)
  indexerState.init();

  logger.info('INDEXER', `Starting background indexer`, {
    intervalMinutes: config.indexer.intervalMinutes,
    wahlperioden: config.indexer.wahlperioden
  });

  const connected = await qdrant.ensureCollection();
  if (!connected) {
    logger.error('INDEXER', 'Failed to connect to Qdrant on startup');
    return;
  }

  // Ensure protocol and document collections exist
  // (Sets isHealthy flags so search tools report availability)
  // This runs even without MISTRAL_API_KEY so existing indexes are searchable
  await qdrant.ensureProtocolCollection();
  await qdrant.ensureDocumentCollection();

  // Auto-bootstrap state from Qdrant if empty (for existing deployments)
  await indexerState.bootstrapFromQdrant(qdrant.getClient());

  // MISTRAL_API_KEY only required for embedding new documents
  if (!config.mistral.apiKey) {
    logger.warn('INDEXER', 'MISTRAL_API_KEY not set - existing indexes searchable but no new indexing');
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
 * Split a long speech into smaller chunks for embedding
 * @param {object} speech - Speech object
 * @param {number} maxChars - Maximum characters per chunk
 * @returns {Array} - Array of chunked speeches
 */
function splitLongSpeech(speech, maxChars = 4000) {
  if (!speech.text || speech.text.length <= maxChars) {
    return [speech];
  }

  const chunks = [];
  const sentences = speech.text.split(/(?<=[.!?])\s+/);
  let currentChunk = [];
  let currentLength = 0;
  let partIndex = 0;

  for (const sentence of sentences) {
    if (currentLength + sentence.length > maxChars && currentChunk.length > 0) {
      chunks.push({
        ...speech,
        chunk_part: partIndex++,
        text: currentChunk.join(' '),
        text_length: currentChunk.join(' ').length
      });
      currentChunk = [];
      currentLength = 0;
    }
    currentChunk.push(sentence);
    currentLength += sentence.length + 1;
  }

  if (currentChunk.length > 0) {
    chunks.push({
      ...speech,
      chunk_part: partIndex,
      text: currentChunk.join(' '),
      text_length: currentChunk.join(' ').length
    });
  }

  return chunks;
}

/**
 * Transform Python service speeches to indexer format
 * @param {Array} speeches - Speeches from Python service
 * @param {object} metadata - Protocol metadata
 * @returns {object} - Parsed result compatible with indexer
 */
function transformPythonSpeeches(speeches, metadata) {
  let chunkIndex = 0;
  const transformedSpeeches = [];

  for (const speech of speeches) {
    // Skip very short speeches
    if (!speech.text || speech.text.length < 50) {
      continue;
    }

    const baseSpeech = {
      chunk_index: chunkIndex,
      chunk_type: speech.category === 'rede' ? 'speech' : 'contribution',
      speech_type: speech.type,
      category: speech.category,
      speaker: speech.speaker,
      speaker_party: speech.party,
      speaker_state: null,
      speaker_role: speech.is_government ? 'government' : null,
      is_government: speech.is_government || false,
      first_name: speech.first_name,
      last_name: speech.last_name,
      acad_title: speech.acad_title,
      top: null,
      top_title: null,
      text: speech.text,
      text_length: speech.text?.length || 0
    };

    // Split long speeches into chunks
    const chunks = splitLongSpeech(baseSpeech, 4000);
    for (const chunk of chunks) {
      chunk.chunk_index = chunkIndex++;
      transformedSpeeches.push(chunk);
    }
  }

  return {
    metadata: {
      protokoll_id: metadata.id,
      dokumentnummer: metadata.dokumentnummer,
      wahlperiode: metadata.wahlperiode,
      datum: metadata.datum,
      herausgeber: metadata.herausgeber,
      titel: metadata.titel
    },
    speeches: transformedSpeeches
  };
}

/**
 * Process a single protocol: fetch text, parse, embed, upsert
 * Uses Python analysis service for enhanced parsing with JS fallback
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

  // Try Python analysis service first (enhanced parsing)
  let parsed;
  const metadata = {
    id: protokollId,
    dokumentnummer: protokoll.dokumentnummer,
    wahlperiode: protokoll.wahlperiode,
    datum: protokoll.datum || protokoll.fundstelle?.datum,
    herausgeber: protokoll.herausgeber,
    titel: protokoll.titel
  };

  const usePythonService = await analysisService.isAvailable();

  if (usePythonService) {
    try {
      const result = await analysisService.extractSpeeches(textResult.text);
      if (result.speeches && result.speeches.length > 0) {
        parsed = transformPythonSpeeches(result.speeches, metadata);
        logger.debug('INDEXER', `Python service extracted ${result.speech_count} speeches from protocol ${protokollId}`);
      }
    } catch (err) {
      logger.warn('INDEXER', `Python service failed for ${protokollId}, falling back to JS parser: ${err.message}`);
    }
  }

  // Fallback to JS parser if Python service unavailable or failed
  if (!parsed) {
    parsed = parseProtokoll(textResult.text, metadata);
    logger.debug('INDEXER', `JS parser extracted ${parsed.speeches.length} chunks from protocol ${protokollId}`);
  }

  if (parsed.speeches.length === 0) {
    logger.warn('INDEXER', `No speeches found in protocol ${protokollId}`);
    return { chunks: 0, skipped: false };
  }

  logger.debug('INDEXER', `Processing ${parsed.speeches.length} chunks from protocol ${protokollId}`);

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
          text_length: chunk.text_length,
          // Enhanced fields from Python parser
          speech_type: chunk.speech_type || null,
          category: chunk.category || null,
          is_government: chunk.is_government || false,
          first_name: chunk.first_name || null,
          last_name: chunk.last_name || null,
          acad_title: chunk.acad_title || null
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
 * @param {string} datumSince - ISO date string for incremental mode (optional)
 */
async function indexProtocolsForWahlperiode(wahlperiode, herausgeber = 'BT', datumSince = null) {
  const API_DELAY_MS = 500;
  let cursor = null;
  let hasMore = true;
  let totalChunks = 0;
  let totalProtocols = 0;
  let skipped = 0;

  const mode = datumSince ? 'incremental' : 'full';
  logger.info('INDEXER', `Indexing protocols for WP${wahlperiode} (${herausgeber}, ${mode})`,
    datumSince ? { since: datumSince } : {});

  while (hasMore) {
    try {
      const result = await api.searchPlenarprotokolle({
        wahlperiode,
        limit: 20,
        cursor,
        ...(datumSince && { datum_start: datumSince })
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
  const OVERLAP_MS = 20 * 60 * 1000;

  try {
    // Index all configured wahlperioden
    for (const wahlperiode of config.indexer.wahlperioden) {
      // Get per-WP last indexed time for protocols
      const lastTime = indexerState.getLastIndexTime(wahlperiode, 'protocol');
      let datumSince = null;

      if (lastTime) {
        const sinceDate = new Date(lastTime.getTime() - OVERLAP_MS);
        datumSince = sinceDate.toISOString().split('T')[0]; // API expects date only
      }

      // Index Bundestag protocols
      const btResult = await indexProtocolsForWahlperiode(wahlperiode, 'BT', datumSince);
      totalProtocols += btResult.protocols;
      totalChunks += btResult.chunks;

      // Save state after success
      indexerState.setLastIndexTime(wahlperiode, 'protocol', new Date(), btResult.protocols);
    }

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

/**
 * Force full re-indexing of protocols with new schema
 * WARNING: This deletes ALL existing protocol data!
 */
export async function triggerProtocolReindex() {
  if (isRunning) {
    return { success: false, message: 'Indexing already in progress' };
  }

  logger.info('INDEXER', 'Starting full protocol re-index (deleting existing data)');

  // Recreate collection with fresh schema
  const recreated = await qdrant.recreateProtocolCollection();
  if (!recreated) {
    return { success: false, message: 'Failed to recreate protocol collection' };
  }

  // Reset stats
  protocolStats.totalProtocols = 0;
  protocolStats.totalChunks = 0;

  // Start indexing
  runProtocolIndexing();
  return { success: true, message: 'Protocol re-indexing started (collection cleared)' };
}

// ============================================================================
// Document Chunk Indexing (Drucksachen)
// ============================================================================

let documentChunkStats = {
  totalDocuments: 0,
  totalChunks: 0,
  lastRunDocuments: 0,
  lastRunChunks: 0,
  errors: 0
};

/**
 * Generate a unique point ID for a document chunk
 */
function generateDocumentChunkPointId(drucksacheId, chunkIndex, chunkPart = 0) {
  const combined = `document:${drucksacheId}:${chunkIndex}:${chunkPart}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Process a single Drucksache: fetch text, parse, embed, upsert
 */
async function indexDrucksache(drucksache) {
  const drucksacheId = drucksache.id;

  // Check if already indexed
  const exists = await qdrant.documentChunksExist(drucksacheId);
  if (exists) {
    logger.debug('INDEXER', `Drucksache ${drucksacheId} already indexed, skipping`);
    return { chunks: 0, skipped: true };
  }

  // Fetch full text
  let textResult;
  try {
    textResult = await api.getDrucksacheText(drucksacheId, { useCache: false });
    if (!textResult || !textResult.text) {
      logger.debug('INDEXER', `No text found for Drucksache ${drucksacheId}`);
      return { chunks: 0, skipped: false };
    }
  } catch (err) {
    logger.error('INDEXER', `Failed to fetch Drucksache text ${drucksacheId}: ${err.message}`);
    documentChunkStats.errors++;
    return { chunks: 0, skipped: false };
  }

  // Parse into chunks
  const parsed = parseDrucksache(textResult.text, {
    id: drucksacheId,
    dokumentnummer: drucksache.dokumentnummer,
    drucksachetyp: drucksache.drucksachetyp,
    wahlperiode: drucksache.wahlperiode,
    datum: drucksache.datum || drucksache.aktualisiert,
    titel: drucksache.titel,
    urheber: drucksache.urheber?.map(u => u.titel || u) || []
  });

  if (parsed.chunks.length === 0) {
    logger.debug('INDEXER', `No chunks extracted from Drucksache ${drucksacheId}`);
    return { chunks: 0, skipped: false };
  }

  logger.debug('INDEXER', `Parsed ${parsed.chunks.length} chunks from Drucksache ${drucksacheId}`);

  // Generate embeddings for all chunks
  const EMBED_BATCH_SIZE = 32;
  const allPoints = [];

  for (let i = 0; i < parsed.chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = parsed.chunks.slice(i, i + EMBED_BATCH_SIZE);
    const textsToEmbed = batch.map(chunk => {
      // Create embedding text with context
      const parts = [chunk.text];
      if (chunk.section_title) parts.unshift(`Abschnitt: ${chunk.section_title}`);
      if (parsed.metadata.titel) parts.unshift(`Dokument: ${parsed.metadata.titel}`);
      return parts.join(' | ');
    });

    let embeddings;
    try {
      embeddings = await embedding.embedBatch(textsToEmbed);
    } catch (err) {
      logger.error('INDEXER', `Embedding failed for Drucksache ${drucksacheId}: ${err.message}`);
      documentChunkStats.errors++;
      continue;
    }

    // Build points
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const pointId = generateDocumentChunkPointId(drucksacheId, chunk.chunk_index, chunk.chunk_part || 0);

      allPoints.push({
        id: pointId,
        vector: embeddings[j],
        payload: {
          drucksache_id: drucksacheId,
          dokumentnummer: parsed.metadata.dokumentnummer,
          drucksachetyp: parsed.metadata.drucksachetyp,
          wahlperiode: parsed.metadata.wahlperiode,
          datum: parsed.metadata.datum,
          titel: parsed.metadata.titel,
          urheber: parsed.metadata.urheber,
          chunk_index: chunk.chunk_index,
          chunk_part: chunk.chunk_part || 0,
          chunk_type: chunk.chunk_type,
          section_title: chunk.section_title,
          artikel: chunk.artikel,
          question_number: chunk.question_number,
          point_number: chunk.point_number,
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
        await qdrant.upsertDocumentChunks(batch);
      }
      logger.info('INDEXER', `Indexed Drucksache ${drucksacheId} (${drucksache.drucksachetyp}): ${allPoints.length} chunks`);
      return { chunks: allPoints.length, skipped: false };
    } catch (err) {
      logger.error('INDEXER', `Failed to upsert Drucksache ${drucksacheId}: ${err.message}`);
      documentChunkStats.errors++;
      return { chunks: 0, skipped: false };
    }
  }

  return { chunks: 0, skipped: false };
}

/**
 * Index all Drucksachen for a wahlperiode
 * @param {string} aktualisiert_start - ISO date string for incremental mode (optional)
 */
async function indexDrucksachenChunksForWahlperiode(wahlperiode, drucksachetypen = null, aktualisiert_start = null) {
  const API_DELAY_MS = 500;
  let cursor = null;
  let hasMore = true;
  let totalChunks = 0;
  let totalDocuments = 0;
  let skipped = 0;

  // Default to most important document types for chunking
  const typesToIndex = drucksachetypen || [
    'Gesetzentwurf',
    'Kleine Anfrage',
    'Große Anfrage',
    'Antrag',
    'Beschlussempfehlung und Bericht'
  ];

  const mode = aktualisiert_start ? 'incremental' : 'full';
  logger.info('INDEXER', `Indexing Drucksache chunks for WP${wahlperiode} (${mode})`,
    { types: typesToIndex, ...(aktualisiert_start && { since: aktualisiert_start }) });

  for (const drucksachetyp of typesToIndex) {
    cursor = null;
    hasMore = true;

    logger.info('INDEXER', `Indexing ${drucksachetyp} for WP${wahlperiode}`);

    while (hasMore) {
      try {
        const result = await api.searchDrucksachen({
          wahlperiode,
          drucksachetyp,
          limit: 20,
          cursor,
          ...(aktualisiert_start && { aktualisiert_start })
        }, { useCache: false });

        if (!result.documents || result.documents.length === 0) {
          hasMore = false;
          continue;
        }

        cursor = result.cursor;
        hasMore = !!cursor && result.documents.length > 0;

        for (const drucksache of result.documents) {
          const indexResult = await indexDrucksache(drucksache);
          if (indexResult.skipped) {
            skipped++;
          } else if (indexResult.chunks > 0) {
            totalChunks += indexResult.chunks;
            totalDocuments++;
          }

          // Delay between documents
          await sleep(API_DELAY_MS);
        }

      } catch (err) {
        logger.error('INDEXER', `Failed to fetch Drucksachen: ${err.message}`);
        documentChunkStats.errors++;
        // On rate limit, wait longer
        if (err.message.includes('Rate-Limit') || err.message.includes('Enodia')) {
          logger.warn('INDEXER', 'Rate limited, waiting 30s...');
          await sleep(30000);
        } else {
          hasMore = false;
        }
      }
    }
  }

  logger.info('INDEXER', `Completed Drucksache chunks WP${wahlperiode}: ${totalDocuments} new, ${skipped} skipped, ${totalChunks} chunks`);
  return { documents: totalDocuments, chunks: totalChunks, skipped };
}

/**
 * Run document chunk indexing pass
 */
export async function runDocumentChunkIndexing() {
  if (isRunning) {
    logger.warn('INDEXER', 'Indexing already in progress, skipping document chunk indexing');
    return;
  }

  if (!embedding.isAvailable()) {
    logger.warn('INDEXER', 'Embedding service not available');
    return;
  }

  // Ensure document collection exists
  const connected = await qdrant.ensureDocumentCollection();
  if (!connected) {
    logger.error('INDEXER', 'Failed to connect to Qdrant document collection');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  let totalDocuments = 0;
  let totalChunks = 0;
  const OVERLAP_MS = 20 * 60 * 1000;

  try {
    // Index all configured wahlperioden
    for (const wahlperiode of config.indexer.wahlperioden) {
      // Get per-WP last indexed time for document chunks
      const lastTime = indexerState.getLastIndexTime(wahlperiode, 'document_chunk');
      let aktualisiert_start = null;

      if (lastTime) {
        const sinceDate = new Date(lastTime.getTime() - OVERLAP_MS);
        aktualisiert_start = sinceDate.toISOString();
      }

      const result = await indexDrucksachenChunksForWahlperiode(wahlperiode, null, aktualisiert_start);
      totalDocuments += result.documents;
      totalChunks += result.chunks;

      // Save state after success
      indexerState.setLastIndexTime(wahlperiode, 'document_chunk', new Date(), result.documents);
    }

    const duration = Date.now() - startTime;

    documentChunkStats.totalDocuments += totalDocuments;
    documentChunkStats.totalChunks += totalChunks;
    documentChunkStats.lastRunDocuments = totalDocuments;
    documentChunkStats.lastRunChunks = totalChunks;

    logger.info('INDEXER', 'Document chunk indexing complete', {
      documents: totalDocuments,
      chunks: totalChunks,
      durationMs: duration,
      durationMinutes: (duration / 60000).toFixed(2)
    });

  } catch (err) {
    logger.error('INDEXER', `Document chunk indexing failed: ${err.message}`);
    documentChunkStats.errors++;
  } finally {
    isRunning = false;
  }
}

/**
 * Get document chunk indexer statistics
 */
export function getDocumentChunkStats() {
  return {
    totalDocuments: documentChunkStats.totalDocuments,
    totalChunks: documentChunkStats.totalChunks,
    lastRunDocuments: documentChunkStats.lastRunDocuments,
    lastRunChunks: documentChunkStats.lastRunChunks,
    errors: documentChunkStats.errors
  };
}

/**
 * Trigger manual document chunk indexing
 */
export async function triggerDocumentChunkIndexing() {
  if (isRunning) {
    return { success: false, message: 'Indexing already in progress' };
  }

  runDocumentChunkIndexing();
  return { success: true, message: 'Document chunk indexing started' };
}
