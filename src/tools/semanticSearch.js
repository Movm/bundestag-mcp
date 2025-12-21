/**
 * Semantic Search Tool for Bundestag MCP Server
 * Uses vector embeddings and Qdrant for semantic similarity search
 */

import { z } from 'zod';
import * as embedding from '../services/embeddingService.js';
import * as qdrant from '../services/qdrantService.js';
import * as indexer from '../jobs/indexer.js';
import { config } from '../config.js';

export const semanticSearchTool = {
  name: 'bundestag_semantic_search',
  description: `Semantic search across all Bundestag documents using AI embeddings.
Finds conceptually related documents even with different terminology.
Example: Searching "renewable energy" will find documents about "Energiewende", "Solarenergie", etc.
Use this for exploratory searches when you don't know exact terms.
Falls back gracefully if vector search is unavailable.`,

  inputSchema: {
    query: z.string().min(1).max(1000)
      .describe('Natural language search query'),
    limit: z.number().int().min(1).max(50).default(10)
      .describe('Maximum number of results (1-50)'),
    docTypes: z.array(z.enum(['drucksache', 'vorgang', 'aktivitaet'])).optional()
      .describe('Filter by document types'),
    entityTypes: z.array(z.enum([
      'Gesetzentwurf', 'Antrag', 'Kleine Anfrage', 'Große Anfrage',
      'Beschlussempfehlung und Bericht', 'Unterrichtung', 'Entschließungsantrag',
      'Änderungsantrag', 'Bericht', 'Schriftliche Frage',
      'Gesetzgebung', 'Selbständiger Antrag',
      'Rede', 'Mündliche Frage', 'Zwischenfrage'
    ])).optional()
      .describe('Filter by specific entity types (e.g., Gesetzentwurf, Kleine Anfrage, Rede)'),
    wahlperiode: z.number().int().min(1).max(30).optional()
      .describe('Filter by electoral period (Wahlperiode)'),
    sachgebiet: z.string().optional()
      .describe('Filter by subject area (Sachgebiet), e.g., "Arbeit und Beschäftigung", "Umwelt"'),
    initiative: z.string().optional()
      .describe('Filter by initiating faction, e.g., "CDU/CSU", "SPD", "Bundesregierung"'),
    fraktion: z.string().optional()
      .describe('Filter by parliamentary group (Fraktion)'),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      .describe('Filter from date (YYYY-MM-DD)'),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      .describe('Filter to date (YYYY-MM-DD)'),
    scoreThreshold: z.number().min(0).max(1).default(0.3)
      .describe('Minimum similarity score (0-1, higher = more similar)')
  },

  async handler(params) {
    if (!config.qdrant.enabled) {
      return {
        error: true,
        message: 'Semantic search is not enabled. Set QDRANT_ENABLED=true and MISTRAL_API_KEY.',
        endpoint: 'semantic_search'
      };
    }

    if (!embedding.isAvailable()) {
      return {
        error: true,
        message: 'Embedding service not available. Set MISTRAL_API_KEY environment variable.',
        endpoint: 'semantic_search'
      };
    }

    if (!qdrant.isAvailable()) {
      return {
        error: true,
        message: 'Qdrant vector database not available. Check QDRANT_URL and ensure Qdrant is running.',
        endpoint: 'semantic_search'
      };
    }

    try {
      const queryVector = await embedding.embed(params.query);

      const filter = qdrant.buildFilter({
        docTypes: params.docTypes,
        entityTypes: params.entityTypes,
        wahlperiode: params.wahlperiode,
        sachgebiet: params.sachgebiet,
        initiative: params.initiative,
        fraktion: params.fraktion,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo
      });

      const results = await qdrant.search(queryVector, {
        limit: params.limit,
        filter,
        scoreThreshold: params.scoreThreshold
      });

      return {
        success: true,
        endpoint: 'semantic_search',
        query: params.query,
        filters: {
          docTypes: params.docTypes || 'all',
          entityTypes: params.entityTypes || 'all',
          wahlperiode: params.wahlperiode || 'all',
          sachgebiet: params.sachgebiet || 'all',
          initiative: params.initiative || 'all',
          fraktion: params.fraktion || 'all',
          dateRange: params.dateFrom || params.dateTo
            ? `${params.dateFrom || '*'} to ${params.dateTo || '*'}`
            : 'all'
        },
        totalResults: results.length,
        results: results.map(r => ({
          score: r.score.toFixed(3),
          docType: r.payload.doc_type,
          docId: r.payload.doc_id,
          entityType: r.payload.entity_type,
          title: r.payload.title,
          abstract: r.payload.abstract,
          dokumentnummer: r.payload.dokumentnummer,
          date: r.payload.date,
          wahlperiode: r.payload.wahlperiode,
          sachgebiet: r.payload.sachgebiet,
          initiative: r.payload.initiative,
          descriptors: r.payload.descriptors
        }))
      };

    } catch (err) {
      return {
        error: true,
        message: `Semantic search failed: ${err.message}`,
        endpoint: 'semantic_search'
      };
    }
  }
};

