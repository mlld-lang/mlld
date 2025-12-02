import { describe, it, expect } from 'vitest';
import {
  extractPath,
  extractWithFallback,
  extractFields,
  hasPath,
  getPathOr
} from '@interpreter/streaming/jsonpath';

describe('jsonpath', () => {
  describe('extractPath', () => {
    it('should extract simple keys', () => {
      const obj = { name: 'Alice', age: 30 };
      expect(extractPath(obj, 'name')).toBe('Alice');
      expect(extractPath(obj, 'age')).toBe(30);
    });

    it('should extract nested keys', () => {
      const obj = { user: { profile: { name: 'Bob' } } };
      expect(extractPath(obj, 'user.profile.name')).toBe('Bob');
    });

    it('should extract array indices', () => {
      const obj = { items: ['a', 'b', 'c'] };
      expect(extractPath(obj, 'items[0]')).toBe('a');
      expect(extractPath(obj, 'items[2]')).toBe('c');
    });

    it('should extract nested array values', () => {
      const obj = { content: [{ text: 'hello' }, { text: 'world' }] };
      expect(extractPath(obj, 'content[0].text')).toBe('hello');
      expect(extractPath(obj, 'content[1].text')).toBe('world');
    });

    it('should iterate arrays with []', () => {
      const obj = { items: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] };
      expect(extractPath(obj, 'items[].name')).toEqual(['a', 'b', 'c']);
    });

    it('should handle missing paths', () => {
      const obj = { a: { b: 1 } };
      expect(extractPath(obj, 'a.c')).toBeNull();
      expect(extractPath(obj, 'x.y.z')).toBeNull();
    });

    it('should return null for missing paths by default', () => {
      const obj = { a: 1 };
      expect(extractPath(obj, 'missing')).toBeNull();
    });

    it('should return undefined when requested', () => {
      const obj = { a: 1 };
      expect(extractPath(obj, 'b', { returnUndefined: true })).toBeUndefined();
    });

    it('should handle null input', () => {
      expect(extractPath(null, 'a')).toBeNull();
      expect(extractPath(undefined, 'a')).toBeNull();
    });
  });

  describe('extractWithFallback', () => {
    it('should use first matching path', () => {
      const obj = { primary: 'value' };
      expect(extractWithFallback(obj, ['primary', 'fallback'])).toBe('value');
    });

    it('should fall back to secondary path', () => {
      const obj = { fallback: 'backup' };
      expect(extractWithFallback(obj, ['primary', 'fallback'])).toBe('backup');
    });

    it('should handle single path', () => {
      const obj = { key: 'value' };
      expect(extractWithFallback(obj, 'key')).toBe('value');
    });

    it('should return null when no path matches', () => {
      const obj = { other: 'value' };
      expect(extractWithFallback(obj, ['a', 'b', 'c'])).toBeNull();
    });
  });

  describe('extractFields', () => {
    it('should extract multiple fields', () => {
      const obj = {
        user: { name: 'Alice' },
        data: { value: 42 }
      };

      const result = extractFields(obj, {
        name: 'user.name',
        value: 'data.value'
      });

      expect(result).toEqual({ name: 'Alice', value: 42 });
    });

    it('should handle fallback paths in fields', () => {
      const obj = { backup: 'value' };

      const result = extractFields(obj, {
        field: ['primary', 'backup']
      });

      expect(result).toEqual({ field: 'value' });
    });

    it('should omit missing fields when using returnUndefined option', () => {
      const obj = { existing: 'value' };

      const result = extractFields(obj, {
        existing: 'existing',
        missing: 'nonexistent'
      }, { returnUndefined: true });

      expect(result).toEqual({ existing: 'value' });
      expect('missing' in result).toBe(false);
    });

    it('should include null for missing fields by default', () => {
      const obj = { existing: 'value' };

      const result = extractFields(obj, {
        existing: 'existing',
        missing: 'nonexistent'
      });

      expect(result.existing).toBe('value');
      expect(result.missing).toBeNull();
    });
  });

  describe('hasPath', () => {
    it('should return true for existing paths', () => {
      const obj = { a: { b: { c: 1 } } };
      expect(hasPath(obj, 'a')).toBe(true);
      expect(hasPath(obj, 'a.b')).toBe(true);
      expect(hasPath(obj, 'a.b.c')).toBe(true);
    });

    it('should return false for missing paths', () => {
      const obj = { a: 1 };
      expect(hasPath(obj, 'b')).toBe(false);
      expect(hasPath(obj, 'a.b')).toBe(false);
    });

    it('should handle null/undefined values', () => {
      const obj: Record<string, unknown> = { a: null };
      expect(hasPath(obj, 'a')).toBe(true);
      // Note: undefined values are still considered "present" if the key exists
      obj.b = undefined;
      expect(hasPath(obj, 'b')).toBe(true);
    });
  });

  describe('getPathOr', () => {
    it('should return value if path exists', () => {
      const obj = { a: { b: 42 } };
      expect(getPathOr(obj, 'a.b', 0)).toBe(42);
    });

    it('should return default if path missing', () => {
      const obj = { a: 1 };
      expect(getPathOr(obj, 'b', 'default')).toBe('default');
      expect(getPathOr(obj, 'a.b.c', [])).toEqual([]);
    });
  });

  describe('real-world patterns', () => {
    it('should extract Claude SDK response fields', () => {
      const response = {
        type: 'content_block_delta',
        index: 0,
        delta: {
          type: 'text_delta',
          text: 'Hello'
        }
      };

      expect(extractPath(response, 'delta.text')).toBe('Hello');
      expect(extractPath(response, 'type')).toBe('content_block_delta');
    });

    it('should extract from content array', () => {
      const response = {
        type: 'message',
        content: [
          { type: 'text', text: 'First' },
          { type: 'text', text: 'Second' }
        ]
      };

      expect(extractPath(response, 'content[0].text')).toBe('First');
      expect(extractPath(response, 'content[].text')).toEqual(['First', 'Second']);
    });

    it('should handle usage metadata', () => {
      const response = {
        type: 'message_delta',
        usage: {
          input_tokens: 100,
          output_tokens: 50
        }
      };

      const fields = extractFields(response, {
        inputTokens: ['usage.input_tokens', 'input_tokens'],
        outputTokens: ['usage.output_tokens', 'output_tokens']
      });

      expect(fields).toEqual({ inputTokens: 100, outputTokens: 50 });
    });
  });
});
