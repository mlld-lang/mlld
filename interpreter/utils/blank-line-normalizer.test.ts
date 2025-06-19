import { describe, it, expect } from 'vitest';
import { normalizeOutputBlankLines, normalizeFinalOutput } from './blank-line-normalizer';

describe('blank-line-normalizer', () => {
  describe('normalizeOutputBlankLines', () => {
    it('should reduce multiple blank lines to single blank line', () => {
      expect(normalizeOutputBlankLines('A\n\n\nB')).toBe('A\n\nB');
      expect(normalizeOutputBlankLines('A\n\n\n\nB')).toBe('A\n\nB');
      expect(normalizeOutputBlankLines('A\n\n\n\n\nB')).toBe('A\n\nB');
    });

    it('should preserve single blank lines', () => {
      expect(normalizeOutputBlankLines('A\n\nB')).toBe('A\n\nB');
    });

    it('should preserve single newlines', () => {
      expect(normalizeOutputBlankLines('A\nB')).toBe('A\nB');
    });

    it('should handle multiple sections', () => {
      const content = 'Section 1\n\n\n\nSection 2\n\n\n\nSection 3';
      expect(normalizeOutputBlankLines(content)).toBe('Section 1\n\nSection 2\n\nSection 3');
    });

    it('should handle trailing blank lines', () => {
      expect(normalizeOutputBlankLines('Content\n\n\n')).toBe('Content\n\n');
    });

    it('should handle leading blank lines', () => {
      expect(normalizeOutputBlankLines('\n\n\nContent')).toBe('\n\nContent');
    });
  });

  describe('normalizeFinalOutput', () => {
    it('should normalize blank lines and ensure single trailing newline', () => {
      expect(normalizeFinalOutput('A\n\n\nB')).toBe('A\n\nB\n');
      expect(normalizeFinalOutput('A\n\n\nB\n\n\n')).toBe('A\n\nB\n');
    });

    it('should add trailing newline if missing', () => {
      expect(normalizeFinalOutput('Hello')).toBe('Hello\n');
    });

    it('should preserve single trailing newline', () => {
      expect(normalizeFinalOutput('Hello\n')).toBe('Hello\n');
    });

    it('should handle empty content', () => {
      expect(normalizeFinalOutput('')).toBe('');
    });

    it('should normalize complex output', () => {
      const input = 'Header\n\n\n\nSection 1\n\nContent\n\n\n\nSection 2\n\n\n';
      const expected = 'Header\n\nSection 1\n\nContent\n\nSection 2\n';
      expect(normalizeFinalOutput(input)).toBe(expected);
    });
  });
});