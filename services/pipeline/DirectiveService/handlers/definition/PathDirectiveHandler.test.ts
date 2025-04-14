import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler.js';
import { createPathDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { DirectiveNode } from '@core/syntax/types/nodes.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { pathDirectiveExamples } from '@core/syntax/index.js';
import { createNodeFromExample } from '@core/syntax/helpers/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { 
  createValidationServiceMock, 
  createStateServiceMock, 
  createResolutionServiceMock,
} from '@tests/utils/mocks/serviceMocks.js';
import { MeldPath, PathContentType, IFilesystemPathState, IUrlPathState, unsafeCreateValidatedResourcePath } from '@core/types';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import { mock } from 'vitest-mock-extended';
import { MeldError } from '@core/errors/MeldError.js';

/**
 * PathDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use centralized syntax examples and standardized mock factories.
 * 
 * COMPLETED:
 * - All "basic path handling" tests successfully migrated to use centralized examples
 * - Removed dependency on syntax-test-helpers.js
 * - Using centralized createNodeFromExample helper
 * - Updated to use standardized mock factories with vitest-mock-extended
 * 
 * NOTES:
 * - Error handling tests continue to use createPathDirective since the parser rejects 
 *   truly invalid syntax before the handler gets to process it, making it difficult
 *   to test validation error handling with actual invalid syntax examples.
 */

// Helper to create mock MeldPath objects for tests
const createMockMeldPath = (resolvedPathString: string): MeldPath => {
  const isUrl = resolvedPathString.startsWith('http');
  const state: IFilesystemPathState | IUrlPathState = isUrl ? {
    contentType: PathContentType.URL,
    originalValue: resolvedPathString, // Use resolved as original for mock simplicity
    validatedPath: unsafeCreateValidatedResourcePath(resolvedPathString), // Assume validation ok
    isValidSyntax: true,
  } : {
    contentType: PathContentType.FILESYSTEM,
    originalValue: resolvedPathString,
    validatedPath: unsafeCreateValidatedResourcePath(resolvedPathString),
    isAbsolute: resolvedPathString.startsWith('/'),
    isSecure: true,
    isValidSyntax: true,
    exists: true, // Assume exists for mock simplicity
  };
  return { 
    ...state, 
    value: state // Add the value property containing the state itself
  } as MeldPath;
};

