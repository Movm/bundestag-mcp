#!/bin/bash
#
# Migrate Qdrant collections from local to hosted instance
#
# Usage:
#   ./scripts/migrate-qdrant.sh
#
# Example:
#   export QDRANT_API_KEY="/F/Iyf5fTjl2DMqOHxv/auYQZL8tDOiEUqsYn/P0/Sk="
#   ./scripts/migrate-qdrant.sh
#
# Environment variables:
#   LOCAL_QDRANT_URL   - Local Qdrant URL (default: http://localhost:6333)
#   HOSTED_QDRANT_URL  - Hosted Qdrant URL (default: http://bundestagapi.moritz-waechter.de:16333)
#   QDRANT_API_KEY     - API key for hosted Qdrant (required)
#

set -e

LOCAL_QDRANT_URL="${LOCAL_QDRANT_URL:-http://localhost:6333}"
HOSTED_QDRANT_URL="${HOSTED_QDRANT_URL:-http://bundestagapi.moritz-waechter.de:16333}"
QDRANT_API_KEY="${QDRANT_API_KEY:-}"

COLLECTIONS=("bundestag-docs" "bundestag-protocol-chunks" "bundestag-document-chunks")
SNAPSHOT_DIR="./snapshots"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check required env vars
if [ -z "$QDRANT_API_KEY" ]; then
  log_error "QDRANT_API_KEY is required"
  exit 1
fi

# Create snapshot directory
mkdir -p "$SNAPSHOT_DIR"

# Check local Qdrant connectivity
log_info "Checking local Qdrant at $LOCAL_QDRANT_URL..."
if ! curl -sf "$LOCAL_QDRANT_URL/collections" > /dev/null; then
  log_error "Cannot connect to local Qdrant at $LOCAL_QDRANT_URL"
  exit 1
fi
log_info "Local Qdrant is accessible"

# Check hosted Qdrant connectivity
log_info "Checking hosted Qdrant at $HOSTED_QDRANT_URL..."
if ! curl -sf -H "api-key: $QDRANT_API_KEY" "$HOSTED_QDRANT_URL/collections" > /dev/null; then
  log_error "Cannot connect to hosted Qdrant at $HOSTED_QDRANT_URL"
  exit 1
fi
log_info "Hosted Qdrant is accessible"

# Process each collection
for COLLECTION in "${COLLECTIONS[@]}"; do
  echo ""
  log_info "=== Processing collection: $COLLECTION ==="

  # Check if collection exists locally
  COLLECTION_INFO=$(curl -sf "$LOCAL_QDRANT_URL/collections/$COLLECTION" 2>/dev/null || echo "")
  if [ -z "$COLLECTION_INFO" ]; then
    log_warn "Collection $COLLECTION does not exist locally, skipping..."
    continue
  fi

  POINT_COUNT=$(echo "$COLLECTION_INFO" | grep -o '"points_count":[0-9]*' | grep -o '[0-9]*' || echo "0")
  log_info "Collection has $POINT_COUNT points"

  if [ "$POINT_COUNT" = "0" ]; then
    log_warn "Collection is empty, skipping..."
    continue
  fi

  # Step 1: Create snapshot
  log_info "Creating snapshot..."
  SNAPSHOT_RESPONSE=$(curl -sf -X POST "$LOCAL_QDRANT_URL/collections/$COLLECTION/snapshots")
  SNAPSHOT_NAME=$(echo "$SNAPSHOT_RESPONSE" | grep -o '"name":"[^"]*"' | cut -d'"' -f4)

  if [ -z "$SNAPSHOT_NAME" ]; then
    log_error "Failed to create snapshot for $COLLECTION"
    echo "Response: $SNAPSHOT_RESPONSE"
    continue
  fi
  log_info "Created snapshot: $SNAPSHOT_NAME"

  # Step 2: Download snapshot
  SNAPSHOT_FILE="$SNAPSHOT_DIR/$SNAPSHOT_NAME"
  log_info "Downloading snapshot to $SNAPSHOT_FILE..."
  curl -sf "$LOCAL_QDRANT_URL/collections/$COLLECTION/snapshots/$SNAPSHOT_NAME" -o "$SNAPSHOT_FILE"

  FILESIZE=$(du -h "$SNAPSHOT_FILE" | cut -f1)
  log_info "Downloaded snapshot ($FILESIZE)"

  # Step 3: Upload and recover on hosted instance
  log_info "Uploading to hosted Qdrant..."

  RECOVER_RESPONSE=$(curl -sf -X PUT \
    -H "api-key: $QDRANT_API_KEY" \
    -H "Content-Type: multipart/form-data" \
    -F "snapshot=@$SNAPSHOT_FILE" \
    "$HOSTED_QDRANT_URL/collections/$COLLECTION/snapshots/recover" 2>&1 || echo "FAILED")

  if [[ "$RECOVER_RESPONSE" == *"FAILED"* ]] || [[ "$RECOVER_RESPONSE" == *"error"* ]]; then
    log_error "Failed to recover snapshot on hosted instance"
    echo "Response: $RECOVER_RESPONSE"
    continue
  fi

  log_info "Successfully migrated $COLLECTION"

  # Cleanup local snapshot
  rm -f "$SNAPSHOT_FILE"
done

echo ""
log_info "=== Migration complete ==="

# Verify hosted collections
log_info "Verifying hosted collections..."
for COLLECTION in "${COLLECTIONS[@]}"; do
  HOSTED_INFO=$(curl -sf -H "api-key: $QDRANT_API_KEY" "$HOSTED_QDRANT_URL/collections/$COLLECTION" 2>/dev/null || echo "")
  if [ -n "$HOSTED_INFO" ]; then
    POINT_COUNT=$(echo "$HOSTED_INFO" | grep -o '"points_count":[0-9]*' | grep -o '[0-9]*' || echo "0")
    log_info "$COLLECTION: $POINT_COUNT points"
  else
    log_warn "$COLLECTION: not found"
  fi
done

rmdir "$SNAPSHOT_DIR" 2>/dev/null || true
