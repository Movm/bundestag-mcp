/**
 * Drucksache Parser
 * Extracts structured sections from parliamentary documents for semantic search
 */

// Section markers for different document types
const SECTION_PATTERNS = {
  // Gesetzentwurf standard sections
  problemSection: /^A\.\s*Problem\s*$/i,
  loesungSection: /^B\.\s*Lösung\s*$/i,
  alternativenSection: /^C\.\s*Alternativen?\s*$/i,
  haushaltsSection: /^D\.\s*Haushaltsausgaben/i,
  erfuellungSection: /^E\.\s*Erfüllungsaufwand/i,
  weitereKostenSection: /^F\.\s*Weitere Kosten/i,

  // Law articles - must be standalone article headers, not references in text
  // Matches: "Artikel 1", "Artikel 2 (Inkrafttreten)", but NOT "Artikel 87a Absatz"
  artikel: /^Artikel\s+(\d+)\s*(?:\(([^)]+)\))?\s*$/i,
  paragraph: /^§\s*(\d+[a-z]?)\s+(.+)/i,

  // Begründung sections
  begruendungStart: /^Begründung\s*$/i,
  allgemeinerTeil: /^A\.\s*Allgemeiner Teil/i,
  besondererTeil: /^B\.\s*Besonderer Teil/i,
  zuArtikel: /^Zu\s+Artikel\s+(\d+)/i,
  zuParagraph: /^Zu\s+§\s*(\d+)/i,

  // Numbered subsections (I., II., III., etc. or 1., 2., 3., etc.)
  romanNumeral: /^([IVX]+)\.\s+(.+)/,
  arabicNumeral: /^(\d+)\.\s+(.+)/,
  subSection: /^E\.(\d)\s+(.+)/i,

  // Kleine Anfrage
  frageTitel: /^Wir fragen die Bundesregierung:?\s*$/i,
  vorbemerkung: /^Vorbemerkung(?:\s+der\s+(?:Fragesteller|Bundesregierung))?/i,

  // Antrag/Entschließung
  beschlussAntrag: /^Der (?:Bundestag|Bundesrat) (?:möge beschließen|wolle beschließen|beschließt|fordert)/i,

  // General patterns
  headerLine: /^Deutscher Bundestag\s+Drucksache\s+(\d+\/\d+)/,
  bundesratHeader: /^Bundesrat\s+Drucksache\s+(\d+\/\d+)/,
  documentType: /^(Gesetzentwurf|Kleine Anfrage|Große Anfrage|Antrag|Beschlussempfehlung|Unterrichtung|Entschließungsantrag|Änderungsantrag|Bericht|Schriftliche Frage)\s*$/i
};

/**
 * Parse a Drucksache text into structured chunks
 * @param {string} text - The full document text
 * @param {object} metadata - Document metadata (id, dokumentnummer, drucksachetyp, etc.)
 * @returns {object} Parsed document with chunks array
 */
export function parseDrucksache(text, metadata = {}) {
  const drucksachetyp = metadata.drucksachetyp || detectDocumentType(text);

  let chunks;
  switch (drucksachetyp) {
    case 'Gesetzentwurf':
      chunks = parseGesetzentwurf(text, metadata);
      break;
    case 'Kleine Anfrage':
    case 'Große Anfrage':
      chunks = parseAnfrage(text, metadata);
      break;
    case 'Antrag':
    case 'Entschließungsantrag':
      chunks = parseAntrag(text, metadata);
      break;
    case 'Beschlussempfehlung und Bericht':
    case 'Beschlussempfehlung':
    case 'Bericht':
      chunks = parseBericht(text, metadata);
      break;
    default:
      // Generic parsing for unknown types
      chunks = parseGeneric(text, metadata);
  }

  // Re-index and add metadata to all chunks
  chunks.forEach((chunk, idx) => {
    chunk.chunk_index = idx;
    chunk.drucksache_id = metadata.id;
    chunk.dokumentnummer = metadata.dokumentnummer;
    chunk.drucksachetyp = drucksachetyp;
    chunk.wahlperiode = metadata.wahlperiode;
    chunk.datum = metadata.datum;
    chunk.urheber = metadata.urheber;
    chunk.titel = metadata.titel;
  });

  return {
    metadata: {
      drucksache_id: metadata.id,
      dokumentnummer: metadata.dokumentnummer,
      drucksachetyp: drucksachetyp,
      wahlperiode: metadata.wahlperiode,
      datum: metadata.datum,
      titel: metadata.titel,
      urheber: metadata.urheber
    },
    chunks,
    stats: {
      total_chunks: chunks.length,
      chunk_types: countChunkTypes(chunks)
    }
  };
}

