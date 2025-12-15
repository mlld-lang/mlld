import { describe, it, expect } from 'vitest';
import {
  isLoadContentResult,
  isLoadContentResultURL,
  isLoadContentResultHTML
} from './load-content';

describe('Load Content Type Guards', () => {
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
});
