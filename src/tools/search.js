/**
 * MCP Tools for Bundestag API search
 */

import { z } from 'zod';
import * as api from '../api/bundestag.js';
import { getCacheStats } from '../utils/cache.js';
import { config } from '../config.js';

// Common parameter schemas
const wahlperiodeSchema = z.number().int().min(1).max(30).optional()
  .describe('Electoral period (Wahlperiode), e.g., 20 for current');

const datumStartSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  .describe('Start date in YYYY-MM-DD format');

const datumEndSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
  .describe('End date in YYYY-MM-DD format');

const limitSchema = z.number().int().min(1).max(100).default(10)
  .describe('Maximum number of results (1-100)');

const cursorSchema = z.string().optional()
  .describe('Pagination cursor from previous response');

const useCacheSchema = z.boolean().default(true)
  .describe('Whether to use cached results');

// ============================================================================
// Drucksachen Tools
// ============================================================================

export const searchDrucksachenTool = {
  name: 'bundestag_search_drucksachen',
  description: `Search Bundestag Drucksachen (printed parliamentary documents).
Includes: Gesetzentwürfe (bills), Anträge (motions), Anfragen (inquiries), and more.
Use this to find legislative documents, government proposals, and parliamentary inquiries.`,

  inputSchema: {
    query: z.string().optional()
      .describe('Search text in document title'),
    wahlperiode: wahlperiodeSchema,
    dokumentnummer: z.string().optional()
      .describe('Document number, e.g., "20/1234"'),
    drucksachetyp: z.enum([
      'Gesetzentwurf', 'Antrag', 'Kleine Anfrage', 'Große Anfrage',
      'Beschlussempfehlung und Bericht', 'Unterrichtung', 'Entschließungsantrag',
      'Änderungsantrag', 'Bericht', 'Schriftliche Frage'
    ]).optional()
      .describe('Type of document'),
    datum_start: datumStartSchema,
    datum_end: datumEndSchema,
    urheber: z.string().optional()
      .describe('Author/initiator of the document'),
    limit: limitSchema,
    cursor: cursorSchema,
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.searchDrucksachen(params, { useCache: params.useCache });

      return {
        success: true,
        endpoint: 'drucksache',
        query: params,
        totalResults: result.numFound || 0,
        returnedResults: result.documents?.length || 0,
        cursor: result.cursor || null,
        hasMore: !!(result.cursor),
        cached: result.cached,
        results: result.documents || []
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'drucksache'
      };
    }
  }
};

export const getDrucksacheTool = {
  name: 'bundestag_get_drucksache',
  description: 'Get a specific Drucksache (printed document) by its ID. Returns full metadata.',

  inputSchema: {
    id: z.number().int().positive()
      .describe('Drucksache ID'),
    includeFullText: z.boolean().default(false)
      .describe('Also fetch the full text content'),
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.getDrucksache(params.id, { useCache: params.useCache });

      if (!result) {
        return {
          error: true,
          message: `Drucksache with ID ${params.id} not found`,
          endpoint: 'drucksache'
        };
      }

      let fullText = null;
      if (params.includeFullText) {
        try {
          const textResult = await api.getDrucksacheText(params.id, { useCache: params.useCache });
          if (textResult) {
            fullText = textResult.text || textResult;
          }
        } catch (textErr) {
          // Full text may not be available for all documents
        }
      }

      return {
        success: true,
        endpoint: 'drucksache',
        id: params.id,
        cached: result.cached,
        data: result,
        fullText
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'drucksache',
        id: params.id
      };
    }
  }
};

// ============================================================================
// Plenarprotokolle Tools
// ============================================================================

