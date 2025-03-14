import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DataResolver } from './DataResolver.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { MeldNode } from '@core/syntax/types';
import { createTestText, createTestDirective } from '@tests/utils/nodeFactories.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { MeldError } from '@core/errors/MeldError.js';
import { 
  ErrorCollector, 
  expectThrowsWithSeverity, 
  expectWarningsInPermissiveMode,
  createStrictModeOptions,
  createPermissiveModeOptions,
  ErrorModeTestOptions
} from '@tests/utils/ErrorTestUtils.js';

/**
 * Helper function to mimic the InterpreterService's error handling in permissive mode
 */
async function resolveWithPermissiveErrorHandling(
  resolver: DataResolver,
  node: MeldNode,
  context: ResolutionContext,
  errorHandler: (error: MeldError) => void
): Promise<string> {
  try {
    return await resolver.resolve(node, context);
  } catch (error) {
    if (error instanceof MeldError && error.severity === ErrorSeverity.Recoverable) {
      // In permissive mode, handle recoverable errors
      errorHandler(error);
      return ''; // Return empty string for recoverable errors
    }
    // Re-throw fatal errors
    throw error;
  }
}

describe('DataResolver', () => {
  let resolver: DataResolver;
  let stateService: IStateService;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = {
      getDataVar: vi.fn(),
      setDataVar: vi.fn(),
    } as unknown as IStateService;

    resolver = new DataResolver(stateService);

    context = {
      currentFilePath: 'test.meld',
      allowedVariableTypes: {
        text: true,
        data: true,
        path: true,
        command: true
      },
      allowDataFields: true,
      state: stateService
    };
  });

  describe('resolve', () => {
    it('should return content of text node unchanged', async () => {
      const node = createTestText('test');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('test');
    });

    it('should resolve data directive node', async () => {
      const node = createTestDirective('data', 'data', 'value');
      stateService.getDataVar.mockResolvedValue('value');
      const result = await resolver.resolve(node, context);
      expect(result).toBe('value');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should convert objects to JSON strings', async () => {
      const node = createTestDirective('data', 'data', '{ "test": "value" }');
      stateService.getDataVar.mockResolvedValue({ test: 'value' });
      const result = await resolver.resolve(node, context);
      expect(result).toBe('{"test":"value"}');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });

    it('should handle null values', async () => {
      const node = createTestDirective('data', 'data', 'null');
      stateService.getDataVar.mockResolvedValue(null);
      const result = await resolver.resolve(node, context);
      expect(result).toBe('null');
      expect(stateService.getDataVar).toHaveBeenCalledWith('data');
    });
  });

  describe('error handling', () => {
    it('should throw when data variables are not allowed', async () => {
      context.allowedVariableTypes.data = false;
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow('Data variables are not allowed in this context');
    });

    it('should handle undefined variables appropriately', async () => {
      // Arrange
      stateService.getDataVar.mockResolvedValue(undefined);
      const node = createTestDirective('data', 'undefined', '');
      
      // Act & Assert - Strict mode
      await expectThrowsWithSeverity(
        () => resolver.resolve(node, { ...context, strict: true }),
        MeldResolutionError,
        ErrorSeverity.Recoverable
      );
      
      // Act & Assert - Permissive mode
      const collector = new ErrorCollector();
      
      // Use our wrapper function to mimic the InterpreterService's error handling
      const result = await resolveWithPermissiveErrorHandling(
        resolver,
        node,
        { ...context, strict: false },
        collector.handleError
      );
      
      // Should return empty string
      expect(result).toBe('');
      
      // Should have collected a warning
      expect(collector.warnings.length).toBe(1);
      expect(collector.warnings[0]).toBeInstanceOf(MeldResolutionError);
      expect(collector.warnings[0].severity).toBe(ErrorSeverity.Recoverable);
    });

    it('should handle field access appropriately', async () => {
      // Arrange
      stateService.getDataVar.mockResolvedValue({ field: 'value' });
      
      // Create a node with field access
      const node = createTestDirective('data', 'data', '');
      (node as any).directive.field = 'field';
      
      // Act & Assert
      // Test valid field access
      const result = await resolver.resolve(node, context);
      expect(result).toBe('value');
      
      // Test non-existent field access in strict mode
      (node as any).directive.field = 'nonexistent';
      
      await expectThrowsWithSeverity(
        () => resolver.resolve(node, { ...context, strict: true }),
        MeldResolutionError,
        ErrorSeverity.Recoverable
      );
      
      // Test non-existent field access in permissive mode
      const collector = new ErrorCollector();
      
      // Use our wrapper function to mimic the InterpreterService's error handling
      const permissiveResult = await resolveWithPermissiveErrorHandling(
        resolver,
        node,
        { ...context, strict: false },
        collector.handleError
      );
      
      // Should return empty string
      expect(permissiveResult).toBe('');
      
      // Should have collected a warning
      expect(collector.warnings.length).toBe(1);
      expect(collector.warnings[0]).toBeInstanceOf(MeldResolutionError);
      expect(collector.warnings[0].severity).toBe(ErrorSeverity.Recoverable);
    });

    it('should handle null/undefined field access appropriately', async () => {
      // Arrange
      stateService.getDataVar.mockResolvedValue({ 
        nullField: null, 
        undefinedField: undefined 
      });
      
      // Test null field access
      const node = createTestDirective('data', 'data', '');
      (node as any).directive.field = 'nullField';
      
      // Null fields should resolve to "null"
      const nullResult = await resolver.resolve(node, context);
      expect(nullResult).toBe('null');
      
      // Test undefined field access
      (node as any).directive.field = 'undefinedField';
      
      await expectThrowsWithSeverity(
        () => resolver.resolve(node, { ...context, strict: true }),
        MeldResolutionError,
        ErrorSeverity.Recoverable
      );
      
      // Test undefined field access in permissive mode
      const collector = new ErrorCollector();
      
      // Use our wrapper function to mimic the InterpreterService's error handling
      const permissiveResult = await resolveWithPermissiveErrorHandling(
        resolver,
        node,
        { ...context, strict: false },
        collector.handleError
      );
      
      // Should return empty string
      expect(permissiveResult).toBe('');
      
      // Should have collected a warning
      expect(collector.warnings.length).toBe(1);
      expect(collector.warnings[0]).toBeInstanceOf(MeldResolutionError);
      expect(collector.warnings[0].severity).toBe(ErrorSeverity.Recoverable);
    });

    it('should handle accessing field of non-object', async () => {
      // Arrange
      stateService.getDataVar.mockResolvedValue({ 
        stringField: 'string', 
        numberField: 42 
      });
      
      // Test string field access
      const node = createTestDirective('data', 'data', '');
      (node as any).directive.field = 'stringField';
      
      // Primitive values should be returned as strings
      const stringResult = await resolver.resolve(node, context);
      expect(stringResult).toBe('string');
      
      // Test number field access
      (node as any).directive.field = 'numberField';
      
      // Numbers should be converted to strings
      const numberResult = await resolver.resolve(node, context);
      expect(numberResult).toBe('42');
    });
  });

  describe('extractReferences', () => {
    it('should extract variable identifier from data directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'data',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual(['test']);
    });

    it('should return empty array for non-data directive', async () => {
      const node: MeldNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'test',
          value: ''
        }
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });

    it('should return empty array for text node', async () => {
      const node: MeldNode = {
        type: 'Text',
        content: 'no references here'
      };
      const refs = resolver.extractReferences(node);
      expect(refs).toEqual([]);
    });
  });
}); 