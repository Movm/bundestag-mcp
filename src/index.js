#!/usr/bin/env node

console.log('[Boot] Starting Bundestag MCP Server...');
console.log(`[Boot] Node.js ${process.version}`);
console.log(`[Boot] Environment: ${process.env.NODE_ENV || 'development'}`);

console.log('[Boot] Loading dependencies...');
import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
console.log('[Boot] Dependencies loaded');

console.log('[Boot] Loading config...');
import { config, validateConfig } from './config.js';
import { allTools } from './tools/search.js';
import { clientConfigTool } from './tools/clientConfig.js';
import { getCacheStats } from './utils/cache.js';
import { info, error, getStats } from './utils/logger.js';
import { allResources } from './resources/info.js';
console.log('[Boot] Config loaded');

// Validate configuration
console.log('[Config] Validating environment variables...');
try {
  validateConfig();
  console.log('[Config] Validation successful');
} catch (err) {
  console.error(`[Config] ERROR: ${err.message}`);
  process.exit(1);
}

console.log('[Boot] Setting up Express...');
const app = express();
app.use(express.json());

// CORS middleware - compatible with ChatGPT connector requirements
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, mcp-session-id');
  res.header('Access-Control-Expose-Headers', 'Mcp-Session-Id');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204); // 204 No Content for preflight
  }
  next();
});
console.log('[Boot] Express configured');

// Helper: Get base URL
function getBaseUrl(req) {
  return config.server.publicUrl || `${req.protocol}://${req.get('host')}`;
}

// Session management
const transports = {};

// MCP Server Factory
function createMcpServer(baseUrl) {
  const server = new McpServer({
    name: 'bundestag-mcp',
    version: '1.0.0'
  });

  // === MCP RESOURCES ===

  for (const resource of allResources) {
    server.resource(
      resource.uri,
      resource.description,
      async () => {
        const content = await resource.handler();
        const text = typeof content === 'string'
          ? content
          : JSON.stringify(content, null, 2);

        return {
          contents: [{
            uri: resource.uri,
            mimeType: resource.mimeType,
            text
          }]
        };
      }
    );
  }

  // === MCP TOOLS ===

  // Register all search/entity tools
  for (const tool of allTools) {
    server.tool(
      tool.name,
      tool.inputSchema,
      async (params) => {
        try {
          const result = await tool.handler(params);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }],
            isError: !!result.error
          };
        } catch (err) {
          error('Tool', `${tool.name} failed: ${err.message}`);
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ error: true, message: err.message })
            }],
            isError: true
          };
        }
      }
    );
  }

  // Client Config Tool
  server.tool(
    clientConfigTool.name,
    clientConfigTool.inputSchema,
    async ({ client }) => {
      const result = clientConfigTool.handler({ client }, baseUrl);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }
  );

  return server;
}

// Root endpoint for basic health check (ChatGPT connector wizard)
app.get('/', (req, res) => {
  res.type('text/plain').send('Bundestag MCP Server');
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  const cacheStats = getCacheStats();
  const serverStats = getStats();

  res.json({
    status: 'ok',
    service: 'bundestag-mcp',
    version: '1.0.0',
    api: 'DIP Bundestag API',
    uptime: serverStats.uptime,
    cache: {
      apiHitRate: cacheStats.apiResponses.hitRate,
      entityHitRate: cacheStats.entities.hitRate,
      apiEntries: cacheStats.apiResponses.entries,
      entityEntries: cacheStats.entities.entries
    },
    requests: serverStats.requests,
    performance: serverStats.performance
  });
});

// Metrics endpoint (detailed stats)
app.get('/metrics', (req, res) => {
  const cacheStats = getCacheStats();
  const serverStats = getStats();

  res.json({
    server: {
      name: 'bundestag-mcp',
      version: '1.0.0',
      nodeVersion: process.version,
      environment: process.env.NODE_ENV || 'development'
    },
    uptime: serverStats.uptime,
    requests: serverStats.requests,
    performance: serverStats.performance,
    breakdown: serverStats.breakdown,
    cache: cacheStats,
    memory: {
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      rssMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
    }
  });
});

// Auto-Discovery Endpoint
app.get('/.well-known/mcp.json', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json({
    name: 'bundestag-mcp',
    version: '1.0.0',
    description: 'MCP server for German Bundestag parliamentary documentation (DIP API)',
    homepage: 'https://github.com/Movm/bundestag-mcp',
    mcp_endpoint: `${baseUrl}/mcp`,
    transport: 'streamable-http',
    tools: [
      {
        name: 'bundestag_search_drucksachen',
        description: 'Search Bundestag printed documents (bills, motions, inquiries)',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'bundestag_get_drucksache',
        description: 'Get a specific document by ID',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'bundestag_search_plenarprotokolle',
        description: 'Search plenary session transcripts',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'bundestag_get_plenarprotokoll',
        description: 'Get a specific plenary protocol by ID',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'bundestag_search_vorgaenge',
        description: 'Search parliamentary proceedings',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'bundestag_get_vorgang',
        description: 'Get a specific proceeding by ID',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'bundestag_search_personen',
        description: 'Search for MPs and other persons',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'bundestag_get_person',
        description: 'Get person details by ID',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'bundestag_search_aktivitaeten',
        description: 'Search parliamentary activities',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'bundestag_cache_stats',
        description: 'Show API cache statistics',
        annotations: { readOnlyHint: true, idempotentHint: true }
      },
      {
        name: 'get_client_config',
        description: 'Generate MCP client configurations',
        annotations: { readOnlyHint: true, idempotentHint: true }
      }
    ],
    resources: [
      { uri: 'bundestag://system-prompt', name: 'AI Usage Guide', priority: 'high' },
      { uri: 'bundestag://info', name: 'Server Info' },
      { uri: 'bundestag://wahlperioden', name: 'Electoral Periods' },
      { uri: 'bundestag://drucksachetypen', name: 'Document Types' }
    ],
    entities: ['drucksache', 'plenarprotokoll', 'vorgang', 'person', 'aktivitaet'],
    supported_clients: ['claude', 'cursor', 'vscode', 'chatgpt']
  });
});

