# Bundestag MCP Server

[![CI](https://github.com/Movm/bundestag-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/Movm/bundestag-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

A production-ready [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that provides access to the German Bundestag's parliamentary documentation system (DIP API).

## Public Instance

A public instance is available at:

```
https://bundestagapi.moritz-waechter.de/mcp
```

You can use this directly in your MCP client configuration without running your own server.

## Table of Contents

- [Public Instance](#public-instance)
- [Features](#features)
- [Quick Start](#quick-start)
- [MCP Tools](#mcp-tools)
- [MCP Prompts](#mcp-prompts)
- [MCP Resources](#mcp-resources)
- [Client Configuration](#client-configuration)
- [API Endpoints](#api-endpoints)
- [Docker](#docker)
- [Development](#development)
- [Architecture](#architecture)
- [Semantic Search](#semantic-search)
- [NLP Analysis Service](#nlp-analysis-service)
- [License](#license)

## Features

### Core Capabilities
- **Search Drucksachen** - Find bills, motions, inquiries, and other printed documents
- **Search Plenarprotokolle** - Find plenary session transcripts
- **Search Vorgaenge** - Track legislative proceedings through parliament
- **Search Personen** - Find MPs and their information
- **Search Aktivitaeten** - Find parliamentary activities (speeches, questions)
- **Full Text Retrieval** - Get complete document texts
- **Semantic Search** - AI-powered search using Qdrant + Mistral embeddings
- **Speech Search** - Find specific statements in debates with hybrid vector/keyword search
- **Document Section Search** - Search within document sections (articles, questions, etc.)
- **NLP Analysis** - Extract speeches, analyze tone, classify topics, and compare parties

### Production-Ready
- **Graceful Shutdown** - Clean session termination on SIGTERM/SIGINT
- **Retry with Backoff** - Automatic retries with exponential backoff and jitter
- **Rate Limiting** - Token bucket rate limiter to protect upstream API
- **Circuit Breaker** - Fast-fail pattern to prevent cascading failures
- **Response Caching** - Three-layer caching (API, entity, metadata)

### Observability
- **Prometheus Metrics** - `/metrics/prometheus` endpoint for monitoring
- **Deep Health Checks** - `/health/deep` verifies DIP API connectivity
- **Structured Logging** - JSON logs with categories and levels

### MCP Protocol
- **33 Tools** - Search, retrieval, semantic search, speech search, and NLP analysis
- **8 Prompts** - Guided workflows for common research tasks
- **12 Resources** - Static and dynamic resource templates
- **Dual Mode** - Supports stateful (Claude, Cursor) and stateless (ChatGPT) clients

## Quick Start

### Prerequisites

- Node.js 18+
- DIP API Key (a public test key is provided)

### Installation

```bash
git clone https://github.com/Movm/bundestag-mcp.git
cd bundestag-mcp
npm install
```

### Configuration

Create a `.env` file (or copy `.env.example`):

```bash
# Public test key valid until 05/2026
DIP_API_KEY=OSOegLs.PR2lwJ1dwCeje9vTj7FPOt3hvpYKtwKkhw

# Optional
PORT=3000
PUBLIC_URL=
LOG_LEVEL=INFO
```

> **Note:** For production, request your own API key from: `parlamentsdokumentation@bundestag.de`

### Run

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

The server will start at `http://localhost:3000`.

## MCP Tools

### Document Tools

| Tool | Description |
|------|-------------|
| `bundestag_search_drucksachen` | Search printed documents (Gesetzentwürfe, Anträge, Anfragen) |
| `bundestag_get_drucksache` | Get specific document by ID (optionally with full text) |
| `bundestag_search_drucksachen_text` | Full-text search within document content |

### Protocol Tools

| Tool | Description |
|------|-------------|
| `bundestag_search_plenarprotokolle` | Search plenary session transcripts |
| `bundestag_get_plenarprotokoll` | Get specific protocol by ID (optionally with full text) |
| `bundestag_search_plenarprotokolle_text` | Full-text search within transcript content |

### Proceeding Tools

| Tool | Description |
|------|-------------|
| `bundestag_search_vorgaenge` | Search parliamentary proceedings |
| `bundestag_get_vorgang` | Get specific proceeding by ID |
| `bundestag_search_vorgangspositionen` | Search proceeding positions/steps (track bill progress) |

### Person & Activity Tools

| Tool | Description |
|------|-------------|
| `bundestag_search_personen` | Search MPs and other persons |
| `bundestag_get_person` | Get person details by ID |
| `bundestag_search_aktivitaeten` | Search parliamentary activities |
| `bundestag_get_aktivitaet` | Get specific activity by ID |

### Semantic Search Tools

| Tool | Description |
|------|-------------|
| `bundestag_semantic_search` | AI-powered semantic search across all documents |
| `bundestag_semantic_search_status` | Show semantic search system status |
| `bundestag_trigger_indexing` | Manually trigger document indexing |

### Speech Search Tools

| Tool | Description |
|------|-------------|
| `bundestag_search_speeches` | Semantic/hybrid search through parliamentary speeches |
| `bundestag_trigger_protocol_indexing` | Trigger protocol chunking and indexing |
| `bundestag_reindex_protocols` | Force full re-indexing of all protocols |
| `bundestag_protocol_search_status` | Show protocol search system status |

### Document Section Search Tools

| Tool | Description |
|------|-------------|
| `bundestag_search_document_sections` | Semantic search through document sections |
| `bundestag_trigger_document_indexing` | Trigger document chunk indexing |
| `bundestag_document_search_status` | Show document chunk search status |

### NLP Analysis Tools

These tools use a Python FastAPI service with spaCy's German language model for natural language processing.

| Tool | Description |
|------|-------------|
| `bundestag_extract_speeches` | Parse protocol text into individual speeches with speaker, party, and type |
| `bundestag_analyze_text` | Analyze German text for word frequencies (nouns, adjectives, verbs) |
| `bundestag_analyze_tone` | Communication style analysis (aggression, collaboration, solution-focus) |
| `bundestag_classify_topics` | Classify text by political topics (migration, climate, economy, etc.) |
| `bundestag_analysis_health` | Check if the NLP analysis service is available |
| `bundestag_speaker_profile` | Generate comprehensive profile for a speaker based on their speeches |
| `bundestag_compare_parties` | Compare political parties based on their parliamentary speeches |

### Utility Tools

| Tool | Description |
|------|-------------|
| `bundestag_estimate_size` | Check document/protocol size BEFORE fetching to manage context window |
| `bundestag_cache_stats` | Show cache statistics |
| `get_client_config` | Generate MCP client configurations |

### Common Parameters

| Parameter | Description |
|-----------|-------------|
| `query` | Full-text search in title |
| `wahlperiode` | Electoral period (e.g., 20 for current 2021-2025) |
| `datum_start` / `datum_end` | Date range filter (YYYY-MM-DD) |
| `limit` | Results per page (1-100, default 10) |
| `cursor` | Pagination cursor from previous response |
| `includeFullText` | Fetch full document text |
| `useCache` | Whether to use cached results (default: true) |

## MCP Prompts

Guided workflows for common parliamentary research tasks:

| Prompt | Description |
|--------|-------------|
| `search-legislation` | Guided search for bills and legislation with semantic search and fallback strategies |
| `track-proceeding` | Track a parliamentary proceeding with legislative glossary and timeline |
| `mp-activity-report` | Comprehensive MP report with rhetorical analysis via `bundestag_speaker_profile` |
| `analyze-debate` | Analyze plenary debate with party comparison via `bundestag_compare_parties` |
| `compare-factions` | Compare party rhetoric on a topic using cross-party analysis |
| `find-statements` | Find specific quotes/statements from politicians with fallback strategies |
| `topic-trends` | Analyze how topic discussion evolved over time (across Wahlperioden/years) |
| `speaker-deep-dive` | Comprehensive rhetorical and policy analysis of a politician |

## MCP Resources

### Static Resources

| URI | Description |
|-----|-------------|
| `bundestag://system-prompt` | AI usage instructions with tool selection guide and context management |
| `bundestag://info` | Server capabilities and tool listing |
| `bundestag://wahlperioden` | Electoral periods (Wahlperioden) |
| `bundestag://drucksachetypen` | Document types (Gesetzentwurf, Antrag, etc.) |
| `bundestag://factions` | Parliamentary factions with official names, aliases, colors, and positions |

### Resource Templates

| URI Pattern | Description |
|-------------|-------------|
| `bundestag://drucksache/{id}` | Fetch document by ID |
| `bundestag://drucksache/{id}/text` | Fetch document full text |
| `bundestag://plenarprotokoll/{id}` | Fetch protocol by ID |
| `bundestag://plenarprotokoll/{id}/text` | Fetch protocol full text |
| `bundestag://vorgang/{id}` | Fetch proceeding by ID |
| `bundestag://person/{id}` | Fetch person by ID |
| `bundestag://aktivitaet/{id}` | Fetch activity by ID |

## Client Configuration

> **Tip:** Use the public instance `https://bundestagapi.moritz-waechter.de/mcp` or run your own with `http://localhost:3000/mcp`

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "bundestag": {
      "url": "https://bundestagapi.moritz-waechter.de/mcp"
    }
  }
}
```

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "bundestag": {
      "url": "https://bundestagapi.moritz-waechter.de/mcp"
    }
  }
}
```

### VS Code (GitHub Copilot)

Add to settings:

```json
{
  "mcp.servers": {
    "bundestag": {
      "type": "http",
      "url": "https://bundestagapi.moritz-waechter.de/mcp"
    }
  }
}
```

### ChatGPT

The server is fully compatible with ChatGPT as a connector. Use the public instance or deploy your own.

1. **Enable developer mode** in ChatGPT:
   - Go to **Settings → Apps & Connectors → Advanced settings**
   - Enable developer mode

2. **Add the connector**:
   - Go to **Settings → Connectors → Create**
   - Use URL: `https://bundestagapi.moritz-waechter.de/mcp`
   - Name it "Bundestag" and provide a description

3. **Use in chat**:
   - Click the **+** button in a new chat
   - Select your connector from the **More** menu
   - Ask about German parliamentary documents!

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /mcp` | MCP protocol endpoint |
| `GET /mcp` | SSE stream for sessions |
| `DELETE /mcp` | Close session |
| `GET /health` | Basic health check |
| `GET /health/deep` | Deep health check (verifies DIP API) |
| `GET /metrics` | JSON statistics |
| `GET /metrics/prometheus` | Prometheus format metrics |
| `GET /.well-known/mcp.json` | Auto-discovery |
| `GET /config/:client` | Client-specific config |
| `GET /info` | Server information |

## Docker

```bash
# Build
docker build -t bundestag-mcp .

# Run
docker run -p 3000:3000 \
  -e DIP_API_KEY=your-api-key \
  bundestag-mcp
```

### Docker Compose

```yaml
version: '3.8'
services:
  bundestag-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DIP_API_KEY=${DIP_API_KEY}
      - LOG_LEVEL=INFO
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Development

### Running Tests

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Project Structure

```
src/
├── index.js              # Express server, MCP setup, endpoints
├── config.js             # Environment configuration
├── api/
│   └── bundestag.js      # DIP API client with retry logic
├── jobs/
│   └── indexer.js        # Background document/protocol indexer
├── services/
│   ├── analysisService.js    # HTTP client for Python NLP service
│   ├── embeddingService.js   # Mistral embeddings
│   ├── qdrantService.js      # Vector database operations
│   ├── protokollParser.js    # Protocol speech extraction
│   └── drucksacheParser.js   # Document section parsing
├── tools/
│   ├── search.js         # 15 search/entity tools (incl. estimate_size)
│   ├── analysis.js       # 7 NLP analysis tools
│   ├── semanticSearch.js # 10 semantic search tools
│   └── clientConfig.js   # Client configuration tool
├── prompts/
│   └── index.js          # MCP Prompts
├── resources/
│   ├── info.js           # Static resources
│   └── templates.js      # Resource templates
└── utils/
    ├── cache.js          # Three-layer caching
    ├── logger.js         # Structured logging
    ├── retry.js          # Exponential backoff
    ├── rateLimiter.js    # Token bucket rate limiter
    ├── circuitBreaker.js # Circuit breaker pattern
    ├── metrics.js        # Prometheus metrics
    └── textNormalization.js # German text handling
```

## Architecture

### Resilience Patterns

```
Request → Rate Limiter → Circuit Breaker → Retry Logic → DIP API
              ↓               ↓                ↓
         (throttle)      (fast-fail)      (backoff)
```

- **Rate Limiter**: Token bucket algorithm prevents overwhelming the DIP API
- **Circuit Breaker**: Opens after consecutive failures, fast-fails during outages
- **Retry Logic**: Exponential backoff with jitter for transient failures

### Caching Strategy

| Layer | TTL | Max Entries | Use Case |
|-------|-----|-------------|----------|
| API Response | 5 min | 500 | Search results |
| Entity | 15 min | 200 | Individual documents |
| Metadata | 24 hr | 50 | Wahlperioden, document types |

## Semantic Search

The server supports AI-powered semantic search using Qdrant vector database and Mistral embeddings. This enables finding conceptually related documents even when exact keywords don't match.

### How It Works

1. **Document Indexing**: Background indexer fetches documents from DIP API and generates embeddings using Mistral AI
2. **Vector Storage**: Embeddings are stored in Qdrant with rich metadata for filtering
3. **Semantic Query**: User queries are embedded and matched against document vectors using cosine similarity

### Three Search Collections

| Collection | Description |
|------------|-------------|
| `bundestag-docs` | Document-level search (Drucksachen, Vorgaenge, Aktivitaeten, Personen) |
| `bundestag-protocol-chunks` | Speech-level search from Plenarprotokolle |
| `bundestag-document-chunks` | Section-level search from Drucksachen (articles, questions, etc.) |

### Features

- **Multilingual**: Search in English, finds German documents (e.g., "renewable energy" → "Erneuerbare Energien")
- **Hybrid Search**: Combines vector similarity with keyword boosting for improved precision
- **Rich Filtering**: Filter by document type, entity type, Wahlperiode, Sachgebiet, initiative, faction, date range
- **Speech Search**: Find specific statements by speaker, party, speech type, or government officials
- **Document Section Search**: Find specific paragraphs, questions, or articles within documents
- **Incremental Indexing**: Uses `f.aktualisiert.start` for efficient updates after initial indexing

### Configuration

Add to your `.env` file:

```bash
# Semantic Search (Qdrant + Mistral)
QDRANT_ENABLED=true
QDRANT_URL=http://qdrant:6333
MISTRAL_API_KEY=your-mistral-api-key

# Background Indexer
INDEXER_ENABLED=true
INDEXER_INTERVAL_MINUTES=15
INDEXER_WAHLPERIODEN=19,20
```

### Docker Compose with Qdrant

```yaml
services:
  bundestag-mcp:
    build: .
    environment:
      - QDRANT_ENABLED=true
      - QDRANT_URL=http://qdrant:6333
      - MISTRAL_API_KEY=${MISTRAL_API_KEY}
      - INDEXER_ENABLED=true
    depends_on:
      - qdrant

  qdrant:
    image: qdrant/qdrant:latest
    volumes:
      - qdrant_data:/qdrant/storage

volumes:
  qdrant_data:
```

### Semantic Search Parameters

| Parameter | Description |
|-----------|-------------|
| `query` | Natural language search query |
| `limit` | Max results (1-50) |
| `docTypes` | Filter: `drucksache`, `vorgang`, `aktivitaet`, `person` |
| `entityTypes` | Filter: `Gesetzentwurf`, `Kleine Anfrage`, `Rede`, etc. |
| `wahlperiode` | Electoral period (19, 20) |
| `sachgebiet` | Subject area |
| `initiative` | Initiating faction (CDU/CSU, SPD, etc.) |
| `fraktion` | Parliamentary group |
| `dateFrom` / `dateTo` | Date range (YYYY-MM-DD) |
| `scoreThreshold` | Minimum similarity (0-1, default 0.3) |

### Speech Search Parameters

| Parameter | Description |
|-----------|-------------|
| `query` | Natural language search query |
| `limit` | Max results (1-50) |
| `speaker` | Filter by speaker name (e.g., "Friedrich Merz") |
| `speakerParty` | Filter by party (e.g., "CDU/CSU", "SPD") |
| `speakerState` | Filter by state for Bundesrat (e.g., "Bayern") |
| `top` | Filter by agenda item (e.g., "TOP 1") |
| `wahlperiode` | Electoral period |
| `herausgeber` | Publisher: `BT` (Bundestag) or `BR` (Bundesrat) |
| `speechType` | Type: `rede`, `befragung`, `fragestunde_antwort`, `kurzbeitrag` |
| `isGovernment` | Filter for government officials (ministers, state secretaries) |
| `category` | Category: `rede` (formal speeches) or `wortbeitrag` (contributions) |
| `searchMode` | `semantic` (pure vector) or `hybrid` (vector + keyword boosting) |
| `keywordBoost` | Boost factor for keyword matches in hybrid mode (0-2, default 0.5) |
| `requiredKeywords` | Keywords that must appear in the text |
| `excludeKeywords` | Keywords that must not appear in the text |

### Document Section Search Parameters

| Parameter | Description |
|-----------|-------------|
| `query` | Natural language search query |
| `limit` | Max results (1-50) |
| `drucksachetyp` | Filter: `Gesetzentwurf`, `Kleine Anfrage`, `Antrag`, etc. |
| `chunkType` | Section type: `problem`, `loesung`, `artikel`, `question`, etc. |
| `wahlperiode` | Electoral period |
| `urheber` | Author/initiator (e.g., "Bundesregierung", "CDU/CSU") |
| `dateFrom` / `dateTo` | Date range (YYYY-MM-DD) |
| `scoreThreshold` | Minimum similarity (0-1, default 0.3) |

## NLP Analysis Service

The server includes optional NLP analysis capabilities powered by a Python FastAPI service using spaCy's German language model.

### Features

- **Speech Extraction**: Parse Plenarprotokolle into individual speeches with speaker, party, and type
- **Word Analysis**: Extract and lemmatize nouns, adjectives, and verbs with frequency counts
- **Tone Analysis**: 12 communication style metrics including aggression, collaboration, and solution-focus
- **Topic Classification**: Detect focus on 13 policy areas (migration, climate, economy, etc.)
- **Speaker Profiles**: Generate comprehensive profiles with statistics, vocabulary, and communication style
- **Party Comparison**: Compare parties based on their speeches with tone rankings and topic focus

### Tone Metrics

| Metric | Description |
|--------|-------------|
| `affirmative` | Positive vs critical adjective ratio (0-100) |
| `aggression` | Aggressive language intensity (0-100) |
| `labeling` | "Othering" language usage (0-100) |
| `solution_focus` | Solution vs problem-oriented verbs (0-100) |
| `collaboration` | Collaborative vs confrontational (0-100) |
| `demand_intensity` | Demanding language (fordern, müssen) (0-100) |
| `authority` | Obligation vs possibility modals (0-100) |
| `future_orientation` | Forward vs backward-looking (0-100) |

### Topic Categories

Migration, Climate (Klima), Economy (Wirtschaft), Social Policy (Soziales), Security (Sicherheit), Health (Gesundheit), Europe (Europa), Digital, Education (Bildung), Finance (Finanzen), Justice (Justiz), Labor (Arbeit), Mobility (Mobilität)

### Configuration

The analysis service runs as a separate Python container. Add to your `.env`:

```bash
ANALYSIS_SERVICE_URL=http://analysis:8000
```

### Docker Compose with Analysis

```yaml
services:
  bundestag-mcp:
    build: .
    environment:
      - ANALYSIS_SERVICE_URL=http://analysis:8000
    depends_on:
      - analysis

  analysis:
    build:
      context: ../bundestag-noun-analysis
      dockerfile: Dockerfile.api
    expose:
      - "8000"
```

> **Note**: The analysis service requires ~1GB RAM for the spaCy model and takes ~30s to start.

## DIP API

This server uses the official Bundestag DIP API:

- **Documentation**: https://dip.bundestag.de/
- **API Docs**: https://dip.bundestag.api.bund.dev/
- **GitHub**: https://github.com/bundesAPI/dip-bundestag-api

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`npm test`)
4. Commit your changes (`git commit -m 'feat: Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
