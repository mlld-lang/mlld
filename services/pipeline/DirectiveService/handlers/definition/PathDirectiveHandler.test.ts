import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler';
import { createLocation, createDirectiveNode as coreCreateDirectiveNode } from '@tests/utils/testFactories'; // Use core factory
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import type { DirectiveNode, StructuredPath } from '@core/syntax/types/nodes';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { MeldPath, PathContentType, unsafeCreateValidatedResourcePath, createMeldPath, VariableType } from '@core/types';
import { expectToThrowWithConfig, ErrorTestOptions } from '@tests/utils/ErrorTestUtils'; // Keep for error tests
import { VariableOrigin } from '@core/types/variables';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { SourceLocation } from '@core/types/common';
import type { PathValidationContext } from '@core/types/paths';
import { PathPurpose } from '@core/types/paths';
import { container, type DependencyContainer } from 'tsyringe'; // Added
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'; // Added
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService'; // Added
import type { IPathService } from '@services/fs/PathService/IPathService'; // Added
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index'; // Added
import type { VariableDefinition } from '@core/types/variables'; // Added
import path from 'path'; // Added

/**
 * PathDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: In Progress (Refactoring to Manual DI)
 * 
 * This test file is being migrated to use:
 * - Manual Child Container pattern
 * - Standardized mock factories with vitest-mock-extended
 */