export const semanticSearchStatusTool = {
  name: 'bundestag_semantic_search_status',
  description: `Get the status of the semantic search system.
Shows whether Qdrant and embeddings are available, how many documents are indexed,
and background indexer statistics.`,

  inputSchema: {},

  async handler() {
    const qdrantInfo = await qdrant.getCollectionInfo();
    const indexerStats = indexer.getStats();

    return {
      success: true,
      endpoint: 'semantic_search_status',
      embeddingService: {
        available: embedding.isAvailable(),
        model: config.mistral.embeddingModel
      },
      qdrant: {
        enabled: config.qdrant.enabled,
        available: qdrant.isAvailable(),
        url: config.qdrant.url,
        collection: config.qdrant.collection,
        ...(qdrantInfo || { status: 'unavailable' })
      },
      indexer: indexerStats
    };
  }
};

export const triggerIndexingTool = {
  name: 'bundestag_trigger_indexing',
  description: `Manually trigger a document indexing run.
Use this to start indexing immediately instead of waiting for the scheduled interval.
Only works if INDEXER_ENABLED=true and required API keys are set.`,

  inputSchema: {},

  async handler() {
    if (!config.indexer.enabled) {
      return {
        error: true,
        message: 'Indexer is not enabled. Set INDEXER_ENABLED=true.',
        endpoint: 'trigger_indexing'
      };
    }

    const result = await indexer.triggerManualRun();

    return {
      success: result.success,
      message: result.message,
      endpoint: 'trigger_indexing',
      indexerStats: indexer.getStats()
    };
  }
};

// ============================================================================
// Speech Search Tool (Protocol Chunks)
// ============================================================================

