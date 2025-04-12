import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { StringLiteralHandler } from '@services/resolution/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
import { parse } from '@core/ast'; // Import the parser
import { createLocation } from '@tests/utils/testFactories.js'; // <<< Add import
// Import the centralized syntax examples and helpers
import { textDirectiveExamples } from '@core/syntax/index.js';
import { ErrorSeverity, FieldAccessError, MeldResolutionError } from '@core/errors/index.js';
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
import { VariableType } from '@core/types';

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
      validateNodes: true
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
    validationService.validate.mockResolvedValue(undefined);
    
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
    resolutionService.resolveInContext.mockImplementation(async (value: any, context: any): Promise<string> => {
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

    // Mock resolveNodes
    resolutionService.resolveNodes.mockImplementation(async (nodes: InterpolatableValue, context: any): Promise<string> => {
        let result = '';
        for (const node of nodes) {
            if (node.type === 'Text') {
                result += node.content;
            } else if (node.type === 'VariableReference') {
                let resolvedVar: any;
                // Simulate variable lookup
                if (node.identifier === 'greeting') resolvedVar = 'Hello';
                else if (node.identifier === 'subject') resolvedVar = 'World';
                else if (node.identifier === 'user') resolvedVar = { name: 'Alice', id: 123 }; // Sample object for field access
                else if (node.identifier === 'config') resolvedVar = '$PROJECTPATH/docs'; // Path variable
                else if (node.identifier === 'missing') {
                   // <<< Throw generic Error instead of MeldResolutionError >>>
                   throw new Error('Variable not found: missing');
                }
                else resolvedVar = `{{${node.identifier}}}`; // Placeholder
                
                // Simulate basic field access
                if (resolvedVar && node.fields && node.fields.length > 0) {
                  let current = resolvedVar;
                  for (const field of node.fields) {
                    if (field.type === 'field' && current && typeof current === 'object') {
                      // Check if field exists before accessing
                      if (field.value in current) {
                        current = current[field.value as string];
                      } else {
                         // <<< Throw generic Error >>>
                         throw new Error(`Field '${field.value}' not found`); 
                      }
                    } else {
                      // Handle other field types (index) or non-object access if needed
                       // <<< Throw generic Error >>>
                      throw new Error(`Cannot access field '${field.value}' on non-object`); 
                    }
                  }
                  resolvedVar = current;
                }
                
                result += String(resolvedVar); // Ensure result is string
            }
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
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello', expect.objectContaining({ definedAt: expect.any(Object) }));
    });

    it('should handle text assignment with escaped characters', async () => {
      // Arrange
      const example = textDirectiveExamples.atomic.escapedCharacters;
      const node = await createNodeFromExample(example.code);
      
      // <<< Ensure mockImplementationOnce returns the unescaped string >>>
      resolutionService.resolveNodes.mockImplementationOnce(async () => {
        return 'Line 1\nLine 2\t"Quoted"'; // The actual string value after unescaping
      });

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('escaped', 'Line 1\nLine 2\t"Quoted"', expect.objectContaining({ definedAt: expect.any(Object) }));
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
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Template content', expect.objectContaining({ definedAt: expect.any(Object) }));
    });

    it('should handle object property interpolation in text value', async () => {
      // Arrange
      const example = textDirectiveExamples.combinations.objectInterpolation;
      
      // <<< Use mockImplementationOnce >>>
      resolutionService.resolveNodes.mockImplementationOnce(async () => {
        return 'Hello, Alice! Your ID is 123.';
      });
      
      const node = await createNodeFromExample(example.code.split('\n')[1]); // Get the second line with greeting directive

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello, Alice! Your ID is 123.', expect.objectContaining({ definedAt: expect.any(Object) }));
      
      // <<< No need to restore mock with mockImplementationOnce >>>
      // resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should handle path referencing in text values', async () => {
      // Arrange
      const example = textDirectiveExamples.combinations.pathReferencing;
      
      // <<< Use mockImplementationOnce >>>
      resolutionService.resolveNodes.mockImplementationOnce(async () => {
        return 'Docs are at $PROJECTPATH/docs';
      });
      
      const node = await createNodeFromExample(example.code.split('\n')[5]); // Get the docsText line

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('configText', 'Docs are at $PROJECTPATH/docs', expect.objectContaining({ definedAt: expect.any(Object) }));
      
      // <<< No need to restore mock with mockImplementationOnce >>>
      // resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should return error if text interpolation contains undefined variables', async () => {
      // Arrange
      const example = textDirectiveExamples.invalid.undefinedVariable;
      
      // <<< Use mockImplementationOnce to throw the specific error >>>
      resolutionService.resolveNodes.mockImplementationOnce(async () => {
        // <<< Throw generic Error >>>
        throw new Error('Variable not found: undefined_var');
      });

      const node = await createNodeFromExample(example.code);

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      await expect(handler.execute(node, testContext))
        .rejects
        .toThrow(DirectiveError); // Expect DirectiveError as it should be wrapped
        
      // <<< No need to restore mock with mockImplementationOnce >>>
      // resolutionService.resolveInContext = mockResolveInContext;
    });

    it('should handle basic variable interpolation', async () => {
      // Arrange
      const example = textDirectiveExamples.combinations.basicInterpolation;
      
      // <<< Use mockImplementationOnce >>>
      resolutionService.resolveNodes.mockImplementationOnce(async () => {
        return 'Hello, World!';
      });
      
      const node = await createNodeFromExample(example.code.split('\n')[2]); // Get the third line with the message directive

      const testContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, testContext);
      expect(clonedState.setTextVar).toHaveBeenCalledWith('message', 'Hello, World!', expect.objectContaining({ definedAt: expect.any(Object) }));
      
      // <<< No need to restore mock with mockImplementationOnce >>>
      // resolutionService.resolveInContext = mockResolveInContext;
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
      expect(clonedState.setTextVar).toHaveBeenCalledWith('greeting', 'Hello', expect.objectContaining({ definedAt: expect.any(Object) }));
    });

    // Skip this test due to validation being commented out (Issue #34)
    it.skip('should report error for unclosed string', async () => {
      const node = createTextDirective('unclosed', '"abc');
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