/**
 * MCP Tools for NLP Analysis
 *
 * These tools call the Python FastAPI analysis service to perform
 * NLP analysis on German parliamentary texts.
 */

import { z } from 'zod';
import * as analysisService from '../services/analysisService.js';

// =============================================================================
// Speech Extraction Tool
// =============================================================================

export const extractSpeechesTool = {
  name: 'bundestag_extract_speeches',
  description: `Extract individual speeches from a Plenarprotokoll (plenary session transcript).

Parses the full protocol text and identifies speech boundaries using speaker patterns
like "Name (Party):" for MPs and "Name, Role:" for government officials.

Returns structured speech data including:
- Speaker name (with academic titles separated)
- Party affiliation
- Speech type (rede, befragung, fragestunde_antwort, etc.)
- Word count
- Full text (with parenthetical annotations like [Beifall] removed)

Use this to break down a protocol into analyzable speech units.`,

  inputSchema: {
    text: z.string().min(100)
      .describe('Full Plenarprotokoll text to parse')
  },

  async handler(params) {
    try {
      const result = await analysisService.extractSpeeches(params.text);

      return {
        success: true,
        speech_count: result.speech_count,
        speeches: result.speeches
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        tool: 'bundestag_extract_speeches'
      };
    }
  }
};

// =============================================================================
// Text Analysis Tool
// =============================================================================

export const analyzeTextTool = {
  name: 'bundestag_analyze_text',
  description: `Analyze German text for word frequencies, tone, and topics using NLP.

Uses spaCy with the German de_core_news_lg model to:
- Extract and lemmatize nouns, adjectives, and verbs
- Filter German stopwords and parliamentary procedural terms
- Calculate word frequencies (per 1000 words)
- Analyze communication style (tone scores)
- Classify political topics

Returns top words by frequency with normalized rates for cross-text comparison.`,

  inputSchema: {
    text: z.string().min(10)
      .describe('German text to analyze'),
    include_tone: z.boolean().default(true)
      .describe('Include tone analysis scores (aggression, collaboration, etc.)'),
    include_topics: z.boolean().default(true)
      .describe('Include topic classification scores'),
    top_n: z.number().int().min(1).max(500).default(50)
      .describe('Number of top words to return per type')
  },

  async handler(params) {
    try {
      const result = await analysisService.analyzeText(params.text, {
        includeTone: params.include_tone,
        includeTopics: params.include_topics,
        topN: params.top_n
      });

      return {
        success: true,
        ...result
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        tool: 'bundestag_analyze_text'
      };
    }
  }
};

// =============================================================================
// Tone Analysis Tool
// =============================================================================

export const analyzeToneTool = {
  name: 'bundestag_analyze_tone',
  description: `Analyze German text for communication style and tone.

Returns 12 tone metrics on a 0-100 scale:

**Adjective-based (Scheme D):**
- affirmative: Positive vs critical adjective ratio
- aggression: Aggressive language intensity
- labeling: "Othering" language (ideologisch, radikal, etc.)

**Verb-based (Scheme D):**
- solution_focus: Solution-oriented vs problem-focused verbs
- collaboration: Collaborative vs confrontational language
- demand_intensity: Demanding verb usage (fordern, müssen)
- acknowledgment: Acknowledging language (anerkennen, würdigen)

**Extended (Scheme E):**
- authority: Obligation (müssen) vs possibility (können) modals
- future_orientation: Forward-looking vs backward-looking
- emotional_intensity: Intensifiers vs moderators
- inclusivity: Inclusive (wir) vs exclusive (sie) pronouns
- discriminatory: Per-mille rate of discriminatory terms`,

  inputSchema: {
    text: z.string().min(10)
      .describe('German text to analyze for tone')
  },

  async handler(params) {
    try {
      const result = await analysisService.analyzeTone(params.text);

      return {
        success: true,
        total_words: result.total_words,
        tone_scores: result.tone_scores
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        tool: 'bundestag_analyze_tone'
      };
    }
  }
};

