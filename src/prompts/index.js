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
   Use \`bundestag_search_drucksachen\` with:
   - query: "${topic}"
   - wahlperiode: ${wahlperiode}
   - Focus on document types: Gesetzentwurf (bills), Antrag (motions), Beschlussempfehlung (recommendations)

2. **For each relevant result, get details**
   Use \`bundestag_get_drucksache\` to fetch the full document
   ${includeText ? '- Set includeFullText: true to get the complete text' : ''}

3. **Track the legislative process**
   For bills (Gesetzentwürfe), use \`bundestag_search_vorgaenge\` to find the associated Vorgang (proceeding)
   This shows the full lifecycle: committee referrals, readings, votes

4. **Summarize findings**
   - List the most relevant documents found
   - Explain their current status in the legislative process
   - Highlight key dates and next steps

Focus on the most relevant results and provide context about what each document type means.`
            }
          }
        ]
      };
    }
  },

  {
    name: 'track-proceeding',
    description: 'Track a parliamentary proceeding (Vorgang) through its lifecycle. Shows all steps from introduction to final decision.',
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

      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: searchFirst
                ? `I want to track the legislative process for a proceeding about "${topic}".

Please follow these steps:

1. **Find the Vorgang**
   Use \`bundestag_search_vorgaenge\` with query: "${topic}"
   Look for the most relevant proceeding

2. **Get Vorgang details**
   Use \`bundestag_get_vorgang\` with the found ID
   This returns the complete proceeding with all related documents

3. **Get all positions (steps)**
   Use \`bundestag_search_vorgangspositionen\` with vorgang_id
   This shows every step: committee referrals, readings, amendments, votes

4. **Create a timeline**
   For each position, explain:
   - What happened
   - When it happened
   - What it means for the proceeding
   - What comes next

5. **Current status summary**
   - Where is this proceeding now?
   - What are the next expected steps?
   - What is the likely outcome?`
                : `I want to track the parliamentary proceeding with ID: ${vorgang_id}

Please follow these steps:

1. **Get Vorgang details**
   Use \`bundestag_get_vorgang\` with id: ${vorgang_id}
   This returns the complete proceeding with all related documents

2. **Get all positions (steps)**
   Use \`bundestag_search_vorgangspositionen\` with vorgang_id: ${vorgang_id}
   This shows every step in the legislative process

3. **Analyze related documents**
   For each linked Drucksache, briefly explain its role:
   - Original bill/motion
   - Committee recommendations
   - Amendments
   - Final decision document

4. **Create a timeline**
   List all steps chronologically with:
   - Date
   - What happened
   - Significance

5. **Current status**
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
    description: 'Generate an activity report for a Member of Parliament. Shows speeches, questions, and parliamentary work.',
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

4. **Search plenary protocols for speeches**
   Use \`bundestag_search_plenarprotokolle_text\` with:
   - query: "${name}"
   ${dateFilter ? `- Filter by date range` : ''}

   This finds actual speeches in plenary sessions

5. **Generate the report**
   Structure it as:

   ## Personal Information
   - Full name, party/faction
   - Role/position
   - Electoral district (if applicable)

   ## Parliamentary Activities
   - Number of speeches
   - Number of questions (written/oral)
   - Committee memberships (if available)

   ## Key Topics
   - Main policy areas they work on
   - Notable speeches or questions

   ## Recent Activity
   - Last 5-10 activities with dates and brief descriptions

   ## Document Authorship
   - Bills or motions they (co-)authored
   - Their party's major initiatives`
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
