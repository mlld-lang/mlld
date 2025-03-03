import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DefineDirectiveHandler } from './DefineDirectiveHandler.js';
import { 
  createMockStateService, 
  createMockValidationService, 
  createMockResolutionService,
  createDefineDirective,
  createLocation
} from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
// Import the centralized syntax examples and helpers
import { defineDirectiveExamples } from '@core/syntax/index.js';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
import { ErrorSeverity } from '@core/errors';

/**
 * MIGRATION STATUS: Partially Complete
 * 
 * This test file is being migrated to use centralized syntax examples from @core/constants/syntax.
 * 
 * Completed:
 * - Basic command handling tests have been migrated to use centralized examples.
 * - Added the createNodeFromExample helper function.
 * - Migrated the duplicate parameter validation test to use centralized invalid examples.
 * 
 * Not Migrated:
 * - The "value processing with mock nodes" section is kept for backward compatibility.
 * - Most metadata handling, validation, state management, and error handling tests are not migrated yet.
 * 
 * Notes:
 * - For invalid syntax tests, we still need to use createDefineDirective since the parser would reject
 *   truly invalid syntax before it reaches the handler.
 */

/**
 * Create a Define directive node that matches the structure expected by the handler
 */
function createDefineDirectiveNode(input: string): DirectiveNode {
  // Parse the input manually
  const hasParameters = input.includes('(') && input.includes(')');
  const name = input.split('=')[0].trim().split('(')[0].trim();
  
  // Extract parameters if present
  let parameters: string[] = [];
  if (hasParameters) {
    const paramString = input.split('(')[1].split(')')[0];
    parameters = paramString.split(',').map(p => p.trim());
  }
  
  // Extract command
  let command = '';
  if (input.includes('@run [')) {
    command = input.split('@run [')[1].split(']')[0];
  }
  
  // Create a node that matches the structure expected by the handler
  return {
    type: 'Directive',
    directive: {
      kind: 'define',
      name,
      command: {
        kind: 'run',
        command
      },
      parameters
    },
    location: createLocation(1, 1, 1, input.length)
  } as DirectiveNode;
}

/**
 * Helper function to create real AST nodes using meld-ast
 */
const createNodeFromExample = async (code: string): Promise<DirectiveNode> => {
  try {
    const { parse } = await import('meld-ast');
    
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true,
      structuredPaths: true
    });
    
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with meld-ast:', error);
    throw error;
  }
};

