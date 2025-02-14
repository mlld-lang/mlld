import { describe, it, expect } from 'vitest';
import { validateFuzzyThreshold } from './FuzzyMatchingValidator';
import { MeldDirectiveError } from '../../../core/errors/MeldDirectiveError';
import { createEmbedDirective, createLocation } from '../../../tests/utils/testFactories';

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

    it('should reject fuzzy thresholds below 0', () => {
      const invalidThresholds = [-0.1, -1, -100];
      
      for (const threshold of invalidThresholds) {
        const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
        node.directive.fuzzy = threshold;
        expect(() => validateFuzzyThreshold(node))
          .toThrow(MeldDirectiveError);
      }
    });

    it('should reject fuzzy thresholds above 1', () => {
      const invalidThresholds = [1.1, 2, 100];
      
      for (const threshold of invalidThresholds) {
        const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
        node.directive.fuzzy = threshold;
        expect(() => validateFuzzyThreshold(node))
          .toThrow(MeldDirectiveError);
      }
    });

    it('should reject non-numeric fuzzy thresholds', () => {
      const invalidValues = ['0.5', true, false, null, undefined, {}, []];
      
      for (const value of invalidValues) {
        const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
        node.directive.fuzzy = value as any;
        expect(() => validateFuzzyThreshold(node))
          .toThrow(MeldDirectiveError);
      }
    });

    it('should handle missing fuzzy threshold (undefined is valid)', () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      // Don't set fuzzy threshold
      expect(() => validateFuzzyThreshold(node)).not.toThrow();
    });

    it('should provide helpful error messages', () => {
      const node = createEmbedDirective('test.md', 'section', createLocation(1, 1));
      
      // Test below 0
      node.directive.fuzzy = -0.1;
      expect(() => validateFuzzyThreshold(node))
        .toThrow(/must be between 0 and 1/);
      
      // Test above 1
      node.directive.fuzzy = 1.1;
      expect(() => validateFuzzyThreshold(node))
        .toThrow(/must be between 0 and 1/);
      
      // Test non-numeric
      node.directive.fuzzy = 'invalid' as any;
      expect(() => validateFuzzyThreshold(node))
        .toThrow(/must be a number/);
    });
  });
}); 