/**
 * Detect document type from text if not provided in metadata
 */
function detectDocumentType(text) {
  const firstLines = text.substring(0, 2000);

  if (/Gesetzentwurf/i.test(firstLines)) return 'Gesetzentwurf';
  if (/Kleine Anfrage/i.test(firstLines)) return 'Kleine Anfrage';
  if (/Große Anfrage/i.test(firstLines)) return 'Große Anfrage';
  if (/Beschlussempfehlung und Bericht/i.test(firstLines)) return 'Beschlussempfehlung und Bericht';
  if (/Entschließungsantrag/i.test(firstLines)) return 'Entschließungsantrag';
  if (/Änderungsantrag/i.test(firstLines)) return 'Änderungsantrag';
  if (/Antrag\s*$/m.test(firstLines)) return 'Antrag';
  if (/Unterrichtung/i.test(firstLines)) return 'Unterrichtung';
  if (/Bericht/i.test(firstLines)) return 'Bericht';
  if (/Schriftliche Frage/i.test(firstLines)) return 'Schriftliche Frage';

  return 'Sonstige';
}

/**
 * Parse Gesetzentwurf (Law Draft)
 */
function parseGesetzentwurf(text, metadata) {
  const chunks = [];
  const lines = text.split('\n');

  let currentSection = null;
  let currentContent = [];
  let inBegruendung = false;
  let begruendungPart = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (currentContent.length > 0) currentContent.push('');
      continue;
    }

    // Skip header/footer boilerplate
    if (isBoilerplate(line)) continue;

    // Check for major section transitions
    if (SECTION_PATTERNS.begruendungStart.test(line)) {
      saveCurrentSection(chunks, currentSection, currentContent, 'overview');
      inBegruendung = true;
      currentSection = { type: 'begruendung_header', title: 'Begründung' };
      currentContent = [];
      continue;
    }

    if (inBegruendung) {
      if (SECTION_PATTERNS.allgemeinerTeil.test(line)) {
        saveCurrentSection(chunks, currentSection, currentContent, 'begruendung');
        begruendungPart = 'allgemein';
        currentSection = { type: 'begruendung_allgemein', title: 'Begründung - Allgemeiner Teil' };
        currentContent = [];
        continue;
      }

      if (SECTION_PATTERNS.besondererTeil.test(line)) {
        saveCurrentSection(chunks, currentSection, currentContent, 'begruendung');
        begruendungPart = 'besonders';
        currentSection = { type: 'begruendung_besonders', title: 'Begründung - Besonderer Teil' };
        currentContent = [];
        continue;
      }

      const zuArtikelMatch = line.match(SECTION_PATTERNS.zuArtikel);
      if (zuArtikelMatch) {
        saveCurrentSection(chunks, currentSection, currentContent, 'begruendung');
        currentSection = {
          type: 'begruendung_artikel',
          title: `Begründung zu Artikel ${zuArtikelMatch[1]}`,
          artikel: zuArtikelMatch[1]
        };
        currentContent = [];
        continue;
      }
    } else {
      // Non-Begründung sections
      if (SECTION_PATTERNS.problemSection.test(line)) {
        saveCurrentSection(chunks, currentSection, currentContent, 'overview');
        currentSection = { type: 'problem', title: 'A. Problem' };
        currentContent = [];
        continue;
      }

      if (SECTION_PATTERNS.loesungSection.test(line)) {
        saveCurrentSection(chunks, currentSection, currentContent, 'overview');
        currentSection = { type: 'loesung', title: 'B. Lösung' };
        currentContent = [];
        continue;
      }

      if (SECTION_PATTERNS.alternativenSection.test(line)) {
        saveCurrentSection(chunks, currentSection, currentContent, 'overview');
        currentSection = { type: 'alternativen', title: 'C. Alternativen' };
        currentContent = [];
        continue;
      }

      if (SECTION_PATTERNS.haushaltsSection.test(line)) {
        saveCurrentSection(chunks, currentSection, currentContent, 'overview');
        currentSection = { type: 'haushalt', title: 'D. Haushaltsausgaben' };
        currentContent = [];
        continue;
      }

      if (SECTION_PATTERNS.erfuellungSection.test(line)) {
        saveCurrentSection(chunks, currentSection, currentContent, 'overview');
        currentSection = { type: 'erfuellung', title: 'E. Erfüllungsaufwand' };
        currentContent = [];
        continue;
      }

      if (SECTION_PATTERNS.weitereKostenSection.test(line)) {
        saveCurrentSection(chunks, currentSection, currentContent, 'overview');
        currentSection = { type: 'kosten', title: 'F. Weitere Kosten' };
        currentContent = [];
        continue;
      }

      // Artikel detection - regex requires line to end after article number
      const artikelMatch = line.match(SECTION_PATTERNS.artikel);
      if (artikelMatch) {
        saveCurrentSection(chunks, currentSection, currentContent, 'article');
        currentSection = {
          type: 'artikel',
          title: line,
          artikel: artikelMatch[1],
          artikelTitel: artikelMatch[2] || null
        };
        currentContent = [];
        continue;
      }
    }

    // Add line to current content
    currentContent.push(line);
  }

  // Save final section
  saveCurrentSection(chunks, currentSection, currentContent, inBegruendung ? 'begruendung' : 'article');

  // Split any oversized chunks
  return splitOversizedChunks(chunks);
}

