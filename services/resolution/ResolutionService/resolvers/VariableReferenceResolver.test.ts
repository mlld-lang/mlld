import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from 'vitest';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver';
import { ResolutionServiceClientFactory } from '@services/resolution/ResolutionService/factories/ResolutionServiceClientFactory';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient';

// --- Corrected Core Type Imports ---
import type { JsonValue, Result } from '@core/types';
import { MeldError } from '@core/types'; // Keep MeldError if needed
import type { ResolutionContext, PathResolutionContext } from '@core/types/resolution'; 
import {
    VariableType, 
    type MeldVariable, 
    type TextVariable, 
    type DataVariable, 
    type IPathVariable, 
    type CommandVariable
} from '@core/types/variables';
import {
    MeldPath,
    PathContentType,
    ValidatedResourcePath,
    unsafeCreateValidatedResourcePath,
    type IFilesystemPathState // Keep if needed
} from '@core/types/paths';
// Removed incorrect/conflicting imports from @core/types/index.js

// --- Other Imports ---
import type { VariableReferenceNode, TextNode } from '@core/ast/ast/astTypes';
import { MeldResolutionError, FieldAccessError, VariableResolutionError } from '@core/errors/index';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import type { IParserService } from '@services/pipeline/ParserService/IParserService'; 
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { TestContextDI } from '@tests/utils/di/index';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils'; 
import { createVariableReferenceNode } from '@tests/utils/testFactories';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
// Removed duplicate import of IFilesystemPathState
import { createStateServiceMock } from '@tests/utils/mocks/serviceMocks';
import { container, type DependencyContainer } from 'tsyringe'; // Import container and DependencyContainer

// Define explicit mock types matching used methods
type MockResolutionService = Pick<IResolutionService, 'resolveNodes' | 'resolveInContext' | 'resolveFieldAccess' | 'validateResolution' | 'convertToFormattedString'>;
type MockPathService = Pick<IPathService, 'resolvePath' | 'validatePath'>; // Add others if needed

