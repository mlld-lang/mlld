import { describe, it, expect } from 'vitest';
import { validateFuzzyThreshold } from './FuzzyMatchingValidator.js';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError.js';
import { createEmbedDirective, createLocation } from '@tests/utils/testFactories.js';

describe('FuzzyMatchingValidator', () => {
  describe('Fuzzy threshold validation', () => {
    it('should accept valid fuzzy thresholds', () => {
      const validThresholds = [0, 0.5, 0.8, 1];
      
      for (const threshold of validThresholds) {
        const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
        node.directive.fuzzy = threshold;
        expect(() => validateFuzzyThreshold(node)).not.toThrow();
      }
    });

    it.todo('should reject fuzzy thresholds below 0 - Edge case validation deferred for V1');

    it.todo('should reject fuzzy thresholds above 1 - Edge case validation deferred for V1');

    it.todo('should reject non-numeric fuzzy thresholds - Edge case validation deferred for V1');

    it('should handle missing fuzzy threshold (undefined is valid)', () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      // Don't set fuzzy threshold
      expect(() => validateFuzzyThreshold(node)).not.toThrow();
    });

    it.todo('should provide helpful error messages - Detailed error messaging deferred for V1');
  });
}); 