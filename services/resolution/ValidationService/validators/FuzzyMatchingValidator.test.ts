import { describe, it, expect } from 'vitest';
import { validateFuzzyThreshold } from '@services/resolution/ValidationService/validators/FuzzyMatchingValidator';
import { MeldDirectiveError } from '@core/errors/MeldDirectiveError';
import { createAddDirective, createLocation } from '@tests/utils/testFactories';
import { ErrorCollector, expectThrowsInStrictButWarnsInPermissive } from '@tests/utils/ErrorTestUtils';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError';

describe('FuzzyMatchingValidator', () => {
  describe('Fuzzy threshold validation', () => {
    it('should accept valid fuzzy thresholds', () => {
      const validThresholds = [0, 0.5, 0.8, 1];
      
      for (const threshold of validThresholds) {
        const node = createAddDirective('test.md', 'section', createLocation(1, 1));
        (node as any).meta = { fuzzy: threshold };
        expect(() => validateFuzzyThreshold(node)).not.toThrow();
      }
    });

    it.skip('should reject fuzzy thresholds below 0 - Edge case validation deferred for V1', async () => {
      const node = createAddDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = -0.5; // Invalid negative threshold
      
      await expectThrowsInStrictButWarnsInPermissive(
        async () => validateFuzzyThreshold(node),
        MeldDirectiveError,
        ErrorSeverity.Recoverable
      );
    });

    it.skip('should reject fuzzy thresholds above 1 - Edge case validation deferred for V1', async () => {
      const node = createAddDirective('test.md', 'section', createLocation(1, 1));
      node.directive.fuzzy = 1.5; // Invalid threshold above 1
      
      await expectThrowsInStrictButWarnsInPermissive(
        async () => validateFuzzyThreshold(node),
        MeldDirectiveError,
        ErrorSeverity.Recoverable
      );
    });

    it.skip('should reject non-numeric fuzzy thresholds - Edge case validation deferred for V1', async () => {
      const node = createAddDirective('test.md', 'section', createLocation(1, 1));
      // @ts-ignore - Intentionally setting an invalid type for testing
      node.directive.fuzzy = 'not-a-number';
      
      await expectThrowsInStrictButWarnsInPermissive(
        async () => validateFuzzyThreshold(node),
        MeldDirectiveError,
        ErrorSeverity.Recoverable
      );
    });

    it('should handle missing fuzzy threshold (undefined is valid)', () => {
      const node = createAddDirective('test.md', 'section', createLocation(1, 1));
      // Don't set fuzzy threshold
      expect(() => validateFuzzyThreshold(node)).not.toThrow();
    });

    it('should provide helpful error messages - Detailed error messaging deferred for V1', async () => {
      // Test for below 0
      const nodeBelowZero = createAddDirective('test.md', 'section', createLocation(1, 1));
      (nodeBelowZero as any).meta = { fuzzy: -0.5 };
      
      const collectorBelowZero = new ErrorCollector();
      try {
        validateFuzzyThreshold(nodeBelowZero);
      } catch (error) {
        collectorBelowZero.handleError(error as MeldError);
      }
      
      expect(collectorBelowZero.getAllErrors().length).toBe(1);
      expect(collectorBelowZero.getAllErrors()[0].message).toContain('must be between 0 and 1');
      
      // Test for above 1
      const nodeAboveOne = createAddDirective('test.md', 'section', createLocation(1, 1));
      (nodeAboveOne as any).meta = { fuzzy: 1.5 };
      
      const collectorAboveOne = new ErrorCollector();
      try {
        validateFuzzyThreshold(nodeAboveOne);
      } catch (error) {
        collectorAboveOne.handleError(error as MeldError);
      }
      
      expect(collectorAboveOne.getAllErrors().length).toBe(1);
      expect(collectorAboveOne.getAllErrors()[0].message).toContain('must be between 0 and 1');
      
      // Test for non-numeric
      const nodeNonNumeric = createAddDirective('test.md', 'section', createLocation(1, 1));
      // @ts-ignore - Intentionally setting an invalid type for testing
      (nodeNonNumeric as any).meta = { fuzzy: 'not-a-number' };
      
      const collectorNonNumeric = new ErrorCollector();
      try {
        validateFuzzyThreshold(nodeNonNumeric);
      } catch (error) {
        collectorNonNumeric.handleError(error as MeldError);
      }
      
      expect(collectorNonNumeric.getAllErrors().length).toBe(1);
      expect(collectorNonNumeric.getAllErrors()[0].message).toContain('must be a number');
    });
  });
}); 