/**
 * Text Normalization Utilities for German text
 * Handles German umlauts, hyphenation, and unicode normalization
 */

const SUBSCRIPT_MAP = {
  '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4',
  '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9'
};

const SUPERSCRIPT_MAP = {
  '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2074': '4',
  '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9'
};

/**
 * Fold German umlauts to ASCII equivalents
 */
export function foldUmlauts(s) {
  if (!s) return s || '';
  return s
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
}

/**
 * Normalize unicode subscript and superscript numbers to ASCII
 */
export function normalizeUnicodeNumbers(text) {
  if (!text) return text || '';
  let out = text;
  for (const [unicode, ascii] of Object.entries(SUBSCRIPT_MAP)) {
    out = out.replace(new RegExp(unicode, 'g'), ascii);
  }
  for (const [unicode, ascii] of Object.entries(SUPERSCRIPT_MAP)) {
    out = out.replace(new RegExp(unicode, 'g'), ascii);
  }
  return out;
}

/**
 * Normalize a query string for robust text matching
 */
export function normalizeQuery(q) {
  if (!q) return '';
  let out = q.replace(/\u00AD/g, ''); // soft hyphen
  out = out.replace(/([A-Za-zÄÖÜäöüß])\s*[-–—]\s*([A-Za-zÄÖÜäöüß])/g, '$1$2');
  out = out.replace(/\s+/g, ' ').trim();
  out = normalizeUnicodeNumbers(out);
  out = foldUmlauts(out).toLowerCase();
  return out;
}

/**
 * Tokenize a query conservatively
 */
export function tokenizeQuery(q) {
  return (q || '')
    .replace(/[\u00AD]/g, '')
    .replace(/[^A-Za-zÄÖÜäöüß0-9\-\s]/g, ' ')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean);
}
