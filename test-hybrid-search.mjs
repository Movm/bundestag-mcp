import * as embedding from './src/services/embeddingService.js';
import * as qdrant from './src/services/qdrant/index.js';

async function testHybridSearch() {
  console.log('========================================');
  console.log('HYBRID SEARCH TEST');
  console.log('========================================\n');

  // Test 1: Compare semantic vs hybrid for "Merz + Klimaschutz"
  console.log('Test: Friedrich Merz + Klimaschutz\n');

  const query = 'Klimaschutz Energiewende Umweltpolitik CO2';
  const vector = await embedding.embed(query);

  const filter = {
    must: [
      { key: 'speaker', match: { value: 'Friedrich Merz' } },
      { key: 'category', match: { value: 'rede' } }
    ]
  };

  // A) Pure semantic search (old method)
  console.log('--- SEMANTIC (pure vector) ---');
  const semanticResults = await qdrant.searchProtocolChunks(vector, {
    limit: 10,
    filter
  });

  semanticResults.forEach((r, i) => {
    const text = r.payload.text.substring(0, 150).replace(/\n/g, ' ');
    const hasKlima = r.payload.text.toLowerCase().includes('klima');
    console.log(`${i+1}. [${r.score.toFixed(3)}] ${hasKlima ? '✓ KLIMA' : '✗'} ${text}...`);
  });

  // B) Hybrid search (new method)
  console.log('\n--- HYBRID (vector + keyword boost) ---');
  const keywords = ['Klimaschutz', 'Klima', 'CO2', 'Energiewende', 'Umwelt'];
  const hybridResults = await qdrant.hybridSearchProtocolChunks(vector, {
    limit: 10,
    filter,
    keywords,
    keywordBoost: 0.5
  });

  hybridResults.forEach((r, i) => {
    const text = r.payload.text.substring(0, 150).replace(/\n/g, ' ');
    const matches = r.keywordMatches.length > 0 ? r.keywordMatches.join(', ') : 'none';
    console.log(`${i+1}. [${r.boostedScore.toFixed(3)} <- ${r.originalScore.toFixed(3)}] Keywords: ${matches}`);
    console.log(`   ${text}...`);
  });

  // C) Hybrid with higher boost
  console.log('\n--- HYBRID (strong boost 0.8) ---');
  const strongBoostResults = await qdrant.hybridSearchProtocolChunks(vector, {
    limit: 10,
    filter,
    keywords,
    keywordBoost: 0.8
  });

  strongBoostResults.forEach((r, i) => {
    const text = r.payload.text.substring(0, 150).replace(/\n/g, ' ');
    const matches = r.keywordMatches.length > 0 ? r.keywordMatches.join(', ') : 'none';
    console.log(`${i+1}. [${r.boostedScore.toFixed(3)} <- ${r.originalScore.toFixed(3)}] Keywords: ${matches}`);
    console.log(`   ${text}...`);
  });

  // Stats
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');

  const semanticKlima = semanticResults.filter(r => r.payload.text.toLowerCase().includes('klima')).length;
  const hybridKlima = hybridResults.filter(r => r.payload.text.toLowerCase().includes('klima')).length;
  const strongKlima = strongBoostResults.filter(r => r.payload.text.toLowerCase().includes('klima')).length;

  console.log(`Semantic: ${semanticKlima}/10 results contain "klima"`);
  console.log(`Hybrid (0.5): ${hybridKlima}/10 results contain "klima"`);
  console.log(`Hybrid (0.8): ${strongKlima}/10 results contain "klima"`);
}

testHybridSearch().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
