/**
 * MCP Resources for Bundestag API information
 */

import { config } from '../config.js';

/**
 * System prompt resource with usage instructions
 */
export const systemPromptResource = {
  uri: 'bundestag://system-prompt',
  name: 'Bundestag MCP System Prompt',
  description: 'Usage instructions and best practices for the Bundestag MCP server',
  mimeType: 'text/markdown',

  async handler() {
    return `# Bundestag MCP Server - AI Usage Guide

## Overview
This MCP server provides access to the German Bundestag's parliamentary documentation system (DIP API).
You can search and retrieve:
- **Drucksachen**: Bills, motions, inquiries, and other printed documents
- **Plenarprotokolle**: Verbatim transcripts of plenary sessions
- **Vorgänge**: Legislative proceedings (lifecycle of bills)
- **Personen**: Members of Parliament and other persons
- **Aktivitäten**: Parliamentary activities (speeches, questions)

## Best Practices

### 1. Start with Search
Always search first before fetching specific documents:
\`\`\`
bundestag_search_drucksachen({ query: "Klimaschutz", wahlperiode: 20 })
\`\`\`

### 2. Use Wahlperiode Filter
The current electoral period (20th Bundestag, 2021-) is \`wahlperiode: 20\`.
Always filter by Wahlperiode to get relevant, recent results.

### 3. Pagination
Results are paginated. Use the \`cursor\` from the response to fetch more:
\`\`\`
bundestag_search_drucksachen({ query: "...", cursor: "<cursor-from-previous>" })
\`\`\`

### 4. Document Types
Common Drucksache types:
- \`Gesetzentwurf\`: Draft law/bill
- \`Antrag\`: Motion
- \`Kleine Anfrage\`: Minor interpellation
- \`Große Anfrage\`: Major interpellation
- \`Beschlussempfehlung und Bericht\`: Committee recommendation

### 5. Full Text Search
Two approaches for full-text:
- Use \`includeFullText: true\` on get_drucksache/get_plenarprotokoll for single documents
- Use \`bundestag_search_drucksachen_text\` or \`bundestag_search_plenarprotokolle_text\` to search within content

### 6. Vorgangspositionen
Track detailed bill progress with \`bundestag_search_vorgangspositionen\`:
- Filter by \`vorgang_id\` to see all steps of a specific bill
- Shows committee referrals, votes, decisions, and other milestones

### 7. Linking Documents
Use Vorgänge to understand how documents relate:
1. Search for a Vorgang by topic
2. Get the Vorgang by ID - it lists all related Drucksachen
3. Fetch specific Drucksachen for details

## Example Workflows

### Find Recent Climate Legislation
1. \`bundestag_search_vorgaenge({ query: "Klimaschutz", vorgangstyp: "Gesetzgebung", wahlperiode: 20 })\`
2. Get a specific Vorgang to see all related documents
3. Fetch the Gesetzentwurf (draft law) for full details

### Find MP's Activities
1. \`bundestag_search_personen({ query: "Habeck" })\`
2. Use the person ID to search activities:
   \`bundestag_search_aktivitaeten({ person_id: <id>, wahlperiode: 20 })\`

### Find Recent Parliamentary Debates
1. \`bundestag_search_plenarprotokolle({ datum_start: "2024-01-01", wahlperiode: 20 })\`
2. Get specific protocol with full text for debate content

## Response Format
All search results include:
- \`totalResults\`: Total matching documents
- \`returnedResults\`: Documents in this response
- \`cursor\`: Pagination cursor (if more results available)
- \`cached\`: Whether result was from cache
- \`results\`: Array of documents

## Caching
Results are cached for 5 minutes. Use \`useCache: false\` for fresh data.

## NLP Analysis Tools

The server includes tools for natural language processing of German parliamentary text.

### Speech Extraction
\`\`\`
bundestag_extract_speeches({ text: "<protocol full text>" })
\`\`\`
Parses Plenarprotokolle into individual speeches with speaker, party, and type.

### Text Analysis
\`\`\`
bundestag_analyze_text({ text: "...", include_tone: true, include_topics: true })
\`\`\`
Returns word frequencies (nouns, adjectives, verbs) and optional tone/topic scores.

### Tone Analysis
\`\`\`
bundestag_analyze_tone({ text: "..." })
\`\`\`
Returns 12 communication style metrics (0-100 scale):
- \`aggression\`: Aggressive language intensity
- \`collaboration\`: Collaborative vs confrontational
- \`solution_focus\`: Solution vs problem orientation
- \`demand_intensity\`: Demanding language (fordern, müssen)

### Topic Classification
\`\`\`
bundestag_classify_topics({ text: "..." })
\`\`\`
Returns per-1000-word scores for 13 policy areas:
migration, klima, wirtschaft, soziales, sicherheit, gesundheit,
europa, digital, bildung, finanzen, justiz, arbeit, mobilitaet

### Analysis Workflow Example
1. Get protocol with \`bundestag_get_plenarprotokoll({ id: X, includeFullText: true })\`
2. Check service with \`bundestag_analysis_health()\`
3. Extract speeches with \`bundestag_extract_speeches({ text: fullText })\`
4. Analyze tone with \`bundestag_analyze_tone({ text: fullText })\`
5. Classify topics with \`bundestag_classify_topics({ text: fullText })\`

## Tool Selection Guide

**When to use which search tool:**

| Need | Primary Tool | Fallback |
|------|--------------|----------|
| Find legislation by topic | \`bundestag_search_vorgaenge\` | \`bundestag_semantic_search\` |
| Find specific document by ID | \`bundestag_get_drucksache\` | - |
| Find what someone said | \`bundestag_semantic_search\` (entityTypes: ["speech"]) | \`bundestag_search_plenarprotokolle_text\` |
| Exploratory/broad search | \`bundestag_semantic_search\` | \`bundestag_search_drucksachen\` |
| Find specific paragraphs | \`bundestag_search_drucksachen_text\` | - |
| Analyze speaker rhetoric | \`bundestag_speaker_profile\` | \`bundestag_analyze_tone\` |
| Compare party positions | \`bundestag_compare_parties\` | multiple \`bundestag_analyze_tone\` |
| Track bill lifecycle | \`bundestag_search_vorgangspositionen\` | - |

## Context Window Management

**IMPORTANT:** Before fetching full text of large documents, check the size first:

\`\`\`
bundestag_estimate_size({ type: "plenarprotokoll", id: 12345 })
\`\`\`

This returns:
- Estimated token count
- Size category (tiny/small/medium/large/very_large/massive)
- Context usage percentage for your model
- Recommendation (safe to fetch / avoid full text)

**Size categories:**
| Category | Tokens | Action |
|----------|--------|--------|
| 🟢 tiny/small | <2k | Safe to fetch |
| 🟡 medium | 2k-8k | Consider if needed |
| 🟠 large | 8k-25k | Fetch only if essential |
| 🔴 very_large | 25k-50k | Avoid full text |
| ⛔ massive | >50k | Use text search instead |

**Plenarprotokolle are typically 50k-200k tokens!** Always check size first.

## Common Pitfalls

1. **Empty search results:** Try removing umlauts (ä→ae, ö→oe, ü→ue, ß→ss)
2. **Person search fails:** Use partial name, check for academic titles (Dr., Prof.)
3. **Semantic search unavailable:** Fall back to keyword search tools
4. **NLP tools fail:** Check \`bundestag_analysis_health\` first
5. **Faction names:** Use official names: "CDU/CSU", "BÜNDNIS 90/DIE GRÜNEN", "DIE LINKE"
6. **Context overflow:** Always use \`bundestag_estimate_size\` before fetching full protocol text

## Efficient Tool Chaining

**Get a speaker's rhetoric on a topic:**
1. \`bundestag_semantic_search\` (speaker + topic, entityTypes: ["speech"])
2. \`bundestag_speaker_profile\` (with results)

**Compare parties on a topic:**
1. \`bundestag_semantic_search\` (topic, limit 100+)
2. \`bundestag_compare_parties\` (with results)

**Track a bill completely:**
1. \`bundestag_search_vorgaenge\` (find the Vorgang)
2. \`bundestag_get_vorgang\` (get details)
3. \`bundestag_search_vorgangspositionen\` (get all steps)
4. \`bundestag_get_drucksache\` (for each linked document as needed)

**Analyze a debate:**
1. \`bundestag_get_plenarprotokoll\` (with includeFullText: true)
2. \`bundestag_extract_speeches\` (parse speeches)
3. \`bundestag_compare_parties\` (compare rhetoric)
4. \`bundestag_classify_topics\` (identify policy areas)
`;
  }
};

