/**
 * Plenarprotokoll Parser
 * Extracts speeches and procedural sections from parliamentary protocol texts
 */

// Known parliamentary groups (Fraktionen)
const FRAKTIONEN = [
  'CDU/CSU',
  'SPD',
  'BÜNDNIS 90/DIE GRÜNEN',
  'FDP',
  'AfD',
  'Die Linke',
  'BSW',
  'fraktionslos'
];

// German federal states (for Bundesrat)
const BUNDESLAENDER = [
  'Baden-Württemberg',
  'Bayern',
  'Berlin',
  'Brandenburg',
  'Bremen',
  'Hamburg',
  'Hessen',
  'Mecklenburg-Vorpommern',
  'Niedersachsen',
  'Nordrhein-Westfalen',
  'Rheinland-Pfalz',
  'Saarland',
  'Sachsen',
  'Sachsen-Anhalt',
  'Schleswig-Holstein',
  'Thüringen'
];

// Regex patterns for parsing
const PATTERNS = {
  // Bundestag: "Name (Fraktion):" - e.g., "Friedrich Merz (CDU/CSU):"
  speakerWithFraktion: /^([A-ZÄÖÜ][a-zäöüß]+(?:[-\s][A-ZÄÖÜ]?[a-zäöüß]+)*(?:\s+\([A-Za-z]+\))?)\s*\(([^)]+)\)\s*:\s*$/,

  // Ministers: "Name, Bundesminister XYZ" or "Name, Bundesministerin XYZ"
  ministerSpeaker: /^([A-ZÄÖÜ][a-zäöüß]+(?:[-\s][A-ZÄÖÜ]?[a-zäöüß]+)*),\s*(Bundes(?:minister(?:in)?|kanzler(?:in)?)[^:]*)\s*:\s*$/,

  // President/Vice-President: "Präsident(in) Name:" or "Vizepräsident(in) Name:"
  presidingSpeaker: /^((?:Vize)?Präsident(?:in)?)\s+([A-ZÄÖÜ][a-zäöüß]+(?:[-\s][A-ZÄÖÜ]?[a-zäöüß]+)*)\s*:\s*$/,

  // Bundesrat: "Name (Bundesland):" - e.g., "Winfried Kretschmann (Baden-Württemberg):"
  speakerWithState: /^([A-ZÄÖÜ][a-zäöüß]+(?:[-\s][A-ZÄÖÜ]?[a-zäöüß]+)*)\s*\(([A-ZÄÖÜ][a-zäöüß-]+)\)\s*:\s*$/,

  // Bundesrat with title: "Dr. Name (Bundesland):"
  speakerWithTitle: /^((?:Dr\.|Prof\.|Prof\.\s*Dr\.)\s*[A-ZÄÖÜ][a-zäöüß]+(?:[-\s][A-ZÄÖÜ]?[a-zäöüß]+)*)\s*\(([^)]+)\)\s*:\s*$/,

  // TOP markers: "TOP 34" or "Tagesordnungspunkt 1:"
  topMarker: /^(?:TOP\s+(\d+)|Tagesordnungspunkt\s+(\d+))/i,

  // Reactions in parentheses: "(Beifall)", "(Heiterkeit)", etc.
  reaction: /^\([^)]+\)\s*$/,

  // Procedural notes
  proceduralNote: /^(?:Beginn:|Ende:|Schluss:|Unterbrechung:)/
};

/**
 * Parse a protocol text into structured speeches
 * @param {string} text - The full protocol text
 * @param {object} metadata - Protocol metadata (id, dokumentnummer, datum, etc.)
 * @returns {object} Parsed protocol with speeches array
 */
export function parseProtokoll(text, metadata = {}) {
  const lines = text.split('\n');
  const speeches = [];
  const herausgeber = metadata.herausgeber || 'BT';

  let currentSpeaker = null;
  let currentSpeech = [];
  let currentTop = null;
  let currentTopTitle = null;
  let chunkIndex = 0;
  let inHeader = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines but preserve paragraph breaks in speeches
    if (!line) {
      if (currentSpeech.length > 0) {
        currentSpeech.push('');
      }
      continue;
    }

    // Detect end of header section (when we see "Beginn:" or first speaker)
    if (inHeader && (PATTERNS.proceduralNote.test(line) || isSpeakerLine(line, herausgeber))) {
      inHeader = false;
    }

    // Skip header content
    if (inHeader) continue;

    // Check for TOP marker
    const topMatch = line.match(PATTERNS.topMarker);
    if (topMatch) {
      currentTop = `TOP ${topMatch[1] || topMatch[2]}`;
      // Try to get TOP title from next non-empty line
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const nextLine = lines[j].trim();
        if (nextLine && !isSpeakerLine(nextLine, herausgeber) && !PATTERNS.topMarker.test(nextLine)) {
          currentTopTitle = nextLine.substring(0, 200);
          break;
        }
      }
      continue;
    }

    // Check for new speaker
    const speakerInfo = parseSpeakerLine(line, herausgeber);
    if (speakerInfo) {
      // Save previous speech if exists
      if (currentSpeaker && currentSpeech.length > 0) {
        const speechText = cleanSpeechText(currentSpeech);
        if (speechText.length > 50) { // Only save non-trivial speeches
          speeches.push({
            chunk_index: chunkIndex++,
            chunk_type: currentSpeaker.role ? 'procedural' : 'speech',
            speaker: currentSpeaker.name,
            speaker_party: currentSpeaker.party,
            speaker_state: currentSpeaker.state,
            speaker_role: currentSpeaker.role,
            top: currentTop,
            top_title: currentTopTitle,
            text: speechText,
            text_length: speechText.length
          });
        }
      }

      // Start new speech
      currentSpeaker = speakerInfo;
      currentSpeech = [];
      continue;
    }

    // Skip pure reactions if we're not in a speech
    if (PATTERNS.reaction.test(line) && currentSpeech.length === 0) {
      continue;
    }

    // Add line to current speech
    if (currentSpeaker) {
      currentSpeech.push(line);
    }
  }

  // Save final speech
  if (currentSpeaker && currentSpeech.length > 0) {
    const speechText = cleanSpeechText(currentSpeech);
    if (speechText.length > 50) {
      speeches.push({
        chunk_index: chunkIndex++,
        chunk_type: currentSpeaker.role ? 'procedural' : 'speech',
        speaker: currentSpeaker.name,
        speaker_party: currentSpeaker.party,
        speaker_state: currentSpeaker.state,
        speaker_role: currentSpeaker.role,
        top: currentTop,
        top_title: currentTopTitle,
        text: speechText,
        text_length: speechText.length
      });
    }
  }

  // Split long speeches into chunks
  const chunkedSpeeches = [];
  for (const speech of speeches) {
    const chunks = splitLongSpeech(speech, 4000); // ~1000 tokens
    chunkedSpeeches.push(...chunks);
  }

  // Re-index chunks
  chunkedSpeeches.forEach((chunk, idx) => {
    chunk.chunk_index = idx;
  });

  return {
    metadata: {
      protokoll_id: metadata.id,
      dokumentnummer: metadata.dokumentnummer,
      wahlperiode: metadata.wahlperiode,
      datum: metadata.datum,
      herausgeber: herausgeber,
      titel: metadata.titel
    },
    speeches: chunkedSpeeches,
    stats: {
      total_speeches: speeches.length,
      total_chunks: chunkedSpeeches.length,
      unique_speakers: [...new Set(speeches.map(s => s.speaker))].length
    }
  };
}

