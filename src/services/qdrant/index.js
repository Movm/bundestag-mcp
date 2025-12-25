/**
 * Qdrant Service Facade
 * Re-exports all collection operations for backward compatibility
 *
 * Consumers can import from this file to get all functions:
 *   import * as qdrant from './services/qdrant/index.js';
 *
 * Or import from specific modules for tree-shaking:
 *   import { searchProtocolChunks } from './services/qdrant/protocolCollection.js';
 */

// Core infrastructure
export { getClient, healthCheck } from './client.js';

// Main collection (bundestag-docs)
export {
  isAvailable,
  ensureCollection,
  search,
  upsertPoints,
  getPoints,
  pointExists,
  deletePoints,
  getCollectionInfo,
  buildFilter
} from './mainCollection.js';

// Protocol collection (bundestag-protocol-chunks)
export {
  isProtocolCollectionAvailable,
  ensureProtocolCollection,
  recreateProtocolCollection,
  searchProtocolChunks,
  hybridSearchProtocolChunks,
  upsertProtocolChunks,
  getProtocolCollectionInfo,
  protocolChunksExist,
  buildProtocolFilter
} from './protocolCollection.js';

// Document collection (bundestag-document-chunks)
export {
  isDocumentCollectionAvailable,
  ensureDocumentCollection,
  searchDocumentChunks,
  upsertDocumentChunks,
  getDocumentCollectionInfo,
  documentChunksExist,
  buildDocumentFilter
} from './documentCollection.js';
