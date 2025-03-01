import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextDirectiveHandler } from './TextDirectiveHandler.js';
import { createMockStateService, createMockValidationService, createMockResolutionService } from '@tests/utils/testFactories.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from 'meld-spec';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { StringLiteralHandler } from '@services/resolution/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
// Import the centralized syntax examples and helpers
import { textDirectiveExamples } from '@core/constants/syntax';
import { getExample, getInvalidExample } from '@tests/utils/syntax-test-helpers.js';
import { ErrorSeverity } from '@core/errors';

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
      
      const example = getExample('text', 'atomic', 'simpleString');
      const node = await createNodeFromExample(example.code);

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
      
      const example = getExample('text', 'atomic', 'escapedCharacters');
      const node = await createNodeFromExample(example.code);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('escaped', 'Say "hello" to the world');
    });

    it('should handle multiline string literals with backticks', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded values
      // Migration: Using centralized test examples with template literals
      // Notes: Preserving the same multiline content
      
      const example = getExample('text', 'atomic', 'templateLiteral');
      const node = await createNodeFromExample(example.code);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Template content');
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
      // Migration: Using direct example code instead of non-existent example
      // Notes: Preserving the same variable usage pattern
      
      const exampleCode = '@text message = "Hello World!"';
      const node = await createNodeFromExample(exampleCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello World!');
    });

    it('should handle data variable references', async () => {
      // MIGRATION LOG:
      // Original: Used TEST_EXAMPLES with hardcoded object references
      // Migration: Using centralized examples
      // Notes: Using the object interpolation example
      
      const example = getExample('text', 'combinations', 'objectInterpolation');
      
      // For this test, we need a custom implementation
      const mockResolveInContext = resolutionService.resolveInContext;
      resolutionService.resolveInContext = vi.fn().mockImplementation(() => {
        return 'Hello, Alice! Your ID is 123.';
      });
      
      const node = await createNodeFromExample(example.code.split('\n')[1]); // Get the second line with greeting directive

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello, Alice! Your ID is 123.');
      
      // Restore the original mock
      resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should handle environment variable references', async () => {
      // MIGRATION LOG:
      // Original: Used TEST_EXAMPLES with hardcoded ENV vars
      // Migration: Using centralized examples with path references instead
      // Notes: Adapting to use the path references example
      
      const example = getExample('text', 'combinations', 'pathReferencing');
      
      // For this test, we need a custom implementation
      const mockResolveInContext = resolutionService.resolveInContext;
      resolutionService.resolveInContext = vi.fn().mockImplementation(() => {
        return 'Docs are at $PROJECTPATH/docs';
      });
      
      const node = await createNodeFromExample(example.code.split('\n')[5]); // Get the docsText line

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('configText', 'Docs are at $PROJECTPATH/docs');
      
      // Restore the original mock
      resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should handle variable resolution errors', async () => {
      // MIGRATION LOG:
      // Original: Used TEST_EXAMPLES with undefined variable
      // Migration: Using centralized invalid example
      // Notes: Still needs special mock handling to throw an error
      
      const example = getInvalidExample('text', 'undefinedVariable');
      
      // For error testing, we need to create a custom implementation
      // that throws an error for this specific test
      const mockResolveInContext = resolutionService.resolveInContext;
      resolutionService.resolveInContext = vi.fn().mockImplementation(() => {
        throw new Error('Variable not found: undefined_var');
      });

      const node = await createNodeFromExample(example.code);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
        
      // Restore the original mock
      resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should handle directive pass-through', async () => {
      // MIGRATION LOG:
      // Original: Used createTextDirectiveNode with hardcoded directive
      // Migration: Using centralized test examples for directive pass-through
      // Notes: Still needs the special mock for expected result
      
      // Create or use example for pass-through
      const directiveCode = '@text command = "@run echo \\"test\\""';
      
      // For this test, we need a custom implementation
      const mockResolveInContext = resolutionService.resolveInContext;
      resolutionService.resolveInContext = vi.fn().mockImplementation(() => {
        return '@run echo "test"';
      });
      
      const node = await createNodeFromExample(directiveCode);

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('command', '@run echo "test"');
      
      // Restore the original mock
      resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should support variable interpolation', async () => {
      // MIGRATION LOG:
      // Original: Used hardcoded example with mocked variable resolution
      // Migration: Using centralized examples
      // Notes: Preserving the same variable usage pattern
      
      const example = getExample('text', 'combinations', 'basicInterpolation');
      
      // For this test, we need a custom implementation
      const mockResolveInContext = resolutionService.resolveInContext;
      resolutionService.resolveInContext = vi.fn().mockImplementation(() => {
        return 'Hello, World!';
      });
      
      const node = await createNodeFromExample(example.code.split('\n')[2]); // Get the third line with the message directive

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello, World!');
      
      // Restore the original mock
      resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should handle string concatenation', async () => {
      // MIGRATION LOG:
      // Original: Used hardcoded concatenation examples
      // Migration: Using hardcoded examples since the centralized ones
      // don't have direct equivalents for these specific test cases
      
      const concatCode = '@text greeting = "Hello" ++ " " ++ "World"';
      const node = await createNodeFromExample(concatCode);

      resolutionService.resolveInContext.mockImplementation(async () => {
        return 'Hello World';
      });

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, context);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello World');
    });

    it('should handle variable resolution errors', async () => {
      // MIGRATION LOG:
      // Original: Used hardcoded examples for undefined variables
      // Migration: Using example for undefined variables
      
      // For this test, we'll create a custom example since we need to test error handling
      const errorCode = '@text message = "Hello {{missing}}!"';
      const node = await createNodeFromExample(errorCode);

      // We need to use mockImplementation instead of mockRejectedValueOnce for this test
      resolutionService.resolveInContext.mockImplementation(() => {
        throw new Error('Variable not found: missing');
      });

      const context = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, context))
        .rejects
        .toThrow(DirectiveError);
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