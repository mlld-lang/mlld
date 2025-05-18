import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler';
import { ASTFixtureLoader } from '@tests/utils/ASTFixtureLoader';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import type { DirectiveNode } from '@core/syntax/types/nodes';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { MeldPath, PathContentType, unsafeCreateValidatedResourcePath, VariableType } from '@core/types';
import { VariableOrigin } from '@core/types/variables';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import { PathPurpose } from '@core/types/paths';
import { container, type DependencyContainer } from 'tsyringe';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index';
import path from 'path';

/**
 * PathDirectiveHandler Fixture Test
 * --------------------------------
 * 
 * This test file uses fixture-based testing with the ASTFixtureLoader.
 * It tests the PathDirectiveHandler with real AST structures from fixtures.
 */

describe('PathDirectiveHandler - Fixture Tests', () => {
  let handler: PathDirectiveHandler;
  let testContainer: DependencyContainer;
  let fixtureLoader: ASTFixtureLoader;
  
  // Declare mocks
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockPathService: DeepMockProxy<IPathService>;

  // Helper to create mock MeldPath for tests
  const createMockMeldPathForTest = (resolvedPathString: string): MeldPath => {
    return {
      contentType: PathContentType.FILESYSTEM,
      originalValue: resolvedPathString,
      validatedPath: unsafeCreateValidatedResourcePath(resolvedPathString),
      isAbsolute: resolvedPathString.startsWith('/'),
      isSecure: true,
      isValidSyntax: true,
      exists: true,
      isValidated: true 
    } as MeldPath;
  };

  beforeEach(async () => {
    testContainer = container.createChildContainer();
    fixtureLoader = new ASTFixtureLoader();
    // loadFixtures is called in the constructor, no need to call it again

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
    mockPathService = mockDeep<IPathService>();

    // --- Register Mocks --- 
    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance('ILogger', { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() });
    testContainer.registerInstance('DependencyContainer', testContainer);

    // --- Register Handler --- 
    testContainer.register(PathDirectiveHandler, { useClass: PathDirectiveHandler });

    // --- Resolve Handler --- 
    handler = testContainer.resolve(PathDirectiveHandler);
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.clearAllMocks();
  });

  // Helper to get directive from fixture with adapter for old AST structure
  const getDirectiveFromFixture = async (fixtureName: string): Promise<DirectiveNode> => {
    const fixture = fixtureLoader.getFixture(fixtureName);
    if (!fixture) {
      throw new Error(`Fixture not found: ${fixtureName}`);
    }
    
    // The fixture has the AST in the 'ast' property
    const astProperty = (fixture as any).ast;
    
    // Skip fixtures without AST property - these are typically compound fixtures
    if (!astProperty || astProperty.length === 0) {
      return null as any; // We'll skip these in the tests
    }
    
    let directiveNode = astProperty[0];
    if (directiveNode.type !== 'Directive') {
      throw new Error(`First AST node in fixture ${fixtureName} is not a Directive`);
    }
    
    // Adapt the new AST structure to what the handler expects
    // The handler expects a PathDirectiveData structure with pathObject
    const adaptedNode = {
      ...directiveNode,
      directive: {
        kind: directiveNode.kind || fixture.metadata?.kind || 'path',
        type: 'directive',
        identifier: directiveNode.values?.identifier?.[0]?.identifier || 'unknown',
        path: {
          raw: directiveNode.values?.path?.[0]?.content || directiveNode.raw?.path || '',
          structured: {}, // Basic structured object
          interpolatedValue: undefined // Will be set if there are variables
        },
        location: directiveNode.location
      }
    };
    
    return adaptedNode as DirectiveNode;
  };

  // Helper to create processing context
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
    it('should process simple paths from fixture', async () => {
      const node = await getDirectiveFromFixture('path-assignment-1');
      if (!node) {
        return; // Skip if no AST
      }

      const expectedResolvedString = '/project/file.md';
      const mockValidatedPath = createMockMeldPathForTest(expectedResolvedString);
      
      // Mock service methods
      const resolveInContextSpy = vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(expectedResolvedString);
      const resolvePathSpy = vi.spyOn(mockResolutionService, 'resolvePath').mockResolvedValue(mockValidatedPath);
      const validateSpy = vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);

      const processingContext = createMockProcessingContext(node);
      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(validateSpy).toHaveBeenCalledWith(node);
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toHaveProperty('docsDir');
      const pathDef = result.stateChanges?.variables?.['docsDir'];
      expect(pathDef?.type).toBe(VariableType.PATH);
      expect(pathDef?.value).toEqual(mockValidatedPath);
      expect(pathDef?.metadata?.origin).toBe(VariableOrigin.DIRECT_DEFINITION);
    });

    it('should handle absolute paths', async () => {
      const node = await getDirectiveFromFixture('path-assignment-absolute-1');
      if (!node) {
        return; // Skip if no AST
      }

      const expectedResolvedString = '/home/user/projects/meld/README.md';
      const mockValidatedPath = createMockMeldPathForTest(expectedResolvedString);
      
      const resolveInContextSpy = vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(expectedResolvedString);
      const resolvePathSpy = vi.spyOn(mockResolutionService, 'resolvePath').mockResolvedValue(mockValidatedPath);
      const validateSpy = vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      const processingContext = createMockProcessingContext(node);

      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(validateSpy).toHaveBeenCalledWith(node);
      expect(result.stateChanges).toBeDefined();
      const identifier = node.directive.identifier;
      expect(result.stateChanges?.variables).toHaveProperty(identifier);
      const pathDef = result.stateChanges?.variables?.[identifier];
      expect(pathDef?.type).toBe(VariableType.PATH);
      expect(pathDef?.value).toEqual(mockValidatedPath);
    });

    it('should handle project paths', async () => {
      const node = await getDirectiveFromFixture('path-assignment-project-1');
      if (!node) {
        return; // Skip if no AST
      }

      const expectedResolvedString = '/project/src/index.ts';
      const mockValidatedPath = createMockMeldPathForTest(expectedResolvedString);
      
      const resolveInContextSpy = vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(expectedResolvedString);
      const resolvePathSpy = vi.spyOn(mockResolutionService, 'resolvePath').mockResolvedValue(mockValidatedPath);
      const validateSpy = vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      const processingContext = createMockProcessingContext(node);

      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(validateSpy).toHaveBeenCalledWith(node);
      expect(result.stateChanges).toBeDefined();
      const identifier = node.directive.identifier;
      expect(result.stateChanges?.variables).toHaveProperty(identifier);
      const pathDef = result.stateChanges?.variables?.[identifier];
      expect(pathDef?.type).toBe(VariableType.PATH);
      expect(pathDef?.value).toEqual(mockValidatedPath);
    });

    it('should handle special paths', async () => {
      const node = await getDirectiveFromFixture('path-assignment-special-1');
      if (!node) {
        return; // Skip if no AST
      }

      const expectedResolvedString = '/home/user/test.meld';
      const mockValidatedPath = createMockMeldPathForTest(expectedResolvedString);
      
      const resolveInContextSpy = vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(expectedResolvedString);
      const resolvePathSpy = vi.spyOn(mockResolutionService, 'resolvePath').mockResolvedValue(mockValidatedPath);
      const validateSpy = vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      const processingContext = createMockProcessingContext(node);

      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(validateSpy).toHaveBeenCalledWith(node);
      expect(result.stateChanges).toBeDefined();
      const identifier = node.directive.identifier;
      expect(result.stateChanges?.variables).toHaveProperty(identifier);
      const pathDef = result.stateChanges?.variables?.[identifier];
      expect(pathDef?.type).toBe(VariableType.PATH);
      expect(pathDef?.value).toEqual(mockValidatedPath);
    });

    it('should handle paths with variables', async () => {
      // First, find a proper path fixture with variables
      const fixtureNames = fixtureLoader.getAllFixtureNames();
      const pathFixtureName = fixtureNames.find(name => {
        const fixture = fixtureLoader.getFixture(name);
        return fixture && fixture.metadata?.kind === 'path' && name.includes('variable');
      });
      
      if (!pathFixtureName) {
        console.warn('No path fixture with variables found, skipping test');
        return;
      }

      const node = await getDirectiveFromFixture(pathFixtureName);
      if (!node) {
        return; // Skip if no AST
      }

      const expectedResolvedString = '/project/subdir/file.ts';
      const mockValidatedPath = createMockMeldPathForTest(expectedResolvedString);
      
      const resolveInContextSpy = vi.spyOn(mockResolutionService, 'resolveInContext').mockResolvedValue(expectedResolvedString);
      const resolvePathSpy = vi.spyOn(mockResolutionService, 'resolvePath').mockResolvedValue(mockValidatedPath);
      const validateSpy = vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      const processingContext = createMockProcessingContext(node);

      // Only run the test if we have a valid path node
      if (node.directive.kind === 'path') {
        const result = await handler.handle(processingContext) as DirectiveResult;

        expect(validateSpy).toHaveBeenCalledWith(node);
        expect(result.stateChanges).toBeDefined();
        const identifier = node.directive.identifier;
        expect(result.stateChanges?.variables).toHaveProperty(identifier);
        const pathDef = result.stateChanges?.variables?.[identifier];
        expect(pathDef?.type).toBe(VariableType.PATH);
        expect(pathDef?.value).toEqual(mockValidatedPath);
      }
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = await getDirectiveFromFixture('path-assignment-1');
      if (!node) {
        return; // Skip if no AST
      }

      const validationError = new DirectiveError('Mock Validation Failed', 'path', DirectiveErrorCode.VALIDATION_FAILED);
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(mockValidationService, 'validate').mockRejectedValueOnce(validationError);

      await expect(handler.handle(processingContext)).rejects.toThrow(validationError);
      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
    });

    it('should handle resolution errors', async () => {
      const node = await getDirectiveFromFixture('path-assignment-1');
      if (!node) {
        return; // Skip if no AST
      }

      const originalError = new Error('Resolution error');
      const processingContext = createMockProcessingContext(node);
      
      vi.spyOn(mockValidationService, 'validate').mockResolvedValue(undefined);
      vi.spyOn(mockResolutionService, 'resolveInContext').mockRejectedValueOnce(originalError);

      const executionPromise = handler.handle(processingContext);

      await expect(executionPromise).rejects.toThrow(DirectiveError);
      await expect(executionPromise).rejects.toHaveProperty('code', DirectiveErrorCode.RESOLUTION_FAILED);
      await expect(executionPromise).rejects.toHaveProperty('cause', originalError);
    });
  });
  
  // Test statistics
  describe('fixture coverage', () => {
    it('should have loaded fixtures', () => {
      const stats = fixtureLoader.getStats();
      console.log('PathDirectiveHandler Fixture Stats:', {
        totalLoaded: stats.total,
        pathFixtures: stats.byKind['path'] || 0,
        bySubtype: stats.bySubtype
      });
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byKind['path'] || 0).toBeGreaterThan(0);
    });
  });
});