// Client-specific configuration
app.get('/config/:client', (req, res) => {
  const { client } = req.params;
  const baseUrl = getBaseUrl(req);
  const validClients = ['claude', 'cursor', 'vscode', 'chatgpt'];

  if (!validClients.includes(client)) {
    return res.status(404).json({
      error: 'Unknown client',
      message: `Supported clients: ${validClients.join(', ')}`,
      available: validClients
    });
  }

  const result = clientConfigTool.handler({ client }, baseUrl);
  res.json(result);
});

// Server Info Endpoint
app.get('/info', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const serverStats = getStats();

  res.json({
    server: {
      name: 'bundestag-mcp',
      version: '1.0.0',
      description: 'MCP server for German Bundestag parliamentary documentation (DIP API)',
      uptime: serverStats.uptime
    },
    api: {
      name: 'DIP API',
      provider: 'Deutscher Bundestag',
      baseUrl: config.dipApi.baseUrl,
      documentation: 'https://dip.bundestag.api.bund.dev/'
    },
    endpoints: {
      mcp: `${baseUrl}/mcp`,
      health: `${baseUrl}/health`,
      metrics: `${baseUrl}/metrics`,
      discovery: `${baseUrl}/.well-known/mcp.json`,
      config: `${baseUrl}/config/:client`,
      info: `${baseUrl}/info`
    },
    tools: allTools.map(t => ({
      name: t.name,
      description: t.description,
      annotations: { readOnlyHint: true, idempotentHint: true }
    })).concat([{
      name: 'get_client_config',
      description: 'Generate MCP client configurations',
      annotations: { readOnlyHint: true, idempotentHint: true }
    }]),
    resources: allResources.map(r => ({
      uri: r.uri,
      name: r.name,
      description: r.description
    })),
    links: {
      github: 'https://github.com/Movm/bundestag-mcp',
      dipApi: 'https://dip.bundestag.api.bund.dev/',
      documentation: 'https://github.com/Movm/bundestag-mcp#readme'
    }
  });
});

// MCP POST Endpoint (Main communication)
// Supports both stateful (Claude, Cursor) and stateless (ChatGPT) modes
app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  let transport;
  let server;

  // Check if this is an existing session (stateful mode)
  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
    await transport.handleRequest(req, res, req.body);
    return;
  }

  // New connection - determine mode based on client
  // ChatGPT doesn't send session headers, so we use stateless mode
  const useStatelessMode = !sessionId;
  const baseUrl = getBaseUrl(req);

  if (useStatelessMode) {
    // Stateless mode for ChatGPT
    // Create fresh server and transport for each request
    server = createMcpServer(baseUrl);
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless mode
      enableJsonResponse: true
    });

    res.on('close', () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      error('MCP', `Request failed: ${err.message}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal error' },
          id: null
        });
      }
    }
  } else if (isInitializeRequest(req.body)) {
    // Stateful mode for Claude, Cursor, etc.
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        transports[id] = transport;
        info('Session', `New session: ${id}`);
      },
      onsessionclosed: (id) => {
        delete transports[id];
        info('Session', `Session closed: ${id}`);
      }
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        delete transports[transport.sessionId];
      }
    };

    server = createMcpServer(baseUrl);
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Invalid session' },
      id: null
    });
  }
});

// MCP GET Endpoint (SSE Stream) - for stateful clients
app.get('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const transport = transports[sessionId];

  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: 'Invalid session' });
  }
});

// MCP DELETE Endpoint (Close session) - for stateful clients
app.delete('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'];
  const transport = transports[sessionId];

  if (transport) {
    await transport.handleRequest(req, res);
  } else {
    res.status(400).json({ error: 'Invalid session' });
  }
});

// Start server
const PORT = config.server.port;
console.log(`[Boot] Starting server on port ${PORT}...`);

app.listen(PORT, () => {
  const localUrl = `http://localhost:${PORT}`;
  const publicUrl = config.server.publicUrl;

  console.log('='.repeat(50));
  console.log('Bundestag MCP Server v1.0.0');
  console.log('='.repeat(50));
  console.log(`Port: ${PORT}`);
  console.log(`API: ${config.dipApi.baseUrl}`);
  if (publicUrl) {
    console.log(`Public URL: ${publicUrl}`);
  }
  console.log('='.repeat(50));
  console.log('Endpoints:');
  console.log(`  MCP:        ${localUrl}/mcp`);
  console.log(`  Health:     ${localUrl}/health`);
  console.log(`  Metrics:    ${localUrl}/metrics`);
  console.log(`  Discovery:  ${localUrl}/.well-known/mcp.json`);
  console.log(`  Info:       ${localUrl}/info`);
  console.log(`  Config:     ${localUrl}/config/:client`);
  console.log('='.repeat(50));
  console.log('Resources:');
  allResources.forEach(r => {
    console.log(`  ${r.uri}`);
  });
  console.log('='.repeat(50));
  console.log('Tools:');
  allTools.forEach(t => {
    console.log(`  ${t.name}`);
  });
  console.log('  get_client_config');
  console.log('='.repeat(50));
  info('Boot', 'Server ready for requests');
});
