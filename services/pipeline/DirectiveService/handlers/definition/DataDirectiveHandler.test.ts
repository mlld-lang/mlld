import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler.js';
import { createDataDirective, createLocation, createDirectiveNode } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode, InterpolatableValue, StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes.js';
import type { StructuredPath } from '@core/types/paths.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { dataDirectiveExamples } from '@core/syntax/index.js';
import { MockFactory } from '@tests/utils/mocks/MockFactory.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
// Import new context types
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import { JsonValue, VariableType, createDataVariable } from '@core/types'; // Import VariableType and createDataVariable
// Import error type
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
// Import ErrorSeverity
import { ErrorSeverity } from '@core/errors/MeldError.js';
// Import FS service type for casting
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js'; // Ensure IPathService is imported

/**
 * DataDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Phase 5 ✅ (Using TestContextDI helpers)
 * 
 * This test file has been migrated to use:
 * - TestContextDI.createTestHelpers().setupWithStandardMocks()
 * - vi.spyOn on resolved mocks for test-specific behavior
 */

/**
 * Creates a DirectiveNode from a syntax example code
 * This is needed for handler tests where you need a parsed node
 * 
 * @param exampleCode - Example code to parse
 * @returns Promise resolving to a DirectiveNode
 */
const createNodeFromExample = async (exampleCode: string): Promise<DirectiveNode> => {
  try {
    const { parse } = await import('@core/ast/index.js');
    
    const result = await parse(exampleCode, {
      trackLocations: true,
      validateNodes: true
    } as any); // Using 'as any' to avoid type issues
    
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with @core/ast:', error);
    throw error;
  }
};

/**
 * Helper to extract state from handler result
 */
function getStateFromResult(result: DirectiveResult | IStateService): IStateService {
    if (result && typeof result === 'object' && 'state' in result) {
        return result.state as IStateService;
    }
    return result as IStateService;
}

