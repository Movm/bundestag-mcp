/**
 * Analysis Service for Bundestag MCP Server
 * HTTP client for the Python FastAPI analysis service
 */

import { config } from '../config.js';
import * as logger from '../utils/logger.js';

// Analysis service URL from config
const ANALYSIS_URL = config.analysis?.url || 'http://localhost:8000';

/**
 * Check if analysis service is available
 * @returns {Promise<boolean>}
 */
export async function isAvailable() {
  try {
    const response = await fetch(`${ANALYSIS_URL}/health`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000)
    });
    return response.ok;
  } catch (err) {
    logger.debug('ANALYSIS', `Service not available: ${err.message}`);
    return false;
  }
}

/**
 * Get service health status
 * @returns {Promise<object>}
 */
export async function getHealth() {
  const response = await fetch(`${ANALYSIS_URL}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Extract speeches from protocol text
 * @param {string} text - Full protocol text
 * @returns {Promise<object>} - Extracted speeches
 */
export async function extractSpeeches(text) {
  const startTime = Date.now();

  const response = await fetch(`${ANALYSIS_URL}/extract/speeches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(60000) // 60s timeout for large protocols
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Extract failed: ${response.status}`);
  }

  const result = await response.json();
  const elapsed = Date.now() - startTime;

  logger.debug('ANALYSIS', `Extracted ${result.speech_count} speeches in ${elapsed}ms`);

  return result;
}

/**
 * Analyze text for word frequencies, tone, and topics
 * @param {string} text - Text to analyze
 * @param {object} options - Analysis options
 * @returns {Promise<object>} - Analysis results
 */
export async function analyzeText(text, options = {}) {
  const {
    includeCategories = true,
    includeTone = true,
    includeTopics = true,
    topN = 50
  } = options;

  const startTime = Date.now();

  const response = await fetch(`${ANALYSIS_URL}/analyze/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      include_categories: includeCategories,
      include_tone: includeTone,
      include_topics: includeTopics,
      top_n: topN
    }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Analysis failed: ${response.status}`);
  }

  const result = await response.json();
  const elapsed = Date.now() - startTime;

  logger.debug('ANALYSIS', `Analyzed ${result.total_words} words in ${elapsed}ms`);

  return result;
}

/**
 * Analyze text for tone scores only
 * @param {string} text - Text to analyze
 * @returns {Promise<object>} - Tone scores
 */
export async function analyzeTone(text) {
  const startTime = Date.now();

  const response = await fetch(`${ANALYSIS_URL}/analyze/tone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Tone analysis failed: ${response.status}`);
  }

  const result = await response.json();
  const elapsed = Date.now() - startTime;

  logger.debug('ANALYSIS', `Tone analysis completed in ${elapsed}ms`);

  return result;
}

/**
 * Classify text by political topics
 * @param {string} text - Text to classify
 * @returns {Promise<object>} - Topic scores
 */
export async function classifyTopics(text) {
  const startTime = Date.now();

  const response = await fetch(`${ANALYSIS_URL}/analyze/topics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Topic classification failed: ${response.status}`);
  }

  const result = await response.json();
  const elapsed = Date.now() - startTime;

  logger.debug('ANALYSIS', `Topic classification completed in ${elapsed}ms`);

  return result;
}

/**
 * Get comprehensive speaker profile based on their speeches
 * @param {string} speakerName - Full name of the speaker
 * @param {Array<object>} speeches - Array of speech objects with text, speaker, party fields
 * @returns {Promise<object>} - Speaker profile with stats, tone, topics
 */
export async function getSpeakerProfile(speakerName, speeches) {
  const startTime = Date.now();

  const response = await fetch(`${ANALYSIS_URL}/analysis/speaker-profile?speaker_name=${encodeURIComponent(speakerName)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speeches }),
    signal: AbortSignal.timeout(120000) // 2 min timeout for large speech collections
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Speaker profile failed: ${response.status}`);
  }

  const result = await response.json();
  const elapsed = Date.now() - startTime;

  logger.debug('ANALYSIS', `Speaker profile for ${speakerName} completed in ${elapsed}ms`);

  return result;
}

/**
 * Compare parties based on their speeches
 * @param {Array<object>} speeches - Array of speech objects with text, speaker, party fields
 * @param {object} options - Comparison options
 * @returns {Promise<object>} - Party comparison with rankings
 */
export async function compareParties(speeches, options = {}) {
  const {
    parties = null,
    wahlperiode = 21,
    topN = 20
  } = options;

  const startTime = Date.now();

  // Build query params
  const params = new URLSearchParams();
  if (parties && parties.length > 0) {
    parties.forEach(p => params.append('parties', p));
  }
  params.append('wahlperiode', wahlperiode.toString());
  params.append('top_n', topN.toString());

  const response = await fetch(`${ANALYSIS_URL}/analysis/party-comparison?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ speeches }),
    signal: AbortSignal.timeout(120000) // 2 min timeout
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.detail || `Party comparison failed: ${response.status}`);
  }

  const result = await response.json();
  const elapsed = Date.now() - startTime;

  logger.debug('ANALYSIS', `Party comparison (${result.parties_compared?.length || 0} parties) completed in ${elapsed}ms`);

  return result;
}