// =============================================================================
// Topic Classification Tool
// =============================================================================

export const classifyTopicsTool = {
  name: 'bundestag_classify_topics',
  description: `Classify German text by political topic.

Detects focus on 13 policy areas using curated German keyword lexicons.
Returns per-1000-word frequency scores for each topic:

- **migration**: Asylum, refugees, integration, borders
- **klima**: Climate, environment, energy transition
- **wirtschaft**: Economy, trade, industry, growth
- **soziales**: Social policy, welfare, poverty
- **sicherheit**: Security, defense, police, terrorism
- **gesundheit**: Health, medicine, pandemic, care
- **europa**: EU, European integration, member states
- **digital**: Technology, digitalization, internet, data
- **bildung**: Education, schools, universities, research
- **finanzen**: Budget, taxes, debt, financial policy
- **justiz**: Law, courts, justice, constitutional
- **arbeit**: Employment, labor market, unions, wages
- **mobilitaet**: Transport, infrastructure, mobility

Higher scores indicate more focus on that topic.`,

  inputSchema: {
    text: z.string().min(10)
      .describe('German text to classify by topic')
  },

  async handler(params) {
    try {
      const result = await analysisService.classifyTopics(params.text);

      return {
        success: true,
        total_words: result.total_words,
        topic_scores: result.topic_scores
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        tool: 'bundestag_classify_topics'
      };
    }
  }
};

// =============================================================================
// Analysis Service Health Tool
// =============================================================================

export const analysisHealthTool = {
  name: 'bundestag_analysis_health',
  description: `Check the health status of the NLP analysis service.

Returns whether the Python FastAPI service is running and the spaCy
model is loaded. Use this to verify analysis capabilities are available
before calling other analysis tools.`,

  inputSchema: {},

  async handler() {
    try {
      const isUp = await analysisService.isAvailable();

      if (!isUp) {
        return {
          success: true,
          available: false,
          message: 'Analysis service is not running or not reachable'
        };
      }

      const health = await analysisService.getHealth();

      return {
        success: true,
        available: true,
        spacy_model: health.spacy_model,
        spacy_model_loaded: health.spacy_model_loaded
      };
    } catch (err) {
      return {
        success: true,
        available: false,
        message: err.message
      };
    }
  }
};

// =============================================================================
// Speaker Profile Tool
// =============================================================================

export const speakerProfileTool = {
  name: 'bundestag_speaker_profile',
  description: `Get a comprehensive profile for a Bundestag speaker based on their speeches.

Analyzes all speeches from a specific speaker to create a detailed profile including:

**Speech Statistics:**
- Total speeches, formal speeches (Reden), short contributions (Wortbeiträge)
- Responses in Q&A sessions (Befragung, Fragestunde)
- Total words spoken, average words per speech

**Vocabulary Analysis:**
- Top nouns, adjectives, and verbs used
- Signature words (characteristic vocabulary for this speaker)

**Communication Style:**
- Tone scores (aggression, collaboration, solution-focus, etc.)
- Topic focus (which policy areas they speak about most)

IMPORTANT: This tool requires speeches as input. First use bundestag_search_speeches
to retrieve speeches for a specific speaker, then pass them to this tool.

Example workflow:
1. Search: bundestag_search_speeches(query="*", speaker="Friedrich Merz", limit=100)
2. Profile: bundestag_speaker_profile(speaker_name="Friedrich Merz", speeches=[...results])`,

  inputSchema: {
    speaker_name: z.string().min(2)
      .describe('Full name of the speaker to profile'),
    speeches: z.array(z.object({
      text: z.string().describe('Speech text'),
      speaker: z.string().optional().describe('Speaker name'),
      party: z.string().optional().describe('Party affiliation'),
      type: z.string().optional().describe('Speech type (rede, befragung, etc.)'),
      category: z.string().optional().describe('Category (rede, wortbeitrag)'),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
      acad_title: z.string().optional()
    })).min(1)
      .describe('Array of speech objects from bundestag_search_speeches')
  },

  async handler(params) {
    try {
      const result = await analysisService.getSpeakerProfile(
        params.speaker_name,
        params.speeches
      );

      return {
        success: true,
        profile: {
          name: result.name,
          first_name: result.first_name,
          last_name: result.last_name,
          party: result.party,
          acad_title: result.acad_title,
          statistics: {
            total_speeches: result.total_speeches,
            formal_speeches: result.formal_speeches,
            wortbeitraege: result.wortbeitraege,
            befragung_responses: result.befragung_responses,
            total_words: result.total_words,
            avg_words_per_speech: result.avg_words_per_speech
          },
          vocabulary: {
            top_nouns: result.top_nouns,
            top_adjectives: result.top_adjectives,
            top_verbs: result.top_verbs
          },
          tone_scores: result.tone_scores,
          topic_scores: result.topic_scores
        }
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        tool: 'bundestag_speaker_profile'
      };
    }
  }
};