/**
 * Parse Kleine/Große Anfrage (Parliamentary Question)
 */
function parseAnfrage(text, metadata) {
  const chunks = [];
  const lines = text.split('\n');

  let inVorbemerkung = true;
  let inQuestions = false;
  let currentQuestion = null;
  let currentContent = [];
  let vorbemerkungContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (currentContent.length > 0) currentContent.push('');
      if (inVorbemerkung && vorbemerkungContent.length > 0) vorbemerkungContent.push('');
      continue;
    }

    if (isBoilerplate(line)) continue;

    // Check for question section start
    if (SECTION_PATTERNS.frageTitel.test(line)) {
      // Save vorbemerkung
      if (vorbemerkungContent.length > 0) {
        const vorbemerkungText = cleanText(vorbemerkungContent);
        if (vorbemerkungText.length > 50) {
          chunks.push({
            chunk_type: 'vorbemerkung',
            section_title: 'Vorbemerkung der Fragesteller',
            text: vorbemerkungText,
            text_length: vorbemerkungText.length
          });
        }
      }
      inVorbemerkung = false;
      inQuestions = true;
      continue;
    }

    if (inQuestions) {
      // Check for numbered question
      const questionMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (questionMatch) {
        // Save previous question
        if (currentQuestion !== null) {
          const questionText = cleanText(currentContent);
          if (questionText.length > 20) {
            chunks.push({
              chunk_type: 'question',
              section_title: `Frage ${currentQuestion}`,
              question_number: currentQuestion,
              text: questionText,
              text_length: questionText.length
            });
          }
        }

        currentQuestion = parseInt(questionMatch[1]);
        currentContent = [line];
        continue;
      }

      // Continue current question
      if (currentQuestion !== null) {
        currentContent.push(line);
      }
    } else {
      // Vorbemerkung content (skip header lines)
      if (!isHeaderLine(line) && !SECTION_PATTERNS.documentType.test(line)) {
        vorbemerkungContent.push(line);
      }
    }
  }

  // Save final question
  if (currentQuestion !== null && currentContent.length > 0) {
    const questionText = cleanText(currentContent);
    if (questionText.length > 20) {
      chunks.push({
        chunk_type: 'question',
        section_title: `Frage ${currentQuestion}`,
        question_number: currentQuestion,
        text: questionText,
        text_length: questionText.length
      });
    }
  }

  return splitOversizedChunks(chunks);
}

/**
 * Parse Antrag (Motion/Resolution)
 */
