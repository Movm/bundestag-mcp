# Bundestag MCP Server

A Model Context Protocol (MCP) server that provides access to the German Bundestag's parliamentary documentation system (DIP API).

## Features

- **Search Drucksachen** - Find bills, motions, inquiries, and other printed documents
- **Search Plenarprotokolle** - Find plenary session transcripts
- **Search Vorgänge** - Track legislative proceedings through parliament
- **Search Personen** - Find MPs and their information
- **Search Aktivitäten** - Find parliamentary activities (speeches, questions)
- **Response Caching** - Built-in caching for improved performance
- **Full Text Retrieval** - Get complete document texts

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

For production, request your own API key from: `parlamentsdokumentation@bundestag.de`

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

### Protocol Tools

| Tool | Description |
|------|-------------|
| `bundestag_search_plenarprotokolle` | Search plenary session transcripts |
| `bundestag_get_plenarprotokoll` | Get specific protocol by ID (optionally with full text) |

### Proceeding Tools

| Tool | Description |
|------|-------------|
| `bundestag_search_vorgaenge` | Search parliamentary proceedings |
| `bundestag_get_vorgang` | Get specific proceeding by ID |

### Person & Activity Tools

| Tool | Description |
|------|-------------|
| `bundestag_search_personen` | Search MPs and other persons |
| `bundestag_get_person` | Get person details by ID |
| `bundestag_search_aktivitaeten` | Search parliamentary activities |

### Utility Tools

| Tool | Description |
|------|-------------|
| `bundestag_cache_stats` | Show cache statistics |
| `get_client_config` | Generate MCP client configurations |

## Common Parameters

- `query` - Full-text search in title
- `wahlperiode` - Electoral period (e.g., 20 for current 2021-2025)
- `datum_start` / `datum_end` - Date range filter (YYYY-MM-DD)
- `limit` - Results per page (1-100, default 10)
- `cursor` - Pagination cursor from previous response
- `includeFullText` - Fetch full document text (for documents/protocols)
- `useCache` - Whether to use cached results (default: true)

## Client Configuration

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bundestag": {
      "url": "http://localhost:3000/mcp"
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
      "url": "http://localhost:3000/mcp"
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
      "url": "http://localhost:3000/mcp"
    }
  }
}
```

### ChatGPT

The server is fully compatible with ChatGPT as a connector.

1. **Deploy your server** to a public URL (or use ngrok for development):
   ```bash
   ngrok http 3000
   ```

2. **Enable developer mode** in ChatGPT:
   - Go to **Settings → Apps & Connectors → Advanced settings**
   - Enable developer mode

3. **Add the connector**:
   - Go to **Settings → Connectors → Create**
   - Paste your public URL with `/mcp` path (e.g., `https://xxx.ngrok.app/mcp`)
   - Name it "Bundestag" and provide a description

4. **Use in chat**:
   - Click the **+** button in a new chat
   - Select your connector from the **More** menu
   - Ask about German parliamentary documents!

## Docker

```bash
# Build
docker build -t bundestag-mcp .

# Run
docker run -p 3000:3000 \
  -e DIP_API_KEY=your-api-key \
  bundestag-mcp
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `POST /mcp` | MCP protocol endpoint |
| `GET /mcp` | SSE stream for sessions |
| `DELETE /mcp` | Close session |
| `GET /health` | Health check with metrics |
| `GET /metrics` | Detailed statistics |
| `GET /.well-known/mcp.json` | Auto-discovery |
| `GET /config/:client` | Client-specific config |
| `GET /info` | Server information |

## Example Usage

### Search for Climate Legislation

```json
{
  "tool": "bundestag_search_drucksachen",
  "params": {
    "query": "Klimaschutz",
    "drucksachetyp": "Gesetzentwurf",
    "wahlperiode": 20,
    "limit": 10
  }
}
```

### Get Document with Full Text

```json
{
  "tool": "bundestag_get_drucksache",
  "params": {
    "id": 12345,
    "includeFullText": true
  }
}
```

### Find MP's Activities

```json
{
  "tool": "bundestag_search_aktivitaeten",
  "params": {
    "person_id": 12345,
    "wahlperiode": 20
  }
}
```

## Resources

| URI | Description |
|-----|-------------|
| `bundestag://system-prompt` | AI usage instructions |
| `bundestag://info` | Server capabilities |
| `bundestag://wahlperioden` | Electoral periods |
| `bundestag://drucksachetypen` | Document types |

## DIP API

This server uses the official Bundestag DIP API:

- **Documentation**: https://dip.bundestag.api.bund.dev/
- **GitHub**: https://github.com/bundesAPI/dip-bundestag-api

## License

MIT
