import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { createMockStateService, createMockValidationService, createMockResolutionService } from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { StringLiteralHandler } from '@services/resolution/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';

/**
 * Centralized Test Examples
 * 
 * These examples mirror the structure of the centralized syntax examples.
 * Once the import issues are fixed, these can be replaced with imports
 * from the actual centralized system.
 */
const TEST_EXAMPLES = {
  // Basic examples similar to 'atomic' in the centralized system
  atomic: {
    simpleString: '@text greeting = "Hello"',
    escapedString: '@text message = "Say \\"hello\\" to the world"',
    templateLiteral: '@text template = `line1\nline2`',
    variableReference: '@text message = "Hello {{name}}!"',
    objectReference: '@text greeting = "Hello {{user.name}}!"',
    envVariable: '@text path = "{{ENV_HOME}}/project"',
    passThrough: '@text command = "@run echo \\"test\\""',
    undefinedVar: '@text greeting = "Hello {{missing}}!"'
  },
  
  // Combination examples
  concatenation: {
    basicConcat: '@text greeting = "Hello" ++ " " ++ "World"',
    variableConcat: '@text message = "Hello " ++ "{{name}}"',
    embeddedConcat: '@text doc = "Prefix: " ++ "Header" ++ "Footer"',
    mixedQuotes: '@text mixed = "double" ++ \'single\' ++ `backtick`',
    invalidConcat: '@text bad = "no"++"spaces"'
  },
  
  // Invalid examples
  invalid: {
    unclosedString: '@text invalid = \'unclosed string',
    missingValue: '@text empty',
    invalidChar: '@text invalid-name = "Value"'
  }
};

// Helper function to create real AST nodes using meld-ast
const createTextDirectiveNode = async (identifier: string, value: string): Promise<DirectiveNode> => {
  try {
    // Import the real meld-ast parser dynamically
    const { parse } = await import('meld-ast');
    
    // Create a text directive string
    const textDirective = `@text ${identifier} = ${value}`;
    
    // Parse it with meld-ast
    const result = await parse(textDirective, {
      trackLocations: true,
      validateNodes: true,
      structuredPaths: true
    });
    
    // Return the first node, which should be our text directive
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with meld-ast:', error);
    throw error;
  }
};

// Helper function to create AST nodes from example code
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

