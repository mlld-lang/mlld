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
    // Create handler instance (no DI needed for handler itself typically)
    handler = new TextDirectiveHandler();
    
    // Use the fixture to create context, mocks, and resolve services
    fixture = await DirectiveTestFixture.create({
      handler: handler,
      // Add specific overrides for this test suite if needed, e.g.:
      // resolutionOverrides: {
      //   resolveNodes: vi.fn().mockImplementation(...) // Default mock logic
      // }
    });
    
    // Get references to resolved services/mocks from the fixture
    stateService = fixture.stateService;
    resolutionService = fixture.resolutionService;

    // Default mock behavior for resolutionService (can be overridden per test)
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
                    // Simulate resolution error
                    throw new MeldResolutionError(`Variable not found: ${node.identifier}`);
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
      vi.spyOn(stateService, 'setTextVar'); // Spy to check the call

      // --- Execution ---
      const result = await fixture.executeHandler(node);

      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello');
      expect(result).toBe(stateService); // Handler should return the state
    });

    it('should handle text assignment with escaped characters', async () => {
      const example = textDirectiveExamples.atomic.escapedCharacters;
      const node = await createNodeFromExample(example.code);
      const expectedValue = 'Line 1\nLine 2\t"Quoted"';
      
      // --- Test Specific Mock Setup ---
      // Mock resolveNodes to return the unescaped value
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue); 
      vi.spyOn(stateService, 'setTextVar');
      
      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(stateService.setTextVar).toHaveBeenCalledWith('escaped', expectedValue);
      expect(result).toBe(stateService);
    });

    it('should handle a template literal in text directive', async () => {
      const example = textDirectiveExamples.atomic.templateLiteral;
      const node = await createNodeFromExample(example.code);
      const expectedValue = 'Template content';
      
      // --- Test Specific Mock Setup ---
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue);
      vi.spyOn(stateService, 'setTextVar');

      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(stateService.setTextVar).toHaveBeenCalledWith('message', expectedValue);
      expect(result).toBe(stateService);
    });

    it('should handle object property interpolation in text value', async () => {
      const example = textDirectiveExamples.combinations.objectInterpolation;
      const node = await createNodeFromExample(example.code.split('\n')[1]); // Get only the @text line
      const expectedValue = 'Hello, Alice!';

      // --- Test Specific Mock Setup ---
      // Mock resolveNodes for this specific interpolation (uses default mock logic from beforeEach)
      vi.spyOn(stateService, 'setTextVar');
      
      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', expectedValue);
      expect(result).toBe(stateService);
    });

    it('should handle path referencing in text values', async () => {
      const example = textDirectiveExamples.combinations.pathReferencing;
      const node = await createNodeFromExample(example.code.split('\n')[5]); // Get only the @text configText line
      const expectedValue = 'Docs are at $PROJECTPATH/docs';

      // --- Test Specific Mock Setup ---
      // Mock resolveNodes for this specific interpolation
      vi.spyOn(resolutionService, 'resolveNodes').mockResolvedValueOnce(expectedValue);
      vi.spyOn(stateService, 'setTextVar');

      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(stateService.setTextVar).toHaveBeenCalledWith('configText', expectedValue);
      expect(result).toBe(stateService);
    });

    it('should throw DirectiveError if text interpolation contains undefined variables', async () => {
      const example = textDirectiveExamples.invalid.undefinedVariable;
      const node = await createNodeFromExample(example.code);

      // --- Test Specific Mock Setup ---
      // Default mock for resolveNodes in beforeEach already throws MeldResolutionError for 'undefined_var'
      vi.spyOn(stateService, 'setTextVar'); // Ensure setTextVar is spied on

      // --- Execution & Assertion ---
      await expect(fixture.executeHandler(node))
        .rejects
        .toThrow(DirectiveError); // Expect handler to wrap MeldResolutionError
      
      await expect(fixture.executeHandler(node))
        .rejects
        .toHaveProperty('cause.message', 'Variable not found: undefined_var'); // Check original cause
        
      expect(stateService.setTextVar).not.toHaveBeenCalled(); // State should not be updated
    });

    it('should handle basic variable interpolation', async () => {
      const example = textDirectiveExamples.combinations.basicInterpolation;
      const node = await createNodeFromExample(example.code.split('\n')[2]); // Get only the @text message line
      const expectedValue = 'Hello, World!';
      
      // --- Test Specific Mock Setup ---
      // Mock resolveNodes (uses default mock logic from beforeEach)
      vi.spyOn(stateService, 'setTextVar');

      // --- Execution ---
      const result = await fixture.executeHandler(node);
      
      // --- Assertions ---
      expect(resolutionService.resolveNodes).toHaveBeenCalledWith(node.directive.value, expect.anything());
      expect(stateService.setTextVar).toHaveBeenCalledWith('message', expectedValue);
      expect(result).toBe(stateService);
    });
  });
}); 