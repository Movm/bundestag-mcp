/**
 * MCP Resource Templates - Dynamic resources with URI patterns
 *
 * Resource templates allow clients to fetch dynamic content by filling
 * in URI parameters. For example, `bundestag://drucksache/12345` returns
 * the document with ID 12345.
 */

import {
  getDrucksache,
  getDrucksacheText,
  getPlenarprotokoll,
  getPlenarprotokollText,
  getVorgang,
  getPerson,
  getAktivitaet
} from '../api/bundestag.js';

/**
 * All MCP Resource Templates
 */
export const allResourceTemplates = [
  {
    uriTemplate: 'bundestag://drucksache/{id}',
    name: 'Drucksache by ID',
    description: 'Fetch a specific Bundestag document (Drucksache) by its ID',
    mimeType: 'application/json',
    handler: async (params) => {
      const { id } = params;
      const data = await getDrucksache(id);
      if (!data) {
        return { error: `Drucksache ${id} not found` };
      }
      return data;
    }
  },
  {
    uriTemplate: 'bundestag://drucksache/{id}/text',
    name: 'Drucksache Full Text',
    description: 'Fetch the full text content of a Drucksache',
    mimeType: 'application/json',
    handler: async (params) => {
      const { id } = params;
      const data = await getDrucksacheText(id);
      if (!data) {
        return { error: `Drucksache text ${id} not found` };
      }
      return data;
    }
  },
  {
    uriTemplate: 'bundestag://plenarprotokoll/{id}',
    name: 'Plenarprotokoll by ID',
    description: 'Fetch a specific plenary protocol by its ID',
    mimeType: 'application/json',
    handler: async (params) => {
      const { id } = params;
      const data = await getPlenarprotokoll(id);
      if (!data) {
        return { error: `Plenarprotokoll ${id} not found` };
      }
      return data;
    }
  },
  {
    uriTemplate: 'bundestag://plenarprotokoll/{id}/text',
    name: 'Plenarprotokoll Full Text',
    description: 'Fetch the full text content of a plenary protocol',
    mimeType: 'application/json',
    handler: async (params) => {
      const { id } = params;
      const data = await getPlenarprotokollText(id);
      if (!data) {
        return { error: `Plenarprotokoll text ${id} not found` };
      }
      return data;
    }
  },
  {
    uriTemplate: 'bundestag://vorgang/{id}',
    name: 'Vorgang by ID',
    description: 'Fetch a parliamentary proceeding with all related documents',
    mimeType: 'application/json',
    handler: async (params) => {
      const { id } = params;
      const data = await getVorgang(id);
      if (!data) {
        return { error: `Vorgang ${id} not found` };
      }
      return data;
    }
  },
  {
    uriTemplate: 'bundestag://person/{id}',
    name: 'Person by ID',
    description: 'Fetch details about a Member of Parliament or other person',
    mimeType: 'application/json',
    handler: async (params) => {
      const { id } = params;
      const data = await getPerson(id);
      if (!data) {
        return { error: `Person ${id} not found` };
      }
      return data;
    }
  },
  {
    uriTemplate: 'bundestag://aktivitaet/{id}',
    name: 'Aktivitaet by ID',
    description: 'Fetch a specific parliamentary activity',
    mimeType: 'application/json',
    handler: async (params) => {
      const { id } = params;
      const data = await getAktivitaet(id);
      if (!data) {
        return { error: `Aktivitaet ${id} not found` };
      }
      return data;
    }
  }
];

/**
 * Parse a URI against a template and extract parameters
 * @param {string} uri - The actual URI
 * @param {string} template - The template pattern
 * @returns {object|null} - Extracted parameters or null if no match
 */
export function parseTemplateUri(uri, template) {
  // Convert template to regex
  // bundestag://drucksache/{id} -> bundestag://drucksache/([^/]+)
  const paramNames = [];
  const regexStr = template.replace(/\{(\w+)\}/g, (_, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });

  const regex = new RegExp(`^${regexStr}$`);
  const match = uri.match(regex);

  if (!match) return null;

  const params = {};
  paramNames.forEach((name, i) => {
    params[name] = match[i + 1];
  });

  return params;
}

/**
 * Find a matching template for a URI and extract parameters
 * @param {string} uri - The URI to match
 * @returns {object|null} - { template, params } or null
 */
export function matchResourceTemplate(uri) {
  for (const template of allResourceTemplates) {
    const params = parseTemplateUri(uri, template.uriTemplate);
    if (params) {
      return { template, params };
    }
  }
  return null;
}

/**
 * Register resource templates with an MCP server
 */
export function registerResourceTemplates(server) {
  for (const template of allResourceTemplates) {
    server.resource(
      template.uriTemplate,
      template.description,
      async (uri) => {
        // Parse the actual URI to get parameters
        const params = parseTemplateUri(uri.href || uri, template.uriTemplate);

        if (!params) {
          return {
            contents: [{
              uri: uri.href || uri,
              mimeType: 'application/json',
              text: JSON.stringify({ error: 'Invalid URI format' })
            }]
          };
        }

        const content = await template.handler(params);
        const text = JSON.stringify(content, null, 2);

        return {
          contents: [{
            uri: uri.href || uri,
            mimeType: template.mimeType,
            text
          }]
        };
      }
    );
  }
}
