import { describe, it, expect } from 'vitest';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { wrapLoadContentValue } from '@interpreter/utils/load-content-structured';

/**
 * MIGRATION COMPARISON TEST SUITE
 *
 * This test suite captures EXACT current array interpolation behavior BEFORE
 * Phase 2.3 migration work. These tests must PASS both before and after the migration.
 *
 * Purpose: Detect any regressions when updating interpolation.ts to work with
 * StructuredValue arrays instead of checking for specific array types.
 *
 * Strategy: Test the core asText() behavior directly with different array types,
 * since that's what interpolation.ts uses to convert arrays to strings.
 *
 * DO NOT modify these tests during migration - they are the "golden master" reference.
 */
describe('Array Interpolation Migration - Comparison Tests', () => {
  describe('asText() behavior with LoadContentResult arrays', () => {
    it('should join LoadContentResult array items with \\n\\n separator', () => {
      const array = [
        wrapLoadContentValue({
          content: 'Content 1',
          filename: 'file1.md',
          relative: './file1.md',
          absolute: '/file1.md'
        }),
        wrapLoadContentValue({
          content: 'Content 2',
          filename: 'file2.md',
          relative: './file2.md',
          absolute: '/file2.md'
        }),
        wrapLoadContentValue({
          content: 'Content 3',
          filename: 'file3.md',
          relative: './file3.md',
          absolute: '/file3.md'
        })
      ];

      const result = asText(array);

      expect(result).toBe('Content 1\n\nContent 2\n\nContent 3');
    });

    it('should handle empty LoadContentResult arrays', () => {
      const array: any[] = [];

      const result = asText(array);

      expect(result).toBe('');
    });

    it('should handle single-item LoadContentResult arrays', () => {
      const array = [
        wrapLoadContentValue({
          content: 'Single content',
          filename: 'single.md',
          relative: './single.md',
          absolute: '/single.md'
        })
      ];

      const result = asText(array);

      expect(result).toBe('Single content');
    });
  });

  describe('asText() behavior with StructuredValue LoadContentResultArray type', () => {
    it('should extract and join LoadContentResultArray StructuredValue', () => {
      const array = [
        wrapLoadContentValue({
          content: 'Item 1',
          filename: 'item1.md',
          relative: './item1.md',
          absolute: '/item1.md'
        }),
        wrapLoadContentValue({
          content: 'Item 2',
          filename: 'item2.md',
          relative: './item2.md',
          absolute: '/item2.md'
        })
      ];

      // Wrap in StructuredValue with LoadContentResultArray type
      const structuredValue = {
        type: 'LoadContentResultArray' as const,
        data: array,
        text: '', // Will be computed
        ctx: {}
      };

      const result = asText(structuredValue);

      expect(result).toBe('Item 1\n\nItem 2');
    });
  });

  describe('asText() behavior with renamed content arrays', () => {
    it('should handle renamed content arrays with string items', () => {
      // Renamed content arrays are just arrays of strings
      const array = ['filename1.md', 'filename2.md', 'filename3.md'];
      (array as any).__arrayType = 'renamed-content';

      const result = asText(array);

      expect(result).toBe('filename1.md\n\nfilename2.md\n\nfilename3.md');
    });

    it('should handle renamed content arrays with content property', () => {
      const array = ['- item1.md', '- item2.md'];
      (array as any).__arrayType = 'renamed-content';
      (array as any).content = '- item1.md\n\n- item2.md';

      const result = asText(array);

      expect(result).toBe('- item1.md\n\n- item2.md');
    });
  });

  describe('asText() behavior with mixed StructuredValue types', () => {
    it('should handle StructuredValue with text type', () => {
      const value = {
        type: 'text' as const,
        text: 'Simple text',
        data: 'Simple text',
        ctx: {}
      };

      const result = asText(value);

      expect(result).toBe('Simple text');
    });

    it('should handle StructuredValue with json type', () => {
      const value = {
        type: 'json' as const,
        data: { key: 'value' },
        text: '{"key":"value"}',
        ctx: {}
      };

      const result = asText(value);

      expect(result).toBe('{"key":"value"}');
    });

    it('should verify isStructuredValue works correctly', () => {
      const value = {
        type: 'text' as const,
        text: 'Test',
        data: 'Test',
        ctx: {}
      };

      expect(isStructuredValue(value)).toBe(true);
      expect(isStructuredValue('plain string')).toBe(false);
      expect(isStructuredValue(null)).toBe(false);
      expect(isStructuredValue(undefined)).toBe(false);
    });
  });

  describe('Array type detection for migration', () => {
    it('should detect LoadContentResult items in arrays', async () => {
      const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');

      const item = wrapLoadContentValue({
        content: 'Test',
        filename: 'test.md',
        relative: './test.md',
        absolute: '/test.md'
      });

      expect(isStructuredValue(item)).toBe(true);
      expect(isLoadContentResult(item)).toBe(true);

      const array = [item];
      expect(isLoadContentResultArray(array)).toBe(true);
    });

    it('should detect renamed content arrays', async () => {
      const { isRenamedContentArray } = await import('@core/types/load-content');

      const array = ['name1.md', 'name2.md'];
      (array as any).__arrayType = 'renamed-content';

      expect(isRenamedContentArray(array)).toBe(true);
    });
  });
});