export const searchPlenarprotokolleTool = {
  name: 'bundestag_search_plenarprotokolle',
  description: `Search Bundestag Plenarprotokolle (plenary session transcripts).
These are verbatim transcripts of parliamentary debates and votes.
Use this to find speeches, debates, and parliamentary proceedings.`,

  inputSchema: {
    query: z.string().optional()
      .describe('Search text in protocol title'),
    wahlperiode: wahlperiodeSchema,
    dokumentnummer: z.string().optional()
      .describe('Protocol number, e.g., "20/42"'),
    datum_start: datumStartSchema,
    datum_end: datumEndSchema,
    limit: limitSchema,
    cursor: cursorSchema,
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.searchPlenarprotokolle(params, { useCache: params.useCache });

      return {
        success: true,
        endpoint: 'plenarprotokoll',
        query: params,
        totalResults: result.numFound || 0,
        returnedResults: result.documents?.length || 0,
        cursor: result.cursor || null,
        hasMore: !!(result.cursor),
        cached: result.cached,
        results: result.documents || []
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'plenarprotokoll'
      };
    }
  }
};

export const getPlenarprotokollTool = {
  name: 'bundestag_get_plenarprotokoll',
  description: 'Get a specific Plenarprotokoll (plenary protocol) by its ID.',

  inputSchema: {
    id: z.number().int().positive()
      .describe('Plenarprotokoll ID'),
    includeFullText: z.boolean().default(false)
      .describe('Also fetch the full transcript text'),
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.getPlenarprotokoll(params.id, { useCache: params.useCache });

      if (!result) {
        return {
          error: true,
          message: `Plenarprotokoll with ID ${params.id} not found`,
          endpoint: 'plenarprotokoll'
        };
      }

      let fullText = null;
      if (params.includeFullText) {
        try {
          const textResult = await api.getPlenarprotokollText(params.id, { useCache: params.useCache });
          if (textResult) {
            fullText = textResult.text || textResult;
          }
        } catch (textErr) {
          // Full text may not be available
        }
      }

      return {
        success: true,
        endpoint: 'plenarprotokoll',
        id: params.id,
        cached: result.cached,
        data: result,
        fullText
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'plenarprotokoll',
        id: params.id
      };
    }
  }
};

// ============================================================================
// Vorgaenge Tools
// ============================================================================

export const searchVorgaengeTool = {
  name: 'bundestag_search_vorgaenge',
  description: `Search Bundestag Vorgänge (parliamentary proceedings).
A Vorgang represents the lifecycle of a legislative process, linking related documents,
votes, and decisions. Use this to track bills through parliament.`,

  inputSchema: {
    query: z.string().optional()
      .describe('Search text in proceeding title'),
    wahlperiode: wahlperiodeSchema,
    vorgangstyp: z.string().optional()
      .describe('Type of proceeding (e.g., Gesetzgebung, Antrag)'),
    sachgebiet: z.string().optional()
      .describe('Subject area'),
    deskriptor: z.string().optional()
      .describe('Thesaurus keyword/descriptor'),
    initiative: z.string().optional()
      .describe('Initiating party or faction'),
    datum_start: datumStartSchema,
    datum_end: datumEndSchema,
    limit: limitSchema,
    cursor: cursorSchema,
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.searchVorgaenge(params, { useCache: params.useCache });

      return {
        success: true,
        endpoint: 'vorgang',
        query: params,
        totalResults: result.numFound || 0,
        returnedResults: result.documents?.length || 0,
        cursor: result.cursor || null,
        hasMore: !!(result.cursor),
        cached: result.cached,
        results: result.documents || []
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'vorgang'
      };
    }
  }
};

export const getVorgangTool = {
  name: 'bundestag_get_vorgang',
  description: 'Get a specific Vorgang (proceeding) by its ID with all related documents.',

  inputSchema: {
    id: z.number().int().positive()
      .describe('Vorgang ID'),
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.getVorgang(params.id, { useCache: params.useCache });

      if (!result) {
        return {
          error: true,
          message: `Vorgang with ID ${params.id} not found`,
          endpoint: 'vorgang'
        };
      }

      return {
        success: true,
        endpoint: 'vorgang',
        id: params.id,
        cached: result.cached,
        data: result
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'vorgang',
        id: params.id
      };
    }
  }
};

// ============================================================================
// Personen Tools
// ============================================================================

