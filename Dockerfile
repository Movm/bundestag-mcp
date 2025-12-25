FROM node:20-slim

# Install curl for healthcheck and build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# OCI Image Labels
LABEL org.opencontainers.image.title="Bundestag MCP Server"
LABEL org.opencontainers.image.description="MCP Server for German Bundestag parliamentary documentation (DIP API)"
LABEL org.opencontainers.image.source="https://github.com/Movm/bundestag-mcp"
LABEL org.opencontainers.image.documentation="https://github.com/Movm/bundestag-mcp#readme"
LABEL org.opencontainers.image.vendor="bundestag-mcp"
LABEL org.opencontainers.image.licenses="MIT"

# MCP Discovery Labels
LABEL mcp.discoverable="true"
LABEL mcp.transport="streamable-http"
LABEL mcp.endpoint="/mcp"

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create data directory for SQLite state
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Health Check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["node", "src/index.js"]
