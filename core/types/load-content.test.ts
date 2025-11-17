import { describe, it, expect } from 'vitest';
import { 
  isRenamedContentArray, 
  isLoadContentResult, 
  isLoadContentResultArray,
  isLoadContentResultURL,
  isLoadContentResultHTML
} from './load-content';
import type { ArrayVariable } from '@core/types/variable/VariableTypes';

describe('Load Content Type Guards', () => {
  describe('isRenamedContentArray', () => {
    it('should identify arrays tagged with renamed-content metadata', () => {
      const array = ['content1', 'content2'];
      
      // Tag with __variable metadata
      const variable: Partial<ArrayVariable> = {
        type: 'array',
        internal: {
          arrayType: 'renamed-content'
        }
      };
      
      Object.defineProperty(array, '__variable', {
        value: variable,
        enumerable: false
      });
      
      expect(isRenamedContentArray(array)).toBe(true);
    });
    
    it('should not identify regular string arrays as RenamedContentArray', () => {
      const regularArray = ['hello', 'world'];
      expect(isRenamedContentArray(regularArray)).toBe(false);
    });
    
    it('should not identify arrays with different arrayType metadata', () => {
      const array = ['content1', 'content2'];
      
      // Tag with different arrayType
      const variable: Partial<ArrayVariable> = {
        type: 'array',
        internal: {
          arrayType: 'load-content-result'
        }
      };
      
      Object.defineProperty(array, '__variable', {
        value: variable,
        enumerable: false
      });
      
      expect(isRenamedContentArray(array)).toBe(false);
    });
    
    it('should not identify non-arrays', () => {
      expect(isRenamedContentArray('string')).toBe(false);
      expect(isRenamedContentArray(123)).toBe(false);
      expect(isRenamedContentArray({})).toBe(false);
      expect(isRenamedContentArray(null)).toBe(false);
      expect(isRenamedContentArray(undefined)).toBe(false);
    });
    
    it('should not identify arrays with non-string content', () => {
      const mixedArray = ['string', 123, true];
      expect(isRenamedContentArray(mixedArray)).toBe(false);
      
      const numberArray = [1, 2, 3];
      expect(isRenamedContentArray(numberArray)).toBe(false);
    });
  });
  
  describe('isLoadContentResult', () => {
    it('should identify objects with required LoadContentResult properties', () => {
      const result = {
        content: 'file content',
        filename: 'test.md',
        relative: './test.md',
        absolute: '/path/to/test.md'
      };
      
      expect(isLoadContentResult(result)).toBe(true);
    });
    
    it('should not identify objects missing required properties', () => {
      const incomplete1 = { content: 'test' };
      const incomplete2 = { content: 'test', filename: 'test.md' };
      const incomplete3 = { content: 'test', filename: 'test.md', relative: './test.md' };
      
      expect(isLoadContentResult(incomplete1)).toBe(false);
      expect(isLoadContentResult(incomplete2)).toBe(false);
      expect(isLoadContentResult(incomplete3)).toBe(false);
    });
  });
  
  describe('isLoadContentResultArray', () => {
    it('should identify arrays of LoadContentResult objects', () => {
      const results = [
        {
          content: 'file1 content',
          filename: 'file1.md',
          relative: './file1.md',
          absolute: '/path/to/file1.md'
        },
        {
          content: 'file2 content',
          filename: 'file2.md',
          relative: './file2.md',
          absolute: '/path/to/file2.md'
        }
      ];
      
      expect(isLoadContentResultArray(results)).toBe(true);
    });
    
    it('should not identify empty arrays as LoadContentResultArray', () => {
      // Empty arrays are not treated as LoadContentResult arrays to avoid
      // misclassifying generic empty arrays (e.g., for-expression results).
      expect(isLoadContentResultArray([])).toBe(false);
    });
    
    it('should not identify arrays with non-LoadContentResult items', () => {
      const mixed = [
        { content: 'valid', filename: 'test.md', relative: './test.md', absolute: '/test.md' },
        'invalid string'
      ];
      
      expect(isLoadContentResultArray(mixed)).toBe(false);
    });
  });
});
