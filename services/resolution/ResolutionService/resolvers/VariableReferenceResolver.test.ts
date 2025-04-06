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
  MeldVariable
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

describe('VariableReferenceResolver', () => {
  let contextDI: TestContextDI;
  let resolver: VariableReferenceResolver;
  let stateService: DeepMockProxy<IStateService>;
  let parserService: DeepMockProxy<IParserService>;
  let resolutionService: DeepMockProxy<IResolutionService>;
  let pathService: DeepMockProxy<IPathService>;
  let context: ResolutionContext;

  beforeEach(async () => {
    contextDI = TestContextDI.createIsolated();

    // Create mocks
    stateService = mockDeep<IStateService>();
    parserService = mockDeep<IParserService>();
    resolutionService = mockDeep<IResolutionService>();
    pathService = mockDeep<IPathService>();

    // Register mocks
    contextDI.registerMock<IStateService>('IStateService', stateService);
    contextDI.registerMock<IParserService>('IParserService', parserService);
    contextDI.registerMock<IResolutionService>('IResolutionService', resolutionService);
    contextDI.registerMock<IPathService>('IPathService', pathService);
    
    // Instantiate resolver directly, passing mocks
    resolver = new VariableReferenceResolver(stateService, pathService, resolutionService, parserService);
    
    // Use ResolutionContextFactory to create the context
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
      expect(stateService.getTextVar).toHaveBeenCalledWith('greeting');
      expect(stateService.getDataVar).not.toHaveBeenCalled();
    });

    it('should resolve data variables using node.valueType', async () => {
      const node = createVariableReferenceNode('dataVar', VariableType.DATA);
      const mockData = { key: 'value' };
      const mockVar: DataVariable = { name: 'dataVar', type: VariableType.DATA, value: mockData };
      
      stateService.getDataVar.calledWith('dataVar').mockResolvedValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe(JSON.stringify(mockData)); 
      expect(stateService.getDataVar).toHaveBeenCalledWith('dataVar');
      expect(stateService.getTextVar).not.toHaveBeenCalled();
    });

    it('should handle field access in data variables', async () => {
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fieldsDefinition: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'user' }, 
        { type: FieldAccessType.PROPERTY, key: 'name' }
      ];
      // @ts-ignore - Persistent linter error: Type mapping conflict (key vs value) between FieldAccess and node factory param.
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, 
          fieldsDefinition.map(f => ({ ...f, value: f.key }))
      );

      stateService.getDataVar.calledWith('dataObj').mockResolvedValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('Alice');
      expect(stateService.getDataVar).toHaveBeenCalledWith('dataObj');
    });

    it('should handle array index access in data variables', async () => {
      const mockData = { users: ['Alice', 'Bob'] };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fieldsDefinition: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'users' },
        { type: FieldAccessType.INDEX, key: 1 }
      ];
      // @ts-ignore - Persistent linter error: Type mapping conflict (key vs value) between FieldAccess and node factory param.
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, 
          fieldsDefinition.map(f => ({ ...f, value: f.key }))
      );

      stateService.getDataVar.calledWith('dataObj').mockResolvedValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('Bob');
      expect(stateService.getDataVar).toHaveBeenCalledWith('dataObj');
    });

    it('should throw VariableResolutionError for undefined variables in strict mode', async () => {
      const node = createVariableReferenceNode('missing', VariableType.TEXT);
      stateService.getTextVar.calledWith('missing').mockResolvedValue(undefined);
      
      await expectToThrowWithConfig(async () => {
        await resolver.resolve(node, context);
      }, {
        type: 'VariableResolutionError',
        messageContains: "Variable not found: missing",
        code: 'E_VAR_NOT_FOUND'
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
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fieldsDefinition: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'user' },
        { type: FieldAccessType.PROPERTY, key: 'age' } 
      ];
      // @ts-ignore - Persistent linter error: Type mapping conflict (key vs value) between FieldAccess and node factory param.
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, 
          fieldsDefinition.map(f => ({ ...f, value: f.key }))
      );

      stateService.getDataVar.calledWith('dataObj').mockResolvedValue(mockVar);

      await expectToThrowWithConfig(async () => {
        await resolver.resolve(node, context);
      }, {
        type: 'FieldAccessError',
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
      // @ts-ignore - Persistent linter error: Type mapping conflict (key vs value) between FieldAccess and node factory param.
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, 
          fieldsDefinition.map(f => ({ ...f, value: f.key }))
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
      
      // @ts-ignore - Persistent linter error: MeldPath subtypes/mock structure incompatible.
      const mockPath: MeldPath = {
         contentType: PathContentType.FILESYSTEM,
         originalValue: rawPathString,
         validatedPath: unsafeCreateValidatedResourcePath(''), 
         isAbsolute: false,
         isSecure: true,
         isValidSyntax: true 
      };
      const mockVar: IPathVariable = { name: 'docsPath', type: VariableType.PATH, value: mockPath };
      stateService.getPathVar.calledWith('docsPath').mockResolvedValue(mockVar);
      
      // @ts-ignore - Persistent linter error: MeldPath subtypes/mock structure incompatible.
      const resolvedMeldPath: MeldPath = { 
          contentType: PathContentType.FILESYSTEM, 
          originalValue: rawPathString, 
          validatedPath: unsafeCreateValidatedResourcePath(resolvedPathString),
          isAbsolute: true,
          isSecure: true,
          isValidSyntax: true
      }; 
      // @ts-ignore - Persistent linter error: calledWith type mismatch for pathService.resolvePath.
      pathService.resolvePath.calledWith(mockPath, expect.any(String)).mockResolvedValue(resolvedMeldPath);
      
      // @ts-ignore - Persistent linter error: MeldPath subtypes/mock structure incompatible.
      const validatedMeldPath: MeldPath = { 
          ...resolvedMeldPath,
          validatedPath: unsafeCreateValidatedResourcePath(validatedPathString)
      };
      // @ts-ignore - Persistent linter error: calledWith type mismatch for pathService.validatePath.
      pathService.validatePath.calledWith(resolvedMeldPath, expect.objectContaining({
          purpose: context.pathContext?.purpose,
          validation: context.pathContext?.validation 
      })).mockResolvedValue(validatedMeldPath);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe(validatedPathString);
      expect(stateService.getPathVar).toHaveBeenCalledWith('docsPath');
      // @ts-ignore - Persistent linter error: calledWith type mismatch for pathService.resolvePath.
      expect(pathService.resolvePath).toHaveBeenCalledWith(mockPath, expect.any(String)); 
      // @ts-ignore - Persistent linter error: calledWith type mismatch for pathService.validatePath.
      expect(pathService.validatePath).toHaveBeenCalledWith(resolvedMeldPath, expect.objectContaining({ 
          purpose: context.pathContext?.purpose,
          validation: context.pathContext?.validation
      }));
    });
    
    it('should resolve command variables using node.valueType', async () => {
      const node = createVariableReferenceNode('myCmd', VariableType.COMMAND);
      const mockCmdDef = { 
          name: 'myCmd', 
          type: 'basic',
          commandTemplate: 'echo Hello', 
          parameters: [],
          isMultiline: false
      };
      const mockVar: CommandVariable = { name: 'myCmd', type: VariableType.COMMAND, value: mockCmdDef };
      stateService.getCommandVar.calledWith('myCmd').mockResolvedValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe(JSON.stringify(mockCmdDef)); 
      expect(stateService.getCommandVar).toHaveBeenCalledWith('myCmd');
    });

  }); 
}); 