describe('VariableReferenceResolver', () => {
  // Remove contextDI if not used for fs/fixtures
  // let contextDI: TestContextDI; 
  let testContainer: DependencyContainer; // Use manual container
  let resolver: VariableReferenceResolver;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let parserService: Partial<IParserService>; // Use Partial for manual mocks
  let resolutionService: MockResolutionService; // Use explicit mock type
  let pathService: MockPathService; // Use explicit mock type
  let resolutionServiceClientFactory: DeepMockProxy<ResolutionServiceClientFactory>;
  let mockResolutionClient: DeepMockProxy<IResolutionServiceClient>;
  let context: ResolutionContext;
  // Remove fileSystemService if not directly needed by this resolver/tests
  // let fileSystemService: DeepMockProxy<IFileSystemService>; 

  // --- Exec ALL mock variables/defs used in tests --- 
  const mockGreetingVar: TextVariable = { name: 'greeting', type: VariableType.TEXT, value: 'Hello World' };
  const mockDataVarVar: DataVariable = { name: 'dataVar', type: VariableType.DATA, value: { key: 'value' } };
  const mockDataObjVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: { user: { name: 'Alice' } } }; // Default
  const mockDataObjWithUsersVar: DataVariable = { name: 'dataObjWithUsers', type: VariableType.DATA, value: { users: ['Alice', 'Bob'] } };
  const mockPathValue: IFilesystemPathState = {
      contentType: PathContentType.FILESYSTEM, originalValue: '$./docs', validatedPath: unsafeCreateValidatedResourcePath(''), isAbsolute: false, isSecure: true, isValidSyntax: true
  };
  const mockDocsPathVar: IPathVariable = { name: 'docsPath', type: VariableType.PATH, value: mockPathValue };
  const mockCmdDef = { name: 'myCmd', type: 'basic' as const, commandTemplate: 'echo Hello', parameters: [], isMultiline: false };
  const mockMyCmdVar: CommandVariable = { name: 'myCmd', type: VariableType.COMMAND, value: mockCmdDef };
  const mockVar1: TextVariable = { name: 'var1', type: VariableType.TEXT, value: '{{var2}}' };
  const mockVar2: TextVariable = { name: 'var2', type: VariableType.TEXT, value: '{{var1}}' };

  beforeEach(async () => {
    // contextDI = TestContextDI.createIsolated(); // Remove if not used
    testContainer = container.createChildContainer(); // Create child container

    // Initialize mocks (Manual objects)
    stateService = createStateServiceMock(); 
    // fileSystemService = mockDeep<IFileSystemService>(); // Remove if not needed
    parserService = {
      parse: vi.fn(),
      parseWithLocations: vi.fn(),
      parseFile: vi.fn(),
      // Add other methods if needed by the resolver
    };
    resolutionService = {
      resolveNodes: vi.fn(),
      resolveInContext: vi.fn(),
      resolveFieldAccess: vi.fn(), 
      validateResolution: vi.fn(), 
      convertToFormattedString: vi.fn(),
    };
    pathService = { 
        resolvePath: vi.fn() as any, // Use as any to bypass type error
        validatePath: vi.fn() as any, // Use as any to bypass type error
    };
    resolutionServiceClientFactory = mockDeep<ResolutionServiceClientFactory>();
    mockResolutionClient = mockDeep<IResolutionServiceClient>();
    resolutionServiceClientFactory.createClient.mockReturnValue(mockResolutionClient);

    // Create a context using the factory
    // context = ResolutionContextFactory.create(stateService, 'test.meld')
    //           .withStrictMode(true); 

    // --- Restore Full Mock implementation for getVariable --- 
    stateService.getVariable.mockImplementation((name: string): MeldVariable | undefined => {
        console.log(`[DEBUG MOCK getVariable RESTORED] Called for: ${name}`); 
        if (name === 'greeting') return mockGreetingVar;
        if (name === 'dataVar') return mockDataVarVar;
        if (name === 'dataObj') return mockDataObjVar; 
        if (name === 'dataObjWithUsers') return mockDataObjWithUsersVar;
        if (name === 'docsPath') return mockDocsPathVar;
        if (name === 'myCmd') return mockMyCmdVar;
        if (name === 'var1') return mockVar1;
        if (name === 'var2') return mockVar2;
        // recursiveTextVar handled by override in its suite
        if (name === 'recursiveTextVar') return undefined; 
        
        if ([ 'nested', 'outer', 'user', 'missingVar', 'data', 'var_'].some(prefix => name.startsWith(prefix))) {
            console.log(`[DEBUG MOCK getVariable] Explicitly returning undefined for edge case var: ${name}`);
            return undefined;
        }
        console.log(`[DEBUG MOCK getVariable] NOT FOUND for: ${name}`);
        return undefined;
    });
    
    // Restore other necessary mocks FOR STATE SERVICE
    stateService.getCurrentFilePath.mockReturnValue('/mock/dir/test.meld');
    // ... potentially restore getTextVar, getDataVar etc. if needed by specific tests ...
    
    // --- Mock other services (IF NEEDED DIRECTLY, otherwise remove) ---
    // fileSystemService.executeCommand.mockResolvedValue({ stdout: '', stderr: '' }); // Remove if fileSystemService removed
    // fileSystemService.dirname.mockImplementation(p => p ? p.substring(0, p.lastIndexOf('/') || 0) : ''); // Remove if fileSystemService removed
    // fileSystemService.getCwd.mockReturnValue('/mock/cwd'); // Remove if fileSystemService removed
    
    // --- Register ALL mocks in the MANUAL container --- 
    testContainer.registerInstance<IStateService>('IStateService', stateService);
    // contextDI.registerMock<IFileSystemService>('IFileSystemService', fileSystemService); // Remove if fileSystemService removed
    testContainer.registerInstance<IParserService>('IParserService', parserService as IParserService); // Register manual mock
    testContainer.registerInstance<IResolutionService>('IResolutionService', resolutionService as IResolutionService); // Register manual mock
    testContainer.registerInstance<IPathService>('IPathService', pathService as IPathService); // Register manual mock
    
    // --- Register REAL Service Implementation ---
    // The resolver itself is registered automatically via @Service decorator,
    // but we need to ensure its dependencies are correctly mocked above.
    // If VariableReferenceResolver wasn't marked with @Service, we'd register it here:
    // testContainer.register(VariableReferenceResolver, { useClass: VariableReferenceResolver });
    // Or if injecting an interface:
    // testContainer.register('IVariableReferenceResolver', { useClass: VariableReferenceResolver });
    
    // --- Remove Explicit DI Context Resolves ---
    // await contextDI.resolve<IStateService>('IStateService'); 
    // await contextDI.resolve<IFileSystemService>('IFileSystemService');
    // await contextDI.resolve<IParserService>('IParserService');
    // await contextDI.resolve<IResolutionService>('IResolutionService');
    // await contextDI.resolve<IPathService>('IPathService');

    // --- RESOLVE the resolver from the MANUAL container --- 
    resolver = new VariableReferenceResolver(
        stateService as any, 
        pathService as any, 
        resolutionServiceClientFactory as any,
        parserService as any
    );

    context = ResolutionContextFactory.create(stateService, 'test.meld')
               .withStrictMode(true); 

    // Mock the client's resolveNodes method for the successful recursion test
    mockResolutionClient.resolveNodes.mockResolvedValue('Outer Hello World Inner');
  });
  
  afterEach(async () => {
    // await contextDI?.cleanup(); // Remove if contextDI is removed
    testContainer?.dispose(); // Dispose the manual container
  });

  describe('resolve', () => {
    it('should resolve text variables using node.valueType', async () => {
      const node = createVariableReferenceNode('greeting', VariableType.TEXT);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe('Hello World');
      expect(stateService.getVariable).toHaveBeenCalledWith('greeting', VariableType.TEXT);
    });

    it('should resolve data variables using node.valueType', async () => {
      const node = createVariableReferenceNode('dataVar', VariableType.DATA);
      const mockData = { key: 'value' };
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe(JSON.stringify(mockData)); 
      expect(stateService.getVariable).toHaveBeenCalledWith('dataVar', VariableType.DATA);
    });

    it('should handle field access in data variables', async () => {
       // This test uses the default mockDataObjVar { user: { name: 'Alice' } }
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, 
          [{ type: 'field', value: 'user' }, { type: 'field', value: 'name' }]
      );
      const result = await resolver.resolve(node, context);
      expect(result).toBe('Alice');
      expect(stateService.getVariable).toHaveBeenCalledWith('dataObj', VariableType.DATA); // Check getVariable call with type
    });

    it('should handle array index access in data variables', async () => {
      // Use the dataObjWithUsers variable defined in beforeEach

      // Pass AstField-like structure directly to createVariableReferenceNode
      const node = createVariableReferenceNode('dataObjWithUsers', VariableType.DATA,
          [{ type: 'field', value: 'users' }, { type: 'index', value: 1 }]
      );

      const result = await resolver.resolve(node, context);
      expect(result).toBe('Bob');
      expect(stateService.getVariable).toHaveBeenCalledWith('dataObjWithUsers', VariableType.DATA);
    });

    it('should throw VariableResolutionError for undefined variables in strict mode', async () => {
      const node = createVariableReferenceNode('missing', VariableType.TEXT);
      // Mock getVariable to return undefined for 'missing'
      stateService.getVariable.calledWith('missing').mockResolvedValue(undefined);
      
      await expectToThrowWithConfig(async () => {
        await resolver.resolve(node, context);
      }, {
        type: 'VariableResolutionError',
        messageContains: 'Variable not found: missing',
        code: 'E_VAR_NOT_FOUND' // Verify resolver throws this specific code now
      });
    });

    it('should return empty string for undefined variables in non-strict mode', async () => {
      const node = createVariableReferenceNode('missing', VariableType.TEXT);
      // No need to mock getTextVar separately, getVariable mock in beforeEach returns undefined
      
      const nonStrictContext = ResolutionContextFactory.create(stateService, 'test.meld')
                                 .withStrictMode(false);
      
      const result = await resolver.resolve(node, nonStrictContext);
      expect(result).toBe('');
    });

    it('should throw FieldAccessError on invalid field access in strict mode', async () => {
      // Uses default mockDataObjVar { user: { name: 'Alice' } }
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, 
          [{ type: 'field', value: 'user' }, { type: 'field', value: 'age' }]
      );

      await expectToThrowWithConfig(async () => {
        await resolver.resolve(node, context);
      }, {
        type: 'FieldAccessError', // Verify resolver lets this specific error bubble up
        messageContains: 'Field \'age\' not found in object.',
      });
    });

    it('should return empty string on invalid field access in non-strict mode', async () => {
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };

      // Pass AstField-like structure directly to createVariableReferenceNode
      const node = createVariableReferenceNode('dataObj', VariableType.DATA,
          [{ type: 'field', value: 'user' }, { type: 'index', value: 10 }]
      );

      // No need to mock getDataVar separately, getVariable mock in beforeEach handles dataObj
      const nonStrictContext = ResolutionContextFactory.create(stateService, 'test.meld')
                                 .withStrictMode(false);

      const result = await resolver.resolve(node, nonStrictContext);
      expect(result).toBe('');
    });

    it('should resolve path variables using PathService', async () => {
      const node = createVariableReferenceNode('docsPath', VariableType.PATH);
      const rawPathString = '$./docs';
      const resolvedPathString = '/abs/project/docs';
      const validatedPathString = '/abs/project/docs/validated';
      
      // Uses mockDocsPathVar from beforeEach
      const mockPath = mockDocsPathVar.value as IFilesystemPathState;
      
      const resolvedMeldPath: MeldPath = { 
          contentType: PathContentType.FILESYSTEM, originalValue: rawPathString, 
          validatedPath: unsafeCreateValidatedResourcePath(resolvedPathString),
          isAbsolute: true, isSecure: true, isValidSyntax: true 
      } as MeldPath;
      (pathService.resolvePath as any).mockResolvedValue(resolvedMeldPath);
      
      const validatedMeldPath: MeldPath = { 
          ...resolvedMeldPath,
          validatedPath: unsafeCreateValidatedResourcePath(validatedPathString)
      } as MeldPath;
      (pathService.validatePath as any).mockResolvedValue(validatedMeldPath);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe(mockPath.originalValue);
      expect(stateService.getVariable).toHaveBeenCalledWith('docsPath', VariableType.PATH); // Check getVariable call with type
    });
    
    it('should resolve command variables using node.valueType', async () => {
      const node = createVariableReferenceNode('myCmd', VariableType.COMMAND);
      // Uses mockMyCmdVar from beforeEach
      const mockCmdDef = mockMyCmdVar.value;

      const result = await resolver.resolve(node, context);
      
      expect(result).toBe(JSON.stringify(mockCmdDef)); // Verify resolver returns stringified def
      expect(stateService.getVariable).toHaveBeenCalledWith('myCmd', VariableType.COMMAND); // Check getVariable call with type
    });

  }); 

  // --- Tests for Recursive Resolution ---
  describe('recursive resolution', () => {
    let recursiveTextVar: TextVariable;
    let innerVarNode: VariableReferenceNode;
    let textNode1: TextNode;
    let textNode2: TextNode;
    let interpolatableValue: Array<TextNode | VariableReferenceNode>;

    beforeEach(() => {
      // Define the structure 
      textNode1 = { type: 'Text', content: 'Outer ', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 7 } }, nodeId: 'test-node-id-1' };
      innerVarNode = createVariableReferenceNode('greeting', VariableType.TEXT); 
      textNode2 = { type: 'Text', content: ' Inner', location: { start: { line: 1, column: 8 }, end: { line: 1, column: 14 } }, nodeId: 'test-node-id-2' };
      interpolatableValue = [textNode1, innerVarNode, textNode2];
      
      recursiveTextVar = { 
          name: 'recursiveTextVar', 
          type: VariableType.TEXT, 
          value: interpolatableValue as any 
      };
      
      const recursiveVarForMock = recursiveTextVar;
      const greetingVarForMock = mockGreetingVar; // Already defined outside

      // <<< Override getVariable mock AFTER defining vars >>>
      stateService.getVariable.mockImplementation((name: string): MeldVariable | undefined => {
        if (name === 'recursiveTextVar') return recursiveVarForMock; 
        if (name === 'greeting') return greetingVarForMock; 
        // Return undefined for anything else in this specific test suite
        return undefined; 
      });

      // Mock the resolutionService.resolveNodes method
      // Cast to Mock to access mock methods
      // (resolutionService.resolveNodes as Mock).mockResolvedValue('Outer Hello World Inner'); 
    });

    it('should call resolutionServiceClient.resolveNodes for interpolatable variable values', async () => {
      const node = createVariableReferenceNode('recursiveTextVar', VariableType.TEXT);
      
      const result = await resolver.resolve(node, context);
      
      // Expect the final string returned by the mocked resolveNodes
      expect(result).toBe('Outer Hello World Inner');
      
      // Verify getVariable was called for the outer variable
      expect(stateService.getVariable).toHaveBeenCalledWith('recursiveTextVar', VariableType.TEXT);
      
      // Verify resolutionServiceClient.resolveNodes was called with the correct array and context
      expect(mockResolutionClient.resolveNodes).toHaveBeenCalledTimes(1);
      expect(mockResolutionClient.resolveNodes).toHaveBeenCalledWith(
        interpolatableValue, 
        expect.objectContaining({ depth: context.depth + 1 }) // Check context depth increased
      );
    });

    it('should throw MeldResolutionError if resolutionServiceClient is missing during recursion', async () => {
      // --- Temporarily configure factory to return undefined client for THIS test ---
      resolutionServiceClientFactory.createClient.mockReturnValue(undefined as any);

      // Instantiate the resolver normally, passing the re-configured factory.
      // This will cause `this.resolutionClient` to be undefined inside the instance.
      const resolverWithoutClient = new VariableReferenceResolver(
        stateService,       // Mock stateService from beforeEach
        pathService as any,  // Mock pathService from beforeEach
        resolutionServiceClientFactory as any, // Pass the factory (now returns undefined client)
        parserService as any // Mock parserService from beforeEach
      );

      const node = createVariableReferenceNode('recursiveTextVar', VariableType.TEXT);

      // The resolve call should now definitely hit the check for the missing service
      await expectToThrowWithConfig(async () => {
        await resolverWithoutClient.resolve(node, context);
      }, {
        type: 'MeldResolutionError',
        code: 'E_SERVICE_UNAVAILABLE',
        messageContains: 'Cannot recursively resolve variable: ResolutionServiceClient is missing'
      });

      // --- Restore factory mock for subsequent tests (if any) ---
      resolutionServiceClientFactory.createClient.mockReturnValue(mockResolutionClient);
    });

  });
  // --- End Recursive Resolution Tests ---

}); 