import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';

// Corrected Import Paths
import {
  ResolutionContext, 
  VariableType,
  FieldAccess,
  FieldAccessType,
  MeldPath,
  PathContentType,
  ValidatedResourcePath,
  unsafeCreateValidatedResourcePath,
  TextVariable, 
  DataVariable, 
  IPathVariable,
  CommandVariable, 
  MeldVariable,
  StructuredPath,
  PathResolutionContext
} from '@core/types/index.js';
import type { VariableReferenceNode } from '@core/ast/ast/astTypes.js';
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
// Import IFilesystemPathState for explicit typing
import type { IFilesystemPathState } from '@core/types/paths.js'; 

describe('VariableReferenceResolver', () => {
  let contextDI: TestContextDI;
  let resolver: VariableReferenceResolver;
  let stateService: DeepMockProxy<IStateService>;
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

    // Initialize ALL mocks first
    stateService = mockDeep<IStateService>();
    fileSystemService = mockDeep<IFileSystemService>();
    parserService = mockDeep<IParserService>(); 
    resolutionService = mockDeep<IResolutionService>(); // Initialize resolutionService
    pathService = { // Initialize pathService partial mock
        resolvePath: vi.fn() as any, 
        validatePath: vi.fn() as any,
    };

    // --- Mock implementation for getVariable --- 
    stateService.getVariable.mockImplementation((name: string): MeldVariable | undefined => {
        console.log(`[DEBUG MOCK getVariable] Called for: ${name}`); 
        if (name === 'greeting') return mockGreetingVar;
        if (name === 'dataVar') return mockDataVarVar;
        if (name === 'dataObj') return mockDataObjVar; 
        if (name === 'dataObjWithUsers') return mockDataObjWithUsersVar;
        if (name === 'docsPath') return mockDocsPathVar;
        if (name === 'myCmd') return mockMyCmdVar;
        if (name === 'var1') return mockVar1;
        if (name === 'var2') return mockVar2;
        // Add variables used in edge tests - they are expected to be undefined/not found
        if ([ 'nested', 'outer', 'user', 'missingVar', 'data', 'var_'].some(prefix => name.startsWith(prefix))) { // Simplified check
            console.log(`[DEBUG MOCK getVariable] Explicitly returning undefined for edge case var: ${name}`);
            return undefined;
        }
        // 'missing' variable is intentionally undefined
        console.log(`[DEBUG MOCK getVariable] NOT FOUND for: ${name}`);
        return undefined;
    });
    
    // --- Mock specific getters (can act as fallback/verification) --- 
    stateService.getTextVar.mockImplementation((name: string) => {
        if (name === 'greeting') return mockGreetingVar;
        if (name === 'var1') return mockVar1;
        if (name === 'var2') return mockVar2;
        return undefined;
    });
    stateService.getDataVar.mockImplementation((name: string) => {
        // Default mock for dataObj
        if (name === 'dataObj') return mockDataObjVar;
        if (name === 'dataVar') return mockDataVarVar;
        return undefined;
    });
    stateService.getPathVar.mockImplementation((name: string) => {
        if (name === 'docsPath') return mockDocsPathVar;
        return undefined;
    });
    stateService.getCommandVar.mockImplementation((name: string) => {
        if (name === 'myCmd') return mockMyCmdVar;
        return undefined;
    });
    
    // --- Mock other services --- 
    fileSystemService.executeCommand.mockResolvedValue({ stdout: '', stderr: '' });
    fileSystemService.dirname.mockImplementation(p => p ? p.substring(0, p.lastIndexOf('/') || 0) : '');
    fileSystemService.getCwd.mockReturnValue('/mock/cwd');
    stateService.getCurrentFilePath.mockReturnValue('/mock/dir/test.meld');

    // --- Register ALL mocks --- 
    contextDI.registerMock<IStateService>('IStateService', stateService);
    contextDI.registerMock<IFileSystemService>('IFileSystemService', fileSystemService);
    contextDI.registerMock<IParserService>('IParserService', parserService);
    contextDI.registerMock<IResolutionService>('IResolutionService', resolutionService); // Register resolutionService
    contextDI.registerMock<IPathService>('IPathService', pathService as IPathService); 
    
    // --- Instantiate resolver AFTER mocks are initialized and registered --- 
    // resolver = new VariableReferenceResolver(stateService, pathService as IPathService, resolutionService, parserService); 
    resolver = await contextDI.resolve(VariableReferenceResolver);

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
      // No need for test-specific mock overrides anymore
      
      const fieldsDefinition: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'users' },
        { type: FieldAccessType.INDEX, key: 1 }
      ];
      // Use 'dataObjWithUsers' identifier
      const node = createVariableReferenceNode('dataObjWithUsers', VariableType.DATA, 
          fieldsDefinition.map(f => ({ type: f.type === FieldAccessType.PROPERTY ? 'field' : 'index', value: f.key }))
      );
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('Bob');
      // Expect getVariable to be called with the correct identifier
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
        messageContains: "Variable not found: missing",
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
        messageContains: "Field 'age' not found in object.",
      });
    });

    it('should return empty string on invalid field access in non-strict mode', async () => {
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fieldsDefinition: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'user' },
        { type: FieldAccessType.INDEX, key: 10 }
      ];
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, 
          fieldsDefinition.map(f => ({
             type: f.type === FieldAccessType.PROPERTY ? 'field' : 'index',
             value: f.key
           }))
      );

      stateService.getDataVar.calledWith('dataObj').mockResolvedValue(mockVar);
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
      
      expect(result).toBe(validatedPathString);
      expect(stateService.getVariable).toHaveBeenCalledWith('docsPath'); // Check getVariable call
      expect(pathService.resolvePath).toHaveBeenCalledWith(mockPath.originalValue, expect.any(String)); 
      expect(pathService.validatePath).toHaveBeenCalledWith(resolvedMeldPath, expect.objectContaining({ 
          workingDirectory: expect.any(String),
          allowExternalPaths: expect.any(Boolean),
          rules: expect.objectContaining({
              allowAbsolute: true,
              allowRelative: true,
              allowParentTraversal: expect.any(Boolean)
          })
      }));
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
}); 