import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import { ASTFixtureLoader } from '@tests/utils/ASTFixtureLoader';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { DirectiveNode, MeldNode } from '@core/syntax/types/nodes';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index';
import type { ResolutionContext } from '@core/types/resolution';
import { container, type DependencyContainer } from 'tsyringe';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import { PathPurpose, createMeldPath, PathContentType, unsafeCreateValidatedResourcePath } from '@core/types/paths';
import { createTextVariable, VariableOrigin } from '@core/types/variables';
import path from 'path';

/**
 * ImportDirectiveHandler Fixture Test
 * -----------------------------------
 * 
 * This test file uses fixture-based testing with the ASTFixtureLoader.
 * It tests the ImportDirectiveHandler with real AST structures from fixtures.
 */

describe('ImportDirectiveHandler - Fixture Tests', () => {
  let handler: ImportDirectiveHandler;
  let testContainer: DependencyContainer;
  let fixtureLoader: ASTFixtureLoader;
  
  // Declare mocks
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockParserService: DeepMockProxy<IParserService>;
  let mockPathService: DeepMockProxy<IPathService>;
  let mockCircularityService: DeepMockProxy<ICircularityService>;
  let mockURLContentResolver: DeepMockProxy<IURLContentResolver>;
  let mockInterpreterServiceClient: DeepMockProxy<IInterpreterServiceClient>;
  let mockInterpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;

  beforeEach(async () => {
    testContainer = container.createChildContainer();
    fixtureLoader = new ASTFixtureLoader();

    // --- Create Mocks --- 
    mockValidationService = mockDeep<IValidationService>({ validate: vi.fn() });
    mockResolutionService = mockDeep<IResolutionService>({ 
        resolveInContext: vi.fn(), 
        resolvePath: vi.fn() 
    });
    const mockChildState = mockDeep<IStateService>({
        setCurrentFilePath: vi.fn(),
        getVariables: vi.fn().mockReturnValue({})
    });
    
    mockStateService = mockDeep<IStateService>({ 
        getCurrentFilePath: vi.fn().mockReturnValue('/test.meld'),
        getStateId: vi.fn().mockReturnValue('mock-import-state'),
        getVariableDefinitions: vi.fn().mockReturnValue({}),
        createChildState: vi.fn().mockResolvedValue(mockChildState)
    });
    mockFileSystemService = mockDeep<IFileSystemService>({
        exists: vi.fn(),
        readFile: vi.fn()
    });
    mockParserService = mockDeep<IParserService>({
        parseDocument: vi.fn(),
        parse: vi.fn() // Handler uses parse() not parseDocument()
    });
    mockPathService = mockDeep<IPathService>();
    mockCircularityService = mockDeep<ICircularityService>({
        checkImport: vi.fn(),
        beginImport: vi.fn() // Handler calls beginImport()
    });
    mockURLContentResolver = mockDeep<IURLContentResolver>();
    mockInterpreterServiceClient = mockDeep<IInterpreterServiceClient>({
        interpretNodes: vi.fn(),
        interpret: vi.fn() // Handler uses interpret() not interpretNodes()
    });
    mockInterpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>({
        createClient: vi.fn().mockReturnValue(mockInterpreterServiceClient)
    });

    // --- Register Mocks --- 
    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IParserService>('IParserService', mockParserService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance<ICircularityService>('ICircularityService', mockCircularityService);
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', mockURLContentResolver);
    testContainer.registerInstance(InterpreterServiceClientFactory, mockInterpreterServiceClientFactory);
    testContainer.registerInstance('ILogger', { debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() });
    testContainer.registerInstance('DependencyContainer', testContainer);

    // --- Register Handler --- 
    testContainer.register(ImportDirectiveHandler, { useClass: ImportDirectiveHandler });

    // --- Resolve Handler --- 
    handler = testContainer.resolve(ImportDirectiveHandler);
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
    
    // Skip fixtures without AST property
    if (!astProperty || astProperty.length === 0) {
      return null as any;
    }
    
    let directiveNode = astProperty[0];
    if (directiveNode.type !== 'Directive') {
      throw new Error(`First AST node in fixture ${fixtureName} is not a Directive`);
    }
    
    // The ImportDirectiveHandler expects a directive property with 'imports' and 'path'
    // Process imports based on subtype
    let imports: any;
    if (directiveNode.subtype === 'importAll') {
      imports = '*';
    } else if (directiveNode.values?.imports) {
      // For selected imports, map to expected format
      imports = directiveNode.values.imports.map((imp: any) => ({
        name: imp.identifier,
        alias: imp.alias || undefined
      }));
    } else {
      imports = '*';
    }
    
    const adaptedNode = {
      ...directiveNode,
      directive: {
        kind: directiveNode.kind || fixture.metadata?.kind || 'import',
        type: 'directive',
        imports: imports,
        path: {
          raw: directiveNode.values?.path?.[0]?.content || directiveNode.raw?.path || '',
          structured: {},
          interpolatedValue: undefined
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

  describe('import all handling', () => {
    it('should process import all from fixture', async () => {
      const node = await getDirectiveFromFixture('import-all-1');
      if (!node) {
        return; // Skip if no AST
      }

      const mockPath = {
        contentType: PathContentType.FILESYSTEM,
        originalValue: 'config.mld',
        validatedPath: '/project/config.mld', // Handler expects string here
        isAbsolute: false,
        isSecure: true,
        isValidSyntax: true,
        exists: true,
        isValidated: true
      } as any;

      // Mock the imported file content
      const mockImportedContent = 'mock file content';
      const mockImportedAST: MeldNode[] = [];
      
      // Set up mocks
      mockResolutionService.resolveInContext.mockResolvedValue('config.mld');
      mockResolutionService.resolvePath.mockResolvedValue(mockPath);
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue(mockImportedContent);
      mockParserService.parse.mockResolvedValue(mockImportedAST);
      
      // Create mock child state with imported variables
      const mockChildStateWithVars = mockDeep<IStateService>({
        getVariables: vi.fn().mockReturnValue({
          'greeting': createTextVariable('Hello, world!', {
            origin: VariableOrigin.IMPORTED,
            sourceLocation: { filePath: '/project/config.mld', line: 1, column: 1 },
            importedFrom: '/project/config.mld'
          }),
          'answer': createTextVariable('42', {
            origin: VariableOrigin.IMPORTED,
            sourceLocation: { filePath: '/project/config.mld', line: 2, column: 1 },
            importedFrom: '/project/config.mld'
          })
        }),
        getLocalChanges: vi.fn().mockReturnValue(['greeting', 'answer']),
        getVariable: vi.fn((name: string) => {
          const vars = {
            'greeting': createTextVariable('Hello, world!', {
              origin: VariableOrigin.IMPORTED,
              sourceLocation: { filePath: '/project/config.mld', line: 1, column: 1 },
              importedFrom: '/project/config.mld'
            }),
            'answer': createTextVariable('42', {
              origin: VariableOrigin.IMPORTED,
              sourceLocation: { filePath: '/project/config.mld', line: 2, column: 1 },
              importedFrom: '/project/config.mld'
            })
          };
          return vars[name as keyof typeof vars];
        })
      });
      
      mockInterpreterServiceClient.interpret.mockResolvedValue(mockChildStateWithVars);

      const processingContext = createMockProcessingContext(node);
      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(mockResolutionService.resolvePath).toHaveBeenCalled();
      expect(mockFileSystemService.readFile).toHaveBeenCalled();
      expect(mockParserService.parse).toHaveBeenCalledWith(mockImportedContent);
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toBeDefined();
      expect(Object.keys(result.stateChanges?.variables || {})).toContain('greeting');
      expect(Object.keys(result.stateChanges?.variables || {})).toContain('answer');
    });

    it('should handle import all with variables', async () => {
      const node = await getDirectiveFromFixture('import-all-variable-1');
      if (!node) {
        return; // Skip if no AST
      }

      const mockPath = {
        contentType: PathContentType.FILESYSTEM,
        originalValue: 'config/prod.mld',
        validatedPath: '/project/config/prod.mld', // Handler expects string here
        isAbsolute: false,
        isSecure: true,
        isValidSyntax: true,
        exists: true,
        isValidated: true
      } as any;

      // Set up mocks
      mockResolutionService.resolveInContext.mockResolvedValue('config/prod.mld');
      mockResolutionService.resolvePath.mockResolvedValue(mockPath);
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue('mock content');
      mockParserService.parse.mockResolvedValue([]);
      
      // Create empty child state
      const mockChildStateEmpty = mockDeep<IStateService>({
        getVariables: vi.fn().mockReturnValue({}),
        getLocalChanges: vi.fn().mockReturnValue([]),
        getVariable: vi.fn().mockReturnValue(undefined)
      });
      
      mockInterpreterServiceClient.interpret.mockResolvedValue(mockChildStateEmpty);

      const processingContext = createMockProcessingContext(node);
      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(result.stateChanges).toBeDefined();
    });
  });

  describe('import selected handling', () => {
    it('should process selected imports from fixture', async () => {
      const node = await getDirectiveFromFixture('import-selected-1');
      if (!node) {
        return; // Skip if no AST
      }

      const mockPath = {
        contentType: PathContentType.FILESYSTEM,
        originalValue: 'config.mld',
        validatedPath: '/project/config.mld', // Handler expects string here
        isAbsolute: false,
        isSecure: true,
        isValidSyntax: true,
        exists: true,
        isValidated: true
      } as any;

      // Set up mocks
      mockResolutionService.resolveInContext.mockResolvedValue('config.mld');
      mockResolutionService.resolvePath.mockResolvedValue(mockPath);
      mockFileSystemService.exists.mockResolvedValue(true);
      mockFileSystemService.readFile.mockResolvedValue('mock content');
      mockParserService.parse.mockResolvedValue([]);
      
      // Create child state with all variables (handler will filter selected)
      const mockChildStateWithAllVars = mockDeep<IStateService>({
        getVariables: vi.fn().mockReturnValue({
          'greeting': createTextVariable('Hello', {
            origin: VariableOrigin.IMPORTED,
            sourceLocation: { filePath: '/project/config.mld', line: 1, column: 1 },
            importedFrom: '/project/config.mld'
          }),
          'count': createTextVariable('42', {
            origin: VariableOrigin.IMPORTED,
            sourceLocation: { filePath: '/project/config.mld', line: 2, column: 1 },
            importedFrom: '/project/config.mld'
          }),
          'notImported': createTextVariable('This should not be imported', {
            origin: VariableOrigin.DIRECT_DEFINITION,
            sourceLocation: { filePath: '/project/config.mld', line: 3, column: 1 }
          })
        }),
        getLocalChanges: vi.fn().mockReturnValue(['greeting', 'count', 'notImported']),
        getVariable: vi.fn((name: string) => {
          const vars = {
            'greeting': createTextVariable('Hello', {
              origin: VariableOrigin.IMPORTED,
              sourceLocation: { filePath: '/project/config.mld', line: 1, column: 1 },
              importedFrom: '/project/config.mld'
            }),
            'count': createTextVariable('42', {
              origin: VariableOrigin.IMPORTED,
              sourceLocation: { filePath: '/project/config.mld', line: 2, column: 1 },
              importedFrom: '/project/config.mld'
            }),
            'notImported': createTextVariable('This should not be imported', {
              origin: VariableOrigin.DIRECT_DEFINITION,
              sourceLocation: { filePath: '/project/config.mld', line: 3, column: 1 }
            })
          };
          return vars[name as keyof typeof vars];
        })
      });
      
      mockInterpreterServiceClient.interpret.mockResolvedValue(mockChildStateWithAllVars);

      const processingContext = createMockProcessingContext(node);
      const result = await handler.handle(processingContext) as DirectiveResult;

      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
      expect(result.stateChanges).toBeDefined();
      expect(result.stateChanges?.variables).toBeDefined();
      
      // Should only include selected imports, not all variables
      const variables = result.stateChanges?.variables || {};
      expect(Object.keys(variables)).toContain('greeting');
      expect(Object.keys(variables)).toContain('count');
      expect(Object.keys(variables)).not.toContain('notImported');
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = await getDirectiveFromFixture('import-all-1');
      if (!node) {
        return; // Skip if no AST
      }

      const validationError = new DirectiveError('Mock Validation Failed', 'import', DirectiveErrorCode.VALIDATION_FAILED);
      const processingContext = createMockProcessingContext(node);
      
      mockValidationService.validate.mockRejectedValueOnce(validationError);

      await expect(handler.handle(processingContext)).rejects.toThrow(validationError);
      expect(mockValidationService.validate).toHaveBeenCalledWith(node);
    });

    it('should handle file not found errors', async () => {
      const node = await getDirectiveFromFixture('import-all-1');
      if (!node) {
        return; // Skip if no AST
      }

      const processingContext = createMockProcessingContext(node);
      
      mockValidationService.validate.mockResolvedValue(undefined);
      mockResolutionService.resolveInContext.mockResolvedValue('config.mld');
      mockResolutionService.resolvePath.mockResolvedValue({
        contentType: PathContentType.FILESYSTEM,
        originalValue: 'config.mld',
        validatedPath: '/project/config.mld', // Handler expects string here
        isAbsolute: false,
        isSecure: true,
        isValidSyntax: true,
        exists: false,
        isValidated: true
      } as any);
      mockFileSystemService.exists.mockResolvedValue(false);

      await expect(handler.handle(processingContext)).rejects.toThrow();
    });

    it('should handle circular import errors', async () => {
      const node = await getDirectiveFromFixture('import-all-1');
      if (!node) {
        return; // Skip if no AST
      }

      const processingContext = createMockProcessingContext(node);
      
      mockValidationService.validate.mockResolvedValue(undefined);
      mockResolutionService.resolveInContext.mockResolvedValue('config.mld');
      mockResolutionService.resolvePath.mockResolvedValue({
        contentType: PathContentType.FILESYSTEM,
        originalValue: 'config.mld',
        validatedPath: '/project/config.mld', // Handler expects string here
        isAbsolute: false,
        isSecure: true,
        isValidSyntax: true,
        exists: true,
        isValidated: true
      } as any);
      mockCircularityService.checkImport.mockRejectedValue(new Error('Circular import detected'));

      await expect(handler.handle(processingContext)).rejects.toThrow();
    });
  });
  
  // Test statistics
  describe('fixture coverage', () => {
    it('should have loaded fixtures', () => {
      const stats = fixtureLoader.getStats();
      console.log('ImportDirectiveHandler Fixture Stats:', {
        totalLoaded: stats.total,
        importFixtures: stats.byKind['import'] || 0,
        bySubtype: stats.bySubtype
      });
      expect(stats.total).toBeGreaterThan(0);
      expect(stats.byKind['import'] || 0).toBeGreaterThan(0);
    });
  });
});