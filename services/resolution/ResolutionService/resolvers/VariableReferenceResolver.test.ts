import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';

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
} from '@core/types/variables.js';
import {
    MeldPath,
    PathContentType,
    ValidatedResourcePath,
    unsafeCreateValidatedResourcePath,
    type IFilesystemPathState // Keep if needed
} from '@core/types/paths';
// Removed incorrect/conflicting imports from @core/types/index.js

// --- Other Imports ---
import type { VariableReferenceNode, TextNode } from '@core/ast/ast/astTypes.js';
import { MeldResolutionError, FieldAccessError, VariableResolutionError } from '@core/errors/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js'; 
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { TestContextDI } from '@tests/utils/di/index.js';
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { expectToThrowWithConfig } from '@tests/utils/ErrorTestUtils.js'; 
import { createVariableReferenceNode } from '@tests/utils/testFactories.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
// Removed duplicate import of IFilesystemPathState
import { createStateServiceMock } from '@tests/utils/mocks/serviceMocks.js';

describe('VariableReferenceResolver', () => {
  let contextDI: TestContextDI;
  let resolver: VariableReferenceResolver;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let parserService: DeepMockProxy<IParserService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let pathService: Partial<IPathService>;
  let context: ResolutionContext;
  let fileSystemService: DeepMockProxy<IFileSystemService>;

  // --- Define ALL mock variables/defs used in tests --- 
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
    contextDI = TestContextDI.createIsolated();

    // Initialize mocks
    stateService = createStateServiceMock(); 
    fileSystemService = mockDeep<IFileSystemService>();
    parserService = mockDeep<IParserService>(); 
    resolutionService = mockDeep<IResolutionService>();
    pathService = { 
        resolvePath: vi.fn() as any, 
        validatePath: vi.fn() as any,
    };

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
    
    // Restore other necessary mocks
    stateService.getCurrentFilePath.mockReturnValue('/mock/dir/test.meld');
    // ... potentially restore getTextVar, getDataVar etc. if needed by specific tests ...
    
    // --- Mock other services ---
    fileSystemService.executeCommand.mockResolvedValue({ stdout: '', stderr: '' });
    fileSystemService.dirname.mockImplementation(p => p ? p.substring(0, p.lastIndexOf('/') || 0) : '');
    fileSystemService.getCwd.mockReturnValue('/mock/cwd');
    
    // --- Register ALL mocks (still needed if other services use DI) --- 
    contextDI.registerMock<IStateService>('IStateService', stateService);
    contextDI.registerMock<IFileSystemService>('IFileSystemService', fileSystemService);
    contextDI.registerMock<IParserService>('IParserService', parserService);
    contextDI.registerMock<IResolutionService>('IResolutionService', resolutionService);
    contextDI.registerMock<IPathService>('IPathService', pathService as IPathService); 
    
    // --- Explicitly Resolve Mocks (Optional, keep for now) ---
    await contextDI.resolve<IStateService>('IStateService');
    await contextDI.resolve<IFileSystemService>('IFileSystemService');
    await contextDI.resolve<IParserService>('IParserService');
    await contextDI.resolve<IResolutionService>('IResolutionService');
    await contextDI.resolve<IPathService>('IPathService');

    // --- Instantiate resolver DIRECTLY --- 
    resolver = new VariableReferenceResolver(stateService, pathService as IPathService, resolutionService, parserService);

    context = ResolutionContextFactory.create(stateService, 'test.meld')
               .withStrictMode(true); 
  });
  
  afterEach(async () => {
    await contextDI?.cleanup();
  });

  describe('resolve', () => {
    it('should resolve text variables using node.valueType', async () => {
      const node = createVariableReferenceNode('greeting', VariableType.TEXT);
      const mockVar: TextVariable = { name: 'greeting', type: VariableType.TEXT, value: 'Hello World' };
      stateService.getTextVar.calledWith('greeting').mockResolvedValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe('Hello World');
      expect(stateService.getVariable).toHaveBeenCalledWith('greeting');
    });

    it('should resolve data variables using node.valueType', async () => {
      const node = createVariableReferenceNode('dataVar', VariableType.DATA);
      const mockData = { key: 'value' };
      const mockVar: DataVariable = { name: 'dataVar', type: VariableType.DATA, value: mockData };
      
      stateService.getDataVar.calledWith('dataVar').mockResolvedValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe(JSON.stringify(mockData)); 
      expect(stateService.getVariable).toHaveBeenCalledWith('dataVar');
    });

    it('should handle field access in data variables', async () => {
       // This test uses the default mockDataObjVar { user: { name: 'Alice' } }
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, 
          [{ type: 'field', value: 'user' }, { type: 'field', value: 'name' }]
      );
      const result = await resolver.resolve(node, context);
      expect(result).toBe('Alice');
      expect(stateService.getVariable).toHaveBeenCalledWith('dataObj'); // Check getVariable call
    });

    it('should handle array index access in data variables', async () => {
      // Use the dataObjWithUsers variable defined in beforeEach

      // Pass AstField-like structure directly to createVariableReferenceNode
      const node = createVariableReferenceNode('dataObjWithUsers', VariableType.DATA,
          [{ type: 'field', value: 'users' }, { type: 'index', value: 1 }]
      );

      const result = await resolver.resolve(node, context);
      expect(result).toBe('Bob');
      expect(stateService.getVariable).toHaveBeenCalledWith('dataObjWithUsers');
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
      stateService.getTextVar.calledWith('missing').mockResolvedValue(undefined);
      
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

      stateService.getDataVar.calledWith('dataObj').mockResolvedValue(mockVar); // Ensure this mock remains if needed
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
      expect(stateService.getVariable).toHaveBeenCalledWith('docsPath'); // Check getVariable call
    });
    
    it('should resolve command variables using node.valueType', async () => {
      const node = createVariableReferenceNode('myCmd', VariableType.COMMAND);
      // Uses mockMyCmdVar from beforeEach
      const mockCmdDef = mockMyCmdVar.value;

      const result = await resolver.resolve(node, context);
      
      expect(result).toBe(JSON.stringify(mockCmdDef)); // Verify resolver returns stringified def
      expect(stateService.getVariable).toHaveBeenCalledWith('myCmd'); // Check getVariable call
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
      textNode1 = { type: 'Text', content: 'Outer ', location: { start: { line: 1, column: 1 }, end: { line: 1, column: 7 } } };
      innerVarNode = createVariableReferenceNode('greeting', VariableType.TEXT); 
      textNode2 = { type: 'Text', content: ' Inner', location: { start: { line: 1, column: 8 }, end: { line: 1, column: 14 } } };
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
      resolutionService.resolveNodes.mockResolvedValue('Outer Hello World Inner');
    });

    it('should call resolutionService.resolveNodes for interpolatable variable values', async () => {
      const node = createVariableReferenceNode('recursiveTextVar', VariableType.TEXT);
      
      const result = await resolver.resolve(node, context);
      
      // Expect the final string returned by the mocked resolveNodes
      expect(result).toBe('Outer Hello World Inner');
      
      // Verify getVariable was called for the outer variable
      expect(stateService.getVariable).toHaveBeenCalledWith('recursiveTextVar');
      
      // Verify resolutionService.resolveNodes was called with the correct array and context
      expect(resolutionService.resolveNodes).toHaveBeenCalledTimes(1);
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(
        interpolatableValue, 
        expect.objectContaining({ depth: context.depth + 1 }) // Check context depth increased
      );
    });

    it('should throw MeldResolutionError if resolutionService is missing during recursion', async () => {
      // Create a resolver instance specifically without the resolutionService
      const resolverWithoutService = new VariableReferenceResolver(stateService, pathService as IPathService, undefined, parserService);
      
      const node = createVariableReferenceNode('recursiveTextVar', VariableType.TEXT);
      
      await expectToThrowWithConfig(async () => {
        await resolverWithoutService.resolve(node, context);
      }, {
        type: 'MeldResolutionError',
        code: 'E_SERVICE_UNAVAILABLE',
        messageContains: 'Cannot recursively resolve variable: ResolutionService instance is missing'
      });
    });

  });
  // --- End Recursive Resolution Tests ---

}); 