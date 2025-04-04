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
import type { VariableReferenceNode } from '@core/types/ast-types';
import { MeldResolutionError, FieldAccessError, VariableResolutionError } from '@core/types/errors';
import { VariableResolutionError as OldVariableResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { FieldAccessType as OldFieldAccessType } from '@services/resolution/ResolutionService/IResolutionService.js';

// Import Test Utils
import { 
  createMockStateService, 
  createVariableReferenceNode
} from '@tests/utils/testFactories.js';

// Remove Old Types/Imports
// import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
// import type { ResolutionContext as OldResolutionContext, ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';
// import type { MeldNode, TextNode } from '@core/syntax/types.js';
import type { IStateService } from '@services/state/IStateService.js'; // Keep for mock typing
// import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
// import { VariableNodeFactory } from '@core/syntax/types/factories/index.js';
// import { container } from 'tsyringe';

describe('VariableReferenceResolver', () => {
  let resolver: VariableReferenceResolver;
  let stateService: ReturnType<typeof createMockStateService>;
  let context: ResolutionContext;

  beforeEach(() => {
    stateService = createMockStateService();
    
    // Create resolver - REMOVE factory injection
    resolver = new VariableReferenceResolver(
      stateService, 
    );
    
    // Define the NEW ResolutionContext
    context = {
      // Default flags, customize per test if needed
      flags: {
        strict: true,
        isLeftHandAssignment: false,
        isDirective: false,
        isTransformation: false,
        isVariableEmbed: false, // Assume default context is not specific embed
        disableRecursion: false,
      },
      allowedVariableTypes: [ // Array of VariableType
        VariableType.TEXT,
        VariableType.DATA,
        VariableType.PATH,
        VariableType.COMMAND
      ],
      currentFilePath: 'test.meld',
      pathContext: { // Default path context
        validation: { required: false },
        createDirectory: false,
        defaultAccessLevel: 'workspace',
      },
      formattingContext: { // Default formatting context
        isBlock: false,
      },
      sourceMap: { file: 'test.meld' }, // Minimal source map info
      depth: 0,
      // Helper method (real implementation needed if complex tests require it)
      withIncreasedDepth: () => ({ ...context, depth: (context.depth || 0) + 1 } as ResolutionContext),
      // Strict mode is now within flags
      get strict() { return this.flags.strict; }, 
    };
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('resolve', () => {
    it('should resolve text variables using node.valueType', async () => {
      // Create the specific node
      const node = createVariableReferenceNode('greeting', VariableType.TEXT);
      
      // Mock stateService to return TextVariable object
      const mockVar: TextVariable = { name: 'greeting', type: VariableType.TEXT, value: 'Hello World' };
      vi.mocked(stateService.getTextVar).mockReturnValue(mockVar);
      
      // Call resolve with the NODE
      const result = await resolver.resolve(node, context);
      
      expect(result).toBe('Hello World');
      expect(stateService.getTextVar).toHaveBeenCalledWith('greeting');
      expect(stateService.getDataVar).not.toHaveBeenCalled(); // Ensure only correct type was checked
    });

    it('should resolve data variables using node.valueType', async () => {
      const node = createVariableReferenceNode('dataVar', VariableType.DATA);
      const mockData = { key: 'value' };
      const mockVar: DataVariable = { name: 'dataVar', type: VariableType.DATA, value: mockData };
      
      vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      
      // Default conversion is JSON.stringify
      expect(result).toBe(JSON.stringify(mockData)); 
      expect(stateService.getDataVar).toHaveBeenCalledWith('dataVar');
      expect(stateService.getTextVar).not.toHaveBeenCalled();
    });

    it('should handle field access in data variables', async () => {
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      
      // Define fields matching FieldAccess structure
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'user' },
        { type: FieldAccessType.PROPERTY, key: 'name' }
      ];
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, fields);

      vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('Alice');
      expect(stateService.getDataVar).toHaveBeenCalledWith('dataObj');
    });

    it('should handle array index access in data variables', async () => {
      const mockData = { users: ['Alice', 'Bob'] };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'users' },
        { type: FieldAccessType.INDEX, key: '1' } // Access index 1
      ];
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, fields);

      vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('Bob');
      expect(stateService.getDataVar).toHaveBeenCalledWith('dataObj');
    });

    it('should throw VariableResolutionError for undefined variables in strict mode', async () => {
      const node = createVariableReferenceNode('missing', VariableType.TEXT);
      
      // Mock specific type getter to return undefined
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      
      context.flags.strict = true; // Ensure strict mode
      
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(VariableResolutionError);
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Text variable 'missing' not found in state."); // Check specific message if needed
    });

    it('should return empty string for undefined variables in non-strict mode', async () => {
      const node = createVariableReferenceNode('missing', VariableType.TEXT);
      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      
      context.flags.strict = false; // Ensure non-strict mode
      
      const result = await resolver.resolve(node, context);
      expect(result).toBe('');
    });

    it('should throw FieldAccessError on invalid field access in strict mode', async () => {
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'user' },
        { type: FieldAccessType.PROPERTY, key: 'age' } // Non-existent field
      ];
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, fields);

      vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      context.flags.strict = true;

      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow(FieldAccessError); // Expecting specific FieldAccessError
      await expect(resolver.resolve(node, context))
        .rejects
        .toThrow("Field 'age' not found in object.");
    });

    it('should return empty string on invalid field access in non-strict mode', async () => {
      const mockData = { user: { name: 'Alice' } };
      const mockVar: DataVariable = { name: 'dataObj', type: VariableType.DATA, value: mockData };
      const fields: FieldAccess[] = [
        { type: FieldAccessType.PROPERTY, key: 'user' },
        { type: FieldAccessType.PROPERTY, key: 'age' } // Non-existent field
      ];
      const node = createVariableReferenceNode('dataObj', VariableType.DATA, fields);

      vi.mocked(stateService.getDataVar).mockReturnValue(mockVar);
      context.flags.strict = false;

      const result = await resolver.resolve(node, context);
      expect(result).toBe('');
    });

    // ADD PATH VARIABLE TEST
    it('should resolve path variables using node.valueType', async () => {
      const node = createVariableReferenceNode('docsPath', VariableType.PATH);
      const mockPath = createMeldPath('$./docs'); // Use helper from path-types
      const mockVar: PathVariable = { name: 'docsPath', type: VariableType.PATH, value: mockPath };
      
      vi.mocked(stateService.getPathVar).mockReturnValue(mockVar);
      
      // Path resolution often involves normalization/validation via PathService
      // For this test, assume the resolver returns the raw path string by default
      // or mock PathService if the resolver interacts with it directly.
      const result = await resolver.resolve(node, context);
      
      // Expect the raw string representation of the path by default
      expect(result).toBe('$./docs'); 
      expect(stateService.getPathVar).toHaveBeenCalledWith('docsPath');
    });
    
    // ADD COMMAND VARIABLE TEST
    it('should resolve command variables using node.valueType', async () => {
      // Assuming command resolution retrieves the definition string
      const node = createVariableReferenceNode('myCmd', VariableType.COMMAND);
      const mockCmdDef = { command: '@run echo Hello' };
      // Mock getCommand instead of a specific variable type getter
      vi.mocked(stateService.getCommand).mockReturnValue(mockCmdDef);
      
      const result = await resolver.resolve(node, context);
      
      // Expect the raw command definition string (or adjust if behavior differs)
      expect(result).toBe('@run echo Hello'); 
      expect(stateService.getCommand).toHaveBeenCalledWith('myCmd');
    });

  }); // End of resolve describe block
}); 