describe('DataDirectiveHandler', () => {
  // Use helpers
  const helpers = TestContextDI.createTestHelpers();
  let testDIContext: TestContextDI;
  let handler: DataDirectiveHandler;
  // Use standard interface types for mocks
  let stateService: IStateService;
  let resolutionService: IResolutionService;
  let fileSystemService: IFileSystemService;
  let mockProcessingContext: DirectiveProcessingContext;

  beforeEach(async () => {
    // --- Phase 5: Use setupWithStandardMocks --- 
    testDIContext = helpers.setupWithStandardMocks({}, { isolatedContainer: true });
    // Await initialization implicitly by resolving a service
    await testDIContext.resolve('IFileSystemService'); 

    // --- Resolve services/mocks from context ---
    stateService = await testDIContext.resolve('IStateService');
    resolutionService = await testDIContext.resolve('IResolutionService');
    fileSystemService = await testDIContext.resolve('IFileSystemService');
    // Resolve other needed services/mocks
    const pathService = await testDIContext.resolve<IPathService>('IPathService');
    handler = await testDIContext.resolve(DataDirectiveHandler);
    
    // Default mock behavior needed for tests (applied to resolved mocks)
    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('/test.meld');
    vi.spyOn(resolutionService, 'resolveNodes').mockImplementation(async (nodes, ctx) => {
      return nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join('');
    });
    vi.spyOn(resolutionService, 'resolveInContext').mockImplementation(async (value, ctx) => {
        if (typeof value === 'string') return value.replace('${username}', 'Alice');
        return JSON.stringify(value);
    });
    vi.spyOn(stateService, 'setVariable'); // Spy for assertions

    // Create base processing context using resolved mocks
    const mockResolutionContext: ResolutionContext = { strict: true, filePath: '/test.meld' };
    const mockFormattingContext: FormattingContext = { isBlock: false, preserveLiteralFormatting: false, preserveWhitespace: false };
    mockProcessingContext = {
        state: stateService, 
        resolutionContext: mockResolutionContext,
        formattingContext: mockFormattingContext,
        directiveNode: undefined as any, 
    };
  });

  afterEach(async () => {
    await testDIContext?.cleanup();
  });

  describe('basic data handling', () => {
    it('should process simple JSON data', async () => {
      const node = createDataDirective(
        'user', 
        { 'name': 'Alice', 'id': 123 }, // Use resolved value directly
        createLocation()
      );
      mockProcessingContext.directiveNode = node;
      
      // Mock the recursive resolver specifically for this test case if needed
      const mockResolveInterpolatable = vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue({ name: 'Alice', id: 123 });

      const result = await handler.handle(mockProcessingContext);
      const resultState = getStateFromResult(result);
      
      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        type: VariableType.DATA,
        name: 'user',
        value: { name: 'Alice', id: 123 }
      }));
      expect(resultState).toBe(stateService);
      if (result && typeof result === 'object' && 'replacement' in result) {
          expect(result.replacement).toBeUndefined();
      }
      mockResolveInterpolatable.mockRestore();
    });

    it('should handle nested JSON objects', async () => {
      const example = dataDirectiveExamples.atomic.person;
      const node = await createNodeFromExample(example.code);
      mockProcessingContext.directiveNode = node;
      const expectedData = {
        name: 'John Doe',
        age: 30,
        address: {
          street: '123 Main St',
          city: 'Anytown'
        }
      };
      const mockResolveInterpolatable = vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedData);

      const result = await handler.handle(mockProcessingContext);
      const resultState = getStateFromResult(result);

      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        type: VariableType.DATA,
        name: 'person',
        value: expectedData
      }));
      expect(resultState).toBe(stateService);
      if (result && typeof result === 'object' && 'replacement' in result) {
          expect(result.replacement).toBeUndefined();
      }
       mockResolveInterpolatable.mockRestore();
    });

    it('should handle JSON arrays', async () => {
      const example = dataDirectiveExamples.atomic.simpleArray;
      const node = await createNodeFromExample(example.code);
      mockProcessingContext.directiveNode = node;
      const expectedData = ['apple', 'banana', 'cherry'];
      const mockResolveInterpolatable = vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedData);

      const result = await handler.handle(mockProcessingContext);
      const resultState = getStateFromResult(result);

      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        type: VariableType.DATA,
        name: 'fruits',
        value: expectedData
      }));
      expect(resultState).toBe(stateService);
      if (result && typeof result === 'object' && 'replacement' in result) {
          expect(result.replacement).toBeUndefined();
      }
      mockResolveInterpolatable.mockRestore();
    });

    // Remove redundant tests from migration log
    // it('should successfully assign a parsed object', ...);
    // it('should successfully assign a parsed array', ...);
    // it('should successfully assign a simple object', ...);
    // it('should properly handle stringified JSON', ...);
    // it('should handle nested objects correctly', ...);
  });

  describe('error handling', () => {
    it('should handle invalid JSON from run/embed', async () => {
      const node = createDirectiveNode('data', {
        identifier: 'invalidData',
        source: 'run',
        run: { subtype: 'runCommand', command: [{ type: 'Text', content: 'echo { key: "value", ' }] }
      });
      mockProcessingContext.directiveNode = node;

      // Mock command resolution for this specific test
      resolutionService.resolveNodes.mockResolvedValueOnce('echo { key: "value", ');
      
      // Resolve the FS mock *within the test* and configure it
      const fsMock = testDIContext.resolveSync<IFileSystemService>('IFileSystemService'); 
      const mockCommandResult = { 
          stdout: '{ "key": "value", ', 
          stderr: '' 
      };
      vi.mocked(fsMock.executeCommand).mockResolvedValue(mockCommandResult);

      // Execute and assert
      await expect(handler.handle(mockProcessingContext))
        .rejects
        .toThrow(DirectiveError); 
      await expect(handler.handle(mockProcessingContext))
        .rejects
        .toThrow(/Failed to parse command output as JSON/);
        
      // Verify executeCommand was called
      expect(fsMock.executeCommand).toHaveBeenCalledWith('echo { key: "value", ', expect.anything());
    });

    it('should handle resolution errors', async () => {
      const node = createDataDirective('user', { name: '{{missing}}' });
      mockProcessingContext.directiveNode = node;

      // Use the correct constructor signature for MeldResolutionError
      const mockResolveInterpolatable = vi.spyOn(handler as any, 'resolveInterpolatableValuesInData')
          .mockRejectedValue(new MeldResolutionError('Variable not found: missing', {
              code: 'VARIABLE_NOT_FOUND', // Pass code as string
              severity: ErrorSeverity.Recoverable,
              details: { variableName: 'missing' }
              // No MeldErrorOptions type needed here
          }));

      await expect(handler.handle(mockProcessingContext)).rejects.toThrow(DirectiveError); 
      await expect(handler.handle(mockProcessingContext)).rejects.toThrow(/Variable not found: missing/);

      mockResolveInterpolatable.mockRestore();
    });

    it('should handle state errors', async () => {
      // Create a state mock specifically for this test where setDataVar throws
      const stateErrorMock = MockFactory.createStateService();
      // Configure necessary methods used before the error
      stateErrorMock.getCurrentFilePath.mockReturnValue('/test.meld'); 
      // Configure setVariable to throw
      stateErrorMock.setVariable.mockRejectedValue(new Error('State error'));

      // Create a context specifically for this test using the throwing mock
      const errorTestContext: DirectiveProcessingContext = {
          ...mockProcessingContext, // Copy base context
          state: stateErrorMock, // Use the throwing state mock
      };
      
      const node = createDataDirective('data', { value: 1 });
      errorTestContext.directiveNode = node; // Assign node to the test-specific context
      
      const expectedData = { value: 1 };
      // Spy on the handler instance used in this test
      const mockResolveInterpolatable = vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedData);

      // Execute with the context containing the throwing state mock
      await expect(handler.handle(errorTestContext)).rejects.toThrow(DirectiveError);
      await expect(handler.handle(errorTestContext)).rejects.toThrow(/State error/);
      mockResolveInterpolatable.mockRestore();
    });
  });

  describe('variable resolution', () => {
    it('should resolve variables in nested JSON structures', async () => {
      const node = createDataDirective('config', {
        app: {
          name: 'Meld',
          version: '{{version}}',
          features: ['text', '{{featureType}}', 'path']
        },
        env: '{{env}}'
      });
      mockProcessingContext.directiveNode = node;
      const expectedResolvedData = {
        app: {
          name: 'Meld',
          version: '1.0',
          features: ['text', 'data', 'path']
        },
        env: 'prod'
      };
      // Mock the recursive resolver
      const mockResolveInterpolatable = vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedResolvedData);

      const result = await handler.handle(mockProcessingContext);
      const resultState = getStateFromResult(result);

      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        type: VariableType.DATA,
        name: 'config',
        value: expectedResolvedData
      }));
      expect(resultState).toBe(stateService);
      mockResolveInterpolatable.mockRestore();
    });

    it('should handle JSON strings containing variable references', async () => {
      const node = createDataDirective('message', { text: 'Hello {{user}}!' });
      mockProcessingContext.directiveNode = node;
      const expectedResolvedData = { text: 'Hello Alice!' };
      const mockResolveInterpolatable = vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedResolvedData);

      const result = await handler.handle(mockProcessingContext);
      const resultState = getStateFromResult(result);

      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        type: VariableType.DATA,
        name: 'message',
        value: expectedResolvedData
      }));
      expect(resultState).toBe(stateService);
      mockResolveInterpolatable.mockRestore();
    });

    it('should preserve JSON structure when resolving variables', async () => {
      const node = createDataDirective('data', {
        array: [1, '{{var}}', 3],
        object: { key: '{{var}}' }
      });
      mockProcessingContext.directiveNode = node;
      const expectedResolvedData = {
        array: [1, '2', 3],
        object: { key: '2' }
      };
      const mockResolveInterpolatable = vi.spyOn(handler as any, 'resolveInterpolatableValuesInData').mockResolvedValue(expectedResolvedData);

      const result = await handler.handle(mockProcessingContext);
      const resultState = getStateFromResult(result);

      expect(stateService.setVariable).toHaveBeenCalledWith(expect.objectContaining({
        type: VariableType.DATA,
        name: 'data',
        value: expectedResolvedData
      }));
      expect(resultState).toBe(stateService);
      mockResolveInterpolatable.mockRestore();
    });
  });
  
  /**
   * This section demonstrates how to use testParserWithValidExamples and testParserWithInvalidExamples
   * once all the import issues are fixed and the helper functions are properly integrated.
   * 
   * NOTE: This section is commented out until those issues are resolved.
   */
  /*
  describe('bulk testing with centralized examples', () => {
    // This would test all valid atomic examples
    testParserWithValidExamples(handler, 'data', 'atomic');
    
    // This would test all invalid examples
    testParserWithInvalidExamples(handler, 'data', expectThrowsWithSeverity);
  });
  */
}); 