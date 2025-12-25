/**
 * Indexer State Persistence
 * Stores last-indexed timestamps per wahlperiode + doctype in SQLite
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import * as logger from '../utils/logger.js';

const DB_PATH = process.env.INDEXER_STATE_PATH || './data/indexer-state.db';
let db = null;

export function init() {
  if (db) return;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS index_state (
      wahlperiode INTEGER NOT NULL,
      doc_type TEXT NOT NULL,
      last_indexed_at TEXT NOT NULL,
      indexed_count INTEGER DEFAULT 0,
      PRIMARY KEY (wahlperiode, doc_type)
    )
  `);

  logger.info('INDEXER_STATE', `Initialized SQLite state at ${DB_PATH}`);
}

export function getLastIndexTime(wahlperiode, docType) {
  if (!db) init();

  const row = db.prepare(
    'SELECT last_indexed_at FROM index_state WHERE wahlperiode = ? AND doc_type = ?'
  ).get(wahlperiode, docType);

  return row ? new Date(row.last_indexed_at) : null;
}

export function setLastIndexTime(wahlperiode, docType, timestamp, count = 0) {
  if (!db) init();

  db.prepare(`
    INSERT INTO index_state (wahlperiode, doc_type, last_indexed_at, indexed_count)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(wahlperiode, doc_type) DO UPDATE SET
      last_indexed_at = excluded.last_indexed_at,
      indexed_count = indexed_count + excluded.indexed_count
  `).run(wahlperiode, docType, timestamp.toISOString(), count);
}

export function getAllState() {
  if (!db) init();

  return db.prepare('SELECT * FROM index_state ORDER BY wahlperiode DESC, doc_type').all();
}

export function clearState() {
  if (!db) init();

  db.exec('DELETE FROM index_state');
  logger.info('INDEXER_STATE', 'Cleared all indexer state');
}

export function close() {
  if (db) {
    db.close();
    db = null;
  }
}

/**
 * Check if state is empty
 */
export function isEmpty() {
  if (!db) init();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM index_state').get();
  return row.cnt === 0;
}

/**
 * Bootstrap state from Qdrant by finding max date per WP+doctype
 * Called automatically on first startup if state is empty but Qdrant has data
 */
export async function bootstrapFromQdrant(qdrantClient) {
  if (!db) init();

  // Check if state already has data
  if (!isEmpty()) {
    logger.info('INDEXER_STATE', 'State already populated, skipping bootstrap');
    return false;
  }

  if (!qdrantClient) {
    logger.warn('INDEXER_STATE', 'No Qdrant client available for bootstrap');
    return false;
  }

  logger.info('INDEXER_STATE', 'Empty state detected, bootstrapping from Qdrant...');

  const collections = [
    { name: 'bundestag-docs', dateField: 'date', docTypeField: 'doc_type' },
    { name: 'bundestag-protocol-chunks', dateField: 'datum', docType: 'protocol' },
    { name: 'bundestag-document-chunks', dateField: 'datum', docType: 'document_chunk' }
  ];

  let totalBootstrapped = 0;

  for (const col of collections) {
    try {
      // Check if collection exists
      const info = await qdrantClient.getCollection(col.name).catch(() => null);
      if (!info || info.points_count === 0) {
        logger.debug('INDEXER_STATE', `Collection ${col.name} empty or missing, skipping`);
        continue;
      }

      const maxDates = await getMaxDatesFromCollection(qdrantClient, col.name, col.dateField, col.docTypeField);

      for (const { wahlperiode, docType, maxDate } of maxDates) {
        setLastIndexTime(wahlperiode, col.docType || docType, new Date(maxDate), 0);
        totalBootstrapped++;
      }

      logger.info('INDEXER_STATE', `Bootstrapped ${maxDates.length} entries from ${col.name}`);
    } catch (err) {
      logger.warn('INDEXER_STATE', `Failed to bootstrap from ${col.name}: ${err.message}`);
    }
  }

  if (totalBootstrapped > 0) {
    logger.info('INDEXER_STATE', `Bootstrap complete: ${totalBootstrapped} entries from Qdrant`);
  }

  return totalBootstrapped > 0;
}

/**
 * Query Qdrant collection to find max date per WP+doctype
 */
async function getMaxDatesFromCollection(client, collectionName, dateField, docTypeField) {
  const maxDateMap = new Map();
  let offset = null;
  let processed = 0;

  while (true) {
    const result = await client.scroll(collectionName, {
      limit: 1000,
      offset,
      with_payload: true,
      with_vector: false
    });

    if (!result.points?.length) break;

    for (const { payload } of result.points) {
      const wp = payload.wahlperiode;
      const dt = docTypeField ? payload[docTypeField] : 'chunk';
      const date = payload[dateField];

      if (!wp || !date) continue;

      const key = `${wp}|${dt}`;
      const current = maxDateMap.get(key);
      if (!current || date > current.maxDate) {
        maxDateMap.set(key, { wahlperiode: wp, docType: dt, maxDate: date });
      }
    }

    processed += result.points.length;
    offset = result.next_page_offset;
    if (!offset) break;

    // Log progress for large collections
    if (processed % 10000 === 0) {
      logger.debug('INDEXER_STATE', `Bootstrap scanning ${collectionName}: ${processed} points...`);
    }
  }

  return Array.from(maxDateMap.values());
}
