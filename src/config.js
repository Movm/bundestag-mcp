/**
 * Configuration for Bundestag MCP Server
 */

import 'dotenv/config';

export const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000,
    publicUrl: process.env.PUBLIC_URL || null
  },

  dipApi: {
    baseUrl: 'https://search.dip.bundestag.de/api/v1',
    apiKey: process.env.DIP_API_KEY,
    defaultLimit: 10,
    maxLimit: 100,
    timeout: 30000
  },

  cache: {
    apiResponseTTL: 5 * 60 * 1000,      // 5 minutes for API responses
    entityTTL: 15 * 60 * 1000,          // 15 minutes for single entities
    metadataTTL: 24 * 60 * 60 * 1000,   // 24 hours for metadata
    maxApiResponseEntries: 500,
    maxEntityEntries: 200,
    maxMetadataEntries: 50
  },

  qdrant: {
    enabled: process.env.QDRANT_ENABLED === 'true',
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    collection: 'bundestag-docs',
    protocolCollection: 'bundestag-protocol-chunks',
    vectorSize: 1024  // Mistral embed dimensions
  },

  mistral: {
    apiKey: process.env.MISTRAL_API_KEY,
    embeddingModel: 'mistral-embed',
    batchSize: 32
  },

  indexer: {
    enabled: process.env.INDEXER_ENABLED === 'true',
    intervalMinutes: parseInt(process.env.INDEXER_INTERVAL_MINUTES) || 15,
    wahlperioden: (process.env.INDEXER_WAHLPERIODEN || '20,19').split(',').map(Number)
  },

  entityTypes: {
    drucksachetypen: [
      'Gesetzentwurf',
      'Antrag',
      'Kleine Anfrage',
      'Große Anfrage',
      'Beschlussempfehlung und Bericht',
      'Unterrichtung',
      'Entschließungsantrag',
      'Änderungsantrag',
      'Bericht',
      'Schriftliche Frage'
    ],
    vorgangstypen: [
      'Gesetzgebung',
      'Antrag',
      'Kleine Anfrage',
      'Große Anfrage',
      'Selbständiger Antrag',
      'Entschließungsantrag'
    ],
    aktivitaetsarten: [
      'Rede',
      'Schriftliche Frage',
      'Mündliche Frage',
      'Zwischenfrage'
    ]
  }
};

/**
 * Validate configuration at startup
 */
export function validateConfig() {
  if (!config.dipApi.apiKey) {
    throw new Error(
      'DIP_API_KEY environment variable is required.\n' +
      'Public test key (valid until 05/2026): OSOegLs.PR2lwJ1dwCeje9vTj7FPOt3hvpYKtwKkhw\n' +
      'Or request your own key: parlamentsdokumentation@bundestag.de'
    );
  }
}