/**
 * Server info resource
 */
export const infoResource = {
  uri: 'bundestag://info',
  name: 'Server Information',
  description: 'Bundestag MCP server capabilities and version info',
  mimeType: 'application/json',

  async handler() {
    return {
      name: 'Bundestag MCP Server',
      version: '1.0.0',
      description: 'MCP server for German Bundestag parliamentary documentation (DIP API)',
      api: {
        name: 'DIP API',
        provider: 'Deutscher Bundestag',
        documentation: 'https://dip.bundestag.api.bund.dev/',
        baseUrl: config.dipApi.baseUrl
      },
      capabilities: {
        entities: [
          'drucksache',
          'drucksache-text',
          'plenarprotokoll',
          'plenarprotokoll-text',
          'vorgang',
          'vorgangsposition',
          'person',
          'aktivitaet'
        ],
        features: [
          'Full-text search',
          'Metadata search',
          'Date range filtering',
          'Wahlperiode filtering',
          'Pagination with cursors',
          'Full document text retrieval',
          'Proceeding position tracking',
          'Response caching',
          'Semantic search (Qdrant + Mistral)',
          'Speech extraction from protocols',
          'NLP word frequency analysis',
          'Communication style/tone analysis',
          'Political topic classification'
        ]
      },
      tools: [
        'bundestag_search_drucksachen',
        'bundestag_get_drucksache',
        'bundestag_search_drucksachen_text',
        'bundestag_search_plenarprotokolle',
        'bundestag_get_plenarprotokoll',
        'bundestag_search_plenarprotokolle_text',
        'bundestag_search_vorgaenge',
        'bundestag_get_vorgang',
        'bundestag_search_vorgangspositionen',
        'bundestag_search_personen',
        'bundestag_get_person',
        'bundestag_search_aktivitaeten',
        'bundestag_get_aktivitaet',
        'bundestag_semantic_search',
        'bundestag_semantic_search_status',
        'bundestag_trigger_indexing',
        'bundestag_extract_speeches',
        'bundestag_analyze_text',
        'bundestag_analyze_tone',
        'bundestag_classify_topics',
        'bundestag_speaker_profile',
        'bundestag_compare_parties',
        'bundestag_analysis_health',
        'bundestag_estimate_size',
        'bundestag_cache_stats',
        'get_client_config'
      ],
      prompts: [
        'search-legislation',
        'track-proceeding',
        'mp-activity-report',
        'analyze-debate',
        'compare-factions',
        'find-statements',
        'topic-trends',
        'speaker-deep-dive'
      ]
    };
  }
};

