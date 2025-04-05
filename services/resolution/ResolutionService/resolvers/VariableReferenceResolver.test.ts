import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';

// Import NEW Types
import type { 
  ResolutionContext, 
  VariableType, 
  FieldAccess,
  FieldAccessType
} from '@core/types';
import type { TextVariable, DataVariable, PathVariable, CommandVariable, MeldVariable } from '@core/types/variables-spec';
import type { VariableReferenceNode } from '@core/syntax/types.js';
import { MeldResolutionError, FieldAccessError, VariableResolutionError } from '@core/errors/index.js';
// import { VariableResolutionError as OldVariableResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
// import { FieldAccessType as OldFieldAccessType } from '@services/resolution/ResolutionService/IResolutionService.js';

// Import Test Utils
import { 
  // createMockStateService, // Removed
  createVariableReferenceNode
} from '@tests/utils/testFactories.js';

// Removed Old Types/Imports
// import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
// import type { ResolutionContext as OldResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
// import type { MeldNode, TextNode } from '@core/syntax/types.js';
import type { IStateService } from '@services/state/IStateService.js'; // Keep for mock typing
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js'; // Added ParserService type
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js'; // Added ResolutionService type
import { TestContextDI } from '@tests/utils/di/index.js'; // Added TestContextDI
import { DeepMockProxy, mockDeep } from 'vitest-mock-extended'; // Added mockDeep and DeepMockProxy
import { createMeldPath } from '@core/types/paths.js'; // Added path helper