export const searchPersonenTool = {
  name: 'bundestag_search_personen',
  description: `Search for persons in the Bundestag (MPs, ministers, etc.).
Use this to find information about members of parliament and their affiliations.`,

  inputSchema: {
    query: z.string().optional()
      .describe('Search by name'),
    wahlperiode: wahlperiodeSchema,
    fraktion: z.string().optional()
      .describe('Parliamentary group/faction (e.g., SPD, CDU/CSU, GRÜNE)'),
    limit: limitSchema,
    cursor: cursorSchema,
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.searchPersonen(params, { useCache: params.useCache });

      return {
        success: true,
        endpoint: 'person',
        query: params,
        totalResults: result.numFound || 0,
        returnedResults: result.documents?.length || 0,
        cursor: result.cursor || null,
        hasMore: !!(result.cursor),
        cached: result.cached,
        results: result.documents || []
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'person'
      };
    }
  }
};

export const getPersonTool = {
  name: 'bundestag_get_person',
  description: 'Get detailed information about a specific person by their ID.',

  inputSchema: {
    id: z.number().int().positive()
      .describe('Person ID'),
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.getPerson(params.id, { useCache: params.useCache });

      if (!result) {
        return {
          error: true,
          message: `Person with ID ${params.id} not found`,
          endpoint: 'person'
        };
      }

      return {
        success: true,
        endpoint: 'person',
        id: params.id,
        cached: result.cached,
        data: result
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'person',
        id: params.id
      };
    }
  }
};

// ============================================================================
// Aktivitaeten Tools
// ============================================================================

export const searchAktivitaetenTool = {
  name: 'bundestag_search_aktivitaeten',
  description: `Search parliamentary activities (speeches, questions, etc.).
Use this to find specific contributions by MPs in parliament.`,

  inputSchema: {
    query: z.string().optional()
      .describe('Search text in activity title'),
    wahlperiode: wahlperiodeSchema,
    aktivitaetsart: z.string().optional()
      .describe('Type of activity (e.g., Rede, Schriftliche Frage)'),
    person_id: z.number().int().positive().optional()
      .describe('Filter by person ID'),
    datum_start: datumStartSchema,
    datum_end: datumEndSchema,
    limit: limitSchema,
    cursor: cursorSchema,
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.searchAktivitaeten(params, { useCache: params.useCache });

      return {
        success: true,
        endpoint: 'aktivitaet',
        query: params,
        totalResults: result.numFound || 0,
        returnedResults: result.documents?.length || 0,
        cursor: result.cursor || null,
        hasMore: !!(result.cursor),
        cached: result.cached,
        results: result.documents || []
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'aktivitaet'
      };
    }
  }
};

export const getAktivitaetTool = {
  name: 'bundestag_get_aktivitaet',
  description: 'Get a specific parliamentary activity by its ID.',

  inputSchema: {
    id: z.number().int().positive()
      .describe('Aktivitaet ID'),
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.getAktivitaet(params.id, { useCache: params.useCache });

      if (!result) {
        return {
          error: true,
          message: `Aktivitaet with ID ${params.id} not found`,
          endpoint: 'aktivitaet'
        };
      }

      return {
        success: true,
        endpoint: 'aktivitaet',
        id: params.id,
        cached: result.cached,
        data: result
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'aktivitaet',
        id: params.id
      };
    }
  }
};

// ============================================================================
// Vorgangspositionen Tools
// ============================================================================

export const searchVorgangspositionenTool = {
  name: 'bundestag_search_vorgangspositionen',
  description: `Search Vorgangspositionen (proceeding positions/steps).
A Vorgangsposition represents a single step in a legislative proceeding (Vorgang),
such as a committee referral, vote, or decision. Use this to track detailed
progress of bills through parliament.`,

  inputSchema: {
    vorgang_id: z.number().int().positive().optional()
      .describe('Filter by Vorgang ID to get all positions of a specific proceeding'),
    wahlperiode: wahlperiodeSchema,
    datum_start: datumStartSchema,
    datum_end: datumEndSchema,
    limit: limitSchema,
    cursor: cursorSchema,
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.searchVorgangspositionen(params, { useCache: params.useCache });

      return {
        success: true,
        endpoint: 'vorgangsposition',
        query: params,
        totalResults: result.numFound || 0,
        returnedResults: result.documents?.length || 0,
        cursor: result.cursor || null,
        hasMore: !!(result.cursor),
        cached: result.cached,
        results: result.documents || []
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'vorgangsposition'
      };
    }
  }
};

