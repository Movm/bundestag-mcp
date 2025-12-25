import * as embedding from './src/services/embeddingService.js';
import * as qdrant from './src/services/qdrant/index.js';
import fs from 'fs';

async function runTests() {
  const results = {
    timestamp: new Date().toISOString(),
    tests: []
  };

  // Test 1: Friedrich Merz zu Klimaschutz (nur formale Reden)
  console.log('Test 1: Friedrich Merz + Klimaschutz...');
  const v1 = await embedding.embed('Klimaschutz Energiewende Umweltpolitik CO2');
  const r1 = await qdrant.searchProtocolChunks(v1, {
    limit: 10,
    filter: {
      must: [
        { key: 'speaker', match: { value: 'Friedrich Merz' } },
        { key: 'category', match: { value: 'rede' } }
      ]
    }
  });
  results.tests.push({
    name: 'Friedrich Merz zu Klimaschutz (nur Reden)',
    query: 'Klimaschutz Energiewende Umweltpolitik CO2',
    filters: { speaker: 'Friedrich Merz', category: 'rede' },
    count: r1.length,
    speeches: r1.map(r => ({
      score: r.score.toFixed(3),
      datum: r.payload.datum,
      speech_type: r.payload.speech_type,
      text_preview: r.payload.text.substring(0, 300)
    }))
  });

  // Test 2: Regierungsmitglieder zur Migration in Befragungen
  console.log('Test 2: Regierung + Migration + Befragung...');
  const v2 = await embedding.embed('Migration Asyl Flüchtlinge Abschiebung Grenzschutz');
  const r2 = await qdrant.searchProtocolChunks(v2, {
    limit: 10,
    filter: {
      must: [
        { key: 'is_government', match: { value: true } },
        { key: 'speech_type', match: { value: 'befragung' } }
      ]
    }
  });
  results.tests.push({
    name: 'Regierungsmitglieder zu Migration (Befragungen)',
    query: 'Migration Asyl Flüchtlinge Abschiebung Grenzschutz',
    filters: { is_government: true, speech_type: 'befragung' },
    count: r2.length,
    speeches: r2.map(r => ({
      score: r.score.toFixed(3),
      speaker: r.payload.speaker,
      party: r.payload.speaker_party,
      datum: r.payload.datum,
      text_preview: r.payload.text.substring(0, 300)
    }))
  });

  // Test 3: Parteienvergleich - GRÜNE vs AfD zu Wirtschaft
  console.log('Test 3: GRÜNE vs AfD zu Wirtschaft...');
  const v3 = await embedding.embed('Wirtschaft Wachstum Industrie Arbeitsplätze Unternehmen');
  const r3a = await qdrant.searchProtocolChunks(v3, {
    limit: 5,
    filter: {
      must: [
        { key: 'speaker_party', match: { value: 'GRÜNE' } },
        { key: 'category', match: { value: 'rede' } }
      ]
    }
  });
  const r3b = await qdrant.searchProtocolChunks(v3, {
    limit: 5,
    filter: {
      must: [
        { key: 'speaker_party', match: { value: 'AfD' } },
        { key: 'category', match: { value: 'rede' } }
      ]
    }
  });
  results.tests.push({
    name: 'Parteienvergleich: Wirtschaftsreden GRÜNE vs AfD',
    query: 'Wirtschaft Wachstum Industrie Arbeitsplätze Unternehmen',
    gruene: r3a.map(r => ({
      score: r.score.toFixed(3),
      speaker: r.payload.speaker,
      datum: r.payload.datum,
      text_preview: r.payload.text.substring(0, 250)
    })),
    afd: r3b.map(r => ({
      score: r.score.toFixed(3),
      speaker: r.payload.speaker,
      datum: r.payload.datum,
      text_preview: r.payload.text.substring(0, 250)
    }))
  });

  // Test 4: Akademische Titel - Doktoren zu Gesundheit
  console.log('Test 4: Doktoren zu Gesundheit...');
  const v4 = await embedding.embed('Gesundheit Krankenhaus Pflege Medizin Krankenkasse');
  const r4 = await qdrant.searchProtocolChunks(v4, {
    limit: 15,
    filter: {
      must: [
        { key: 'category', match: { value: 'rede' } }
      ]
    }
  });
  const doktoren = r4.filter(r => r.payload.acad_title && r.payload.acad_title.includes('Dr'));
  results.tests.push({
    name: 'Redner mit Dr.-Titel zu Gesundheit',
    query: 'Gesundheit Krankenhaus Pflege Medizin Krankenkasse',
    total_results: r4.length,
    with_doctorate: doktoren.length,
    speakers: doktoren.map(r => ({
      score: r.score.toFixed(3),
      full_name: (r.payload.acad_title || '') + ' ' + r.payload.first_name + ' ' + r.payload.last_name,
      party: r.payload.speaker_party,
      datum: r.payload.datum,
      text_preview: r.payload.text.substring(0, 250)
    }))
  });

  // Test 5: Zeitlicher Vergleich - Ukraine-Debatte über Zeit
  console.log('Test 5: Ukraine-Debatte zeitlich...');
  const v5 = await embedding.embed('Ukraine Krieg Russland Waffen Unterstützung');
  const r5 = await qdrant.searchProtocolChunks(v5, {
    limit: 20,
    filter: {
      must: [
        { key: 'category', match: { value: 'rede' } }
      ]
    }
  });
  const byDate = {};
  r5.forEach(r => {
    const month = r.payload.datum.substring(0, 7);
    if (!byDate[month]) byDate[month] = [];
    byDate[month].push({
      speaker: r.payload.speaker,
      party: r.payload.speaker_party,
      score: r.score.toFixed(3)
    });
  });
  results.tests.push({
    name: 'Ukraine-Debatte nach Monat',
    query: 'Ukraine Krieg Russland Waffen Unterstützung',
    speeches_by_month: byDate
  });

  // Test 6: Fragestunde - Kurze Wortbeiträge
  console.log('Test 6: Fragestunde Wortbeiträge...');
  const v6 = await embedding.embed('Bürgergeld Sozialleistungen Arbeit');
  const r6 = await qdrant.searchProtocolChunks(v6, {
    limit: 10,
    filter: {
      must: [
        { key: 'speech_type', match: { value: 'fragestunde' } }
      ]
    }
  });
  results.tests.push({
    name: 'Fragestunde zu Bürgergeld',
    query: 'Bürgergeld Sozialleistungen Arbeit',
    filters: { speech_type: 'fragestunde' },
    count: r6.length,
    exchanges: r6.map(r => ({
      score: r.score.toFixed(3),
      speaker: r.payload.speaker,
      party: r.payload.speaker_party,
      is_government: r.payload.is_government,
      datum: r.payload.datum,
      text_preview: r.payload.text.substring(0, 200)
    }))
  });

  // Statistiken
  console.log('Sammle Collection-Statistiken...');
  const collectionInfo = await qdrant.getProtocolCollectionInfo();
  results.collection_stats = collectionInfo;

  // Speichern
  const outputPath = '/home/morit/bundestag-mcp/test-results.json';
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log('');
  console.log('========================================');
  console.log('KOMPLEXER TEST ABGESCHLOSSEN');
  console.log('========================================');
  console.log('Ergebnisse: ' + outputPath);
  console.log('Tests: ' + results.tests.length);
  console.log('Collection: ' + (collectionInfo?.points_count || 'N/A') + ' Punkte');
  console.log('');

  // Kurze Zusammenfassung ausgeben
  results.tests.forEach((t, i) => {
    console.log(`${i+1}. ${t.name}: ${t.count || t.speeches?.length || Object.keys(t.speeches_by_month || {}).length || '?'} Ergebnisse`);
  });
}

runTests().catch(err => {
  console.error('Fehler:', err.message);
  process.exit(1);
});
