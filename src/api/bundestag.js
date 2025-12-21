/**
 * Bundestag DIP API Client
 * Provides methods for all DIP API endpoints
 */

import { config } from '../config.js';
import {
  getCachedApiResponse,
  cacheApiResponse,
  getCachedEntity,
  cacheEntity
} from '../utils/cache.js';
import { debug, error, info, logApiRequest } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

/**
 * Make an authenticated request to the DIP API
 */
async function makeRequest(endpoint, params = {}, options = {}) {
  const startTime = Date.now();
  const { useCache = true, entityType = 'unknown' } = options;

  // Check cache first
  if (useCache) {
    const cached = getCachedApiResponse(endpoint, params);
    if (cached) {
      const responseTime = Date.now() - startTime;
      logApiRequest(endpoint, entityType, cached.numFound || 1, responseTime, true);
      return { ...cached, cached: true };
    }
  }

  // Build URL with query parameters
  const url = new URL(`${config.dipApi.baseUrl}${endpoint}`);

  // Add API key
  url.searchParams.set('apikey', config.dipApi.apiKey);
  url.searchParams.set('format', 'json');

  // Add other parameters
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  }

  debug('API', `Requesting: ${endpoint}`, { params });

  // Wrap fetch in retry logic for transient failures
  const data = await withRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.dipApi.timeout);

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          const err = new Error(`DIP API error: ${response.status} - ${errorText}`);
          err.status = response.status;
          throw err;
        }

        return response.json();
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          const timeoutErr = new Error(`DIP API timeout after ${config.dipApi.timeout}ms`);
          timeoutErr.name = 'AbortError';
          throw timeoutErr;
        }
        throw err;
      }
    },
    {
      maxRetries: 3,
      baseDelay: 100,
      onRetry: ({ attempt, delay, error: retryError }) => {
        info('API', `Retry ${attempt}/3 for ${endpoint} after ${Math.round(delay)}ms: ${retryError.message}`);
      }
    }
  );

  const responseTime = Date.now() - startTime;

  // Cache the response
  if (useCache) {
    cacheApiResponse(endpoint, params, data);
  }

  logApiRequest(endpoint, entityType, data.numFound || 1, responseTime, false);
  return { ...data, cached: false };
}

/**
 * Get a single entity by ID
 */
async function getById(endpoint, id, options = {}) {
  const startTime = Date.now();
  const { useCache = true, entityType = 'unknown' } = options;

  // Check cache first
  if (useCache) {
    const cached = getCachedEntity(endpoint, id);
    if (cached) {
      const responseTime = Date.now() - startTime;
      logApiRequest(`${endpoint}/${id}`, entityType, 1, responseTime, true);
      return { ...cached, cached: true };
    }
  }

  const url = new URL(`${config.dipApi.baseUrl}${endpoint}/${id}`);
  url.searchParams.set('apikey', config.dipApi.apiKey);
  url.searchParams.set('format', 'json');

  debug('API', `Fetching: ${endpoint}/${id}`);

  // Wrap fetch in retry logic for transient failures
  const data = await withRetry(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.dipApi.timeout);

      try {
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          if (response.status === 404) {
            return { __notFound: true };
          }
          const errorText = await response.text();
          const err = new Error(`DIP API error: ${response.status} - ${errorText}`);
          err.status = response.status;
          throw err;
        }

        return response.json();
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          const timeoutErr = new Error(`DIP API timeout after ${config.dipApi.timeout}ms`);
          timeoutErr.name = 'AbortError';
          throw timeoutErr;
        }
        throw err;
      }
    },
    {
      maxRetries: 3,
      baseDelay: 100,
      onRetry: ({ attempt, delay, error: retryError }) => {
        info('API', `Retry ${attempt}/3 for ${endpoint}/${id} after ${Math.round(delay)}ms: ${retryError.message}`);
      }
    }
  );

  // Handle 404 case
  if (data && data.__notFound) {
    return null;
  }

  const responseTime = Date.now() - startTime;

  // Cache the entity
  if (useCache) {
    cacheEntity(endpoint, id, data);
  }

  logApiRequest(`${endpoint}/${id}`, entityType, 1, responseTime, false);
  return { ...data, cached: false };
}

// ============================================================================
// Drucksachen (Printed Documents)
// ============================================================================

/**
 * Search Drucksachen
 */
