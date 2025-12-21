import { describe, it, expect } from 'vitest';
import { parseDrucksache, extractChunks, getParseStats } from '../../src/services/drucksacheParser.js';

// Sample Gesetzentwurf text (shortened for testing)
const GESETZENTWURF_SAMPLE = `Deutscher Bundestag Drucksache 20/15099
20. Wahlperiode 10.03.2025
Gesetzentwurf
der Fraktion der FDP
Entwurf eines Gesetzes zur Errichtung eines Verteidigungsfonds für Deutschland
und zur Änderung des Grundgesetzes (Artikel 87a)
A. Problem
Der russische Angriffskrieg gegen das gesamte Territorium der Ukraine dauert
nunmehr bereits über drei Jahre und hat die Sicherheitslage in Europa
fundamental verändert. Der Amtsantritt der neuen US-Regierung lässt darüber hinaus nicht
erwarten, dass sich die existierenden geoökonomischen und sicherheitspolitischen
Spannungen in der internationalen Politik verringern. Die Gewissheiten unserer
nach dem Zweiten Weltkrieg entstandenen transatlantischen Sicherheitsarchitektur
gehören der Vergangenheit an.
B. Lösung
Weiterhin bestehende NATO-Fähigkeitslücken sind umgehend aus dem
Kernhaushalt zu schließen und Investitionen in die personelle Aufwuchsfähigkeit
entsprechend zu tätigen. Um das zu erreichen, muss im Kernhaushalt umgeschichtet
werden. Deshalb sollen neue Schulden und Sondervermögen nur dann genutzt
werden, wenn die bestehenden Ziele aus dem Kernhaushalt gedeckt sind.
C. Alternativen
Keine. Es wurden keine anderen Optionen in Betracht gezogen, da dieser Ansatz
der einzig praktikable ist, um die gesteckten Ziele zu erreichen.
D. Haushaltsausgaben ohne Erfüllungsaufwand
Durch die Grundgesetzänderung ergeben sich keine unmittelbaren finanziellen
Auswirkungen. Die Höhe der Auswirkungen ist abhängig von der
einfachgesetzlichen Ausgestaltung.
E. Erfüllungsaufwand
E.1 Erfüllungsaufwand für Bürgerinnen und Bürger
Das Gesetz hat keine Auswirkungen auf den Erfüllungsaufwand der Bürgerinnen
und Bürger.
E.2 Erfüllungsaufwand für die Wirtschaft
Das Gesetz hat keine Auswirkungen auf den Erfüllungsaufwand der Wirtschaft.
E.3 Erfüllungsaufwand der Verwaltung
Das Gesetz hat keine Auswirkungen auf den Erfüllungsaufwand der Verwaltung.
F. Weitere Kosten
Durch das Gesetz entstehen der Wirtschaft keine weiteren Kosten.
Entwurf eines Gesetzes zur Errichtung eines Verteidigungsfonds
Vom …
Der Bundestag hat mit Zustimmung des Bundesrates das folgende Gesetz beschlossen:
Artikel 1
Änderung des Grundgesetzes
Artikel 87a Absatz 1a des Grundgesetzes für die Bundesrepublik Deutschland wird wie folgt gefasst:
„(1a) Zur Stärkung der Bündnis- und Verteidigungsfähigkeit kann der Bund einen Verteidigungsfonds für
Deutschland als Sondervermögen für die Bundeswehr mit eigener Kreditermächtigung in Höhe von einmalig bis
zu 300 Milliarden Euro errichten."
Artikel 2
Inkrafttreten
Dieses Gesetz tritt am Tag nach der Verkündung in Kraft.
Begründung
A. Allgemeiner Teil
I. Zielsetzung und Notwendigkeit der Regelungen
Der russische Angriffskrieg gegen die Ukraine dauert bereits über drei Jahre. Die Sicherheitslage
in Europa hat sich fundamental verändert. Die Gewissheiten der transatlantischen Sicherheitsarchitektur
gehören der Vergangenheit an.
II. Wesentlicher Inhalt des Entwurfs
Durch die Änderung in Artikel 87a Grundgesetz wird dem Bundesgesetzgeber ermöglicht, das bestehende
Sondervermögen zu erweitern.
B. Besonderer Teil
Zu Artikel 1
Durch den neu gefassten Artikel 87 Absatz 1a wird die Rechtsgrundlage für das bisherige Sondervermögen
erweitert. Der bisherige Zweck bleibt bestehen.
Zu Artikel 2
Die Vorschrift regelt das Inkrafttreten.
Gesamtherstellung: H. Heenemann GmbH & Co. KG, Buch- und Offsetdruckerei
ISSN 0722-8333`;