export const searchSpeechesTool = {
  name: 'bundestag_search_speeches',
  description: `Semantic search through parliamentary speeches and debates.
Searches through chunked Plenarprotokolle to find specific statements, arguments, or topics.
Example: "Was sagt die CDU zur Schuldenbremse?" or "Argumente gegen das Heizungsgesetz"
Use this to find what specific politicians or parties said about topics.
Requires QDRANT_ENABLED=true and protocol indexing to have been run.`,

  inputSchema: {
    query: z.string().min(1).max(1000)
      .describe('Natural language search query'),
    limit: z.number().int().min(1).max(50).default(10)
      .describe('Maximum number of results (1-50)'),
    speaker: z.string().optional()
      .describe('Filter by speaker name, e.g., "Friedrich Merz", "Olaf Scholz"'),
    speakerParty: z.string().optional()
      .describe('Filter by party/faction, e.g., "CDU/CSU", "SPD", "BÜNDNIS 90/DIE GRÜNEN"'),
    speakerState: z.string().optional()
      .describe('Filter by state (for Bundesrat), e.g., "Bayern", "Baden-Württemberg"'),
    top: z.string().optional()
      .describe('Filter by agenda item (TOP), e.g., "TOP 1", "TOP 34"'),
    wahlperiode: z.number().int().min(1).max(30).optional()
      .describe('Filter by electoral period (Wahlperiode)'),
    herausgeber: z.enum(['BT', 'BR']).optional()
      .describe('Filter by publisher: BT (Bundestag) or BR (Bundesrat)'),
    dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      .describe('Filter from date (YYYY-MM-DD)'),
    dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
      .describe('Filter to date (YYYY-MM-DD)'),
    scoreThreshold: z.number().min(0).max(1).default(0.3)
      .describe('Minimum similarity score (0-1, higher = more similar)')
  },

  async handler(params) {
    if (!config.qdrant.enabled) {
      return {
        error: true,
        message: 'Semantic search is not enabled. Set QDRANT_ENABLED=true and MISTRAL_API_KEY.',
        endpoint: 'search_speeches'
      };
    }

    if (!embedding.isAvailable()) {
      return {
        error: true,
        message: 'Embedding service not available. Set MISTRAL_API_KEY environment variable.',
        endpoint: 'search_speeches'
      };
    }

    if (!qdrant.isProtocolCollectionAvailable()) {
      return {
        error: true,
        message: 'Protocol collection not available. Run protocol indexing first.',
        endpoint: 'search_speeches'
      };
    }

    try {
      const queryVector = await embedding.embed(params.query);

      const filter = qdrant.buildProtocolFilter({
        speaker: params.speaker,
        speakerParty: params.speakerParty,
        speakerState: params.speakerState,
        top: params.top,
        wahlperiode: params.wahlperiode,
        herausgeber: params.herausgeber,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo
      });

      const results = await qdrant.searchProtocolChunks(queryVector, {
        limit: params.limit,
        filter,
        scoreThreshold: params.scoreThreshold
      });

      return {
        success: true,
        endpoint: 'search_speeches',
        query: params.query,
        filters: {
          speaker: params.speaker || 'all',
          speakerParty: params.speakerParty || 'all',
          speakerState: params.speakerState || 'all',
          top: params.top || 'all',
          wahlperiode: params.wahlperiode || 'all',
          herausgeber: params.herausgeber || 'all',
          dateRange: params.dateFrom || params.dateTo
            ? `${params.dateFrom || '*'} to ${params.dateTo || '*'}`
            : 'all'
        },
        totalResults: results.length,
        results: results.map(r => ({
          score: r.score.toFixed(3),
          speaker: r.payload.speaker,
          speakerParty: r.payload.speaker_party,
          speakerState: r.payload.speaker_state,
          speakerRole: r.payload.speaker_role,
          top: r.payload.top,
          topTitle: r.payload.top_title,
          text: r.payload.text,
          textLength: r.payload.text_length,
          protokollId: r.payload.protokoll_id,
          dokumentnummer: r.payload.dokumentnummer,
          datum: r.payload.datum,
          wahlperiode: r.payload.wahlperiode,
          herausgeber: r.payload.herausgeber
        }))
      };

    } catch (err) {
      return {
        error: true,
        message: `Speech search failed: ${err.message}`,
        endpoint: 'search_speeches'
      };
    }
  }
};

export const triggerProtocolIndexingTool = {
  name: 'bundestag_trigger_protocol_indexing',
  description: `Manually trigger protocol indexing.
This indexes all Plenarprotokolle into chunks for semantic speech search.
Only run this once initially - subsequent runs will skip already-indexed protocols.
Requires QDRANT_ENABLED=true and MISTRAL_API_KEY to be set.`,

  inputSchema: {},

  async handler() {
    if (!config.qdrant.enabled) {
      return {
        error: true,
        message: 'Qdrant is not enabled. Set QDRANT_ENABLED=true.',
        endpoint: 'trigger_protocol_indexing'
      };
    }

    if (!embedding.isAvailable()) {
      return {
        error: true,
        message: 'Embedding service not available. Set MISTRAL_API_KEY.',
        endpoint: 'trigger_protocol_indexing'
      };
    }

    const result = await indexer.triggerProtocolIndexing();

    return {
      success: result.success,
      message: result.message,
      endpoint: 'trigger_protocol_indexing',
      protocolStats: indexer.getProtocolStats()
    };
  }
};

export const protocolSearchStatusTool = {
  name: 'bundestag_protocol_search_status',
  description: `Get the status of the protocol search system.
Shows statistics about indexed protocols and chunks.`,

  inputSchema: {},

  async handler() {
    const protocolCollectionInfo = await qdrant.getProtocolCollectionInfo();
    const protocolStats = indexer.getProtocolStats();

    return {
      success: true,
      endpoint: 'protocol_search_status',
      embeddingService: {
        available: embedding.isAvailable(),
        model: config.mistral.embeddingModel
      },
      protocolCollection: {
        enabled: config.qdrant.enabled,
        available: qdrant.isProtocolCollectionAvailable(),
        collection: config.qdrant.protocolCollection,
        ...(protocolCollectionInfo || { status: 'unavailable' })
      },
      indexer: protocolStats
    };
  }
};

export const semanticSearchTools = [
  semanticSearchTool,
  semanticSearchStatusTool,
  triggerIndexingTool,
  searchSpeechesTool,
  triggerProtocolIndexingTool,
  protocolSearchStatusTool
];
