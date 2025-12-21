import { describe, it, expect } from 'vitest';
import {
  foldUmlauts,
  normalizeUnicodeNumbers,
  normalizeQuery,
  tokenizeQuery
} from '../../src/utils/textNormalization.js';

describe('textNormalization', () => {
  describe('foldUmlauts', () => {
    it('should fold lowercase umlauts', () => {
      expect(foldUmlauts('äöü')).toBe('aeoeue');
    });

    it('should fold uppercase umlauts', () => {
      expect(foldUmlauts('ÄÖÜ')).toBe('AeOeUe');
    });

    it('should fold Eszett', () => {
      expect(foldUmlauts('Straße')).toBe('Strasse');
    });

    it('should handle mixed text', () => {
      expect(foldUmlauts('Müller-Lüdenscheid')).toBe('Mueller-Luedenscheid');
    });

    it('should handle null/undefined', () => {
      expect(foldUmlauts(null)).toBe('');
      expect(foldUmlauts(undefined)).toBe('');
    });

    it('should handle empty string', () => {
      expect(foldUmlauts('')).toBe('');
    });
  });

  describe('normalizeUnicodeNumbers', () => {
    it('should convert subscript numbers', () => {
      expect(normalizeUnicodeNumbers('CO₂')).toBe('CO2');
      expect(normalizeUnicodeNumbers('H₂O')).toBe('H2O');
    });

    it('should convert superscript numbers', () => {
      expect(normalizeUnicodeNumbers('m²')).toBe('m2');
      expect(normalizeUnicodeNumbers('10³')).toBe('103');
    });

    it('should handle mixed text', () => {
      expect(normalizeUnicodeNumbers('Text with CO₂ and m²')).toBe('Text with CO2 and m2');
    });

    it('should handle null/undefined', () => {
      expect(normalizeUnicodeNumbers(null)).toBe('');
      expect(normalizeUnicodeNumbers(undefined)).toBe('');
    });
  });

  describe('normalizeQuery', () => {
    it('should lowercase text', () => {
      expect(normalizeQuery('BUNDESTAG')).toBe('bundestag');
    });

    it('should fold umlauts and lowercase', () => {
      expect(normalizeQuery('Müller')).toBe('mueller');
    });

    it('should remove soft hyphens', () => {
      expect(normalizeQuery('Bun\u00ADdes\u00ADtag')).toBe('bundestag');
    });

    it('should join hyphenated words', () => {
      expect(normalizeQuery('Bundes - tag')).toBe('bundestag');
      expect(normalizeQuery('Bundes–tag')).toBe('bundestag');
    });

    it('should normalize whitespace', () => {
      expect(normalizeQuery('  multiple   spaces  ')).toBe('multiple spaces');
    });

    it('should handle empty/null input', () => {
      expect(normalizeQuery('')).toBe('');
      expect(normalizeQuery(null)).toBe('');
    });
  });

  describe('tokenizeQuery', () => {
    it('should split into tokens', () => {
      expect(tokenizeQuery('hello world')).toEqual(['hello', 'world']);
    });

    it('should handle hyphens', () => {
      expect(tokenizeQuery('CDU-CSU')).toEqual(['CDU-CSU']);
    });

    it('should filter empty tokens', () => {
      expect(tokenizeQuery('  hello   world  ')).toEqual(['hello', 'world']);
    });

    it('should remove special characters', () => {
      expect(tokenizeQuery('hello! world?')).toEqual(['hello', 'world']);
    });

    it('should preserve German characters', () => {
      expect(tokenizeQuery('Müller Schröder')).toEqual(['Müller', 'Schröder']);
    });

    it('should handle null/undefined', () => {
      expect(tokenizeQuery(null)).toEqual([]);
      expect(tokenizeQuery(undefined)).toEqual([]);
    });
  });
});
