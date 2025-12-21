# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.

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

# Build Docker image
docker build -t bundestag-mcp .

# Run Docker container
docker run -p 3000:3000 \
  -e DIP_API_KEY=... \
  bundestag-mcp
```

## Architecture

### Entry Point & Server

`src/index.js` - Express server that implements MCP protocol via streamable HTTP transport. Creates MCP server instances per session with tools and resources.

### Core Components

```
src/
├── config.js              # Environment config and validation
├── api/bundestag.js       # DIP API client with all endpoint methods
├── tools/
│   ├── search.js          # All search and entity retrieval tools
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
- **Tools**: 10 search/entity tools + client config tool
- **Resources**: system-prompt, info, wahlperioden, drucksachetypen

All tools are read-only (annotated with `readOnlyHint: true`).

## Environment Variables

Required:
- `DIP_API_KEY` - Bundestag DIP API key

Optional:
- `PORT` - Server port (default: 3000)
- `PUBLIC_URL` - For config generation URLs
- `LOG_LEVEL` - DEBUG, INFO, WARN, ERROR (default: INFO)

## DIP API Entities

Five main entity types:
- `drucksache` → Printed documents (bills, motions, inquiries)
- `plenarprotokoll` → Plenary session transcripts
- `vorgang` → Parliamentary proceedings (bill lifecycle)
- `person` → MPs and other persons
- `aktivitaet` → Parliamentary activities (speeches, questions)

## German Text Handling

`src/utils/textNormalization.js` handles:
- Umlaut folding: ä→ae, ö→oe, ü→ue, ß→ss
- Unicode subscript/superscript normalization
- Query normalization for cache keys
