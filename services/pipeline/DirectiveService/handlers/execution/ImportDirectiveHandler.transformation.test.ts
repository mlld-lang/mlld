import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';
import type { DirectiveNode } from '@core/ast/types/base';
import type { ImportDirectiveNode } from '@core/ast/types/import';
import type { TextNode, MeldNode, SourceLocation, VariableReferenceNode } from '@core/ast/types';
import type { MeldPath, ValidatedResourcePath } from '@core/types/paths';
import { VariableOrigin, type TextVariable, VariableType, type VariableDefinition, type DataVariable, type IPathVariable, type CommandVariable, createTextVariable, VariableMetadata } from '@core/types/variables';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService, ResolutionContext, FormattingContext } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { createTestLocation, createTestText, createTestDirective, createTestCodeFence } from '@tests/utils/nodeFactories';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils';
import { importDirectiveExamples } from '@core/syntax/index';
import { createNodeFromExample } from '@core/syntax/helpers';
import { InterpreterServiceClientFactory } from '@services/pipeline/InterpreterService/factories/InterpreterServiceClientFactory';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient';
import { createMeldPath, unsafeCreateValidatedResourcePath, PathContentType } from '@core/types/paths';
import type { DirectiveProcessingContext, OutputFormattingContext } from '@core/types/index';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import { MeldFileNotFoundError } from '@core/errors/MeldFileNotFoundError';
import crypto from 'crypto';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import type { IURLContentResolver } from '@services/resolution/URLContentResolver/IURLContentResolver';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { container, DependencyContainer } from 'tsyringe';
import type { IInterpreterService } from '@services/pipeline/InterpreterService/IInterpreterService';
// Removed unused imports

// Mock the logger using vi.mock
vi.mock('@core/utils/logger', () => {
  // EXEC the mock object INSIDE the factory function
  const mockLoggerObject = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  return { 
    // Ensure all exported loggers are mocked if needed by the SUT
    importLogger: mockLoggerObject, 
    directiveLogger: mockLoggerObject, // Add other loggers if imported directly
    logger: mockLoggerObject, // Add default logger if imported directly
    default: mockLoggerObject // ADD default export
    // ... add other exported loggers as needed
  };
});

/**
 * ImportDirectiveHandler Transformation Test Status
 * -----------------------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * - Centralized syntax examples
 * 
 * Migration details:
 * 
 * 1. Using TestContextDI for test environment setup
 * 2. Using standardized mock factories for service mocks
 * 3. Using a hybrid approach with direct handler instantiation
 * 4. Maintained use of centralized syntax examples
 * 5. Added proper cleanup with afterEach hook
 * 
 * Some key observations from the migration:
 * 
 * 1. For the first test "should return empty text node when transformation enabled",
 *    we were able to use the centralized 'basicImport' example directly.
 * 
 * 2. For the tests involving specific importList formats (second and third tests),
 *    we kept the direct node creation approach since:
 *    - The specific format of importList is important for the test behavior
 *    - The handler expects a particular structure for these specialized cases
 * 
 * 3. For the error handling test, we were able to use a modified version of the 
 *    centralized example by replacing the file path with a non-existent one.
 */

/**
 * Creates a DirectiveNode from example code string (Local helper)
 * 
 * @param code - The directive code to parse
 * @returns The parsed DirectiveNode
 */
async function createNodeFromExampleLocal(code: string): Promise<DirectiveNode> {
  try {
    const { parse } = await import('@core/ast');
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true,
      // @ts-expect-error - structuredPaths is used but may be missing from typings
      structuredPaths: true
    });
    
    const nodes = result.ast || [];
    if (!nodes || nodes.length === 0) {
      throw new Error(`Failed to parse example: ${code}`);
    }
    
    // The first node should be our directive
    const directiveNode = nodes[0];
    if (directiveNode.type !== 'Directive') {
      throw new Error(`Example did not produce a directive node: ${code}`);
    }
    
    return directiveNode as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with meld-ast:', error);
    throw error;
  }
}

