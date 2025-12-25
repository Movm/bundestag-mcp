#!/usr/bin/env node
/**
 * Script to trigger protocol indexing
 *
 * Usage:
 *   node scripts/index-protocols.js           # Index all configured WPs
 *   node scripts/index-protocols.js 19        # Index only WP 19
 *   INDEXER_WAHLPERIODEN=19 node scripts/index-protocols.js
 *
 * Requires environment variables:
 * - DIP_API_KEY: Bundestag DIP API key
 * - QDRANT_ENABLED=true
 * - QDRANT_URL: Qdrant server URL (default: http://localhost:6333)
 * - MISTRAL_API_KEY: Mistral AI API key for embeddings
 * - INDEXER_WAHLPERIODEN: Comma-separated WPs to index (default: 20,19)
 */

import 'dotenv/config';
import { config } from '../src/config.js';
import * as qdrant from '../src/services/qdrant/index.js';
import * as embedding from '../src/services/embeddingService.js';
import * as api from '../src/api/bundestag.js';
import { parseProtokoll } from '../src/services/protokollParser.js';
import * as analysisService from '../src/services/analysisService.js';

// Override wahlperioden if CLI argument provided
const cliWP = process.argv[2];
if (cliWP) {
  config.indexer.wahlperioden = cliWP.split(',').map(Number);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateChunkPointId(protokollId, chunkIndex, chunkPart = 0) {
  const combined = `protocol:${protokollId}:${chunkIndex}:${chunkPart}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function splitLongSpeech(speech, maxChars = 4000) {
  if (!speech.text || speech.text.length <= maxChars) {
    return [speech];
  }
  const chunks = [];
  const sentences = speech.text.split(/(?<=[.!?])\s+/);
  let currentChunk = [];
  let currentLength = 0;
  let partIndex = 0;

  for (const sentence of sentences) {
    if (currentLength + sentence.length > maxChars && currentChunk.length > 0) {
      chunks.push({
        ...speech,
        chunk_part: partIndex++,
        text: currentChunk.join(' '),
        text_length: currentChunk.join(' ').length
      });
      currentChunk = [];
      currentLength = 0;
    }
    currentChunk.push(sentence);
    currentLength += sentence.length + 1;
  }

  if (currentChunk.length > 0) {
    chunks.push({
      ...speech,
      chunk_part: partIndex,
      text: currentChunk.join(' '),
      text_length: currentChunk.join(' ').length
    });
  }
  return chunks;
}

function transformPythonSpeeches(speeches, metadata) {
  let chunkIndex = 0;
  const transformedSpeeches = [];

  for (const speech of speeches) {
    if (!speech.text || speech.text.length < 50) continue;

    const baseSpeech = {
      chunk_index: chunkIndex,
      chunk_type: speech.category === 'rede' ? 'speech' : 'contribution',
      speech_type: speech.type,
      category: speech.category,
      speaker: speech.speaker,
      speaker_party: speech.party,
      speaker_state: null,
      speaker_role: speech.is_government ? 'government' : null,
      is_government: speech.is_government || false,
      first_name: speech.first_name,
      last_name: speech.last_name,
      acad_title: speech.acad_title,
      top: null,
      top_title: null,
      text: speech.text,
      text_length: speech.text?.length || 0
    };

    const chunks = splitLongSpeech(baseSpeech, 4000);
    for (const chunk of chunks) {
      chunk.chunk_index = chunkIndex++;
      transformedSpeeches.push(chunk);
    }
  }

  return {
    metadata: {
      protokoll_id: metadata.id,
      dokumentnummer: metadata.dokumentnummer,
      wahlperiode: metadata.wahlperiode,
      datum: metadata.datum,
      herausgeber: metadata.herausgeber,
      titel: metadata.titel
    },
    speeches: transformedSpeeches
  };
}

async function indexProtocol(protokoll) {
  const protokollId = protokoll.id;

  const exists = await qdrant.protocolChunksExist(protokollId);
  if (exists) {
    return { chunks: 0, skipped: true };
  }

  let textResult;
  try {
    textResult = await api.getPlenarprotokollText(protokollId, { useCache: false });
    if (!textResult || !textResult.text) {
      console.log(`  ⚠ No text for protocol ${protokollId}`);
      return { chunks: 0, skipped: false };
    }
  } catch (err) {
    console.error(`  ✗ Failed to fetch ${protokollId}: ${err.message}`);
    return { chunks: 0, skipped: false };
  }

  const metadata = {
    id: protokollId,
    dokumentnummer: protokoll.dokumentnummer,
    wahlperiode: protokoll.wahlperiode,
    datum: protokoll.datum || protokoll.fundstelle?.datum,
    herausgeber: protokoll.herausgeber,
    titel: protokoll.titel
  };

  let parsed;
  const usePython = await analysisService.isAvailable();

  if (usePython) {
    try {
      const result = await analysisService.extractSpeeches(textResult.text);
      if (result.speeches && result.speeches.length > 0) {
        parsed = transformPythonSpeeches(result.speeches, metadata);
      }
    } catch (err) {
      // Fall back to JS parser
    }
  }

  if (!parsed) {
    parsed = parseProtokoll(textResult.text, metadata);
  }

  if (parsed.speeches.length === 0) {
    console.log(`  ⚠ No speeches in ${protokollId}`);
    return { chunks: 0, skipped: false };
  }

  const EMBED_BATCH_SIZE = 32;
  const allPoints = [];

  for (let i = 0; i < parsed.speeches.length; i += EMBED_BATCH_SIZE) {
    const batch = parsed.speeches.slice(i, i + EMBED_BATCH_SIZE);
    const textsToEmbed = batch.map(chunk => {
      const parts = [chunk.text];
      if (chunk.speaker) parts.unshift(`Redner: ${chunk.speaker}`);
      if (chunk.speaker_party) parts.unshift(`Fraktion: ${chunk.speaker_party}`);
      if (chunk.top) parts.unshift(`${chunk.top}`);
      return parts.join(' | ');
    });

    let embeddings;
    try {
      embeddings = await embedding.embedBatch(textsToEmbed);
    } catch (err) {
      console.error(`  ✗ Embedding failed: ${err.message}`);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      allPoints.push({
        id: generateChunkPointId(protokollId, chunk.chunk_index, chunk.chunk_part || 0),
        vector: embeddings[j],
        payload: {
          protokoll_id: protokollId,
          dokumentnummer: parsed.metadata.dokumentnummer,
          wahlperiode: parsed.metadata.wahlperiode,
          datum: parsed.metadata.datum,
          herausgeber: parsed.metadata.herausgeber,
          chunk_index: chunk.chunk_index,
          chunk_part: chunk.chunk_part || 0,
          chunk_type: chunk.chunk_type,
          speaker: chunk.speaker,
          speaker_party: chunk.speaker_party,
          speaker_state: chunk.speaker_state,
          speaker_role: chunk.speaker_role,
          top: chunk.top,
          top_title: chunk.top_title,
          text: chunk.text,
          text_length: chunk.text_length,
          speech_type: chunk.speech_type || null,
          category: chunk.category || null,
          is_government: chunk.is_government || false,
          first_name: chunk.first_name || null,
          last_name: chunk.last_name || null,
          acad_title: chunk.acad_title || null
        }
      });
    }
  }

  if (allPoints.length > 0) {
    const UPSERT_BATCH_SIZE = 64;
    for (let i = 0; i < allPoints.length; i += UPSERT_BATCH_SIZE) {
      await qdrant.upsertProtocolChunks(allPoints.slice(i, i + UPSERT_BATCH_SIZE));
    }
    return { chunks: allPoints.length, skipped: false };
  }

  return { chunks: 0, skipped: false };
}

async function indexProtocolsForWP(wahlperiode) {
  const API_DELAY_MS = 500;
  let cursor = null;
  let hasMore = true;
  let totalChunks = 0;
  let totalProtocols = 0;
  let skipped = 0;

  console.log(`\n📚 Indexing WP ${wahlperiode} protocols...`);

  while (hasMore) {
    try {
      const result = await api.searchPlenarprotokolle({
        wahlperiode,
        limit: 20,
        cursor
      }, { useCache: false });

      if (!result.documents || result.documents.length === 0) {
        hasMore = false;
        continue;
      }

      const protocols = result.documents.filter(p => p.herausgeber === 'BT');
      cursor = result.cursor;
      hasMore = !!cursor && result.documents.length > 0;

      for (const protokoll of protocols) {
        process.stdout.write(`  ${protokoll.dokumentnummer}... `);
        const indexResult = await indexProtocol(protokoll);
        if (indexResult.skipped) {
          console.log('skipped');
          skipped++;
        } else if (indexResult.chunks > 0) {
          console.log(`${indexResult.chunks} chunks`);
          totalChunks += indexResult.chunks;
          totalProtocols++;
        } else {
          console.log('no chunks');
        }
        await sleep(API_DELAY_MS);
      }
    } catch (err) {
      console.error(`\n✗ Error: ${err.message}`);
      if (err.message.includes('Rate-Limit')) {
        console.log('  Waiting 30s for rate limit...');
        await sleep(30000);
      } else {
        hasMore = false;
      }
    }
  }

  console.log(`\n✓ WP ${wahlperiode}: ${totalProtocols} protocols, ${totalChunks} chunks, ${skipped} skipped`);
  return { protocols: totalProtocols, chunks: totalChunks, skipped };
}

async function main() {
  console.log('Protocol Indexer');
  console.log('================\n');

  if (!config.qdrant.enabled) {
    console.error('❌ QDRANT_ENABLED is not set to true');
    process.exit(1);
  }

  if (!embedding.isAvailable()) {
    console.error('❌ MISTRAL_API_KEY not set');
    process.exit(1);
  }

  const connected = await qdrant.ensureProtocolCollection();
  if (!connected) {
    console.error('❌ Failed to connect to Qdrant');
    process.exit(1);
  }

  const info = await qdrant.getProtocolCollectionInfo();
  console.log(`Current points: ${info?.pointsCount || 0}`);
  console.log(`Wahlperioden: ${config.indexer.wahlperioden.join(', ')}`);

  let grandTotalProtocols = 0;
  let grandTotalChunks = 0;

  for (const wp of config.indexer.wahlperioden) {
    const result = await indexProtocolsForWP(wp);
    grandTotalProtocols += result.protocols;
    grandTotalChunks += result.chunks;
  }

  const finalInfo = await qdrant.getProtocolCollectionInfo();
  console.log('\n================');
  console.log('Complete!');
  console.log(`  Protocols: ${grandTotalProtocols}`);
  console.log(`  Chunks: ${grandTotalChunks}`);
  console.log(`  Total points: ${finalInfo?.pointsCount || 0}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
