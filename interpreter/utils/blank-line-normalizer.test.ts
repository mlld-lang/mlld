import { describe, it, expect } from 'vitest';
import { normalizeTemplateContent, normalizeOutputBlankLines, normalizeFinalOutput } from './blank-line-normalizer';

describe('blank-line-normalizer', () => {
  describe('normalizeTemplateContent', () => {
    it('should not modify content when not a template', () => {
      const content = '\nHello\nWorld\n\n';
      expect(normalizeTemplateContent(content, false)).toBe(content);
    });

    it('should remove leading newline in templates', () => {
      const content = '\nHello World!';
      expect(normalizeTemplateContent(content, true)).toBe('Hello World!');
    });

    it('should preserve content without leading newline', () => {
      const content = 'Hello World!';
      expect(normalizeTemplateContent(content, true)).toBe('Hello World!');
    });

    it('should reduce trailing blank lines by one', () => {
      // 2 trailing newlines (1 blank line) → 1 newline (0 blank lines)
      expect(normalizeTemplateContent('Hello\n\n', true)).toBe('Hello\n');
      
      // 3 trailing newlines (2 blank lines) → 2 newlines (1 blank line)
      expect(normalizeTemplateContent('Hello\n\n\n', true)).toBe('Hello\n\n');
      
      // 4 trailing newlines (3 blank lines) → 3 newlines (2 blank lines)
      expect(normalizeTemplateContent('Hello\n\n\n\n', true)).toBe('Hello\n\n\n');
    });

    it('should handle both leading and trailing normalization', () => {
      const content = '\nHello World!\n\n\n';
      // Remove leading \n and reduce 3 trailing \n to 2
      expect(normalizeTemplateContent(content, true)).toBe('Hello World!\n\n');
    });

    it('should preserve single trailing newline', () => {
      const content = 'Hello World!\n';
      expect(normalizeTemplateContent(content, true)).toBe('Hello World!\n');
    });

    it('should handle empty templates', () => {
      expect(normalizeTemplateContent('', true)).toBe('');
      expect(normalizeTemplateContent('\n', true)).toBe('');
      expect(normalizeTemplateContent('\n\n', true)).toBe('\n');
    });
  });

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