// Sample Kleine Anfrage text
const KLEINE_ANFRAGE_SAMPLE = `Deutscher Bundestag Drucksache 20/15144
20. Wahlperiode 24.03.2025
Kleine Anfrage
der Abgeordneten Sevim Dağdelen, Dr. Sahra Wagenknecht, Ali Al-Dailami, Klaus
Ernst und der Gruppe BSW
Presseberichte über Zählungs- und Übertragungsfehler bei der Auszählung der Stimmen
Mit 4,972 Prozent hat das Bündnis Sahra Wagenknecht (BSW) laut
vorläufigem Ergebnis bei der diesjährigen Bundestagswahl die Fünf-Prozent-Hürde
knapp verfehlt. Verschiedene Recherchen haben Anomalien bezüglich der
Wahlergebnisse aufgezeigt.
So habe es eine Häufung von Fällen gegeben, in denen das BSW mit null Stimmen
aufgeführt wurde, während kleinere Parteien unerwartet hohe Stimmenanteile zeigten.
Wir fragen die Bundesregierung:
1. Hat die Bundesregierung Kenntnis darüber, in wie vielen Briefwahlbezirken
die Bundestagswahl 2025 stattgefunden hat?
2. Hat die Bundesregierung Kenntnis darüber, in wie vielen
Urnenwahlbezirken die Bundestagswahl 2025 stattgefunden hat?
3. Hat die Bundesregierung Kenntnis darüber, in wie vielen Wahllokalen in
Deutschland die Bundestagswahl 2025 stattgefunden hat?
4. Hat die Bundesregierung Kenntnisse darüber, ob die Daten aus den
Wahllokalen rechtzeitig zur Verfügung gestellt werden?
Berlin, den 18. März 2025
Dr. Sahra Wagenknecht und Gruppe
ISSN 0722-8333`;

// Sample Antrag text (Bundesrat)
const ANTRAG_SAMPLE = `Bundesrat Drucksache 119/25
20.03.25
Antrag
der Länder Brandenburg, Mecklenburg-Vorpommern
Entschließung des Bundesrates zum künftigen Umgang mit dem Wolf in Deutschland
Der Bundesrat möge beschließen:
1. Der Bundesrat stellt fest, dass die zunehmende Anzahl und Dichte der Wolfsbestände in
Deutschland zu anhaltender Besorgnis führt. Neben Prävention besteht dringender
zusätzlicher Handlungsbedarf.
2. Der Bundesrat stellt weiterhin fest, dass es bislang nicht gelungen ist, rechtssichere
Regelungen auf Bundesebene zu schaffen.
3. Der Bundesrat fordert die Bundesregierung auf, sich für eine zeitnahe Rechtsänderung auf
europäischer Ebene einzusetzen.
4. Die Bundesregierung wird zudem aufgefordert, die erforderlichen nationalen
Rechtsänderungen vorzubereiten.
5. Schließlich wird die Bundesregierung aufgefordert, darauf hinzuwirken, dass
die nationale Bewertung verbessert wird.
Begründung:
Im Umgang mit dem Wolf hat auf europäischer Ebene bereits ein Umdenken stattgefunden.
Zu 4. Der FFH-Bericht der Bundesregierung 2025 sieht vor, den Erhaltungszustand als
„ungünstig schlecht" zu bewerten.
Zu 5. Die FFH-Richtlinie stellt auf den günstigen Erhaltungszustand ab.
ISSN 0720-2946`;