// Local definition of reconstructRawString (copied from parser helpers)
function reconstructRawString(nodes: InterpolatableValue | string | PathValueObject): string {
  if (!Array.isArray(nodes)) {
    // Handle case where PathValueObject is passed directly
    if (typeof nodes === 'object' && nodes !== null && 'raw' in nodes) {
        return nodes.raw;
    }
    return String(nodes || '');
  }
  return nodes.map(node => {
    if (!node || typeof node !== 'object') {
      return '';
    }
    if (node.type === 'Text') { 
      return node.content || '';
    }
    if (node.type === 'VariableReference') { 
      let fieldsStr = '';
      if (node.fields && node.fields.length > 0) {
        fieldsStr = node.fields.map(f => {
          if (f.type === 'field') return '.' + f.value;
          if (f.type === 'index') {
              if (typeof f.value === 'string') {
                  return `[${f.value}]`;
              } else {
                  return `[${f.value}]`;
              }
          }
          return '';
        }).join('');
      }
      let formatStr = node.format ? `>>${node.format}` : '';

      if (node.valueType === 'path') {
        return `$${node.identifier}${fieldsStr}${formatStr}`;
      }
      return `{{${node.identifier}${fieldsStr}${formatStr}}}`;
    }
    return '';
  }).join('');
}

// Helper to create a valid PathValueObject for tests
function createTestPathObject(rawPath: string, isUrl: boolean = false): PathValueObject {
  return {
    raw: rawPath,
    structured: {
      base: isUrl ? '' : '.',
      segments: rawPath.split('/').filter(s => s !== '.' && s !== ''),
      url: isUrl,
      variables: { text: [], special: [], path: [] }
    },
  };
}

// Helper to create a basic ImportDirectiveNode for tests
function createTestImportNode(options: {
  pathObject: PathValueObject;
  imports?: Array<{ name: string; alias?: string | null }>;
  subtype?: 'importAll' | 'importSelected';
  location?: SourceLocation;
}): ImportDirectiveNode {
  const { pathObject, imports = [{ name: '*' }], subtype = 'importAll', location = createTestLocation(1, 1) } = options;
  const nodeId = crypto.randomUUID();
  
  // Transform imports to node structure
  const importNodes = imports.map(imp => ({
    type: 'VariableReference' as const,
    identifier: imp.name,
    valueType: 'import' as const,
    alias: imp.alias || undefined,
    nodeId: crypto.randomUUID()
  }));
  
  // Transform path to node structure
  const pathNodes = [
    {
      type: 'Text' as const,
      content: pathObject.raw,
      nodeId: crypto.randomUUID()
    }
  ];
  
  return {
    type: 'Directive',
    kind: 'import',
    subtype,
    values: {
      imports: importNodes,
      path: pathNodes
    },
    raw: {
      imports: imports.map(imp => imp.name).join(', '),
      path: pathObject.raw
    },
    meta: {
      path: {
        hasVariables: false,
        isAbsolute: pathObject.raw.startsWith('/'),
        hasExtension: pathObject.raw.includes('.'),
        extension: pathObject.raw.split('.').pop() || ''
      }
    },
    location,
    nodeId,
  } as ImportDirectiveNode;
}

// >>> REFACTOR HELPER HERE <<<
const createMockInterpretedState = (vars: { text?: Map<string, VariableDefinition>, data?: Map<string, VariableDefinition>, path?: Map<string, VariableDefinition>, command?: Map<string, VariableDefinition> } = {}): IStateService => {
    const textMap = vars.text ?? new Map<string, VariableDefinition>();
    const dataMap = vars.data ?? new Map<string, VariableDefinition>();
    const pathMap = vars.path ?? new Map<string, VariableDefinition>();
    const commandMap = vars.command ?? new Map<string, VariableDefinition>();

    // Combine vars for getLocalChanges
    const combinedVars: Record<string, VariableDefinition> = {};
    textMap.forEach((v, k) => combinedVars[k] = v);
    dataMap.forEach((v, k) => combinedVars[k] = v);
    pathMap.forEach((v, k) => combinedVars[k] = v);
    commandMap.forEach((v, k) => combinedVars[k] = v);

    // Return a plain object implementing the necessary IStateService methods
    return {
        getStateId: vi.fn().mockReturnValue(`mock-interpreted-${crypto.randomUUID()}`),
        getAllTextVars: vi.fn().mockReturnValue(textMap),
        getAllDataVars: vi.fn().mockReturnValue(dataMap),
        getAllPathVars: vi.fn().mockReturnValue(pathMap),
        getAllCommands: vi.fn().mockReturnValue(commandMap),
        getTransformedNodes: vi.fn().mockReturnValue([]),
        // Add stubs for other potentially accessed methods by ImportDirectiveHandler
        getCurrentFilePath: vi.fn().mockReturnValue('/imported/transform/file.meld'), // Default path
        isTransformationEnabled: vi.fn().mockReturnValue(true), // Assume true for transformation tests
        setVariable: vi.fn(),
        getVariable: vi.fn().mockImplementation((name: string) => { 
            return textMap.get(name) ?? dataMap.get(name) ?? pathMap.get(name) ?? commandMap.get(name);
        }),
        setCurrentFilePath: vi.fn(),
        clone: vi.fn(),
        getNodes: vi.fn().mockReturnValue([]),
        addNode: vi.fn(),
        createChildState: vi.fn(),
        mergeChildState: vi.fn(),
        getLocalChanges: vi.fn().mockReturnValue(Object.keys(combinedVars)), // Return array of keys
        // Add any other methods if linting/errors indicate they are needed
    } as unknown as IStateService; // Use type assertion as we are partially mocking
};

