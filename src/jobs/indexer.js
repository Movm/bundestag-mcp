/**
 * Background Document Indexer for Bundestag MCP Server
 * Fetches documents from DIP API and indexes them in Qdrant
 */

import { config } from '../config.js';
import * as api from '../api/bundestag.js';
import * as embedding from '../services/embeddingService.js';
import * as qdrant from '../services/qdrantService.js';
import * as logger from '../utils/logger.js';

let indexerInterval = null;
let isRunning = false;
let lastIndexTime = null;
let stats = {
  totalIndexed: 0,
  lastRunDuration: 0,
  lastRunDocuments: 0,
  errors: 0
};

/**
 * Generate a unique point ID from document type and ID
 * Returns a positive integer for Qdrant
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
 * Index documents of a specific type
 */
async function indexDocumentType(docType, searchFn, wahlperiode) {
  const batchSize = config.mistral.batchSize;
  let cursor = null;
  let indexed = 0;
  let hasMore = true;

  logger.info('INDEXER', `Indexing ${docType} for WP${wahlperiode}`);

  while (hasMore) {
    try {
      const result = await searchFn({
        wahlperiode,
        limit: 100,
        cursor
      }, { useCache: false });

      if (!result.documents || result.documents.length === 0) {
        hasMore = false;
        continue;
      }

      const documents = result.documents;
      cursor = result.cursor;
      hasMore = !!cursor && documents.length > 0;

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);

        const textsToEmbed = batch.map(doc => embedding.prepareDocumentText(doc));

        let embeddings;
        try {
          embeddings = await embedding.embedBatch(textsToEmbed);
        } catch (err) {
          logger.error('INDEXER', `Embedding failed for batch: ${err.message}`);
          stats.errors++;
          continue;
        }

        const points = batch.map((doc, idx) => ({
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

        try {
          await qdrant.upsertPoints(points);
          indexed += points.length;
        } catch (err) {
          logger.error('INDEXER', `Qdrant upsert failed: ${err.message}`);
          stats.errors++;
        }
      }

      logger.debug('INDEXER', `Indexed ${indexed} ${docType} documents so far`);

    } catch (err) {
      logger.error('INDEXER', `Failed to fetch ${docType}: ${err.message}`);
      stats.errors++;
      hasMore = false;
    }
  }

  return indexed;
}

/**
 * Run a full indexing pass
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

  logger.info('INDEXER', 'Starting indexing pass', {
    wahlperioden: config.indexer.wahlperioden
  });

  try {
    for (const wp of config.indexer.wahlperioden) {
      totalIndexed += await indexDocumentType('drucksache', api.searchDrucksachen, wp);

      totalIndexed += await indexDocumentType('vorgang', api.searchVorgaenge, wp);

      totalIndexed += await indexDocumentType('aktivitaet', api.searchAktivitaeten, wp);
    }

    const duration = Date.now() - startTime;

    stats.totalIndexed += totalIndexed;
    stats.lastRunDuration = duration;
    stats.lastRunDocuments = totalIndexed;
    lastIndexTime = new Date();

    logger.info('INDEXER', `Indexing pass complete`, {
      documentsIndexed: totalIndexed,
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

  runIndexingPass();

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
    lastIndexTime: lastIndexTime?.toISOString() || null,
    totalIndexed: stats.totalIndexed,
    lastRunDuration: stats.lastRunDuration,
    lastRunDocuments: stats.lastRunDocuments,
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