/**
 * Wahlperioden (electoral periods) resource
 */
export const wahlperiodenResource = {
  uri: 'bundestag://wahlperioden',
  name: 'Electoral Periods',
  description: 'List of Bundestag electoral periods (Wahlperioden)',
  mimeType: 'application/json',

  async handler() {
    return {
      current: 20,
      periods: [
        { number: 20, years: '2021-2025', description: 'Current electoral period' },
        { number: 19, years: '2017-2021', description: 'Previous electoral period' },
        { number: 18, years: '2013-2017', description: '' },
        { number: 17, years: '2009-2013', description: '' },
        { number: 16, years: '2005-2009', description: '' },
        { number: 15, years: '2002-2005', description: '' },
        { number: 14, years: '1998-2002', description: '' },
        { number: 13, years: '1994-1998', description: '' },
        { number: 12, years: '1990-1994', description: 'First all-German Bundestag' }
      ],
      note: 'Earlier periods (1-11) are also available in the API'
    };
  }
};

/**
 * Document types resource
 */
export const drucksachetypenResource = {
  uri: 'bundestag://drucksachetypen',
  name: 'Document Types',
  description: 'Available Drucksache (document) types',
  mimeType: 'application/json',

  async handler() {
    return {
      types: config.entityTypes.drucksachetypen,
      descriptions: {
        'Gesetzentwurf': 'Draft law/bill introduced by government, Bundesrat, or parliamentary groups',
        'Antrag': 'Motion proposed by parliamentary groups',
        'Kleine Anfrage': 'Minor interpellation - written questions to the government',
        'Große Anfrage': 'Major interpellation - significant questions requiring debate',
        'Beschlussempfehlung und Bericht': 'Committee recommendation and report',
        'Unterrichtung': 'Government information/notification to parliament',
        'Entschließungsantrag': 'Resolution motion',
        'Änderungsantrag': 'Amendment proposal',
        'Bericht': 'Report',
        'Schriftliche Frage': 'Written question by individual MP'
      }
    };
  }
};