// ============================================================================
// Full-Text Search Tools
// ============================================================================

export const searchDrucksachenTextTool = {
  name: 'bundestag_search_drucksachen_text',
  description: `Full-text search within Drucksachen content.
Unlike bundestag_search_drucksachen which searches metadata/titles,
this searches the actual document text. Use this to find specific
phrases, legal references, or content within parliamentary documents.`,

  inputSchema: {
    query: z.string()
      .describe('Full-text search query within document content'),
    wahlperiode: wahlperiodeSchema,
    drucksache_id: z.number().int().positive().optional()
      .describe('Filter to a specific Drucksache ID'),
    limit: z.number().int().min(1).max(50).default(10)
      .describe('Maximum results (1-50, lower limit than metadata search)'),
    cursor: cursorSchema,
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.searchDrucksachenText(params, { useCache: params.useCache });

      return {
        success: true,
        endpoint: 'drucksache-text',
        query: params,
        totalResults: result.numFound || 0,
        returnedResults: result.documents?.length || 0,
        cursor: result.cursor || null,
        hasMore: !!(result.cursor),
        cached: result.cached,
        results: result.documents || []
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'drucksache-text'
      };
    }
  }
};

export const searchPlenarprotokolleTextTool = {
  name: 'bundestag_search_plenarprotokolle_text',
  description: `Full-text search within Plenarprotokoll transcripts.
Unlike bundestag_search_plenarprotokolle which searches metadata,
this searches actual speech transcripts. Use this to find specific
quotes, debates on topics, or MP statements in plenary sessions.`,

  inputSchema: {
    query: z.string()
      .describe('Full-text search query within transcript content'),
    wahlperiode: wahlperiodeSchema,
    plenarprotokoll_id: z.number().int().positive().optional()
      .describe('Filter to a specific Plenarprotokoll ID'),
    limit: z.number().int().min(1).max(50).default(10)
      .describe('Maximum results (1-50, lower limit than metadata search)'),
    cursor: cursorSchema,
    useCache: useCacheSchema
  },

  async handler(params) {
    try {
      const result = await api.searchPlenarprotokolleText(params, { useCache: params.useCache });

      return {
        success: true,
        endpoint: 'plenarprotokoll-text',
        query: params,
        totalResults: result.numFound || 0,
        returnedResults: result.documents?.length || 0,
        cursor: result.cursor || null,
        hasMore: !!(result.cursor),
        cached: result.cached,
        results: result.documents || []
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        endpoint: 'plenarprotokoll-text'
      };
    }
  }
};

// ============================================================================
// Utility Tools
// ============================================================================

export const cacheStatsTool = {
  name: 'bundestag_cache_stats',
  description: 'Get cache statistics showing hit rates and entry counts.',

  inputSchema: {},

  async handler() {
    return {
      success: true,
      stats: getCacheStats()
    };
  }
};

// Export all tools as array for easy registration
export const allTools = [
  // Drucksachen (Documents)
  searchDrucksachenTool,
  getDrucksacheTool,
  searchDrucksachenTextTool,
  // Plenarprotokolle (Plenary Protocols)
  searchPlenarprotokolleTool,
  getPlenarprotokollTool,
  searchPlenarprotokolleTextTool,
  // Vorgaenge (Proceedings)
  searchVorgaengeTool,
  getVorgangTool,
  searchVorgangspositionenTool,
  // Personen (Persons)
  searchPersonenTool,
  getPersonTool,
  // Aktivitaeten (Activities)
  searchAktivitaetenTool,
  getAktivitaetTool,
  // Utility
  cacheStatsTool
];
