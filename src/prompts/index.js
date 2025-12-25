/**
 * MCP Prompts - Reusable workflow templates for AI clients
 *
 * Prompts provide guided workflows that help AI assistants
 * perform complex multi-step tasks with the Bundestag API.
 */

import { z } from 'zod';

/**
 * All MCP Prompts for the Bundestag server
 */
export const allPrompts = [
  {
    name: 'search-legislation',
    description: 'Guided search for bills and legislation in the Bundestag. Helps find relevant Drucksachen, track their status, and understand the legislative process.',
    arguments: [
      {
        name: 'topic',
        description: 'The topic or subject to search for (e.g., "climate protection", "minimum wage", "digitalization")',
        required: true
      },
      {
        name: 'wahlperiode',
        description: 'Legislative period to search in (default: 20 for current period)',
        required: false
      },
      {
        name: 'include_full_text',
        description: 'Whether to include full text search results (default: false)',
        required: false
      }
    ],
    handler: ({ topic, wahlperiode = '20', include_full_text = 'false' }) => {
      const includeText = include_full_text === 'true' || include_full_text === true;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want to find legislation about "${topic}" in the German Bundestag.

Please help me by following these steps:

1. **Search for Drucksachen (Documents)**

   **Option A - Keyword search (exact terms):**
   Use \`bundestag_search_drucksachen\` with:
   - query: "${topic}"
   - wahlperiode: ${wahlperiode}
   - drucksachetyp: Start with "Gesetzentwurf" for bills

   **Option B - Semantic search (exploratory, if topic is broad):**
   Use \`bundestag_semantic_search\` with:
   - query: "${topic}"
   - docTypes: ["drucksache"]
   - wahlperiode: ${wahlperiode}
   This finds conceptually related documents even with different terminology.

   **Fallback:** If no results:
   - Try removing umlauts (ae, oe, ue instead of ä, ö, ü)
   - Broaden the query
   - Switch from keyword to semantic search or vice versa

   **Document types to focus on:**
   - Gesetzentwurf: Draft law/bill
   - Antrag: Motion
   - Beschlussempfehlung und Bericht: Committee recommendation
   - Kleine Anfrage: Minor interpellation (questions)
   - Unterrichtung: Government notification

2. **For each relevant result, get details**
   Use \`bundestag_get_drucksache\` to fetch the full document
   ${includeText ? '- Set includeFullText: true to get the complete text' : ''}

3. **Track the legislative process**
   For bills (Gesetzentwürfe), use \`bundestag_search_vorgaenge\` with:
   - query: "${topic}" OR drucksache reference
   - vorgangstyp: "Gesetzgebung" (for legislation)
   - wahlperiode: ${wahlperiode}

   This shows the full lifecycle: committee referrals, readings, votes

4. **Summarize findings**
   - List the most relevant documents found
   - Explain their current status in the legislative process
   - Highlight key dates and next steps
   - Note which documents are related (same Vorgang)

Focus on the most relevant results and provide context about what each document type means.`
            }
          }
        ]
      };
    }
  },

  {
    name: 'track-proceeding',
    description: 'Track a parliamentary proceeding (Vorgang) through its lifecycle. Shows all steps from introduction to final decision with glossary of legislative stages.',
    arguments: [
      {
        name: 'vorgang_id',
        description: 'The Vorgang ID to track (e.g., "299594")',
        required: false
      },
      {
        name: 'topic',
        description: 'Topic to search for if Vorgang ID is not known',
        required: false
      }
    ],
    handler: ({ vorgang_id, topic }) => {
      const searchFirst = !vorgang_id && topic;

      const glossary = `
## Glossary: Legislative Process Stages

| Stage | German | Meaning |
|-------|--------|---------|
| 1. Lesung | First Reading | Introduction and initial debate, referral to committee |
| Ausschussüberweisung | Committee Referral | Assigned to one or more committees for detailed review |
| Ausschussberatung | Committee Deliberation | Expert review and potential amendments |
| Beschlussempfehlung | Committee Recommendation | Committee's recommendation to accept/reject/amend |
| 2. Lesung | Second Reading | Debate on committee recommendation, amendments voted |
| 3. Lesung | Third Reading | Final vote in Bundestag |
| Bundesrat | Bundesrat | Review by states; may approve, object, or invoke committee |
| Vermittlungsausschuss | Mediation Committee | Joint committee if Bundestag and Bundesrat disagree |
| Verkündung | Promulgation | President signs, published in Bundesgesetzblatt |
| Inkrafttreten | Entry into Force | Law takes effect |

**Common Vorgang Types:**
- Gesetzgebung: Legislation (bills)
- Antrag: Motion
- Anfrage: Inquiry (Kleine/Große)
- Verordnung: Regulation`;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: searchFirst
                ? `I want to track the legislative process for a proceeding about "${topic}".

${glossary}

Please follow these steps:

1. **Find the Vorgang**

   **Option A - Keyword search:**
   Use \`bundestag_search_vorgaenge\` with:
   - query: "${topic}"
   - vorgangstyp: "Gesetzgebung" (for bills)
   - wahlperiode: 20

   **Option B - Semantic search (if topic is broad):**
   Use \`bundestag_semantic_search\` with:
   - query: "${topic}"
   - entityTypes: ["vorgang"]
   - wahlperiode: 20

   Look for the most relevant proceeding

2. **Get Vorgang details**
   Use \`bundestag_get_vorgang\` with the found ID
   This returns the complete proceeding with all related documents

3. **Get all positions (steps)**
   Use \`bundestag_search_vorgangspositionen\` with vorgang_id
   This shows every step: committee referrals, readings, amendments, votes

4. **Find related debates**
   Use \`bundestag_search_plenarprotokolle_text\` with:
   - query: (Vorgang title or Drucksache number)
   This finds plenary debates about this proceeding

5. **Create a timeline**
   For each position, explain using the glossary above:
   - What happened (stage name)
   - When it happened
   - What it means for the proceeding
   - What comes next

6. **Current status summary**
   - Where is this proceeding now? (use glossary)
   - What are the next expected steps?
   - What is the likely outcome?`
                : `I want to track the parliamentary proceeding with ID: ${vorgang_id}

${glossary}

Please follow these steps:

1. **Get Vorgang details**
   Use \`bundestag_get_vorgang\` with id: ${vorgang_id}
   This returns the complete proceeding with all related documents

2. **Get all positions (steps)**
   Use \`bundestag_search_vorgangspositionen\` with vorgang_id: ${vorgang_id}
   This shows every step in the legislative process

3. **Analyze related documents**
   For each linked Drucksache, briefly explain its role:
   - Gesetzentwurf: Original bill
   - Beschlussempfehlung: Committee recommendation
   - Änderungsantrag: Amendment
   - Entschließungsantrag: Resolution
   - Unterrichtung: Government notification

4. **Find related debates**
   Use \`bundestag_search_plenarprotokolle_text\` with the Vorgang title
   This shows when this proceeding was debated in plenary

5. **Create a timeline**
   List all steps chronologically using the glossary:
   - Date
   - Stage (German term + explanation)
   - Significance

6. **Current status**
   - Where is this proceeding now?
   - Is it still active or concluded?
   - What was/is the outcome?`
            }
          }
        ]
      };
    }
  },

  {
    name: 'mp-activity-report',
    description: 'Generate a comprehensive activity report for a Member of Parliament. Includes speeches, questions, rhetorical analysis, and parliamentary work.',
    arguments: [
      {
        name: 'name',
        description: 'Name of the MP (e.g., "Merkel", "Scholz", "Baerbock")',
        required: true
      },
      {
        name: 'wahlperiode',
        description: 'Legislative period (default: 20 for current)',
        required: false
      },
      {
        name: 'date_from',
        description: 'Start date for activities (YYYY-MM-DD format)',
        required: false
      },
      {
        name: 'date_to',
        description: 'End date for activities (YYYY-MM-DD format)',
        required: false
      }
    ],
    handler: ({ name, wahlperiode = '20', date_from, date_to }) => {
      const dateFilter = date_from
        ? `- Filter by date: from ${date_from}${date_to ? ` to ${date_to}` : ''}`
        : '';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want a comprehensive activity report for the Member of Parliament: "${name}"

Please follow these steps:

1. **Find the person**
   Use \`bundestag_search_personen\` with:
   - query: "${name}"
   - wahlperiode: ${wahlperiode}

   Get their full details with \`bundestag_get_person\`
   Note: If search fails, try without umlauts (ae, oe, ue instead of ä, ö, ü)

2. **Get their activities**
   Use \`bundestag_search_aktivitaeten\` with:
   - person_id: (from step 1)
   - wahlperiode: ${wahlperiode}
   ${dateFilter}

   Activities include: speeches, written questions, oral questions

3. **Find documents they authored**
   Use \`bundestag_search_drucksachen\` with:
   - urheber: "${name}" (or their faction)
   - wahlperiode: ${wahlperiode}

4. **Search for their speeches (semantic search)**
   Use \`bundestag_semantic_search\` with:
   - query: "${name}"
   - entityTypes: ["speech"]
   - wahlperiode: ${wahlperiode}
   ${date_from ? `- dateFrom: "${date_from}"` : ''}
   ${date_to ? `- dateTo: "${date_to}"` : ''}
   - limit: 50

   This finds speeches using semantic search for more comprehensive results.

5. **Analyze their communication style**
   If speeches were found in step 4, use \`bundestag_speaker_profile\` with:
   - speaker_name: "${name}"
   - speeches: [array of speech objects from step 4]

   This provides:
   - Tone analysis (aggression, collaboration, solution-focus)
   - Vocabulary patterns
   - Topic focus areas

6. **Generate the report**
   Structure it as:

   ## Personal Information
   - Full name, party/faction
   - Role/position
   - Electoral district (if applicable)

   ## Parliamentary Activities
   - Number of speeches
   - Number of questions (written/oral)
   - Committee memberships (if available)

   ## Communication Style
   - Tone profile (from step 5)
   - Characteristic vocabulary
   - Speaking patterns (formal vs interventions)

   ## Key Topics
   - Main policy areas they work on (from topic analysis)
   - Notable speeches or questions

   ## Recent Activity
   - Last 5-10 activities with dates and brief descriptions

   ## Document Authorship
   - Bills or motions they (co-)authored
   - Their party's major initiatives

   ## Notable Quotes
   - 2-3 characteristic or significant quotes from their speeches`
            }
          }
        ]
      };
    }
  },

  {
    name: 'analyze-debate',
    description: 'Analyze a plenary debate. Extract speeches, compare party rhetoric, analyze communication style, and identify key topics discussed.',
    arguments: [
      {
        name: 'protocol_id',
        description: 'The Plenarprotokoll ID to analyze (e.g., "5706")',
        required: false
      },
      {
        name: 'date',
        description: 'Date of the plenary session to find (YYYY-MM-DD format)',
        required: false
      },
      {
        name: 'topic',
        description: 'Topic to search for in protocols (e.g., "Klimaschutz")',
        required: false
      }
    ],
    handler: ({ protocol_id, date, topic }) => {
      const hasProtocolId = !!protocol_id;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: hasProtocolId
                ? `I want to analyze the plenary debate from Plenarprotokoll ID: ${protocol_id}

Please follow these steps:

1. **Fetch the protocol**
   Use \`bundestag_get_plenarprotokoll\` with:
   - id: ${protocol_id}
   - includeFullText: true

2. **Check analysis service**
   Use \`bundestag_analysis_health\` to verify the NLP service is available

3. **Extract individual speeches**
   Use \`bundestag_extract_speeches\` with the protocol's full text
   This identifies each speaker, their party, and speech boundaries

4. **Analyze overall tone**
   Use \`bundestag_analyze_tone\` on the full protocol text
   This gives aggregate communication style metrics

5. **Compare party rhetoric**
   Use \`bundestag_compare_parties\` with:
   - speeches: [array of speech objects from step 3]
   - parties: ["CDU/CSU", "SPD", "BÜNDNIS 90/DIE GRÜNEN", "FDP", "AfD", "DIE LINKE"]
   This compares vocabulary, tone, and framing across parties

6. **Classify topics discussed**
   Use \`bundestag_classify_topics\` on the full protocol text
   This shows which policy areas were discussed

7. **Generate analysis report**

   ## Protocol Overview
   - Date and session number
   - Total speeches extracted
   - Parties represented

   ## Speaker Breakdown
   - Speeches per party
   - Most active speakers
   - Word count distribution

   ## Party Rhetoric Comparison
   - Aggression ranking by party
   - Collaboration scores comparison
   - Solution-focus ranking
   - Key vocabulary differences between parties

   ## Communication Style (Overall)
   - Overall tone (aggressive vs collaborative)
   - Solution-oriented vs problem-focused
   - Notable patterns

   ## Topics Discussed
   - Top 5 policy areas by mention frequency
   - Key themes and debates

   ## Key Quotes
   - Notable statements from each major party`
                : `I want to analyze a plenary debate ${date ? `from ${date}` : topic ? `about "${topic}"` : ''}.

Please follow these steps:

1. **Find the protocol**
   ${date ? `Use \`bundestag_search_plenarprotokolle\` with:
   - datum_start: "${date}"
   - datum_end: "${date}"
   - wahlperiode: 20` : ''}
   ${topic ? `Use \`bundestag_search_plenarprotokolle_text\` with:
   - query: "${topic}"
   - wahlperiode: 20` : ''}
   ${!date && !topic ? `Use \`bundestag_search_plenarprotokolle\` with:
   - wahlperiode: 20
   to find recent protocols` : ''}

2. **Fetch full protocol**
   Use \`bundestag_get_plenarprotokoll\` with:
   - id: (from step 1)
   - includeFullText: true

3. **Check analysis service**
   Use \`bundestag_analysis_health\` to verify NLP is available

4. **Extract speeches**
   Use \`bundestag_extract_speeches\` with the protocol text
   This parses individual speeches by speaker

5. **Analyze tone and topics**
   Use \`bundestag_analyze_tone\` for communication style
   Use \`bundestag_classify_topics\` for policy area detection

6. **Compare party rhetoric**
   Use \`bundestag_compare_parties\` with:
   - speeches: [speech objects from step 4]
   - parties: (parties that participated)
   This shows rhetorical differences between factions

7. **Generate analysis report**

   ## Protocol Overview
   - Session date and number
   - Total speakers and speeches

   ## Speaker Analysis
   - Breakdown by party
   - Most active contributors

   ## Party Comparison
   - Rhetorical style differences
   - Vocabulary patterns by party
   - Aggression/collaboration rankings

   ## Tone Analysis
   - Aggression levels
   - Collaboration scores
   - Solution vs problem focus

   ## Topics Covered
   - Main policy areas discussed
   - Topic frequency rankings

   ## Key Quotes
   - Notable statements from each party`
            }
          }
        ]
      };
    }
  },

  {
    name: 'compare-factions',
    description: 'Compare how different political parties discuss a topic in parliament. Analyzes rhetoric, tone, and policy positions across factions.',
    arguments: [
      {
        name: 'topic',
        description: 'Topic to compare parties on (e.g., "Klimaschutz", "Migration", "Schuldenbremse")',
        required: true
      },
      {
        name: 'parties',
        description: 'Comma-separated list of parties to compare (default: all major parties)',
        required: false
      },
      {
        name: 'wahlperiode',
        description: 'Legislative period (default: 20 for current)',
        required: false
      },
      {
        name: 'date_from',
        description: 'Start date for analysis (YYYY-MM-DD)',
        required: false
      }
    ],
    handler: ({ topic, parties, wahlperiode = '20', date_from }) => {
      const partyList = parties
        ? parties.split(',').map(p => p.trim())
        : ['CDU/CSU', 'SPD', 'BÜNDNIS 90/DIE GRÜNEN', 'FDP', 'AfD', 'DIE LINKE', 'BSW'];

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want to compare how different political parties discuss "${topic}" in the Bundestag.

**Analysis Goal:** Compare the rhetoric, tone, and positions of ${partyList.join(', ')} on this topic.

## Step 1: Gather Speeches

Use \`bundestag_semantic_search\` to collect speeches about this topic:
- query: "${topic}"
- entityTypes: ["speech"]
- wahlperiode: ${wahlperiode}
- limit: 100 (we need enough speeches for meaningful comparison)
${date_from ? `- dateFrom: "${date_from}"` : ''}

If semantic search is unavailable, fall back to:
\`bundestag_search_plenarprotokolle_text\` with query: "${topic}"

Run multiple searches if needed to get speeches from all parties.
For parties with few results, try broader related queries.

## Step 2: Compare Parties

Use \`bundestag_compare_parties\` with the collected speeches:
- speeches: [array of speech objects from Step 1]
- parties: ${JSON.stringify(partyList)}

This produces:
- Per-party vocabulary analysis
- Aggression/collaboration/solution-focus rankings
- Topic emphasis comparison

## Step 3: Generate Comparative Report

Structure your analysis as:

### Overview
- Total speeches analyzed per party
- Date range covered
- Limitations (e.g., parties with few speeches on topic)

### Rhetorical Style Comparison
| Party | Aggression | Collaboration | Solution-Focus |
|-------|------------|---------------|----------------|
| ...   | ...        | ...           | ...            |

Explain what the scores mean:
- High aggression: confrontational language, accusations
- High collaboration: seeking consensus, acknowledging other positions
- High solution-focus: concrete proposals vs problem description

### Key Vocabulary Differences
For each party, list 3-5 distinctive terms they use that others don't.
Explain what this reveals about their framing.

### Policy Positions
Based on the speeches, summarize each party's stance on "${topic}".

### Surprising Findings
Note any unexpected patterns (e.g., unusual agreement between parties,
a party focusing on an unexpected aspect of the topic).`
            }
          }
        ]
      };
    }
  },

  {
    name: 'find-statements',
    description: 'Find specific statements or quotes from politicians or parties on a topic. Uses semantic search for precise speech retrieval.',
    arguments: [
      {
        name: 'topic',
        description: 'What topic are you looking for statements about?',
        required: true
      },
      {
        name: 'speaker',
        description: 'Specific speaker to search for (e.g., "Olaf Scholz", "Friedrich Merz")',
        required: false
      },
      {
        name: 'party',
        description: 'Filter by party (e.g., "CDU/CSU", "SPD", "GRÜNE")',
        required: false
      },
      {
        name: 'context',
        description: 'Additional context for the search (e.g., "during the budget debate")',
        required: false
      },
      {
        name: 'date_from',
        description: 'Start date (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'date_to',
        description: 'End date (YYYY-MM-DD)',
        required: false
      }
    ],
    handler: ({ topic, speaker, party, context, date_from, date_to }) => {
      const fullQuery = context ? `${topic} ${context}` : topic;

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want to find specific statements about "${topic}"${speaker ? ` from ${speaker}` : ''}${party ? ` by ${party} politicians` : ''}.

## Search Strategy

### Primary Search: Semantic Search

Use \`bundestag_semantic_search\`:
- query: "${fullQuery}"
- entityTypes: ["speech"]
- limit: 20
${speaker ? `- Filter results by speaker name: "${speaker}"` : ''}
${party ? `- fraktion: "${party}"` : ''}
${date_from ? `- dateFrom: "${date_from}"` : ''}
${date_to ? `- dateTo: "${date_to}"` : ''}
- scoreThreshold: 0.4 (higher threshold for more relevant results)

### If Semantic Search Returns Few Results

1. **Broaden the query:** Remove context, use only core topic
2. **Try full-text search:** Use \`bundestag_search_plenarprotokolle_text\` with:
   - query: "${topic}${speaker ? ` ${speaker}` : ''}"
3. **Try document search:** Use \`bundestag_search_drucksachen_text\` for written statements

## Presentation Format

For each relevant statement found:

### Statement 1
**Speaker:** [Name] ([Party])
**Date:** [YYYY-MM-DD]
**Context:** [Debate topic / Tagesordnungspunkt]
**Quote:**
> "[Relevant excerpt from the speech]"

**Source:** Plenarprotokoll [Dokumentnummer]

---

Provide 5-10 of the most relevant statements.
Prioritize:
1. Direct statements on the exact topic
2. Clear, quotable passages
3. Recent statements (unless historical context requested)

If the speaker/party hasn't made relevant statements, say so clearly
rather than providing tangentially related content.`
            }
          }
        ]
      };
    }
  },

  {
    name: 'topic-trends',
    description: 'Analyze how discussion of a political topic has evolved over time in the Bundestag.',
    arguments: [
      {
        name: 'topic',
        description: 'Topic to analyze over time (e.g., "Digitalisierung", "Energiewende")',
        required: true
      },
      {
        name: 'time_periods',
        description: 'Time periods to compare: "wahlperioden" (compare WP 19 vs 20) or "years" (year-by-year)',
        required: false
      },
      {
        name: 'wahlperiode_start',
        description: 'Starting Wahlperiode for comparison (default: 19)',
        required: false
      }
    ],
    handler: ({ topic, time_periods = 'wahlperioden', wahlperiode_start = '19' }) => {
      const isWahlperioden = time_periods === 'wahlperioden';

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want to analyze how parliamentary discussion of "${topic}" has evolved over time.

**Analysis Goal:** Track changes in rhetoric, frequency, and framing of "${topic}" across ${isWahlperioden ? 'electoral periods' : 'years'}.

## Step 1: Collect Data for Each Period

${isWahlperioden ? `
### Period 1: Wahlperiode ${wahlperiode_start} (${wahlperiode_start === '19' ? '2017-2021' : wahlperiode_start === '18' ? '2013-2017' : ''})

Use \`bundestag_semantic_search\`:
- query: "${topic}"
- entityTypes: ["speech"]
- wahlperiode: ${wahlperiode_start}
- limit: 50

Also search Vorgänge:
\`bundestag_search_vorgaenge\`:
- query: "${topic}"
- wahlperiode: ${wahlperiode_start}

### Period 2: Wahlperiode 20 (2021-present)

Repeat the same searches with wahlperiode: 20.
` : `
For each year in your analysis range, use \`bundestag_semantic_search\`:
- query: "${topic}"
- entityTypes: ["speech"]
- dateFrom: "YYYY-01-01"
- dateTo: "YYYY-12-31"
- limit: 30

Do this for years: 2019, 2020, 2021, 2022, 2023, 2024.
`}

## Step 2: Analyze Each Period

For each period's speeches, use \`bundestag_analyze_text\`:
- text: [concatenated speech texts]
- include_tone: true
- include_topics: true

This gives you vocabulary and tone metrics for comparison.

## Step 3: Generate Trend Report

### Volume Trends
- How many speeches/documents mention "${topic}" per period?
- Is attention increasing or decreasing?
- Which parties are driving the discussion?

### Framing Evolution
- What terms appeared in early periods but disappeared later?
- What new vocabulary emerged?
- Has the topic become more or less polarizing (aggression scores)?

### Key Vocabulary Shifts
| Term | Period 1 Freq | Period 2 Freq | Change |
|------|---------------|---------------|--------|

### Tone Evolution
- Has rhetoric become more aggressive or collaborative?
- Is discussion more solution-focused now or before?

### Legislative Activity
- Major bills introduced on this topic by period
- What passed vs what failed?

### Interpretation
What do these trends suggest about:
- Political priorities
- Public discourse evolution
- Party positioning changes`
            }
          }
        ]
      };
    }
  },

  {
    name: 'speaker-deep-dive',
    description: 'Comprehensive rhetorical and policy analysis of a specific politician based on their parliamentary speeches.',
    arguments: [
      {
        name: 'name',
        description: 'Full name of the politician (e.g., "Friedrich Merz", "Robert Habeck")',
        required: true
      },
      {
        name: 'wahlperiode',
        description: 'Legislative period to analyze (default: 20)',
        required: false
      },
      {
        name: 'focus_topic',
        description: 'Optional: Focus analysis on a specific topic',
        required: false
      }
    ],
    handler: ({ name, wahlperiode = '20', focus_topic }) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `I want a deep-dive analysis of ${name}'s parliamentary rhetoric and policy positions.

## Step 1: Get Speaker Information

Use \`bundestag_search_personen\`:
- query: "${name}"
- wahlperiode: ${wahlperiode}

Get their details with \`bundestag_get_person\` to understand:
- Current role/position
- Party affiliation
- Electoral district (if applicable)

Note: If search fails, try without umlauts (ae, oe, ue)

## Step 2: Collect Their Speeches

Use \`bundestag_semantic_search\`:
- query: ${focus_topic ? `"${focus_topic}"` : `"${name}"`}
- entityTypes: ["speech"]
- wahlperiode: ${wahlperiode}
- limit: 100

Filter results to speeches by "${name}".
${focus_topic ? `Since focusing on "${focus_topic}", accept fewer results if the topic is specific.` : 'Aim to get a representative sample across different debates.'}

## Step 3: Generate Speaker Profile

Use \`bundestag_speaker_profile\` with:
- speaker_name: "${name}"
- speeches: [array from Step 2]

This produces:
- Speech statistics (total, by type)
- Vocabulary patterns
- Tone scores
- Topic focus areas

## Step 4: Deep Analysis

For ${focus_topic ? `their speeches on "${focus_topic}"` : 'their most significant speeches'},
use \`bundestag_analyze_tone\` individually on 3-5 key speeches to understand:
- How their tone varies by topic
- Whether they're more aggressive in certain debates
- Their rhetorical patterns

## Generate Report

### Profile Summary
- Role and party
- Speaking activity level (compared to typical MP)
- Primary policy areas

### Rhetorical Style
- **Tone Signature:** Interpretation of their overall tone scores
- **Characteristic Vocabulary:** Words they use distinctively
- **Speaking Pattern:** Long formal speeches vs short interventions?

### Policy Focus
- Top 5 policy areas by mention frequency
- Notable positions taken
${focus_topic ? `
### Focus on "${focus_topic}"
- Their stated positions
- Key quotes
- How their tone differs on this topic vs others` : ''}

### Comparison Context
- How do their tone scores compare to party averages?
- Are they more/less aggressive than typical for their party?

### Notable Quotes
Include 3-5 particularly characteristic or significant quotes.`
            }
          }
        ]
      };
    }
  }
];

/**
 * Register all prompts with an MCP server
 */
export function registerPrompts(server) {
  for (const prompt of allPrompts) {
    server.prompt(
      prompt.name,
      prompt.description,
      async (params) => {
        try {
          return prompt.handler(params);
        } catch (err) {
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Error generating prompt: ${err.message}`
                }
              }
            ]
          };
        }
      }
    );
  }
}
