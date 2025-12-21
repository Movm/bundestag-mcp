/**
 * Embedding Service for Bundestag MCP Server
 * Uses Mistral AI to generate embeddings for semantic search
 */

import { Mistral } from '@mistralai/mistralai';
import { config } from '../config.js';
import * as logger from '../utils/logger.js';

let client = null;

/**
 * Initialize the Mistral client
 */
function getClient() {
  if (!client && config.mistral.apiKey) {
    client = new Mistral({ apiKey: config.mistral.apiKey });
    logger.info('EMBEDDING', 'Mistral client initialized');
  }
  return client;
}

/**
 * Check if embedding service is available
 */
export function isAvailable() {
  return !!config.mistral.apiKey;
}

/**
 * Generate embedding for a single text
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector (1024 dimensions)
 */
export async function embed(text) {
  const embeddings = await embedBatch([text]);
  return embeddings[0];
}

/**
 * Generate embeddings for multiple texts
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function embedBatch(texts) {
  const mistral = getClient();
  if (!mistral) {
    throw new Error('Mistral API key not configured');
  }

  if (texts.length === 0) {
    return [];
  }

  const startTime = Date.now();

  try {
    const response = await mistral.embeddings.create({
      model: config.mistral.embeddingModel,
      inputs: texts
    });

    const embeddings = response.data.map(item => item.embedding);
    const elapsed = Date.now() - startTime;

    logger.debug('EMBEDDING', `Generated ${texts.length} embeddings in ${elapsed}ms`);

    return embeddings;
  } catch (err) {
    logger.error('EMBEDDING', `Failed to generate embeddings: ${err.message}`);
    throw err;
  }
}

/**
 * Generate embeddings in batches (for large document sets)
 * @param {string[]} texts - Array of texts to embed
 * @param {function} onProgress - Optional progress callback
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function embedBatchLarge(texts, onProgress = null) {
  const batchSize = config.mistral.batchSize;
  const results = [];
  const totalBatches = Math.ceil(texts.length / batchSize);

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    logger.debug('EMBEDDING', `Processing batch ${batchNum}/${totalBatches}`);

    const embeddings = await embedBatch(batch);
    results.push(...embeddings);

    if (onProgress) {
      onProgress({
        current: Math.min(i + batchSize, texts.length),
        total: texts.length,
        batch: batchNum,
        totalBatches
      });
    }
  }

  return results;
}

/**
 * Prepare document text for embedding
 * Combines title and other metadata into a single string optimized for search
 * @param {object} doc - Document object
 * @returns {string} - Text to embed
 */
export function prepareDocumentText(doc) {
  const parts = [];

  if (doc.titel) {
    parts.push(doc.titel);
  }

  if (doc.drucksachetyp) {
    parts.push(`Typ: ${doc.drucksachetyp}`);
  }

  if (doc.vorgangstyp) {
    parts.push(`Typ: ${doc.vorgangstyp}`);
  }

  if (doc.aktivitaetsart) {
    parts.push(`Art: ${doc.aktivitaetsart}`);
  }

  if (doc.abstract) {
    parts.push(doc.abstract);
  }

  if (doc.sachgebiet) {
    parts.push(`Sachgebiet: ${doc.sachgebiet}`);
  }

  if (doc.initiative) {
    parts.push(`Initiative: ${doc.initiative}`);
  }

  if (doc.urheber) {
    const urheber = Array.isArray(doc.urheber) ? doc.urheber.join(', ') : doc.urheber;
    parts.push(`Urheber: ${urheber}`);
  }

  if (doc.ressort) {
    parts.push(`Ressort: ${doc.ressort}`);
  }

  if (doc.deskriptoren && Array.isArray(doc.deskriptoren)) {
    parts.push(`Themen: ${doc.deskriptoren.join(', ')}`);
  }

  return parts.join(' | ');
}