describe('drucksacheParser', () => {
  describe('parseDrucksache', () => {
    describe('Gesetzentwurf parsing', () => {
      const result = parseDrucksache(GESETZENTWURF_SAMPLE, {
        id: 12345,
        dokumentnummer: '20/15099',
        drucksachetyp: 'Gesetzentwurf',
        wahlperiode: 20,
        datum: '2025-03-10',
        titel: 'Entwurf eines Gesetzes zur Errichtung eines Verteidigungsfonds'
      });

      it('should detect correct document type', () => {
        expect(result.metadata.drucksachetyp).toBe('Gesetzentwurf');
      });

      it('should extract Problem section', () => {
        const problemChunk = result.chunks.find(c => c.chunk_type === 'problem');
        expect(problemChunk).toBeDefined();
        expect(problemChunk.section_title).toBe('A. Problem');
        expect(problemChunk.text).toContain('russische Angriffskrieg');
      });

      it('should extract Lösung section', () => {
        const loesungChunk = result.chunks.find(c => c.chunk_type === 'loesung');
        expect(loesungChunk).toBeDefined();
        expect(loesungChunk.section_title).toBe('B. Lösung');
        expect(loesungChunk.text).toContain('NATO-Fähigkeitslücken');
      });

      it('should extract Alternativen section', () => {
        const altChunk = result.chunks.find(c => c.chunk_type === 'alternativen');
        expect(altChunk).toBeDefined();
        expect(altChunk.text).toContain('Keine');
        expect(altChunk.text).toContain('praktikable');
      });

      it('should extract Artikel sections', () => {
        const artikelChunks = result.chunks.filter(c => c.chunk_type === 'artikel');
        expect(artikelChunks.length).toBeGreaterThanOrEqual(2);

        const artikel1 = artikelChunks.find(c => c.artikel === '1');
        expect(artikel1).toBeDefined();
        expect(artikel1.text).toContain('Grundgesetz');

        const artikel2 = artikelChunks.find(c => c.artikel === '2');
        expect(artikel2).toBeDefined();
        expect(artikel2.text).toContain('Inkrafttreten');
      });

      it('should extract Begründung sections', () => {
        const begruendungChunks = result.chunks.filter(c =>
          c.chunk_type.startsWith('begruendung')
        );
        expect(begruendungChunks.length).toBeGreaterThan(0);
      });

      it('should add metadata to all chunks', () => {
        result.chunks.forEach(chunk => {
          expect(chunk.drucksache_id).toBe(12345);
          expect(chunk.dokumentnummer).toBe('20/15099');
          expect(chunk.wahlperiode).toBe(20);
        });
      });

      it('should calculate text length correctly', () => {
        result.chunks.forEach(chunk => {
          expect(chunk.text_length).toBe(chunk.text.length);
        });
      });

      it('should filter out boilerplate', () => {
        result.chunks.forEach(chunk => {
          expect(chunk.text).not.toContain('ISSN');
          expect(chunk.text).not.toContain('Gesamtherstellung');
        });
      });
    });

    describe('Kleine Anfrage parsing', () => {
      const result = parseDrucksache(KLEINE_ANFRAGE_SAMPLE, {
        id: 23456,
        dokumentnummer: '20/15144',
        drucksachetyp: 'Kleine Anfrage',
        wahlperiode: 20,
        datum: '2025-03-24',
        titel: 'Presseberichte über Zählungs- und Übertragungsfehler'
      });

      it('should detect correct document type', () => {
        expect(result.metadata.drucksachetyp).toBe('Kleine Anfrage');
      });

      it('should extract Vorbemerkung', () => {
        const vorbemerkung = result.chunks.find(c => c.chunk_type === 'vorbemerkung');
        expect(vorbemerkung).toBeDefined();
        expect(vorbemerkung.text).toContain('4,972 Prozent');
        expect(vorbemerkung.text).toContain('Anomalien');
      });

      it('should extract individual questions', () => {
        const questions = result.chunks.filter(c => c.chunk_type === 'question');
        expect(questions.length).toBe(4);

        expect(questions[0].question_number).toBe(1);
        expect(questions[0].text).toContain('Briefwahlbezirken');

        expect(questions[1].question_number).toBe(2);
        expect(questions[1].text).toContain('Urnenwahlbezirken');

        expect(questions[2].question_number).toBe(3);
        expect(questions[2].text).toContain('Wahllokalen');

        expect(questions[3].question_number).toBe(4);
        expect(questions[3].text).toContain('Daten');
      });

      it('should set section titles with question numbers', () => {
        const questions = result.chunks.filter(c => c.chunk_type === 'question');
        expect(questions[0].section_title).toBe('Frage 1');
        expect(questions[1].section_title).toBe('Frage 2');
      });
    });

    describe('Antrag parsing', () => {
      const result = parseDrucksache(ANTRAG_SAMPLE, {
        id: 34567,
        dokumentnummer: '119/25',
        drucksachetyp: 'Antrag',
        wahlperiode: 20,
        datum: '2025-03-20',
        titel: 'Entschließung zum Umgang mit dem Wolf'
      });

      it('should detect correct document type', () => {
        expect(result.metadata.drucksachetyp).toBe('Antrag');
      });

      it('should extract resolution points', () => {
        const resolutionPoints = result.chunks.filter(c => c.chunk_type === 'resolution_point');
        expect(resolutionPoints.length).toBe(5);

        expect(resolutionPoints[0].point_number).toBe(1);
        expect(resolutionPoints[0].text).toContain('Wolfsbestände');

        expect(resolutionPoints[2].point_number).toBe(3);
        expect(resolutionPoints[2].text).toContain('Rechtsänderung');
      });

      it('should extract Begründung sections', () => {
        const begruendung = result.chunks.filter(c => c.chunk_type === 'begruendung');
        expect(begruendung.length).toBeGreaterThan(0);
      });

      it('should link Begründung to resolution points', () => {
        const zu4 = result.chunks.find(c =>
          c.chunk_type === 'begruendung' && c.point_number === 4
        );
        expect(zu4).toBeDefined();
        expect(zu4.text).toContain('FFH-Bericht');
      });
    });
  });

  describe('extractChunks', () => {
    it('should return only chunks array', () => {
      const chunks = extractChunks(KLEINE_ANFRAGE_SAMPLE, {
        drucksachetyp: 'Kleine Anfrage'
      });
      expect(Array.isArray(chunks)).toBe(true);
      expect(chunks.length).toBeGreaterThan(0);
      chunks.forEach(chunk => {
        expect(chunk.chunk_type).toBeDefined();
        expect(chunk.text).toBeDefined();
      });
    });
  });

  describe('getParseStats', () => {
    it('should return statistics', () => {
      const stats = getParseStats(GESETZENTWURF_SAMPLE, {
        drucksachetyp: 'Gesetzentwurf'
      });
      expect(stats.total_chunks).toBeGreaterThan(0);
      expect(stats.chunk_types).toBeDefined();
      expect(typeof stats.chunk_types).toBe('object');
    });

    it('should count chunk types correctly', () => {
      const stats = getParseStats(KLEINE_ANFRAGE_SAMPLE, {
        drucksachetyp: 'Kleine Anfrage'
      });
      expect(stats.chunk_types.question).toBe(4);
      expect(stats.chunk_types.vorbemerkung).toBe(1);
    });
  });

  describe('Document type detection', () => {
    it('should auto-detect Gesetzentwurf', () => {
      const result = parseDrucksache(GESETZENTWURF_SAMPLE, {});
      expect(result.metadata.drucksachetyp).toBe('Gesetzentwurf');
    });

    it('should auto-detect Kleine Anfrage', () => {
      const result = parseDrucksache(KLEINE_ANFRAGE_SAMPLE, {});
      expect(result.metadata.drucksachetyp).toBe('Kleine Anfrage');
    });

    it('should auto-detect Antrag', () => {
      const result = parseDrucksache(ANTRAG_SAMPLE, {});
      expect(result.metadata.drucksachetyp).toBe('Antrag');
    });
  });

  describe('Chunk size limits', () => {
    it('should split oversized chunks', () => {
      const longText = `A. Problem
${'Dieser Text ist sehr lang. '.repeat(300)}
B. Lösung
Kurze Lösung.`;

      const result = parseDrucksache(longText, {
        drucksachetyp: 'Gesetzentwurf'
      });

      // The problem section should be split into multiple parts
      const problemChunks = result.chunks.filter(c =>
        c.chunk_type === 'problem' || c.section_title.includes('Problem')
      );

      // Check that all chunks are within size limit
      result.chunks.forEach(chunk => {
        expect(chunk.text.length).toBeLessThanOrEqual(4500); // Some buffer
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty text', () => {
      const result = parseDrucksache('', { drucksachetyp: 'Gesetzentwurf' });
      expect(result.chunks).toEqual([]);
    });

    it('should handle text with only boilerplate', () => {
      const result = parseDrucksache(
        'ISSN 0722-8333\nGesamtherstellung: Test',
        { drucksachetyp: 'Gesetzentwurf' }
      );
      expect(result.chunks.length).toBe(0);
    });

    it('should handle missing metadata', () => {
      const result = parseDrucksache(GESETZENTWURF_SAMPLE, {});
      expect(result.metadata.drucksachetyp).toBe('Gesetzentwurf');
      result.chunks.forEach(chunk => {
        expect(chunk.drucksache_id).toBeUndefined();
      });
    });
  });
});