export async function searchDrucksachen(params = {}, options = {}) {
  const apiParams = {};

  if (params.query) apiParams['f.titel'] = params.query;
  if (params.wahlperiode) apiParams['f.wahlperiode'] = params.wahlperiode;
  if (params.dokumentnummer) apiParams['f.dokumentnummer'] = params.dokumentnummer;
  if (params.drucksachetyp) apiParams['f.drucksachetyp'] = params.drucksachetyp;
  if (params.datum_start) apiParams['f.datum.start'] = params.datum_start;
  if (params.datum_end) apiParams['f.datum.end'] = params.datum_end;
  if (params.urheber) apiParams['f.urheber'] = params.urheber;
  if (params.aktualisiert_start) apiParams['f.aktualisiert.start'] = params.aktualisiert_start;
  if (params.cursor) apiParams['cursor'] = params.cursor;

  apiParams['rows'] = Math.min(params.limit || config.dipApi.defaultLimit, config.dipApi.maxLimit);

  return makeRequest('/drucksache', apiParams, { ...options, entityType: 'drucksache' });
}

/**
 * Get a specific Drucksache by ID
 */
export async function getDrucksache(id, options = {}) {
  return getById('/drucksache', id, { ...options, entityType: 'drucksache' });
}

/**
 * Search Drucksache full texts
 */
export async function searchDrucksachenText(params = {}, options = {}) {
  const apiParams = {};

  if (params.query) apiParams['f.text'] = params.query;
  if (params.wahlperiode) apiParams['f.wahlperiode'] = params.wahlperiode;
  if (params.drucksache_id) apiParams['f.drucksache'] = params.drucksache_id;
  if (params.cursor) apiParams['cursor'] = params.cursor;

  // Text endpoints typically have lower limits
  apiParams['rows'] = Math.min(params.limit || 10, 50);

  return makeRequest('/drucksache-text', apiParams, { ...options, entityType: 'drucksache-text' });
}

/**
 * Get Drucksache full text by ID
 */
export async function getDrucksacheText(id, options = {}) {
  return getById('/drucksache-text', id, { ...options, entityType: 'drucksache-text' });
}

// ============================================================================
// Plenarprotokolle (Plenary Protocols)
// ============================================================================

/**
 * Search Plenarprotokolle
 */
export async function searchPlenarprotokolle(params = {}, options = {}) {
  const apiParams = {};

  if (params.query) apiParams['f.titel'] = params.query;
  if (params.wahlperiode) apiParams['f.wahlperiode'] = params.wahlperiode;
  if (params.dokumentnummer) apiParams['f.dokumentnummer'] = params.dokumentnummer;
  if (params.datum_start) apiParams['f.datum.start'] = params.datum_start;
  if (params.datum_end) apiParams['f.datum.end'] = params.datum_end;
  if (params.cursor) apiParams['cursor'] = params.cursor;

  apiParams['rows'] = Math.min(params.limit || config.dipApi.defaultLimit, config.dipApi.maxLimit);

  return makeRequest('/plenarprotokoll', apiParams, { ...options, entityType: 'plenarprotokoll' });
}

/**
 * Get a specific Plenarprotokoll by ID
 */
export async function getPlenarprotokoll(id, options = {}) {
  return getById('/plenarprotokoll', id, { ...options, entityType: 'plenarprotokoll' });
}

/**
 * Search Plenarprotokoll full texts
 */
export async function searchPlenarprotokolleText(params = {}, options = {}) {
  const apiParams = {};

  if (params.query) apiParams['f.text'] = params.query;
  if (params.wahlperiode) apiParams['f.wahlperiode'] = params.wahlperiode;
  if (params.plenarprotokoll_id) apiParams['f.plenarprotokoll'] = params.plenarprotokoll_id;
  if (params.cursor) apiParams['cursor'] = params.cursor;

  apiParams['rows'] = Math.min(params.limit || 10, 50);

  return makeRequest('/plenarprotokoll-text', apiParams, { ...options, entityType: 'plenarprotokoll-text' });
}

/**
 * Get Plenarprotokoll full text by ID
 */
export async function getPlenarprotokollText(id, options = {}) {
  return getById('/plenarprotokoll-text', id, { ...options, entityType: 'plenarprotokoll-text' });
}

// ============================================================================
// Vorgaenge (Proceedings)
// ============================================================================

/**
 * Search Vorgaenge
 */
