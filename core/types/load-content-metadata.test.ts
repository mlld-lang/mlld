import { describe, it, expect } from 'vitest';
import type { ArrayVariable } from '@core/types/variable/VariableTypes';
import { isRenamedContentArray, isLoadContentResultArray } from './load-content';
import { extractVariableValue } from '@interpreter/utils/variable-migration';
import { LoadContentResultImpl } from '@interpreter/eval/load-content';

describe('Type Guards with Variable Metadata', () => {
  describe('isRenamedContentArray', () => {
    it('should detect arrays tagged with RenamedContentArray metadata', () => {
      const items = ['Section 1', 'Section 2'];
      const customToString = function() {
        return items.join('\n\n');
      };

      const variable: ArrayVariable = {
        type: 'array',
        name: 'renamed-content',
        value: items,
        source: {
          directive: 'var',
          syntax: 'array',
          hasInterpolation: false,
          isMultiLine: false
        },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        ctx: {},
        internal: {
          arrayType: 'renamed-content',
          customToString
        }
      };

      const taggedArray = extractVariableValue(variable);

      // Should detect via metadata
      expect(isRenamedContentArray(taggedArray)).toBe(true);
    });

    it('should not match regular string arrays', () => {
      const regularArray = ['hello', 'world'];
      expect(isRenamedContentArray(regularArray)).toBe(false);
    });

    it('should not match untagged arrays', () => {
      const untaggedArray = ['Section 1', 'Section 2'];
      expect(isRenamedContentArray(untaggedArray)).toBe(false);
    });
  });

  describe('isLoadContentResultArray', () => {
    it('should detect arrays tagged with LoadContentResultArray metadata', () => {
      const items = [
        new LoadContentResultImpl({
          content: 'File content',
          filename: 'file.md',
          relative: './file.md',
          absolute: '/path/to/file.md'
        })
      ];

      const variable: ArrayVariable = {
        type: 'array',
        name: 'load-content-result',
        value: items,
        source: {
          directive: 'var',
          syntax: 'array',
          hasInterpolation: false,
          isMultiLine: false
        },
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        ctx: {},
        internal: {
          arrayType: 'load-content-result'
        }
      };

      const taggedArray = extractVariableValue(variable);

      // Should detect via metadata
      expect(isLoadContentResultArray(taggedArray)).toBe(true);
    });

    it('should still detect actual LoadContentResult arrays', () => {
      const items = [
        new LoadContentResultImpl({
          content: 'File content',
          filename: 'file.md',
          relative: './file.md',
          absolute: '/path/to/file.md'
        })
      ];

      // Should still work with untagged arrays that contain LoadContentResult objects
      expect(isLoadContentResultArray(items)).toBe(true);
    });

    it('should not match regular arrays', () => {
      const regularArray = [{ content: 'test' }];
      expect(isLoadContentResultArray(regularArray)).toBe(false);
    });
  });
});