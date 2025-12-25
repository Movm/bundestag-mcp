import 'dotenv/config';
import * as qdrant from '../src/services/qdrant/index.js';
import * as embedding from '../src/services/embeddingService.js';

async function test() {
  console.log('Testing Semantic Search Data\n');

  // 1. Collection stats
  const info = await qdrant.getProtocolCollectionInfo();
  console.log('📊 Collection Stats:');
  console.log(`   Total points: ${info ? info.pointsCount : 0}`);

  // 2. Test search across both WPs
  const query = "Klimaschutz und Energiewende";
  console.log(`\n🔍 Test query: "${query}"`);

  const vector = await embedding.embed(query);

  // Search WP20
  const wp20Results = await qdrant.searchProtocolChunks(vector, {
    limit: 3,
    filter: { must: [{ key: 'wahlperiode', match: { value: 20 } }] }
  });

  console.log(`\n📗 WP20 Results (${wp20Results.length}):`);
  for (const r of wp20Results) {
    const text = r.payload.text ? r.payload.text.substring(0, 100) : '';
    console.log(`   [${r.score.toFixed(3)}] ${r.payload.dokumentnummer} - ${r.payload.speaker} (${r.payload.speaker_party})`);
    console.log(`      "${text}..."`);
  }

  // Search WP19
  const wp19Results = await qdrant.searchProtocolChunks(vector, {
    limit: 3,
    filter: { must: [{ key: 'wahlperiode', match: { value: 19 } }] }
  });

  console.log(`\n📘 WP19 Results (${wp19Results.length}):`);
  for (const r of wp19Results) {
    const text = r.payload.text ? r.payload.text.substring(0, 100) : '';
    console.log(`   [${r.score.toFixed(3)}] ${r.payload.dokumentnummer} - ${r.payload.speaker} (${r.payload.speaker_party})`);
    console.log(`      "${text}..."`);
  }

  // 3. Test party filter
  console.log('\n🏛️ Party filter test (CDU/CSU speeches about Klimaschutz):');
  const cduResults = await qdrant.searchProtocolChunks(vector, {
    limit: 2,
    filter: { must: [{ key: 'speaker_party', match: { value: 'CDU/CSU' } }] }
  });
  for (const r of cduResults) {
    console.log(`   [${r.score.toFixed(3)}] WP${r.payload.wahlperiode} - ${r.payload.speaker}`);
  }

  // 4. Test date range (WP19 era)
  console.log('\n📅 Date filter test (2019 speeches):');
  const dateResults = await qdrant.searchProtocolChunks(vector, {
    limit: 2,
    filter: { must: [{ key: 'datum', range: { gte: '2019-01-01', lte: '2019-12-31' } }] }
  });
  for (const r of dateResults) {
    console.log(`   [${r.score.toFixed(3)}] ${r.payload.datum} - ${r.payload.speaker} (WP${r.payload.wahlperiode})`);
  }

  console.log('\n✅ All tests passed!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