/**
 * Parliamentary factions resource
 */
export const factionenResource = {
  uri: 'bundestag://factions',
  name: 'Parliamentary Factions',
  description: 'List of Bundestag factions with official names and common aliases for API filtering',
  mimeType: 'application/json',

  async handler() {
    return {
      current_wahlperiode: 20,
      factions: [
        {
          official: 'SPD',
          full_name: 'Sozialdemokratische Partei Deutschlands',
          aliases: ['Sozialdemokraten'],
          color: '#E3000F',
          position: 'center-left'
        },
        {
          official: 'CDU/CSU',
          full_name: 'Christlich Demokratische Union / Christlich-Soziale Union',
          aliases: ['Union', 'Christdemokraten', 'CDU', 'CSU'],
          color: '#000000',
          position: 'center-right'
        },
        {
          official: 'BÜNDNIS 90/DIE GRÜNEN',
          full_name: 'Bündnis 90/Die Grünen',
          aliases: ['Grüne', 'Die Grünen', 'B90/Grüne', 'Gruene'],
          color: '#1AA037',
          position: 'center-left'
        },
        {
          official: 'FDP',
          full_name: 'Freie Demokratische Partei',
          aliases: ['Liberale', 'Freie Demokraten'],
          color: '#FFEF00',
          position: 'center'
        },
        {
          official: 'AfD',
          full_name: 'Alternative für Deutschland',
          aliases: ['Alternative für Deutschland'],
          color: '#0489DB',
          position: 'right'
        },
        {
          official: 'DIE LINKE',
          full_name: 'Die Linke',
          aliases: ['Linke', 'Linkspartei'],
          color: '#BE3075',
          position: 'left',
          note: 'Lost faction status in 2024 due to split'
        },
        {
          official: 'BSW',
          full_name: 'Bündnis Sahra Wagenknecht',
          aliases: ['Bündnis Sahra Wagenknecht', 'Wagenknecht'],
          color: '#731930',
          position: 'left-populist',
          note: 'Split from DIE LINKE in 2024'
        },
        {
          official: 'fraktionslos',
          full_name: 'Fraktionslose Abgeordnete',
          aliases: ['parteilos', 'unaffiliated', 'independent'],
          color: '#808080',
          note: 'MPs without faction membership'
        }
      ],
      usage_note: 'Always use the official name for API filtering (fraktion parameter). Aliases are for recognition and search fallback only.',
      api_tip: 'When searching by party, use bundestag_semantic_search with fraktion parameter set to official name'
    };
  }
};

// Export all resources
export const allResources = [
  systemPromptResource,
  infoResource,
  wahlperiodenResource,
  drucksachetypenResource,
  factionenResource
];