function parseAntrag(text, metadata) {
  const chunks = [];
  const lines = text.split('\n');

  let inResolution = false;
  let inBegruendung = false;
  let currentPoint = null;
  let currentContent = [];
  let introContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (currentContent.length > 0) currentContent.push('');
      if (!inResolution && !inBegruendung && introContent.length > 0) introContent.push('');
      continue;
    }

    if (isBoilerplate(line)) continue;

    // Check for resolution start
    if (SECTION_PATTERNS.beschlussAntrag.test(line)) {
      // Save intro
      if (introContent.length > 0) {
        const introText = cleanText(introContent);
        if (introText.length > 50) {
          chunks.push({
            chunk_type: 'introduction',
            section_title: 'Einleitung',
            text: introText,
            text_length: introText.length
          });
        }
      }
      inResolution = true;
      currentContent = [line];
      continue;
    }

    // Check for Begründung
    if (SECTION_PATTERNS.begruendungStart.test(line) || /^Begründung:/i.test(line)) {
      // Save current resolution point
      if (currentPoint !== null) {
        saveResolutionPoint(chunks, currentPoint, currentContent);
      } else if (inResolution && currentContent.length > 0) {
        // Save resolution header
        const resText = cleanText(currentContent);
        if (resText.length > 30) {
          chunks.push({
            chunk_type: 'resolution',
            section_title: 'Beschlussantrag',
            text: resText,
            text_length: resText.length
          });
        }
      }

      inResolution = false;
      inBegruendung = true;
      currentPoint = null;
      currentContent = [];
      continue;
    }

    if (inResolution) {
      // Check for numbered point
      const pointMatch = line.match(/^(\d+)\.\s+(.+)/);
      if (pointMatch) {
        // Save previous point
        if (currentPoint !== null) {
          saveResolutionPoint(chunks, currentPoint, currentContent);
        }

        currentPoint = parseInt(pointMatch[1]);
        currentContent = [line];
        continue;
      }

      currentContent.push(line);
    } else if (inBegruendung) {
      // Check for "Zu X." references
      const zuMatch = line.match(/^[Zz]u\s+(\d+)\.\s*(.*)/);
      if (zuMatch) {
        // Save previous begründung section
        if (currentContent.length > 0) {
          const begText = cleanText(currentContent);
          if (begText.length > 30) {
            chunks.push({
              chunk_type: 'begruendung',
              section_title: currentPoint ? `Begründung zu Punkt ${currentPoint}` : 'Begründung',
              point_number: currentPoint,
              text: begText,
              text_length: begText.length
            });
          }
        }

        currentPoint = parseInt(zuMatch[1]);
        currentContent = [line];
        continue;
      }

      currentContent.push(line);
    } else {
      // Intro content
      if (!isHeaderLine(line) && !SECTION_PATTERNS.documentType.test(line)) {
        introContent.push(line);
      }
    }
  }

  // Save final content
  if (currentContent.length > 0) {
    const finalText = cleanText(currentContent);
    if (finalText.length > 30) {
      if (inBegruendung) {
        chunks.push({
          chunk_type: 'begruendung',
          section_title: currentPoint ? `Begründung zu Punkt ${currentPoint}` : 'Begründung',
          point_number: currentPoint,
          text: finalText,
          text_length: finalText.length
        });
      } else if (inResolution && currentPoint !== null) {
        saveResolutionPoint(chunks, currentPoint, currentContent);
      }
    }
  }

  return splitOversizedChunks(chunks);
}

/**
 * Parse Bericht/Beschlussempfehlung
 */
function parseBericht(text, metadata) {
  const chunks = [];
  const lines = text.split('\n');

  let currentSection = null;
  let currentContent = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      if (currentContent.length > 0) currentContent.push('');
      continue;
    }

    if (isBoilerplate(line)) continue;

    // Roman numeral sections (I., II., III., etc.)
    const romanMatch = line.match(SECTION_PATTERNS.romanNumeral);
    if (romanMatch && line.length < 200) {
      saveCurrentSection(chunks, currentSection, currentContent, 'section');
      currentSection = { type: 'section', title: line, numeral: romanMatch[1] };
      currentContent = [];
      continue;
    }

    // Major section headers (all caps or specific patterns)
    if (/^[A-ZÄÖÜ][A-ZÄÖÜ\s]+$/.test(line) && line.length > 5 && line.length < 100) {
      saveCurrentSection(chunks, currentSection, currentContent, 'section');
      currentSection = { type: 'section', title: line };
      currentContent = [];
      continue;
    }

    currentContent.push(line);
  }

  saveCurrentSection(chunks, currentSection, currentContent, 'section');

  return splitOversizedChunks(chunks);
}

/**
 * Generic parser for unknown document types
 */