describe('TextDirectiveHandler', () => {
  let handler: TextDirectiveHandler;
  let stateService: ReturnType<typeof createMockStateService>;
  let validationService: ReturnType<typeof createMockValidationService>;
  let resolutionService: ReturnType<typeof createMockResolutionService>;
  let clonedState: IStateService;
  // Create real instances of the literal and concatenation handlers for testing
  let realStringLiteralHandler: StringLiteralHandler;
  let realStringConcatenationHandler: StringConcatenationHandler;

  beforeEach(() => {
    clonedState = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn(),
    } as unknown as IStateService;

    stateService = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn().mockReturnValue(clonedState)
    } as unknown as IStateService;

    validationService = createMockValidationService();
    resolutionService = createMockResolutionService();
    
    // Create real handlers to match actual implementation
    realStringLiteralHandler = new StringLiteralHandler();
    realStringConcatenationHandler = new StringConcatenationHandler(resolutionService);
    
    // Set up better mocking for variable resolution
    resolutionService.resolveInContext.mockImplementation(async (value: string, context: any) => {
      // Use real string literal handler for string literals
      if (realStringLiteralHandler.isStringLiteral(value)) {
        return realStringLiteralHandler.parseLiteral(value);
      }
      
      // Handle common test case values - this simulates what the real ResolutionService would do
      if (value.includes('{{name}}')) {
        return value.replace(/\{\{name\}\}/g, 'World');
      }
      if (value.includes('{{user.name}}')) {
        return value.replace(/\{\{user\.name\}\}/g, 'Alice');
      }
      if (value.includes('{{ENV_HOME}}')) {
        return value.replace(/\{\{ENV_HOME\}\}/g, '/home/user');
      }
      if (value.includes('{{missing}}')) {
        throw new Error('Variable not found: missing');
      }
      
      // Special case for pass-through directives test
      if (value === '"@run echo \\"test\\""') {
        return '@run echo "test"';
      }
      
      // For string concatenation tests
      if (value === '"Hello" ++ " " ++ "World"') {
        return 'Hello World';
      }
      if (value === '"Hello " ++ "{{name}}"') {
        return 'Hello World';
      }
      if (value === '"Prefix: " ++ "Header" ++ "Footer"') {
        return 'Prefix: HeaderFooter';
      }
      if (value === '"double" ++ \'single\' ++ `backtick`') {
        return 'doublesinglebacktick';
      }
      
      return value;
    });
    
    // Mock validation service to fail for invalid nodes
    validationService.validate.mockImplementation((node: any) => {
      if (node.directive?.value === "'unclosed string") {
        throw new Error('Invalid string literal: unclosed string');
      }
      if (node.directive?.value === '"no"++"spaces"') {
        throw new Error('Invalid concatenation syntax');
      }
      return Promise.resolve();
    });
    
    handler = new TextDirectiveHandler(validationService, stateService, resolutionService);
  });

  describe('execute', () => {
    it('should handle string literals correctly', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values
      // Migration: Using centralized test examples
      // Notes: Using simpler "Hello" example from centralized examples
      
      const exampleCode = TEST_EXAMPLES.atomic.simpleString;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      // The example uses 'greeting' as the identifier and "Hello" as the value
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should handle string literals with escaped quotes', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values and special case mock
      // Migration: Using centralized test examples with escaped quotes
      // Notes: Still needs the special mock for expected behavior
      
      // Special case - direct mock to handle expected behavior
      resolutionService.resolveInContext.mockImplementation(async () => {
        return 'Say "hello" to the world';
      });
      
      const exampleCode = TEST_EXAMPLES.atomic.escapedString;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Say "hello" to the world');
    });

    it('should handle multiline string literals with backticks', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values
      // Migration: Using centralized test examples with template literals
      // Notes: Preserving the same multiline content
      
      const exampleCode = TEST_EXAMPLES.atomic.templateLiteral;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('template', 'line1\nline2');
    });

    it('should reject invalid string literals', async () => {
      // MIGRATION LOG:
      // Original: Used manually created DirectiveNode without parsing
      // Migration: Still using manual node creation as invalid syntax can't be parsed 
      // Notes: This approach won't use createNodeFromExample since we're testing invalid syntax
      
      // For invalid test cases, we'll still need to manually create nodes
      // since meld-ast would throw on these during parsing
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'invalid',
          value: "'unclosed string"
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 }
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };
      
      // Ensure our mock validation service rejects this
      validationService.validate.mockRejectedValueOnce(new Error('Invalid string literal: unclosed string'));

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should handle variable references', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values
      // Migration: Using centralized test examples with variable interpolation
      // Notes: Preserving the same variable usage pattern
      
      const exampleCode = TEST_EXAMPLES.atomic.variableReference;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getTextVar).mockReturnValue('World');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello World!');
    });

    it('should handle data variable references', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values
      // Migration: Using centralized test examples with object property interpolation
      // Notes: Preserving the same data variable reference pattern
      
      const exampleCode = TEST_EXAMPLES.atomic.objectReference;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getDataVar).mockReturnValue({ name: 'Alice' });

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello Alice!');
    });

    it('should handle environment variables', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values
      // Migration: Using centralized test examples for environment variables
      // Notes: Preserving same variable pattern
      
      const exampleCode = TEST_EXAMPLES.atomic.envVariable;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      process.env.ENV_HOME = '/home/user';

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('path', '/home/user/project');

      delete process.env.ENV_HOME;
    });

    it('should handle pass-through directives', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values and special mock
      // Migration: Using centralized test examples for pass-through directives
      // Notes: Still needs special mock handling
      
      // Special case - direct mock to handle expected behavior
      resolutionService.resolveInContext.mockImplementation(async () => {
        return '@run echo "test"';
      });
      
      const exampleCode = TEST_EXAMPLES.atomic.passThrough;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('command', '@run echo "test"');
    });

    it('should throw on missing value', async () => {
      // MIGRATION LOG:
      // Original: Used manually created DirectiveNode without parsing
      // Migration: Still using manual node creation since we're testing syntax that can't be parsed
      // Notes: This approach won't use createNodeFromExample or the TEST_EXAMPLES.invalid.missingValue
      // since that would throw during parsing. Instead, we create a node directly to simulate a parse result.
      
      // For invalid test cases, we'll still need to manually create nodes
      // since meld-ast would throw on these during parsing
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'empty'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 10 }
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should throw on undefined variables', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values
      // Migration: Using centralized test examples for undefined variables
      // Notes: Still needs special mock handling to throw an error
      
      const exampleCode = TEST_EXAMPLES.atomic.undefinedVar;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getTextVar).mockReturnValue(undefined);
      vi.mocked(stateService.getDataVar).mockReturnValue(undefined);
      
      // Make the resolution service throw an error for the missing variable
      resolutionService.resolveInContext.mockImplementation(() => {
        throw new Error('Variable not found: missing');
      });

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });
  });

  describe('string concatenation', () => {
    it('should handle basic string concatenation', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values and special mock
      // Migration: Using centralized test examples for basic concatenation
      // Notes: Still needs special mock for expected result
      
      // Special case - direct mock for the expected result
      resolutionService.resolveInContext.mockImplementation(async () => {
        return 'Hello World';
      });
      
      const exampleCode = TEST_EXAMPLES.concatenation.basicConcat;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello World');
    });

    it('should handle string concatenation with variables', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values and special mock
      // Migration: Using centralized test examples for variable concatenation
      // Notes: Still needs special mock for expected result
      
      // Special case - direct mock for the expected result
      resolutionService.resolveInContext.mockImplementation(async () => {
        return 'Hello World';
      });
      
      const exampleCode = TEST_EXAMPLES.concatenation.variableConcat;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.getTextVar).mockReturnValue('World');

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello World');
    });

    it('should handle string concatenation with embedded content', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values and special mock
      // Migration: Using centralized test examples for embedded content concatenation
      // Notes: Still needs special mock for expected result
      
      // Special case - direct mock for the expected result
      resolutionService.resolveInContext.mockImplementation(async () => {
        return 'Prefix: HeaderFooter';
      });
      
      // For this test, we'll need to mock the EmbedDirectiveHandler
      // This is simplified - a real implementation would use the EmbedDirectiveHandler
      const exampleCode = TEST_EXAMPLES.concatenation.embeddedConcat;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('doc', 'Prefix: HeaderFooter');
    });

    it('should reject invalid concatenation syntax', async () => {
      // MIGRATION LOG:
      // Original: Used manually created DirectiveNode without parsing
      // Migration: Still using manual node creation since invalid syntax can't be parsed
      // Notes: We can't use createNodeFromExample with TEST_EXAMPLES.concatenation.invalidConcat
      // since it would throw during parsing
      
      // For this specific error case, use a manually crafted node
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'bad',
          value: '"no"++"spaces"'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 20 }
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };
      
      // Make the validation service throw an error for invalid concatenation
      validationService.validate.mockRejectedValueOnce(new Error('Invalid concatenation syntax'));

      await expect(handler.execute(node, context)).rejects.toThrow(DirectiveError);
    });

    it('should handle concatenation with mixed quote types', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values and special mock
      // Migration: Using centralized test examples for mixed quote concatenation
      // Notes: Still needs special mock for expected result
      
      // Special case - direct mock for the expected result
      resolutionService.resolveInContext.mockImplementation(async () => {
        return 'doublesinglebacktick';
      });
      
      const exampleCode = TEST_EXAMPLES.concatenation.mixedQuotes;
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('mixed', 'doublesinglebacktick');
    });
  });

  /**
   * This section demonstrates how to use the centralized syntax system
   * once the import issues are fixed.
   * 
   * NOTE: This section is commented out until the centralized system imports
   * are working properly.
   */
  /*
  describe('centralized syntax examples (future implementation)', () => {
    it('should handle atomic examples correctly', async () => {
      // Using the centralized atomic examples
      const example = getExample('text', 'atomic', 'simpleString');
      const node = await createNodeFromExample(example.code);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should reject invalid examples', async () => {
      // Using the centralized invalid examples
      // Note: For invalid syntax, we need to manually create nodes since parsing would fail
      const invalidExample = getInvalidExample('text', 'unclosedString');
      
      // Create a node that represents what the parser would have created
      // if it didn't throw on invalid syntax
      const node: DirectiveNode = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'invalid',
          value: invalidExample.code.split('=')[1]?.trim() || ''
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: invalidExample.code.length }
        }
      };

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Make the validation service reject this as expected by the invalid example
      validationService.validate.mockRejectedValueOnce(
        new Error(invalidExample.expectedError.message)
      );

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
    });

    it('should test multiple examples in bulk', async () => {
      // This is a demonstration of using testParserWithValidExamples
      // to test multiple examples at once
      testParserWithValidExamples(handler, 'text', 'atomic');
    });
  });
  */
}); 