// =============================================================================
// Party Comparison Tool
// =============================================================================

export const partyComparisonTool = {
  name: 'bundestag_compare_parties',
  description: `Compare political parties based on their parliamentary speeches.

Analyzes speeches from multiple parties and creates a comparative profile including:

**Per-Party Statistics:**
- Number of speakers and speeches
- Total words and average speech length
- Top vocabulary (nouns, adjectives, verbs)

**Tone Comparison:**
- Aggression ranking (most to least aggressive rhetoric)
- Collaboration ranking (most to least collaborative)
- Solution-focus ranking (most to least solution-oriented)

**Topic Focus:**
- Which policy areas each party emphasizes
- Comparative topic scores across parties

IMPORTANT: This tool requires speeches as input. First use bundestag_search_speeches
to retrieve speeches (optionally filtered by topic/date), then pass them to this tool.

Example workflow:
1. Search: bundestag_search_speeches(query="Klimaschutz", limit=200)
2. Compare: bundestag_compare_parties(speeches=[...results])

The tool will automatically group speeches by party and compare them.`,

  inputSchema: {
    speeches: z.array(z.object({
      text: z.string().describe('Speech text'),
      speaker: z.string().optional().describe('Speaker name'),
      party: z.string().describe('Party affiliation (required for grouping)')
    })).min(1)
      .describe('Array of speech objects from bundestag_search_speeches'),
    parties: z.array(z.string()).optional()
      .describe('Filter to specific parties (e.g., ["CDU/CSU", "SPD", "GRÜNE"])'),
    wahlperiode: z.number().int().default(21)
      .describe('Wahlperiode for context (default: 21)'),
    top_n: z.number().int().min(5).max(100).default(20)
      .describe('Number of top words per party (default: 20)')
  },

  async handler(params) {
    try {
      const result = await analysisService.compareParties(params.speeches, {
        parties: params.parties,
        wahlperiode: params.wahlperiode,
        topN: params.top_n
      });

      return {
        success: true,
        comparison: {
          wahlperiode: result.wahlperiode,
          parties_compared: result.parties_compared,
          party_profiles: result.party_profiles,
          rankings: {
            aggression: result.aggression_ranking,
            collaboration: result.collaboration_ranking,
            solution_focus: result.solution_focus_ranking
          }
        }
      };
    } catch (err) {
      return {
        error: true,
        message: err.message,
        tool: 'bundestag_compare_parties'
      };
    }
  }
};

// =============================================================================
// Export all analysis tools
// =============================================================================

export const analysisTools = [
  extractSpeechesTool,
  analyzeTextTool,
  analyzeToneTool,
  classifyTopicsTool,
  analysisHealthTool,
  speakerProfileTool,
  partyComparisonTool
];