describe('VariableReferenceResolver', () => {
  let contextDI: TestContextDI;
  let resolver: VariableReferenceResolver;
  // let stateService: ReturnType<typeof createMockStateService>; // Changed type
  let stateService: DeepMockProxy<IStateService>;
  let parserService: DeepMockProxy<IParserService>; // Added parser mock
  let resolutionService: DeepMockProxy<IResolutionService>; // Added resolution mock
  let context: ResolutionContext;

  beforeEach(async () => { // Made async
    contextDI = TestContextDI.createIsolated();

    // Create mocks
    stateService = mockDeep<IStateService>();
    parserService = mockDeep<IParserService>(); // Mock potentially needed dependencies
    resolutionService = mockDeep<IResolutionService>(); // Mock potentially needed dependencies

    // Register mocks
    contextDI.registerMock<IStateService>('IStateService', stateService);
    contextDI.registerMock<IParserService>('IParserService', parserService);
    contextDI.registerMock<IResolutionService>('IResolutionService', resolutionService);
    
    // Resolve the resolver via DI
    resolver = await contextDI.resolve(VariableReferenceResolver);
    
    // Define the NEW ResolutionContext, using the mocked stateService
    context = {
      flags: {
        strict: true,
        isLeftHandAssignment: false,
        isDirective: false,
        isTransformation: false,
        isVariableEmbed: false, 
        disableRecursion: false,
      },
      allowedVariableTypes: [
        VariableType.TEXT,
        VariableType.DATA,
        VariableType.PATH,
        VariableType.COMMAND
      ],
      currentFilePath: 'test.meld',
      state: stateService, // Use the mock state service here
      pathContext: { 
        validation: { required: false },
        createDirectory: false,
        defaultAccessLevel: 'workspace',
      },
      formattingContext: { 
        isBlock: false,
      },
      sourceMap: { file: 'test.meld' }, 
      depth: 0,
      withIncreasedDepth: () => ({ ...context, depth: (context.depth || 0) + 1 } as ResolutionContext),
      get strict() { return this.flags.strict; }, 
    };
  });
  
  afterEach(async () => { // Made async
    // vi.restoreAllMocks(); // Handled by contextDI.cleanup()
    await contextDI?.cleanup();
  });

  describe('resolve', () => {
    it('should resolve text variables using node.valueType', async () => {
      const node = createVariableReferenceNode('greeting', VariableType.TEXT);
      const mockVar: TextVariable = { name: 'greeting', type: VariableType.TEXT, value: 'Hello World' };
      // vi.mocked(stateService.getTextVar).mockReturnValue(mockVar);
      stateService.getTextVar.calledWith('greeting').mockReturnValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe('Hello World');
      expect(stateService.getTextVar).toHaveBeenCalledWith('greeting');
      expect(stateService.getDataVar).not.toHaveBeenCalled();
    });

    it('should resolve data variables using node.valueType', async () => {
      const node = createVariableReferenceNode('dataVar', VariableType.DATA);
      const mockData = { key: 'value' };
      const mockVar: DataVariable = { name: 'dataVar', type: VariableType.DATA, value: mockData };
      
      // vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      stateService.getDataVar.calledWith('dataVar').mockReturnValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe(JSON.stringify(mockData)); 
      expect(stateService.getDataVar).toHaveBeenCalledWith('dataVar');
      expect(stateService.getTextVar).not.toHaveBeenCalled();
    });

    it('should handle field access in data variables', async () => {
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'user' },
        { type: FieldAccessType.PROPERTY, key: 'name' }
      ];
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, fields);

      // vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      stateService.getDataVar.calledWith('dataObj').mockReturnValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('Alice');
      expect(stateService.getDataVar).toHaveBeenCalledWith('dataObj');
    });

    it('should handle array index access in data variables', async () => {
      const mockData = { users: ['Alice', 'Bob'] };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'users' },
        { type: FieldAccessType.INDEX, key: '1' } 
      ];
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, fields);

      // vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      stateService.getDataVar.calledWith('dataObj').mockReturnValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('Bob');
      expect(stateService.getDataVar).toHaveBeenCalledWith('dataObj');
    });

    it('should throw VariableResolutionError for undefined variables in strict mode', async () => {
      const node = createVariableReferenceNode('missing', VariableType.TEXT);
      // vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      stateService.getTextVar.calledWith('missing').mockReturnValue(undefined);
      
      context.flags.strict = true; 
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(VariableResolutionError); // Use core error type
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Text variable 'missing' not found in state."); 
    });

    it('should return empty string for undefined variables in non-strict mode', async () => {
      const node = createVariableReferenceNode('missing', VariableType.TEXT);
      // vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      stateService.getTextVar.calledWith('missing').mockReturnValue(undefined);
      
      context.flags.strict = false; 
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('');
    });

    it('should throw FieldAccessError on invalid field access in strict mode', async () => {
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'user' },
        { type: FieldAccessType.PROPERTY, key: 'age' } 
      ];
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, fields);

      // vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      stateService.getDataVar.calledWith('dataObj').mockReturnValue(mockVar);
      context.flags.strict = true;

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(FieldAccessError); 
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Field 'age' not found in object.");
    });

    it('should return empty string on invalid field access in non-strict mode', async () => {
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'user' },
        { type: FieldAccessType.PROPERTY, key: 'age' } 
      ];
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, fields);

      // vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      stateService.getDataVar.calledWith('dataObj').mockReturnValue(mockVar);
      context.flags.strict = false;

      const result = await resolver.resolve(node, context);
      expect(result).toBe('');
    });

    it('should resolve path variables using node.valueType', async () => {
      const node = createVariableReferenceNode('docsPath', VariableType.PATH);
      const mockPath = createMeldPath('$./docs'); 
      const mockVar: PathVariable = { name: 'docsPath', type: VariableType.PATH, value: mockPath };
      
      // vi.mocked(stateService.getPathVar).mockReturnValue(mockVar);
      stateService.getPathVar.calledWith('docsPath').mockReturnValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe('$./docs'); 
      expect(stateService.getPathVar).toHaveBeenCalledWith('docsPath');
    });
    
    it('should resolve command variables using node.valueType', async () => {
      const node = createVariableReferenceNode('myCmd', VariableType.COMMAND);
      const mockCmdDef = { command: '@run echo Hello' };
      // vi.mocked(stateService.getCommand).mockReturnValue(mockCmdDef);
      stateService.getCommand.calledWith('myCmd').mockReturnValue(mockCmdDef);
      
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe('@run echo Hello'); 
      expect(stateService.getCommand).toHaveBeenCalledWith('myCmd');
    });

  }); 
}); 