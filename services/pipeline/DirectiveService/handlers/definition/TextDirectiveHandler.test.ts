import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types/index.js';
import type { InterpolatableValue, StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { parse } from '@core/ast';
import { createLocation } from '@tests/utils/testFactories.js';
import { textDirectiveExamples } from '@core/syntax/index.js';
import { ErrorSeverity, FieldAccessError, MeldResolutionError } from '@core/errors/index.js';
import { DirectiveTestFixture } from '@tests/utils/fixtures/DirectiveTestFixture.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';

/**
 * TextDirectiveHandler Test Status
 * --------------------------------
 * 
 * MIGRATION STATUS: Complete (Refactored to use DirectiveTestFixture)
 * 
 * This test file has been fully migrated to use:
 * - Centralized syntax examples
 * - DirectiveTestFixture for container management and standard mocks
 * - vi.spyOn for test-specific mock behavior
 */

/**
 * Helper function to create real AST nodes using @core/ast
 */
const createNodeFromExample = async (code: string): Promise<DirectiveNode> => {
  try {
    // Ensure @core/ast is available
    const { parse } = await import('@core/ast');
    
    const result = await parse(code, {
      trackLocations: true,
      validateNodes: true
    });
    
    if (!result.ast || result.ast.length === 0 || result.ast[0].type !== 'Directive') {
        throw new Error(`Failed to parse directive from code: ${code}`);
    }
    
    return result.ast[0] as DirectiveNode;
  } catch (error) {
    console.error('Error parsing with @core/ast:', error);
    throw error;
  }
};

describe('TextDirectiveHandler', () => {
  let fixture: DirectiveTestFixture;
  let handler: TextDirectiveHandler;
  let stateService: IStateService; // Direct reference from fixture
  let resolutionService: IResolutionService; // Direct reference from fixture

  beforeEach(async () => {
    // Create the fixture first, which sets up the DI container with mocks
    fixture = await DirectiveTestFixture.create({
      // No handler instance passed here; we resolve it from the container
      // Add specific overrides for this test suite if needed
    });

    // Ensure the actual handler class is registered in the test container
    // so tsyringe can inject the mocked dependencies into it.
    // Use registerService for actual classes, not registerMock.
    // Access the container helper via fixture.context.container
    if (!fixture.context.container.isRegistered(TextDirectiveHandler)) {
      fixture.context.container.registerService(TextDirectiveHandler, TextDirectiveHandler);
    }

    // Resolve the handler instance *from the fixture's container*
    // This ensures it receives the mocked dependencies correctly.
    handler = fixture.context.resolveSync(TextDirectiveHandler);
    
    // Manually assign the resolved handler to the fixture instance
    // so that fixture.executeHandler() can use it internally.
    fixture.handler = handler;
    
    // Now get references to the *mocked* services from the fixture
    // These are the instances that should have been injected into 'handler'
    stateService = fixture.stateService;
    resolutionService = fixture.resolutionService;

    // Set up spy/mock behavior on the *mocked* resolutionService instance
    vi.spyOn(resolutionService, 'resolveNodes').mockImplementation(async (nodes: InterpolatableValue, context: any): Promise<string> => {
        let result = '';
        for (const node of nodes) {
            if (node.type === 'Text') result += node.content;
            else if (node.type === 'VariableReference') {
                // Simple variable mocking for common test cases
                if (node.identifier === 'name') result += 'World';
                else if (node.identifier === 'user' && node.fields?.[0]?.value === 'name') result += 'Alice';
                else if (node.identifier === 'greeting') result += 'Hello';
                else if (node.identifier === 'subject') result += 'World';
                else if (node.identifier === 'configPath') result += '$PROJECTPATH/docs'; // Use a distinct name
                else if (node.identifier === 'missing' || node.identifier === 'undefined_var') {
                    // Simulate resolution error with required options
                    throw new MeldResolutionError(
                      `Variable not found: ${node.identifier}`,
                      { 
                        code: 'E_VAR_NOT_FOUND', // Example code
                        details: { variableName: node.identifier }, // Provide details
                        severity: ErrorSeverity.Recoverable // Use correct enum member
                      }
                    );
                }
                else result += `{{${node.identifier}}}`; // Fallback for unknown vars
            }
        }
        return result;
    });
    
    vi.spyOn(stateService, 'getCurrentFilePath').mockReturnValue('test.meld');
  });

  afterEach(async () => {
    await fixture?.cleanup();
  });

  describe('execute', () => {
    it('should handle a simple text assignment with string literal', async () => {
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code);
      
      // --- Test Specific Mock Setup ---
      // Mock resolution service to return the direct literal value
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce('Hello');
      const setVariableSpy = vi.spyOn(stateService, 'setVariable'); // Spy on the new method

      // --- Execution ---
      const result = await fixture.executeHandler(node);

      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'text',
        name: 'greeting',
        value: 'Hello'
      }));
      expect(result).toBe(stateService); // Handler should return the state
    });

    it('should handle text assignment with escaped characters', async () => {
      const example = textDirectiveExamples.atomic.escapedCharacters;
      const node = await createNodeFromExample(example.code);
      const expectedValue = 'Line 1\nLine 2\t"Quoted"';
      
      // --- Test Specific Mock Setup ---
      // Mock resolveNodes to return the unescaped value
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue); 
      const setVariableSpy = vi.spyOn(stateService, 'setVariable'); // Spy on the new method
      
      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'text',
        name: 'escaped',
        value: expectedValue
      }));
      expect(result).toBe(stateService);
    });

    it('should handle a template literal in text directive', async () => {
      const example = textDirectiveExamples.atomic.templateLiteral;
      const node = await createNodeFromExample(example.code);
      const expectedValue = 'Template content';
      
      // --- Test Specific Mock Setup ---
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue);
      const setVariableSpy = vi.spyOn(stateService, 'setVariable'); // Spy on the new method

      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'text',
        name: 'message',
        value: expectedValue
      }));
      expect(result).toBe(stateService);
    });

    it('should handle object property interpolation in text value', async () => {
      const example = textDirectiveExamples.combinations.objectInterpolation;
      const node = await createNodeFromExample(example.code.split('\n')[1]); // Get only the @text line
      const expectedValue = 'Hello, Alice!';

      // --- Test Specific Mock Setup ---
      // Override the default mock to return the specific expected value for this test
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue); 
      const setVariableSpy = vi.spyOn(stateService, 'setVariable'); // Spy on the new method
      
      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'text',
        name: 'greeting',
        value: expectedValue
      }));
      expect(result).toBe(stateService);
    });

    it('should handle path referencing in text values', async () => {
      const example = textDirectiveExamples.combinations.pathReferencing;
      const node = await createNodeFromExample(example.code.split('\n')[5]); // Get only the @text configText line
      const expectedValue = 'Docs are at $PROJECTPATH/docs';

      // --- Test Specific Mock Setup ---
      // Mock resolveNodes for this specific interpolation
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue);
      const setVariableSpy = vi.spyOn(stateService, 'setVariable'); // Spy on the new method

      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'text',
        name: 'configText',
        value: expectedValue
      }));
      expect(result).toBe(stateService);
    });

    it('should throw DirectiveError if text interpolation contains undefined variables', async () => {
      const example = textDirectiveExamples.invalid.undefinedVariable;
      const node = await createNodeFromExample(example.code);

      // --- Test Specific Mock Setup ---
      // Default mock for resolveNodes in beforeEach already throws MeldResolutionError for 'undefined_var'
      vi.spyOn(stateService, 'setVariable'); // Ensure setVariable is spied on
      const setVariableSpy = vi.spyOn(stateService, 'setVariable'); // Spy on the new method

      // --- Execution & Assertion ---
      await expect(fixture.executeHandler(node))
        .rejects
        .toThrow(DirectiveError); // Expect handler to wrap MeldResolutionError
      
      await expect(fixture.executeHandler(node))
        .rejects
        .toHaveProperty('cause.message', 'Variable not found: undefined_var'); // Check original cause
        
      expect(setVariableSpy).not.toHaveBeenCalled(); // State should not be updated
    });

    it('should handle basic variable interpolation', async () => {
      const example = textDirectiveExamples.combinations.basicInterpolation;
      const node = await createNodeFromExample(example.code.split('\n')[2]); // Get only the @text message line
      const expectedValue = 'Hello, World!';
      
      // --- Test Specific Mock Setup ---
      // Mock resolveNodes (uses default mock logic from beforeEach)
      vi.spyOn(stateService, 'setVariable');
      const setVariableSpy = vi.spyOn(stateService, 'setVariable'); // Spy on the new method

      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(setVariableSpy).toHaveBeenCalledWith(expect.objectContaining({
        type: 'text',
        name: 'message',
        value: expectedValue
      }));
      expect(result).toBe(stateService);
    });
  });
}); 