describe('DefineDirectiveHandler', () => {
  let handler: DefineDirectiveHandler;
  let stateService: ReturnType<typeof createMockStateService>;
  let validationService: ReturnType<typeof createMockValidationService>;
  let resolutionService: ReturnType<typeof createMockResolutionService>;
  let clonedState: IStateService;

  beforeEach(() => {
    clonedState = {
      setCommand: vi.fn(),
      getCommand: vi.fn(),
      clone: vi.fn(),
    } as unknown as IStateService;

    stateService = {
      setCommand: vi.fn(),
      getCommand: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    validationService = createMockValidationService();
    resolutionService = createMockResolutionService();
    handler = new DefineDirectiveHandler(validationService, stateService, resolutionService);
  });

  describe('value processing with modern AST', () => {
    it('should handle basic command definition without parameters', async () => {
      // MIGRATION LOG:
      // Original: Used createDefineDirectiveNode with hardcoded values
      // Migration: Using centralized test examples
      // Notes: Using the 'simpleCommand' example from centralized examples
      
      const example = getExample('define', 'atomic', 'simpleCommand');
      const node = await createNodeFromExample(example.code);
      
      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce([]);

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: [],
        command: 'echo "Hello"'
      });
    });

    it('should handle command definition with parameters', async () => {
      // MIGRATION LOG:
      // Original: Used createDefineDirectiveNode with hardcoded values
      // Migration: Using centralized test examples
      // Notes: Using the 'singleParameter' example from centralized examples
      
      const example = getExample('define', 'atomic', 'singleParameter');
      const node = await createNodeFromExample(example.code);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['name']);

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: ['name'],
        command: 'echo "Hello {{name}}"'
      });
    });

    it('should handle command definition with multiple parameters', async () => {
      // MIGRATION LOG:
      // Original: Used createDefineDirectiveNode with hardcoded values
      // Migration: Using centralized test examples
      // Notes: Using the 'multipleParameters' example from centralized examples
      
      const example = getExample('define', 'atomic', 'multipleParameters');
      const node = await createNodeFromExample(example.code);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['first', 'last']);

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: ['first', 'last'],
        command: 'echo "Hello {{first}} {{last}}"'
      });
    });
    
    it('should handle parameters in quoted strings', async () => {
      // MIGRATION LOG:
      // Original: Used createDefineDirectiveNode with hardcoded values
      // Migration: Using a customized approach based on the complexData example
      // Notes: This test is testing parameter handling in quoted strings specifically
      
      // For this test, we need something with parameters in quoted strings
      // Using a modified example with our own parameter pattern
      const code = `@define greet(name, message) = @run [echo "Hello {{name}}, {{message}}"]`;
      const node = await createNodeFromExample(code);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['name', 'message']);

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: ['name', 'message'],
        command: 'echo "Hello {{name}}, {{message}}"'
      });
    });
  });

  // Maintain original test cases for backward compatibility
  describe('value processing with mock nodes', () => {
    it('should handle basic command definition without parameters', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'greet',
          'echo "Hello"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'greet',
          command: {
            kind: 'run',
            command: 'echo "Hello"'
          },
          parameters: []
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: [],
        command: 'echo "Hello"'
      });
    });

    it('should handle command definition with parameters', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'greet',
          'echo "Hello {{name}}"',
          ['name'],
          createLocation(1, 1, 1, 30)
        ),
        directive: {
          kind: 'define',
          name: 'greet',
          command: {
            kind: 'run',
            command: 'echo "Hello {{name}}"'
          },
          parameters: ['name']
        }
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['name']);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: ['name'],
        command: 'echo "Hello {{name}}"'
      });
    });

    it('should handle command definition with multiple parameters', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'greet',
          'echo "Hello {{first}} {{last}}"',
          ['first', 'last'],
          createLocation(1, 1, 1, 40)
        ),
        directive: {
          kind: 'define',
          name: 'greet',
          command: {
            kind: 'run',
            command: 'echo "Hello {{first}} {{last}}"'
          },
          parameters: ['first', 'last']
        }
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['first', 'last']);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('greet', {
        parameters: ['first', 'last'],
        command: 'echo "Hello {{first}} {{last}}"'
      });
    });
  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'risky.risk.high',
          'rm -rf /',
          [],
          createLocation(1, 1, 1, 25)
        ),
        directive: {
          kind: 'define',
          name: 'risky.risk.high',
          command: {
            kind: 'run',
            command: 'rm -rf /'
          },
          parameters: []
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('risky', {
        parameters: [],
        command: 'rm -rf /',
        metadata: {
          risk: 'high'
        }
      });
    });

    it('should handle command about metadata', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd.about',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 25)
        ),
        directive: {
          kind: 'define',
          name: 'cmd.about',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('cmd', {
        parameters: [],
        command: 'echo "test"',
        metadata: {
          about: 'This is a description'
        }
      });
    });
  });

  describe('validation', () => {
    it('should validate command structure through ValidationService', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'cmd',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    it('should reject empty commands', async () => {
      const node = createDefineDirective(
        'invalid',
        '',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Command cannot be empty', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject missing parameters referenced in command', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello {{name}}"',
        [],
        createLocation(1, 1, 1, 30)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Parameter name is referenced in command but not declared', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject invalid parameter names', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello {{123invalid}}"',
        ['123invalid'],
        createLocation(1, 1, 1, 35)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid parameter name: 123invalid', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject duplicate parameter names', async () => {
      // MIGRATION LOG:
      // Original: Used createDefineDirective with hardcoded values
      // Migration: Using centralized invalid example for duplicate parameters
      // Notes: We need to mock the validation service to throw the expected error
      
      // Get the invalid example for duplicate parameters
      const invalidExample = getInvalidExample('define', 'duplicateParameter');
      
      // We can't use createNodeFromExample here because the parser would reject this invalid syntax
      // Instead, we'll create a node that simulates what would happen if the parser allowed it
      const node = createDefineDirective(
        'bad',
        'echo "{{name}}"',
        ['name', 'name'],
        createLocation(1, 1, 1, 30)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Use the error message from the invalid example
      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError(invalidExample.expectedError.message, 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should reject invalid metadata fields', async () => {
      const node = createDefineDirective(
        'cmd.invalid',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid metadata field. Only risk and about are supported', 'define')
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });
  });

  describe('state management', () => {
    it('should create new state for command storage', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'cmd',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(stateService.clone).toHaveBeenCalled();
    });

    it('should store command in new state', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'cmd',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(clonedState.setCommand).toHaveBeenCalledWith('cmd', {
        parameters: [],
        command: 'echo "test"'
      });
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createDefineDirective(
        '',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid command', 'define')
      );

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle resolution errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "{{undefined}}"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Resolution error', 'define')
      );

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle state errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(clonedState.setCommand).mockImplementation(() => {
        throw new Error('State error');
      });

      const error = await handler.execute(node, context).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });
  });
});