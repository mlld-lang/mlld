import { describe, it, expect } from 'vitest';
import { MeldError, ErrorSeverity } from '@core/errors/MeldError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { 
  ErrorCollector,
  expectErrorSeverity,
  expectErrorTypeAndSeverity,
  expectThrowsWithSeverity,
  expectWarningsInPermissiveMode,
  expectThrowsInStrictButWarnsInPermissive,
  expectDirectiveErrorWithCode,
  expectResolutionErrorWithDetails,
  createStrictModeOptions,
  createPermissiveModeOptions,
  ErrorModeTestOptions
} from '../ErrorTestUtils.js';

describe('ErrorTestUtils', () => {
  describe('ErrorCollector', () => {
    it('should collect errors and warnings', () => {
      const collector = new ErrorCollector();
      
      const fatalError = new MeldError('Fatal error', { severity: ErrorSeverity.Fatal });
      const recoverableError = new MeldError('Recoverable error', { severity: ErrorSeverity.Recoverable });
      const warningError = new MeldError('Warning', { severity: ErrorSeverity.Warning });
      
      collector.handleError(fatalError);
      collector.handleError(recoverableError);
      collector.handleError(warningError);
      
      expect(collector.errors).toHaveLength(1);
      expect(collector.warnings).toHaveLength(2);
      expect(collector.getAllErrors()).toHaveLength(3);
    });
    
    it('should filter errors by type', () => {
      const collector = new ErrorCollector();
      
      collector.handleError(new MeldError('Generic error', { severity: ErrorSeverity.Fatal }));
      collector.handleError(new MeldResolutionError('Resolution error', { severity: ErrorSeverity.Recoverable }));
      collector.handleError(new DirectiveError('Directive error', 'test', DirectiveErrorCode.VALIDATION_FAILED));
      
      expect(collector.getErrorsOfType(MeldResolutionError)).toHaveLength(1);
      expect(collector.getWarningsOfType(DirectiveError)).toHaveLength(1);
    });
    
    it('should reset correctly', () => {
      const collector = new ErrorCollector();
      
      collector.handleError(new MeldError('Error', { severity: ErrorSeverity.Fatal }));
      collector.handleError(new MeldError('Warning', { severity: ErrorSeverity.Warning }));
      
      expect(collector.getAllErrors()).toHaveLength(2);
      
      collector.reset();
      
      expect(collector.errors).toHaveLength(0);
      expect(collector.warnings).toHaveLength(0);
      expect(collector.getAllErrors()).toHaveLength(0);
    });
  });
  
  describe('Test Options', () => {
    it('should create strict mode options', () => {
      const options = createStrictModeOptions();
      expect(options.strict).toBe(true);
      expect(options.errorHandler).toBeUndefined();
    });
    
    it('should create permissive mode options with collector', () => {
      const collector = new ErrorCollector();
      const options = createPermissiveModeOptions(collector);
      
      expect(options.strict).toBe(false);
      expect(options.errorHandler).toBeDefined();
      
      // Test the error handler
      options.errorHandler!(new MeldError('Test', { severity: ErrorSeverity.Recoverable }));
      expect(collector.warnings).toHaveLength(1);
    });
  });
  
  describe('Assertion Helpers', () => {
    it('should check error severity', () => {
      const error = new MeldError('Test', { severity: ErrorSeverity.Recoverable });
      expectErrorSeverity(error, ErrorSeverity.Recoverable);
      
      // This would fail
      // expectErrorSeverity(error, ErrorSeverity.Fatal);
    });
    
    it('should check error type and severity', () => {
      const error = new MeldResolutionError('Test', { severity: ErrorSeverity.Recoverable });
      expectErrorTypeAndSeverity(error, MeldResolutionError, ErrorSeverity.Recoverable);
      
      // These would fail
      // expectErrorTypeAndSeverity(error, DirectiveError, ErrorSeverity.Recoverable);
      // expectErrorTypeAndSeverity(error, MeldResolutionError, ErrorSeverity.Fatal);
    });
    
    it('should check DirectiveError with code', () => {
      const error = new DirectiveError(
        'Test', 
        'test-kind', 
        DirectiveErrorCode.VALIDATION_FAILED
      );
      
      expectDirectiveErrorWithCode(error, DirectiveErrorCode.VALIDATION_FAILED, ErrorSeverity.Recoverable);
      
      // These would fail
      // expectDirectiveErrorWithCode(error, DirectiveErrorCode.EXECUTION_FAILED, ErrorSeverity.Recoverable);
      // expectDirectiveErrorWithCode(error, DirectiveErrorCode.VALIDATION_FAILED, ErrorSeverity.Fatal);
    });
    
    it('should check ResolutionError with details', () => {
      const error = new MeldResolutionError('Test', { 
        severity: ErrorSeverity.Recoverable,
        details: {
          variableName: 'test',
          variableType: 'text'
        }
      });
      
      expectResolutionErrorWithDetails(error, {
        variableName: 'test',
        variableType: 'text'
      });
      
      // This would fail
      // expectResolutionErrorWithDetails(error, { variableName: 'wrong' });
    });
  });
  
  describe('Async Assertion Helpers', () => {
    it('should check if function throws with severity', async () => {
      const throwingFn = () => {
        throw new MeldResolutionError('Test', { severity: ErrorSeverity.Fatal });
      };
      
      await expectThrowsWithSeverity(
        throwingFn,
        MeldResolutionError,
        ErrorSeverity.Fatal
      );
      
      // These would fail
      // await expectThrowsWithSeverity(throwingFn, DirectiveError, ErrorSeverity.Fatal);
      // await expectThrowsWithSeverity(throwingFn, MeldResolutionError, ErrorSeverity.Recoverable);
    });
    
    it('should check warnings in permissive mode', async () => {
      const fn = (options: ErrorModeTestOptions) => {
        if (options.errorHandler) {
          options.errorHandler(new MeldResolutionError('Test', { severity: ErrorSeverity.Recoverable }));
        } else if (options.strict) {
          throw new MeldResolutionError('Test', { severity: ErrorSeverity.Recoverable });
        }
      };
      
      await expectWarningsInPermissiveMode(fn, MeldResolutionError);
      
      // This would fail
      // await expectWarningsInPermissiveMode(fn, DirectiveError);
    });
    
    it('should check behavior in both modes', async () => {
      const fn = (options: ErrorModeTestOptions) => {
        if (options.errorHandler) {
          options.errorHandler(new MeldResolutionError('Test', { severity: ErrorSeverity.Recoverable }));
        } else if (options.strict) {
          throw new MeldResolutionError('Test', { severity: ErrorSeverity.Recoverable });
        }
      };
      
      await expectThrowsInStrictButWarnsInPermissive(fn, MeldResolutionError);
      
      // This would fail
      // await expectThrowsInStrictButWarnsInPermissive(fn, DirectiveError);
    });
  });
}); 