describe('PathDirectiveHandler', () => {
  // let fixture: DirectiveTestFixture; // Removed
  let handler: PathDirectiveHandler;
  let testContainer: DependencyContainer; // Added
  // Declare mocks
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockPathService: DeepMockProxy<IPathService>;

  // Helper to create mock MeldPath for tests
  const createMockMeldPathForTest = (resolvedPathString: string): MeldPath => {
    // Return the state object directly, matching MeldPath structure
    return {
      contentType: PathContentType.FILESYSTEM,
      originalValue: resolvedPathString,
      validatedPath: unsafeCreateValidatedResourcePath(resolvedPathString),
      isAbsolute: resolvedPathString.startsWith('/'),
      isSecure: true,
      isValidSyntax: true,
      exists: true,
      // Add isValidated for URL compatibility, although this helper focuses on FS
      isValidated: true 
    } as MeldPath;
    // Remove the .value wrapper: 
    // const state = { ... };
    // return { ...state, value: state } as MeldPath;
  };

  beforeEach(async () => {
    // fixture = await DirectiveTestFixture.create(); // Removed
    testContainer = container.createChildContainer(); // Added

    // --- Create Mocks --- 
    mockValidationService = mockDeep<IValidationService>({ validate: vi.fn() });
    mockStateService = mockDeep<IStateService>({ 
        getCurrentFilePath: vi.fn().mockReturnValue('/test.meld'), 
        setVariable: vi.fn(),
        getStateId: vi.fn().mockReturnValue('mock-path-state') 
    });
    mockResolutionService = mockDeep<IResolutionService>({ 
        resolveInContext: vi.fn(), 
        resolvePath: vi.fn() 
    });
    mockPathService = mockDeep<IPathService>(); // Add mock for PathService

    // --- Register Mocks --- 
    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService); // Register PathService mock
    testContainer.registerInstance('ILogger', { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() });
    testContainer.registerInstance('DependencyContainer', testContainer);

    // --- Register Handler --- 
    testContainer.register(PathDirectiveHandler, { useClass: PathDirectiveHandler });

    // --- Resolve Handler --- 
    handler = testContainer.resolve(PathDirectiveHandler);
    // handler = await fixture.context.resolve(PathDirectiveHandler); // Removed
    // fixture.handler = handler; // Removed
  });

  afterEach(async () => {
    // await fixture?.cleanup(); // Removed
    testContainer?.dispose(); // Added
    vi.clearAllMocks();
  });

  // Updated createMockProcessingContext to use mocks directly
  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
    const currentFilePath = mockStateService.getCurrentFilePath() || undefined;
    const resolutionContext: ResolutionContext = { 
        state: mockStateService, 
        strict: true,
        currentFilePath: currentFilePath,
        depth: 0, 
        flags: {},
        pathContext: { purpose: PathPurpose.READ, baseDir: currentFilePath ? path.dirname(currentFilePath) : '.' },
        withIncreasedDepth: vi.fn().mockReturnThis(),
        withStrictMode: vi.fn().mockReturnThis(),
        withPathContext: vi.fn().mockReturnThis(),
        withFlags: vi.fn().mockReturnThis(),
        withAllowedTypes: vi.fn().mockReturnThis(),
        withFormattingContext: vi.fn().mockReturnThis(),
        withParserFlags: vi.fn().mockReturnThis()
    };
    return {
        state: mockStateService,
        resolutionContext: resolutionContext,
        formattingContext: { isBlock: false } as FormattingContext,
        directiveNode: node,
        executionContext: undefined
    };
  };

  describe('basic path handling', () => {
    it('should process simple paths', async () => {
      const identifier = 'docs';
      const rawPathValue = '$PROJECTPATH/docs';
      // Use coreCreateDirectiveNode for correct structure
      const node = coreCreateDirectiveNode('path', { identifier, path: { raw: rawPathValue, structured: {} } }); // Add basic structured obj
      const expectedResolvedString = '/project/docs';
      const mockValidatedPath = createMockMeldPathForTest(expectedResolvedString);
      
      // Mock service methods on directly referenced mocks
      const resolveInContextSpy = vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(expectedResolvedString);
      const resolvePathSpy = vi.spyOn(mockResolutionService, 'resolvePath').mockResolvedValue(mockValidatedPath);
      const setVariableSpy = vi.spyOn(mockStateService, 'setVariable');
      const validateSpy = vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);

      console.log('NODE OBJECT BEFORE EXECUTE:', JSON.stringify(node, null, 2));
      const processingContext = createMockProcessingContext(node);
      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(validateSpy).toHaveBeenCalledWith(node);
      expect(resolveInContextSpy).toHaveBeenCalledWith(
        rawPathValue, // Handler extracts raw value from node.directive.path
        expect.any(Object)
      );
      expect(resolvePathSpy).toHaveBeenCalledWith(
        expectedResolvedString, 
        expect.any(Object)
      );
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty(identifier);
      const pathDef = result.stateChanges?.variables?.[identifier];
      expect(pathDef?.type).toBe(VariableType.PATH);
      expect(pathDef?.value).toEqual(mockValidatedPath);
      expect(pathDef?.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);
    });

    it('should handle paths with variables', async () => {
      const identifier = 'customPath';
      const structuredPathValue: StructuredPath = { 
        raw: '$PROJECTPATH/{{subdir}}', 
        structured: { base: '$PROJECTPATH', segments: ['{{subdir}}'] }, 
        interpolatedValue: [] // Needs update if parser provides this
      };
      // Use coreCreateDirectiveNode
      const node = coreCreateDirectiveNode('path', { identifier, path: structuredPathValue });
      const expectedResolvedString = '/project/meld/docs'; 
      const mockValidatedPath = createMockMeldPathForTest(expectedResolvedString);
      
      const resolveInContextSpy = vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(expectedResolvedString);
      const resolvePathSpy = vi.spyOn(mockResolutionService, 'resolvePath').mockResolvedValue(mockValidatedPath);
      const setVariableSpy = vi.spyOn(mockStateService, 'setVariable');
      const validateSpy = vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      const processingContext = createMockProcessingContext(node);

      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(validateSpy).toHaveBeenCalledWith(node);
      expect(resolveInContextSpy).toHaveBeenCalledWith(
        structuredPathValue.interpolatedValue, // Expect the interpolatedValue array based on handler logic
        expect.any(Object) 
      );
      expect(resolvePathSpy).toHaveBeenCalledWith(expectedResolvedString, expect.any(Object));
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty(identifier);
      const pathDef = result.stateChanges?.variables?.[identifier];
      expect(pathDef?.type).toBe(VariableType.PATH);
      expect(pathDef?.value).toEqual(mockValidatedPath);
    });

    it('should handle relative paths', async () => {
      const identifier = 'config';
      const rawPathValue = './config';
      // Use coreCreateDirectiveNode
      const node = coreCreateDirectiveNode('path', { identifier, path: { raw: rawPathValue, structured: {} } });
      const expectedResolvedString = './config';
      const mockValidatedPath = createMockMeldPathForTest(expectedResolvedString);

      const resolveInContextSpy = vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(expectedResolvedString);
      const resolvePathSpy = vi.spyOn(mockResolutionService, 'resolvePath').mockResolvedValue(mockValidatedPath);
      const setVariableSpy = vi.spyOn(mockStateService, 'setVariable');
      const validateSpy = vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      const processingContext = createMockProcessingContext(node);

      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(validateSpy).toHaveBeenCalledWith(node);
      expect(resolveInContextSpy).toHaveBeenCalledWith(rawPathValue, expect.any(Object));
      expect(resolvePathSpy).toHaveBeenCalledWith(expectedResolvedString, expect.any(Object));
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty(identifier);
      const pathDef = result.stateChanges?.variables?.[identifier];
      expect(pathDef?.type).toBe(VariableType.PATH);
      expect(pathDef?.value).toEqual(mockValidatedPath);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      // Use coreCreateDirectiveNode
      const node = coreCreateDirectiveNode('path', { identifier: 'validIdentifier', path: { raw: '/some/path', structured: {} } });
      const validationError = new DirectiveError('Mock Validation Failed', 'path', DirectiveErrorCode.VALIDATION_FAILED);
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(mockValidationService, 'validate').mockRejectedValueOnce(validationError);

      await expect(handler.handle(processingContext)).rejects.toThrow(validationError);
      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
    });

    it('should handle resolution errors (resolveInContext)', async () => {
      // Use coreCreateDirectiveNode
      const node = coreCreateDirectiveNode('path', { identifier: 'errorPath', path: { raw: '{{undefined}}', structured: {} } }); // Pass path object
      const originalError = new Error('Resolution error');
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      vi.spyOn(mockResolutionService, 'resolveInContext').mockRejectedValueOnce(originalError);

      const executionPromise = handler.handle(processingContext);

      await expect(executionPromise).rejects.toThrow(DirectiveError);
      await expect(executionPromise).rejects.toHaveProperty('code', DirectiveErrorCode.RESOLUTION_FAILED);
      await expect(executionPromise).rejects.toHaveProperty('cause', originalError);
    });
    
    it('should handle resolution errors (resolvePath)', async () => {
      // Use coreCreateDirectiveNode
      const node = coreCreateDirectiveNode('path', { identifier: 'errorPath', path: { raw: '/valid/string', structured: {} } });
      const resolvedString = '/valid/string';
      const originalError = new Error('Path validation error');
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(resolvedString);
      vi.spyOn(mockResolutionService, 'resolvePath').mockRejectedValueOnce(originalError);

      const executionPromise = handler.handle(processingContext);

      await expect(executionPromise).rejects.toThrow(DirectiveError);
      await expect(executionPromise).rejects.toHaveProperty('code', DirectiveErrorCode.VALIDATION_FAILED);
      await expect(executionPromise).rejects.toHaveProperty('cause', originalError);
    });

    it('should handle state errors (setVariable)', async () => {
      // Use coreCreateDirectiveNode
      const node = coreCreateDirectiveNode('path', { identifier: 'errorPath', path: { raw: '/some/path', structured: {} } });
      const resolvedString = '/some/path';
      const mockValidatedPath = createMockMeldPathForTest(resolvedString);
      const originalError = new Error('State error');
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(resolvedString);
      vi.spyOn(mockResolutionService, 'resolvePath').mockResolvedValue(mockValidatedPath);
      vi.spyOn(mockStateService, 'setVariable').mockRejectedValueOnce(originalError);

      const executionPromise = handler.handle(processingContext);

      await expect(executionPromise).rejects.toThrow(DirectiveError);
      await expect(executionPromise).rejects.toHaveProperty('code', DirectiveErrorCode.EXECUTION_FAILED);
      await expect(executionPromise).rejects.toHaveProperty('cause', originalError);
    });
  });
}); 