describe('ImportDirectiveHandler Transformation', () => {
  let handler: ImportDirectiveHandler;
  let mockStateService: DeepMockProxy<IStateService>;
  let mockResolutionService: DeepMockProxy<IResolutionService>;
  let mockFileSystemService: DeepMockProxy<IFileSystemService>;
  let mockPathService: DeepMockProxy<IPathService>;
  let mockParserService: DeepMockProxy<IParserService>;
  let mockInterpreterServiceClientFactory: DeepMockProxy<InterpreterServiceClientFactory>;
  let mockInterpreterServiceClient: DeepMockProxy<IInterpreterServiceClient>;
  let mockCircularityService: DeepMockProxy<ICircularityService>;
  let mockValidationService: DeepMockProxy<IValidationService>;
  let mockUrlContentResolver: DeepMockProxy<IURLContentResolver>;
  let mockStateTrackingService: DeepMockProxy<IStateTrackingService>;
  let testContainer: DependencyContainer;
  let mockProcessingContext: DirectiveProcessingContext;

  beforeEach(async () => {
    // Use manual child container
    testContainer = container.createChildContainer();

    // Create mocks using mockDeep
    mockStateService = mockDeep<IStateService>();
    mockResolutionService = mockDeep<IResolutionService>();
    mockFileSystemService = mockDeep<IFileSystemService>();
    mockPathService = mockDeep<IPathService>();
    mockParserService = mockDeep<IParserService>();
    mockCircularityService = mockDeep<ICircularityService>();
    mockValidationService = mockDeep<IValidationService>();
    mockInterpreterServiceClient = mockDeep<IInterpreterServiceClient>();
    mockInterpreterServiceClientFactory = mockDeep<InterpreterServiceClientFactory>();
    mockUrlContentResolver = mockDeep<IURLContentResolver>();
    mockStateTrackingService = mockDeep<IStateTrackingService>();

    // Configure default mock behaviors
    mockInterpreterServiceClientFactory.createClient.mockReturnValue(mockInterpreterServiceClient);
    mockInterpreterServiceClient.interpret.mockResolvedValue(createMockInterpretedState());
    mockValidationService.validate.mockResolvedValue();
    mockStateService.isTransformationEnabled.mockReturnValue(true); // IMPORTANT for transformation tests
    mockStateService.createChildState.mockResolvedValue(mockDeep<IStateService>({ setCurrentFilePath: vi.fn() }));
    mockStateService.getCurrentFilePath.mockReturnValue('/project/transform.meld');
    mockFileSystemService.exists.mockResolvedValue(true);
    mockFileSystemService.readFile.mockResolvedValue('@text var1="value1"');
    mockParserService.parse.mockResolvedValue([] as MeldNode[]);
    mockResolutionService.resolveNodes = vi.fn().mockImplementation(async (nodes) => {
      // Extract raw text from the nodes
      let raw = '';
      nodes.forEach((node: any) => {
        if (node.type === 'Text') {
          raw += node.content;
        } else if (node.type === 'VariableReference') {
          raw += `$${node.identifier}`;
        } else if (node.type === 'PathSeparator') {
          raw += node.separator || '/';
        }
      });
      return raw;
    });
    mockResolutionService.resolvePath.mockImplementation(async (pathInput, ctx) => {
        let raw = '';
        if (typeof pathInput === 'string') raw = pathInput;
        else if (Array.isArray(pathInput)) raw = reconstructRawString(pathInput);
        else raw = (pathInput as any)?.raw ?? '';
        const currentPath = ctx?.currentFilePath ?? '/project/main.meld';
        const baseDir = currentPath.substring(0, currentPath.lastIndexOf('/'));
        const isUrl = raw.startsWith('http');
        const resolved = isUrl ? raw : `${baseDir}/${raw}`.replace(/\/\//g, '/');
        return createMeldPath(raw, unsafeCreateValidatedResourcePath(resolved), resolved.startsWith('/') || isUrl);
    });

    // Register all mocks in the manual container
    testContainer.registerInstance<IStateService>('IStateService', mockStateService);
    testContainer.registerInstance<IResolutionService>('IResolutionService', mockResolutionService);
    testContainer.registerInstance<IFileSystemService>('IFileSystemService', mockFileSystemService);
    testContainer.registerInstance<IPathService>('IPathService', mockPathService);
    testContainer.registerInstance<IParserService>('IParserService', mockParserService);
    testContainer.registerInstance<ICircularityService>('ICircularityService', mockCircularityService);
    testContainer.registerInstance<IValidationService>('IValidationService', mockValidationService);
    testContainer.registerInstance(InterpreterServiceClientFactory, mockInterpreterServiceClientFactory); // Use class token
    testContainer.registerInstance<IURLContentResolver>('IURLContentResolver', mockUrlContentResolver);
    testContainer.registerInstance('StateTrackingService', mockStateTrackingService); // Use string token if that's how it's injected
    testContainer.registerInstance('ILogger', { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() });
    testContainer.registerInstance('DependencyContainer', testContainer);

    // Register the REAL handler class
    testContainer.register(ImportDirectiveHandler, { useClass: ImportDirectiveHandler });

    // Resolve handler via DI AFTER registering all dependencies
    handler = testContainer.resolve(ImportDirectiveHandler);
  });

  afterEach(async () => {
    testContainer?.dispose();
    vi.resetAllMocks(); // Keep resetting mocks
  });

  // Updated helper to create full DirectiveProcessingContext using factory
  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      // Use the factory for ResolutionContext
      const resolutionContext = ResolutionContextFactory.create(
          mockStateService, 
          mockStateService.getCurrentFilePath() ?? undefined
      ).withFlags({ isTransformation: true }); // Ensure transformation flag is set
      
      const mockFormattingContext: OutputFormattingContext = { 
          isBlock: false, 
          preserveLiteralFormatting: false, 
          preserveWhitespace: false 
      };

      return {
          state: mockStateService, 
          resolutionContext: resolutionContext,
          directiveNode: node,
          formattingContext: mockFormattingContext, 
      };
  };

  describe('transformation behavior', () => {
    it('should return DirectiveResult with empty text node replacement when transformation enabled', async () => {
      const importPath = 'imported.meld';
      const finalPath = '/project/imported.meld';
      const importLocation = createTestLocation(5, 1);
      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });

      // Configure service mocks for this specific test
      mockResolutionService.resolvePath.mockResolvedValueOnce(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      mockFileSystemService.readFile.mockResolvedValueOnce('@text var1="value1"');
      mockParserService.parse.mockResolvedValueOnce([]); // Assume empty parse result for simplicity here

      // Mock the state returned by the *interpreted* import
      const textVarMap = new Map<string, VariableDefinition>();
      textVarMap.set('var1', createTextVariable('var1', 'value1', { origin: VariableOrigin.DIRECT_DEFINITION, definedAt: importLocation }));
      const mockInterpretedState = createMockInterpretedState({ text: textVarMap });
      mockInterpreterServiceClient.interpret.mockResolvedValueOnce(mockInterpretedState);

      mockProcessingContext = createMockProcessingContext(node);
      const result = await handler.handle(mockProcessingContext as DirectiveProcessingContext) as DirectiveResult;

      expect(result.replacement).toEqual([]);
      // Check stateChanges instead of direct calls
      expect(result.stateChanges?.variables).toHaveProperty('var1');
      expect(result.stateChanges?.variables?.var1?.value).toBe('value1');
      expect(result.stateChanges?.variables?.var1?.metadata?.origin).toBe(VariableOrigin.IMPORT); // Verify origin
    });


    it('should preserve error handling and cleanup in transformation mode', async () => {
      const importPath = 'missing.meld';
      const finalPath = '/project/missing.meld';
      const importLocation = createTestLocation(1, 1);
      const node = createTestImportNode({
        pathObject: createTestPathObject(importPath),
        location: importLocation
      });
      
      mockResolutionService.resolvePath.mockResolvedValue(createMeldPath(importPath, unsafeCreateValidatedResourcePath(finalPath), true));
      // Configure mocks for error path
      mockFileSystemService.exists.mockResolvedValue(false); 
      // No need to mock readFile if exists is false

      mockProcessingContext = createMockProcessingContext(node);

      await expectToThrowWithConfig(
        () => handler.handle(mockProcessingContext as DirectiveProcessingContext),
        {
          type: 'DirectiveError',
          code: DirectiveErrorCode.FILE_NOT_FOUND,
          messageContains: 'Import file not found:' 
        }
      );
      expect(mockCircularityService.endImport).toHaveBeenCalledWith(finalPath.replace(/\\/g, '/'));
    });
  });
}); 