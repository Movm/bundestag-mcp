# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bundestag MCP Server is a Model Context Protocol server that provides access to the German Bundestag's parliamentary documentation system (DIP API). It offers tools for searching and retrieving Drucksachen, Plenarprotokolle, Vorgänge, Personen, and Aktivitäten.

## Commands

```bash
# Install dependencies
npm install

# Run server (production)
npm start

# Run with auto-reload (development)
npm run dev

# Run tests
npm test

# Build Docker image
docker build -t bundestag-mcp .

# Run Docker container
docker run -p 3000:3000 \
  -e DIP_API_KEY=... \
  bundestag-mcp
```

## Architecture

### Entry Point & Server

`src/index.js` - Express server that implements MCP protocol via StreamableHTTPServerTransport. Supports two modes:
- **Stateful mode** (Claude, Cursor, VS Code): Session-based with persistent transport per `mcp-session-id` header
- **Stateless mode** (ChatGPT): Fresh server/transport per request, no session tracking

### Core Components

```
src/
├── config.js              # Environment config and validation
├── api/bundestag.js       # DIP API client with all endpoint methods
├── services/
│   ├── analysisService.js # HTTP client for Python NLP analysis service
│   ├── embeddingService.js # Mistral AI embeddings
│   └── qdrantService.js   # Vector database operations
├── tools/
│   ├── search.js          # 14 search/entity tools with Zod schemas
│   ├── analysis.js        # 5 NLP analysis tools (speech extraction, tone, topics)
│   ├── semanticSearch.js  # Semantic search tools
│   └── clientConfig.js    # Client configuration generator tool
├── resources/info.js      # MCP resources (system-prompt, info, etc.)
└── utils/
    ├── cache.js           # In-memory caching for API responses
    ├── textNormalization.js  # German text handling
    └── logger.js          # Structured JSON logging with stats
```

### API Client

The API client in `src/api/bundestag.js` handles all communication with the DIP API:

- Authentication via API key header
- Cursor-based pagination
- Response caching
- Error handling with timeouts

### Caching

Three-layer cache in `src/utils/cache.js`:
- **API Response cache**: 5 min TTL, max 500 entries
- **Entity cache**: 15 min TTL, max 200 entries
- **Metadata cache**: 24 hour TTL, max 50 entries

### MCP Protocol

The server exposes:
- **Tools**: 22 tools across search, semantic search, and NLP analysis
  - Drucksachen: search, get, text search
  - Plenarprotokolle: search, get, text search
  - Vorgänge: search, get, positionen search
  - Personen: search, get
  - Aktivitäten: search, get
  - Semantic search: search, status, trigger_indexing
  - NLP Analysis: extract_speeches, analyze_text, analyze_tone, classify_topics, analysis_health
  - Utility: cache_stats, get_client_config
- **Prompts**: 4 workflow templates (search-legislation, track-proceeding, mp-activity-report, analyze-debate)
- **Resources**: system-prompt, info, wahlperioden, drucksachetypen

All tools are read-only (annotated with `readOnlyHint: true`).

## Environment Variables

Required:
- `DIP_API_KEY` - Bundestag DIP API key

Optional:
- `PORT` - Server port (default: 3000)
- `PUBLIC_URL` - For config generation URLs
- `LOG_LEVEL` - DEBUG, INFO, WARN, ERROR (default: INFO)
- `ANALYSIS_SERVICE_URL` - Python NLP analysis service URL (default: http://localhost:8000)
- `QDRANT_ENABLED` - Enable semantic search (default: false)
- `QDRANT_URL` - Qdrant vector database URL
- `MISTRAL_API_KEY` - Mistral AI API key for embeddings

## DIP API Entities

Eight entity types (all from official DIP API):
- `drucksache` → Printed documents (bills, motions, inquiries)
- `drucksache-text` → Full-text content of documents
- `plenarprotokoll` → Plenary session transcripts
- `plenarprotokoll-text` → Full-text content of transcripts
- `vorgang` → Parliamentary proceedings (bill lifecycle)
- `vorgangsposition` → Individual steps in a proceeding
- `person` → MPs and other persons
- `aktivitaet` → Parliamentary activities (speeches, questions)

## German Text Handling

`src/utils/textNormalization.js` handles:
- Umlaut folding: ä→ae, ö→oe, ü→ue, ß→ss
- Unicode subscript/superscript normalization
- Query normalization for cache keys
