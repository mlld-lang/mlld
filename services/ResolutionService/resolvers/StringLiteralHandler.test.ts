import { describe, it, expect } from 'vitest';
import { StringLiteralHandler } from './StringLiteralHandler.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';

describe('StringLiteralHandler', () => {
  const handler = new StringLiteralHandler();

  describe('validateLiteral', () => {
    it('should accept single quoted strings', () => {
      expect(() => handler.validateLiteral("'hello world'")).not.toThrow();
    });

    it('should accept double quoted strings', () => {
      expect(() => handler.validateLiteral('"hello world"')).not.toThrow();
    });

    it('should accept backtick quoted strings', () => {
      expect(() => handler.validateLiteral('`hello world`')).not.toThrow();
    });

    it('should reject unmatched quotes', () => {
      expect(() => handler.validateLiteral("'hello world")).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('"hello world')).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('`hello world')).toThrow(ResolutionError);
    });

    it('should reject mixed quotes', () => {
      expect(() => handler.validateLiteral("'hello world\"")).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('"hello world`')).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('`hello world\'')).toThrow(ResolutionError);
    });

    it('should reject strings without quotes', () => {
      expect(() => handler.validateLiteral('hello world')).toThrow(ResolutionError);
    });

    it('should reject empty strings', () => {
      expect(() => handler.validateLiteral('')).toThrow(ResolutionError);
    });

    it('should reject strings with only quotes', () => {
      expect(() => handler.validateLiteral('""')).toThrow(ResolutionError);
      expect(() => handler.validateLiteral("''")).toThrow(ResolutionError);
      expect(() => handler.validateLiteral('``')).toThrow(ResolutionError);
    });
  });

  describe('parseLiteral', () => {
    it('should remove matching single quotes', () => {
      expect(handler.parseLiteral("'hello world'")).toBe('hello world');
    });

    it('should remove matching double quotes', () => {
      expect(handler.parseLiteral('"hello world"')).toBe('hello world');
    });

    it('should remove matching backticks', () => {
      expect(handler.parseLiteral('`hello world`')).toBe('hello world');
    });

    it('should preserve internal quotes', () => {
      expect(handler.parseLiteral("'It\\'s a test'")).toBe("It's a test");
      expect(handler.parseLiteral('"Say \\"hello\\""')).toBe('Say "hello"');
      expect(handler.parseLiteral('`Use \\`backticks\\``')).toBe('Use `backticks`');
    });

    it('should preserve whitespace', () => {
      expect(handler.parseLiteral('"  hello  world  "')).toBe('  hello  world  ');
      expect(handler.parseLiteral("'  hello  world  '")).toBe('  hello  world  ');
      expect(handler.parseLiteral('`  hello  world  `')).toBe('  hello  world  ');
    });

    it('should preserve newlines in backtick strings', () => {
      expect(handler.parseLiteral('`line1\nline2`')).toBe('line1\nline2');
    });

    it('should reject newlines in single/double quoted strings', () => {
      expect(() => handler.parseLiteral("'line1\nline2'")).toThrow(ResolutionError);
      expect(() => handler.parseLiteral('"line1\nline2"')).toThrow(ResolutionError);
    });

    it('should preserve special characters', () => {
      expect(handler.parseLiteral('"$!@#%^&*()"')).toBe('$!@#%^&*()');
      expect(handler.parseLiteral("'$!@#%^&*()'")).toBe('$!@#%^&*()');
      expect(handler.parseLiteral('`$!@#%^&*()`')).toBe('$!@#%^&*()');
    });

    it('should handle escaped characters', () => {
      expect(handler.parseLiteral('"\\n\\t\\r"')).toBe('\\n\\t\\r');
      expect(handler.parseLiteral("'\\n\\t\\r'")).toBe('\\n\\t\\r');
      expect(handler.parseLiteral('`\\n\\t\\r`')).toBe('\\n\\t\\r');
    });

    it('should throw on invalid input', () => {
      expect(() => handler.parseLiteral('invalid')).toThrow(ResolutionError);
      expect(() => handler.parseLiteral('')).toThrow(ResolutionError);
      expect(() => handler.parseLiteral('""')).toThrow(ResolutionError);
    });
  });
}); 