export async function searchVorgaenge(params = {}, options = {}) {
  const apiParams = {};

  if (params.query) apiParams['f.titel'] = params.query;
  if (params.wahlperiode) apiParams['f.wahlperiode'] = params.wahlperiode;
  if (params.vorgangstyp) apiParams['f.vorgangstyp'] = params.vorgangstyp;
  if (params.sachgebiet) apiParams['f.sachgebiet'] = params.sachgebiet;
  if (params.deskriptor) apiParams['f.deskriptor'] = params.deskriptor;
  if (params.datum_start) apiParams['f.datum.start'] = params.datum_start;
  if (params.datum_end) apiParams['f.datum.end'] = params.datum_end;
  if (params.initiative) apiParams['f.initiative'] = params.initiative;
  if (params.aktualisiert_start) apiParams['f.aktualisiert.start'] = params.aktualisiert_start;
  if (params.cursor) apiParams['cursor'] = params.cursor;

  apiParams['rows'] = Math.min(params.limit || config.dipApi.defaultLimit, config.dipApi.maxLimit);

  return makeRequest('/vorgang', apiParams, { ...options, entityType: 'vorgang' });
}

/**
 * Get a specific Vorgang by ID
 */
export async function getVorgang(id, options = {}) {
  return getById('/vorgang', id, { ...options, entityType: 'vorgang' });
}

// ============================================================================
// Vorgangspositionen (Proceeding Positions)
// ============================================================================

/**
 * Search Vorgangspositionen
 */
export async function searchVorgangspositionen(params = {}, options = {}) {
  const apiParams = {};

  if (params.vorgang_id) apiParams['f.vorgang'] = params.vorgang_id;
  if (params.wahlperiode) apiParams['f.wahlperiode'] = params.wahlperiode;
  if (params.datum_start) apiParams['f.datum.start'] = params.datum_start;
  if (params.datum_end) apiParams['f.datum.end'] = params.datum_end;
  if (params.cursor) apiParams['cursor'] = params.cursor;

  apiParams['rows'] = Math.min(params.limit || config.dipApi.defaultLimit, config.dipApi.maxLimit);

  return makeRequest('/vorgangsposition', apiParams, { ...options, entityType: 'vorgangsposition' });
}

// ============================================================================
// Personen (Persons/MPs)
// ============================================================================

/**
 * Search Personen
 */
export async function searchPersonen(params = {}, options = {}) {
  const apiParams = {};

  if (params.query) apiParams['f.name'] = params.query;
  if (params.wahlperiode) apiParams['f.wahlperiode'] = params.wahlperiode;
  if (params.fraktion) apiParams['f.fraktion'] = params.fraktion;
  if (params.cursor) apiParams['cursor'] = params.cursor;

  apiParams['rows'] = Math.min(params.limit || config.dipApi.defaultLimit, config.dipApi.maxLimit);

  return makeRequest('/person', apiParams, { ...options, entityType: 'person' });
}

/**
 * Get a specific Person by ID
 */
export async function getPerson(id, options = {}) {
  return getById('/person', id, { ...options, entityType: 'person' });
}

// ============================================================================
// Aktivitaeten (Activities)
// ============================================================================

/**
 * Search Aktivitaeten
 */
export async function searchAktivitaeten(params = {}, options = {}) {
  const apiParams = {};

  if (params.query) apiParams['f.titel'] = params.query;
  if (params.wahlperiode) apiParams['f.wahlperiode'] = params.wahlperiode;
  if (params.aktivitaetsart) apiParams['f.aktivitaetsart'] = params.aktivitaetsart;
  if (params.person_id) apiParams['f.person'] = params.person_id;
  if (params.datum_start) apiParams['f.datum.start'] = params.datum_start;
  if (params.datum_end) apiParams['f.datum.end'] = params.datum_end;
  if (params.aktualisiert_start) apiParams['f.aktualisiert.start'] = params.aktualisiert_start;
  if (params.cursor) apiParams['cursor'] = params.cursor;

  apiParams['rows'] = Math.min(params.limit || config.dipApi.defaultLimit, config.dipApi.maxLimit);

  return makeRequest('/aktivitaet', apiParams, { ...options, entityType: 'aktivitaet' });
}

/**
 * Get a specific Aktivitaet by ID
 */
export async function getAktivitaet(id, options = {}) {
  return getById('/aktivitaet', id, { ...options, entityType: 'aktivitaet' });
}
