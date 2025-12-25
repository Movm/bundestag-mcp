#!/usr/bin/env node
/**
 * Batch migrate Qdrant collections using scroll/upsert
 * Avoids snapshot size limits by transferring in batches
 */

const LOCAL_URL = process.env.LOCAL_QDRANT_URL || 'http://localhost:6333';
const HOSTED_URL = process.env.HOSTED_QDRANT_URL || 'http://bundestagapi.moritz-waechter.de:16333';
const API_KEY = process.env.QDRANT_API_KEY || 'YudVuRv1hENeiAn0cAb0CDebhT4HzrIL-0O3iYKFONA';
const BATCH_SIZE = 100;

const COLLECTIONS = ['bundestag-docs', 'bundestag-protocol-chunks', 'bundestag-document-chunks'];

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY,
      ...options.headers,
    },
  });
  return res.json();
}

async function getCollectionInfo(baseUrl, collection, useKey = false) {
  const headers = useKey ? { 'api-key': API_KEY } : {};
  const res = await fetch(`${baseUrl}/collections/${collection}`, { headers });
  if (!res.ok) return null;
  return res.json();
}

async function scrollPoints(baseUrl, collection, offset = null, limit = BATCH_SIZE) {
  const body = {
    limit,
    with_payload: true,
    with_vector: true,
  };
  if (offset) body.offset = offset;

  const res = await fetch(`${baseUrl}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function upsertPoints(baseUrl, collection, points) {
  const res = await fetch(`${baseUrl}/collections/${collection}/points?wait=true`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY,
    },
    body: JSON.stringify({ points }),
  });
  return res.json();
}

async function ensureCollection(baseUrl, collection, vectorSize = 1024) {
  const info = await getCollectionInfo(baseUrl, collection, true);
  if (info?.result) {
    console.log(`  Collection ${collection} exists on hosted`);
    return true;
  }

  console.log(`  Creating collection ${collection} on hosted...`);
  const res = await fetch(`${baseUrl}/collections/${collection}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY,
    },
    body: JSON.stringify({
      vectors: { size: vectorSize, distance: 'Cosine' },
    }),
  });
  const result = await res.json();
  return result.status === 'ok';
}

async function migrateCollection(collection) {
  console.log(`\n=== Migrating ${collection} ===`);

  // Check local collection
  const localInfo = await getCollectionInfo(LOCAL_URL, collection);
  if (!localInfo?.result) {
    console.log(`  Collection does not exist locally, skipping`);
    return;
  }

  const totalPoints = localInfo.result.points_count;
  const vectorSize = localInfo.result.config?.params?.vectors?.size || 1024;
  console.log(`  Local: ${totalPoints} points, vector size: ${vectorSize}`);

  if (totalPoints === 0) {
    console.log(`  Collection is empty, skipping`);
    return;
  }

  // Ensure collection exists on hosted
  await ensureCollection(HOSTED_URL, collection, vectorSize);

  // Migrate in batches
  let offset = null;
  let migrated = 0;
  let errors = 0;

  while (true) {
    const scrollResult = await scrollPoints(LOCAL_URL, collection, offset, BATCH_SIZE);

    if (!scrollResult.result?.points?.length) break;

    const points = scrollResult.result.points;

    // Upsert to hosted
    const upsertResult = await upsertPoints(HOSTED_URL, collection, points);

    if (upsertResult.status === 'ok') {
      migrated += points.length;
      process.stdout.write(`\r  Migrated: ${migrated}/${totalPoints} (${Math.round(migrated/totalPoints*100)}%)`);
    } else {
      errors++;
      console.error(`\n  Error upserting batch: ${JSON.stringify(upsertResult)}`);
    }

    offset = scrollResult.result.next_page_offset;
    if (!offset) break;
  }

  console.log(`\n  Done: ${migrated} points migrated, ${errors} errors`);
}

async function main() {
  console.log('Qdrant Batch Migration');
  console.log(`Local:  ${LOCAL_URL}`);
  console.log(`Hosted: ${HOSTED_URL}`);

  // Test connectivity
  try {
    const localTest = await fetch(`${LOCAL_URL}/collections`);
    if (!localTest.ok) throw new Error('Local Qdrant not accessible');
    console.log('Local Qdrant: OK');
  } catch (e) {
    console.error(`Cannot connect to local Qdrant: ${e.message}`);
    process.exit(1);
  }

  try {
    const hostedTest = await fetch(`${HOSTED_URL}/collections`, {
      headers: { 'api-key': API_KEY },
    });
    if (!hostedTest.ok) throw new Error('Hosted Qdrant not accessible');
    console.log('Hosted Qdrant: OK');
  } catch (e) {
    console.error(`Cannot connect to hosted Qdrant: ${e.message}`);
    process.exit(1);
  }

  // Migrate each collection
  for (const collection of COLLECTIONS) {
    await migrateCollection(collection);
  }

  console.log('\n=== Migration complete ===');
}

main().catch(console.error);