describe('PathDirectiveHandler', () => {
  let handler: PathDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let mockProcessingContext: DirectiveProcessingContext;
  let testDIContext: TestContextDI;

  beforeEach(async () => {
    testDIContext = TestContextDI.createIsolated();
    await testDIContext.initialize();
    
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    
    stateService.getCurrentFilePath.mockReturnValue('test.meld');
    
    resolutionService.resolvePath.mockImplementation(async (resolvedString: string, context: any): Promise<MeldPath> => {
        return createMockMeldPath(resolvedString);
    });

    testDIContext.registerMock('IValidationService', validationService);
    testDIContext.registerMock('IStateService', stateService);
    testDIContext.registerMock('IResolutionService', resolutionService);

    const mockResolutionContext = mock<ResolutionContext>();
    const mockFormattingContext = mock<FormattingContext>();

    mockProcessingContext = {
        state: stateService,
        resolutionContext: mockResolutionContext,
        formattingContext: mockFormattingContext,
        directiveNode: undefined as any,
    };

    handler = await testDIContext.container.resolve(PathDirectiveHandler);
  });

  afterEach(async () => {
    await testDIContext?.cleanup();
  });

  describe('basic path handling', () => {
    it('should process simple paths', async () => {
      const example = pathDirectiveExamples.atomic.projectPath;
      const node = await createNodeFromExample(example.code) as DirectiveNode;
      mockProcessingContext.directiveNode = node;

      // Simulate the path object from the AST node
      const astPathObject = node.directive.path as StructuredPath;
      const expectedValueToResolve = astPathObject.interpolatedValue ?? astPathObject.raw;
      const expectedResolvedString = '$PROJECTPATH/docs'; // What resolveInContext should return

      // Mock resolveInContext to return the resolved string
      resolutionService.resolveInContext.mockResolvedValueOnce(expectedResolvedString);
      // Mock resolvePath to return a mock MeldPath based on the resolved string
      const mockValidatedPath = createMockMeldPath(expectedResolvedString);
      resolutionService.resolvePath.mockResolvedValueOnce(mockValidatedPath);

      const result = await handler.execute(mockProcessingContext);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      
      // Verify resolveInContext was called with the raw path string (since no interpolation)
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        expectedValueToResolve, // Should be the raw string '$PROJECTPATH/docs'
        mockProcessingContext.resolutionContext
      );
      
      // Verify resolvePath was called with the resolved string
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        expectedResolvedString, // The string returned by resolveInContext
        mockProcessingContext.resolutionContext
      );

      // Verify setPathVar was called with the final validated path state
      expect(stateService.setPathVar).toHaveBeenCalledWith(
        'docs', // The identifier
        mockValidatedPath.value // The .value property holding the state
      );
      expect(result).toBe(stateService);
    });

    it('should handle paths with variables', async () => {
      const exampleSet = pathDirectiveExamples.combinations.pathWithVariables;
      const exampleLines = exampleSet.code.split('\n');
      const pathDirectiveLine = exampleLines[1]; // Get the @path line
      const node = await createNodeFromExample(pathDirectiveLine) as DirectiveNode;
      mockProcessingContext.directiveNode = node;

      // Simulate the path object from the AST node
      const astPathObject = node.directive.path as StructuredPath;
      // For this case, the value passed to resolveInContext should be the InterpolatableValue array
      const expectedValueToResolve = astPathObject.interpolatedValue;
      const expectedResolvedString = '$PROJECTPATH/meld/docs'; // Mock resolved string

      // Mock resolveInContext to return the resolved string
      resolutionService.resolveInContext.mockResolvedValueOnce(expectedResolvedString);
      // Mock resolvePath
      const mockValidatedPath = createMockMeldPath(expectedResolvedString);
      resolutionService.resolvePath.mockResolvedValueOnce(mockValidatedPath);

      const result = await handler.execute(mockProcessingContext);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      
      // Verify resolveInContext was called with the InterpolatableValue
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        expectedValueToResolve, // Should be the InterpolatableValue array
        mockProcessingContext.resolutionContext
      );

      // Verify resolvePath was called with the resolved string
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        expectedResolvedString,
        mockProcessingContext.resolutionContext
      );

      // Verify setPathVar
      expect(stateService.setPathVar).toHaveBeenCalledWith(
        'customPath', // Identifier
        mockValidatedPath.value
      );
      expect(result).toBe(stateService);
    });

    it('should handle relative paths', async () => {
      const example = pathDirectiveExamples.atomic.relativePath;
      const node = await createNodeFromExample(example.code) as DirectiveNode;
      mockProcessingContext.directiveNode = node;

      // Simulate the path object from the AST node
      const astPathObject = node.directive.path as StructuredPath;
      const expectedValueToResolve = astPathObject.interpolatedValue ?? astPathObject.raw;
      const expectedResolvedString = './config'; // Use the raw path as resolved for this test

      // Mock resolveInContext
      resolutionService.resolveInContext.mockResolvedValueOnce(expectedResolvedString);
      // Mock resolvePath
      const mockValidatedPath = createMockMeldPath(expectedResolvedString);
      resolutionService.resolvePath.mockResolvedValueOnce(mockValidatedPath);

      const result = await handler.execute(mockProcessingContext);

      expect(validationService.validate).toHaveBeenCalledWith(node);
      
      // Verify resolveInContext was called with the raw string
      expect(resolutionService.resolveInContext).toHaveBeenCalledWith(
        expectedValueToResolve, // Should be the raw string './config'
        mockProcessingContext.resolutionContext
      );

      // Verify resolvePath was called with the resolved string
      expect(resolutionService.resolvePath).toHaveBeenCalledWith(
        expectedResolvedString,
        mockProcessingContext.resolutionContext
      );

      // Verify setPathVar
      expect(stateService.setPathVar).toHaveBeenCalledWith(
        'config', // Identifier
        mockValidatedPath.value
      );
      expect(result).toBe(stateService);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createPathDirective('validIdentifier', '/some/path', createLocation(1, 1)); 
      mockProcessingContext.directiveNode = node;

      const validationError = new DirectiveError('Mock Validation Failed', 'path', DirectiveErrorCode.VALIDATION_FAILED);
      vi.mocked(validationService.validate).mockRejectedValueOnce(validationError);

      const executionPromise = handler.execute(mockProcessingContext);

      await expect(executionPromise).rejects.toThrow(validationError);
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    it('should handle resolution errors', async () => {
      const node = createPathDirective('errorPath', '{{undefined}}', createLocation(1, 1));
      mockProcessingContext.directiveNode = node;
      const originalError = new Error('Resolution error');
      vi.mocked(resolutionService.resolveInContext).mockRejectedValueOnce(originalError);

      const executionPromise = handler.execute(mockProcessingContext);

      await expect(executionPromise).rejects.toThrow(DirectiveError);
      await expect(executionPromise).rejects.toHaveProperty('code', DirectiveErrorCode.RESOLUTION_FAILED);
      await expect(executionPromise).rejects.toHaveProperty('cause', originalError);
    });

    it('should handle state errors', async () => {
      const node = createPathDirective('errorPath', '/some/path', createLocation(1, 1));
      mockProcessingContext.directiveNode = node;
      const originalError = new Error('State error');

      vi.mocked(resolutionService.resolveInContext).mockResolvedValue('/some/path');
      vi.mocked(stateService.setPathVar).mockRejectedValueOnce(originalError);

      const executionPromise = handler.execute(mockProcessingContext);

      await expect(executionPromise).rejects.toThrow(DirectiveError);
      await expect(executionPromise).rejects.toHaveProperty('code', DirectiveErrorCode.EXECUTION_FAILED);
      await expect(executionPromise).rejects.toHaveProperty('cause', originalError);
    });
  });
}); 