function parseGeneric(text, metadata) {
  const chunks = [];
  const lines = text.split('\n');

  // Simple paragraph-based chunking
  let currentContent = [];
  let paragraphCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      // Paragraph break
      if (currentContent.length > 0) {
        const contentText = cleanText(currentContent);
        if (contentText.length > 100) {
          chunks.push({
            chunk_type: 'paragraph',
            section_title: `Abschnitt ${++paragraphCount}`,
            text: contentText,
            text_length: contentText.length
          });
          currentContent = [];
        } else {
          currentContent.push('');
        }
      }
      continue;
    }

    if (isBoilerplate(trimmed)) continue;

    currentContent.push(trimmed);

    // Split on size if needed
    const currentText = currentContent.join(' ');
    if (currentText.length > 3500) {
      chunks.push({
        chunk_type: 'paragraph',
        section_title: `Abschnitt ${++paragraphCount}`,
        text: currentText,
        text_length: currentText.length
      });
      currentContent = [];
    }
  }

  // Save final content
  if (currentContent.length > 0) {
    const finalText = cleanText(currentContent);
    if (finalText.length > 50) {
      chunks.push({
        chunk_type: 'paragraph',
        section_title: `Abschnitt ${++paragraphCount}`,
        text: finalText,
        text_length: finalText.length
      });
    }
  }

  return splitOversizedChunks(chunks);
}

// Helper functions

function saveCurrentSection(chunks, section, content, defaultType) {
  if (!section && content.length === 0) return;

  const text = cleanText(content);
  if (text.length < 50) return;

  chunks.push({
    chunk_type: section?.type || defaultType,
    section_title: section?.title || 'Abschnitt',
    artikel: section?.artikel,
    text,
    text_length: text.length
  });
}

function saveResolutionPoint(chunks, pointNum, content) {
  const text = cleanText(content);
  if (text.length < 20) return;

  chunks.push({
    chunk_type: 'resolution_point',
    section_title: `Beschlusspunkt ${pointNum}`,
    point_number: pointNum,
    text,
    text_length: text.length
  });
}

function cleanText(lines) {
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isBoilerplate(line) {
  // Skip common boilerplate lines
  if (/^Gesamtherstellung:/i.test(line)) return true;
  if (/^Vertrieb:/i.test(line)) return true;
  if (/^ISSN\s+[\d-]+/i.test(line)) return true;
  if (/^www\./i.test(line)) return true;
  if (/^Telefon\s*\(/i.test(line)) return true;
  if (/^Drucksache\s+\d+\/\d+\s*-?\s*\d*\s*-?\s*$/i.test(line)) return true;
  if (/^\d+\.\s*Wahlperiode\s+[\d.]+$/i.test(line)) return true;
  return false;
}

function isHeaderLine(line) {
  if (SECTION_PATTERNS.headerLine.test(line)) return true;
  if (SECTION_PATTERNS.bundesratHeader.test(line)) return true;
  if (/^\d+\.\s*Wahlperiode/i.test(line)) return true;
  return false;
}

function countChunkTypes(chunks) {
  const counts = {};
  for (const chunk of chunks) {
    counts[chunk.chunk_type] = (counts[chunk.chunk_type] || 0) + 1;
  }
  return counts;
}

function splitOversizedChunks(chunks, maxChars = 4000) {
  const result = [];

  for (const chunk of chunks) {
    if (chunk.text.length <= maxChars) {
      result.push(chunk);
      continue;
    }

    // Split by sentences
    const sentences = chunk.text.split(/(?<=[.!?])\s+/);
    let currentText = [];
    let currentLength = 0;
    let partIndex = 0;

    for (const sentence of sentences) {
      if (currentLength + sentence.length > maxChars && currentText.length > 0) {
        result.push({
          ...chunk,
          chunk_part: partIndex++,
          section_title: `${chunk.section_title} (Teil ${partIndex})`,
          text: currentText.join(' '),
          text_length: currentText.join(' ').length
        });
        currentText = [];
        currentLength = 0;
      }
      currentText.push(sentence);
      currentLength += sentence.length + 1;
    }

    // Save remaining
    if (currentText.length > 0) {
      result.push({
        ...chunk,
        chunk_part: partIndex,
        section_title: partIndex > 0 ? `${chunk.section_title} (Teil ${partIndex + 1})` : chunk.section_title,
        text: currentText.join(' '),
        text_length: currentText.join(' ').length
      });
    }
  }

  return result;
}

/**
 * Extract chunks from a Drucksache (simplified interface)
 */
export function extractChunks(text, metadata = {}) {
  const result = parseDrucksache(text, metadata);
  return result.chunks;
}

/**
 * Get parsing statistics
 */
export function getParseStats(text, metadata = {}) {
  const result = parseDrucksache(text, metadata);
  return result.stats;
}

export default {
  parseDrucksache,
  extractChunks,
  getParseStats,
  SECTION_PATTERNS
};
