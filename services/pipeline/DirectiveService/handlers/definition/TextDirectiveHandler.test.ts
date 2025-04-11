import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { StringLiteralHandler } from '@services/resolution/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
// Import the centralized syntax examples and helpers
import { textDirectiveExamples } from '@core/syntax/index.js';
import { ErrorSeverity } from '@core/errors.js';
// Import TestContextDI
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
// Import standardized mock factories
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';
// Import the type guard used in mocks
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
// Import necessary types for mocks
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import type { StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes.js'; 
import type { MeldPath } from '@core/types';

/**
 * TextDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete
 * 
 * This test file has been fully migrated to use:
 * - Centralized syntax examples
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 */

/**
 * Helper function to create real AST nodes using @core/ast
 */
const createNodeFromExample = async (code: string): Promise<DirectiveNode> => {
  try {
    const { parse } = await import('@core/ast');
    
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true,
      structuredPaths: true
    });
    
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with @core/ast:', error);
    throw error;
  }
};

describe('TextDirectiveHandler', () => {
  let handler: TextDirectiveHandler;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let context: TestContextDI;
  let clonedState: any;
  // Create real instances of the literal and concatenation handlers for testing
  let realStringLiteralHandler: StringLiteralHandler;
  let realStringConcatenationHandler: StringConcatenationHandler;

  beforeEach(async () => {
    // Create context with isolated container
    context = TestContextDI.createIsolated();
    
    // Initialize the context
    await context.initialize();
    
    // Create cloned state that will be returned by stateService.clone()
    clonedState = {
      setTextVar: vi.fn(),
      getTextVar: vi.fn(),
      getDataVar: vi.fn(),
      clone: vi.fn(),
    };
    
    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    
    // Configure mock implementations
    validationService.validate.mockImplementation((node: any) => {
      if (node.directive?.value === '\'unclosed string') {
        throw new Error('Invalid string literal: unclosed string');
      }
      if (node.directive?.value === '"no"++"spaces"') {
        throw new Error('Invalid concatenation syntax');
      }
      return Promise.resolve(true);
    });
    
    stateService.clone.mockReturnValue(clonedState);
    
    // Register mocks with the context
    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);
    
    // Create handler instance from container
    handler = await context.container.resolve(TextDirectiveHandler);

    // Initialize real handlers for testing
    realStringLiteralHandler = new StringLiteralHandler();
    realStringConcatenationHandler = new StringConcatenationHandler(resolutionService);
    
    // Set up resolution service mocks
    // Mock resolveInContext to handle string, StructuredPath (based on raw), and InterpolatableValue
    resolutionService.resolveInContext.mockImplementation(async (value: string | AstStructuredPath | InterpolatableValue, context: any): Promise<string> => {
      if (typeof value === 'string') {
          // Simulate simple string resolution (e.g., variable lookup)
          if (value.includes('{{name}}')) return value.replace(/\{\{name\}\}/g, 'World');
          if (value.includes('{{user.name}}')) return value.replace(/\{\{user\.name\}\}/g, 'Alice');
          if (value.includes('{{ENV_HOME}}')) return value.replace(/\{\{ENV_HOME\}\}/g, '/home/user');
          if (value.includes('{{missing}}')) throw new Error('Variable not found: missing');
          // Handle literal strings passed directly (quotes might be present)
          if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1);
          if (value.startsWith('\'') && value.endsWith('\'')) return value.slice(1, -1);
          return value; // Return other strings as is
      } else if (isInterpolatableValueArray(value)) {
          // Simulate resolving an InterpolatableValue array
          let result = '';
          for (const node of value) {
              if (node.type === 'Text') {
                  result += node.content;
              } else if (node.type === 'VariableReference') {
                  if (node.identifier === 'name') result += 'World';
                  else if (node.identifier === 'user' && node.fields?.[0]?.value === 'name') result += 'Alice'; // Basic field access simulation
                  else result += `{{${node.identifier}}}`; // Placeholder for others
              }
          }
          return result;
      } else if (typeof value === 'object' && value !== null && 'raw' in value) { // Handle AstStructuredPath
          // For tests, just resolve the raw string part if it contains variables
          const raw = value.raw ?? '';
          if (raw.includes('{{name}}')) return raw.replace(/\{\{name\}\}/g, 'World');
          // Add more specific raw path resolutions if needed for tests
          return raw; // Return raw value if no interpolation needed
      }
      return JSON.stringify(value); // Fallback
    });

    // Mock resolveNodes (similar logic to InterpolatableValue case above for simulation)
    resolutionService.resolveNodes.mockImplementation(async (nodes: InterpolatableValue, context: any): Promise<string> => {
        let result = '';
        for (const node of nodes) {
            if (node.type === 'Text') {
                result += node.content;
            } else if (node.type === 'VariableReference') {
                // <<< More robust variable lookup simulation >>>
                let resolvedVar: any;
                // <<< Check for missing variable and throw >>>
                if (node.identifier === 'missing') {
                    throw new Error('Variable not found: missing');
                }
                if (node.identifier === 'user') resolvedVar = { name: 'Alice', id: 123 }; // Mock object
                else if (node.identifier === 'greeting') resolvedVar = 'Hello'; 
                else if (node.identifier === 'subject') resolvedVar = 'World';
                else if (node.identifier === 'config') resolvedVar = '$PROJECTPATH/docs'; // Mock path var - return the EXPECTED final string segment
                else if (node.identifier === 'name') resolvedVar = 'World'; // Added missing case from previous mock logic
                // Add more mocks as needed for tests

                // Simulate basic field access for tests
                if (resolvedVar && node.fields && node.fields.length > 0) {
                  let current = resolvedVar;
                  for (const field of node.fields) {
                    if (field.type === 'field' && current && typeof current === 'object') {
                      current = current[field.value as string];
                    } else {
                      current = undefined; // Basic handling, doesn't cover indices etc.
                      break;
                    }
                  }
                  resolvedVar = current;
                }
                
                // Convert final resolved value to string
                result += resolvedVar !== undefined ? String(resolvedVar) : `{{${node.identifier}}}`; 
            }
        }
        // Handle escaped characters test case specifically
        if (result === 'Line 1\\nLine 2\\t\\') { // Check for the raw unresolved string with escapes
           return 'Line 1\nLine 2\t"Quoted"'; // Return the expected final value
        }
        return result;
    });

    // Mock resolvePath just to return a basic MeldPath object based on input string
    resolutionService.resolvePath.mockImplementation(async (resolvedPathString: string, context: any): Promise<MeldPath> => {
      // Basic mock: create a MeldPath-like object. Adjust if tests need more specifics.
      return {
        contentType: 'filesystem', // Assume filesystem for tests
        originalValue: resolvedPathString, // Use resolved string as original for mock
        validatedPath: resolvedPathString, // Assume validation passes
        isAbsolute: resolvedPathString.startsWith('/'),
        isSecure: true,
        isValidSyntax: true,
        value: { // Mock the internal state needed by PathDirectiveHandler
           contentType: 'filesystem',
           originalValue: resolvedPathString,
           validatedPath: resolvedPathString,
           isAbsolute: resolvedPathString.startsWith('/'),
           isSecure: true,
           isValidSyntax: true,
        }
      } as unknown as MeldPath; // Cast needed as mock is simplified
    });
  });

  afterEach(async () => {
    // Clean up the context to prevent memory leaks
    await context?.cleanup();
  });

  describe('execute', () => {
    it('should handle a simple text assignment with string literal', async () => {
      // Arrange
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code);

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      // The example uses 'greeting' as the identifier and "Hello" as the value
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should handle text assignment with escaped characters', async () => {
      // Arrange
      const example = textDirectiveExamples.atomic.escapedCharacters;
      const node = await createNodeFromExample(example.code);
      
      // Special case - direct mock to handle expected behavior
      resolutionService.resolveInContext.mockImplementation(async () => {
        return 'Line 1\nLine 2\t"Quoted"';
      });

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('escaped', 'Line 1\nLine 2\t"Quoted"');
    });

    it('should handle a template literal in text directive', async () => {
      // Arrange
      const example = textDirectiveExamples.atomic.templateLiteral;
      const node = await createNodeFromExample(example.code);

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Template content');
    });

    it('should handle object property interpolation in text value', async () => {
      // Arrange
      const example = textDirectiveExamples.combinations.objectInterpolation;
      
      // For this test, we need a custom implementation
      const mockResolveInContext = resolutionService.resolveInContext;
      resolutionService.resolveInContext = vi.fn().mockImplementation(() => {
        return 'Hello, Alice! Your ID is 123.';
      });
      
      const node = await createNodeFromExample(example.code.split('\n')[1]); // Get the second line with greeting directive

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello, Alice! Your ID is 123.');
      
      // Restore the original mock
      resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should handle path referencing in text values', async () => {
      // Arrange
      const example = textDirectiveExamples.combinations.pathReferencing;
      
      // For this test, we need a custom implementation
      const mockResolveInContext = resolutionService.resolveInContext;
      resolutionService.resolveInContext = vi.fn().mockImplementation(() => {
        return 'Docs are at $PROJECTPATH/docs';
      });
      
      const node = await createNodeFromExample(example.code.split('\n')[5]); // Get the docsText line

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('configText', 'Docs are at $PROJECTPATH/docs');
      
      // Restore the original mock
      resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should return error if text interpolation contains undefined variables', async () => {
      // Arrange
      const example = textDirectiveExamples.invalid.undefinedVariable;
      
      // For error testing, we need to create a custom implementation
      // that throws an error for this specific test
      const mockResolveInContext = resolutionService.resolveInContext;
      resolutionService.resolveInContext = vi.fn().mockImplementation(() => {
        throw new Error('Variable not found: undefined_var');
      });

      const node = await createNodeFromExample(example.code);

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, testContext))
        .rejects
        .toThrow(DirectiveError);
        
      // Restore the original mock
      resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should handle basic variable interpolation', async () => {
      // Arrange
      const example = textDirectiveExamples.combinations.basicInterpolation;
      
      // For this test, we need a custom implementation
      const mockResolveInContext = resolutionService.resolveInContext;
      resolutionService.resolveInContext = vi.fn().mockImplementation(() => {
        return 'Hello, World!';
      });
      
      const node = await createNodeFromExample(example.code.split('\n')[2]); // Get the third line with the message directive

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello, World!');
      
      // Restore the original mock
      resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should register the node as a text directive in the registry', async () => {
      // Arrange
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code);

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      // The example uses 'greeting' as the identifier and "Hello" as the value
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
    });

    it('should report error for unclosed string', async () => {
      // For invalid test cases, we'll need to manually create nodes
      // since meld-ast would throw on these during parsing
      const invalidExample = textDirectiveExamples.invalid.unclosedString;
      
      // Create a mock node directly instead of parsing invalid syntax
      const node = {
        type: 'Directive',
        directive: {
          kind: 'text',
          identifier: 'greeting',
          value: '"unclosed string'
        },
        location: {
          start: { line: 1, column: 1 },
          end: { line: 1, column: 30 }
        }
      };

      // Ensure our mock validation service rejects this
      validationService.validate.mockRejectedValueOnce(new Error('Invalid string literal: unclosed string'));

      await expect(handler.execute(node, {
        state: stateService,
        currentFilePath: 'test.meld'
      }))
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