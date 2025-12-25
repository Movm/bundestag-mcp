/**
 * Qdrant Client - Core infrastructure for Qdrant vector database
 * Manages singleton client instance and health checking
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { config } from '../../config.js';
import * as logger from '../../utils/logger.js';

let client = null;

/**
 * Get or create the Qdrant client singleton
 * @returns {QdrantClient|null}
 */
export function getClient() {
  if (!client && config.qdrant.enabled) {
    const options = { url: config.qdrant.url };
    if (config.qdrant.apiKey) {
      options.apiKey = config.qdrant.apiKey;
    }
    client = new QdrantClient(options);
    logger.info('QDRANT', `Client initialized for ${config.qdrant.url}`);
  }
  return client;
}

/**
 * Health check for Qdrant connection
 * @returns {Promise<boolean>}
 */
export async function healthCheck() {
  const qdrant = getClient();
  if (!qdrant) {
    return false;
  }

  try {
    await qdrant.getCollections();
    return true;
  } catch (err) {
    logger.warn('QDRANT', `Health check failed: ${err.message}`);
    return false;
  }
}