/**
 * Check if a line is a speaker line
 */
function isSpeakerLine(line, herausgeber) {
  return parseSpeakerLine(line, herausgeber) !== null;
}

/**
 * Parse a speaker line and extract speaker info
 */
function parseSpeakerLine(line, herausgeber = 'BT') {
  // Try presiding officer pattern first
  const presidingMatch = line.match(PATTERNS.presidingSpeaker);
  if (presidingMatch) {
    return {
      name: presidingMatch[2],
      party: null,
      state: null,
      role: presidingMatch[1]
    };
  }

  // Try minister pattern
  const ministerMatch = line.match(PATTERNS.ministerSpeaker);
  if (ministerMatch) {
    return {
      name: ministerMatch[1],
      party: null,
      state: null,
      role: ministerMatch[2]
    };
  }

  // Try speaker with title (Dr., Prof.)
  const titleMatch = line.match(PATTERNS.speakerWithTitle);
  if (titleMatch) {
    const affiliation = titleMatch[2];
    const isFraktion = FRAKTIONEN.some(f => affiliation.includes(f));
    const isState = BUNDESLAENDER.some(s => affiliation.includes(s));

    return {
      name: titleMatch[1],
      party: isFraktion ? affiliation : null,
      state: isState ? affiliation : null,
      role: null
    };
  }

  // Try standard speaker with fraktion (Bundestag)
  const fraktionMatch = line.match(PATTERNS.speakerWithFraktion);
  if (fraktionMatch) {
    const affiliation = fraktionMatch[2];
    const isFraktion = FRAKTIONEN.some(f => affiliation.includes(f));

    if (isFraktion || herausgeber === 'BT') {
      return {
        name: fraktionMatch[1],
        party: affiliation,
        state: null,
        role: null
      };
    }
  }

  // Try speaker with state (Bundesrat)
  const stateMatch = line.match(PATTERNS.speakerWithState);
  if (stateMatch) {
    const affiliation = stateMatch[2];
    const isState = BUNDESLAENDER.some(s => affiliation === s);

    if (isState || herausgeber === 'BR') {
      return {
        name: stateMatch[1],
        party: null,
        state: affiliation,
        role: null
      };
    }
  }

  return null;
}

/**
 * Clean up speech text
 */
function cleanSpeechText(lines) {
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')  // Collapse multiple newlines
    .replace(/^\s+|\s+$/g, '')    // Trim
    .replace(/\s+/g, ' ')         // Normalize whitespace for embedding
    .trim();
}

/**
 * Split a long speech into smaller chunks
 */
function splitLongSpeech(speech, maxChars = 4000) {
  if (speech.text.length <= maxChars) {
    return [speech];
  }

  const chunks = [];
  const sentences = speech.text.split(/(?<=[.!?])\s+/);
  let currentChunk = [];
  let currentLength = 0;
  let partIndex = 0;

  for (const sentence of sentences) {
    if (currentLength + sentence.length > maxChars && currentChunk.length > 0) {
      // Save current chunk
      chunks.push({
        ...speech,
        chunk_index: speech.chunk_index,
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

  // Save remaining chunk
  if (currentChunk.length > 0) {
    chunks.push({
      ...speech,
      chunk_index: speech.chunk_index,
      chunk_part: partIndex,
      text: currentChunk.join(' '),
      text_length: currentChunk.join(' ').length
    });
  }

  return chunks;
}

/**
 * Extract just the speeches from a protocol text (simplified interface)
 */
export function extractSpeeches(text, metadata = {}) {
  const result = parseProtokoll(text, metadata);
  return result.speeches;
}

/**
 * Get statistics about a parsed protocol
 */
export function getProtocolStats(text, metadata = {}) {
  const result = parseProtokoll(text, metadata);
  return result.stats;
}

export default {
  parseProtokoll,
  extractSpeeches,
  getProtocolStats,
  FRAKTIONEN,
  BUNDESLAENDER
};
