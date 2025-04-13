import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import type { DirectiveNode } from '@core/syntax/types/index.js';
import type { InterpolatableValue, StructuredPath as AstStructuredPath } from '@core/syntax/types/nodes.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import { StringLiteralHandler } from '@services/resolution/ResolutionService/resolvers/StringLiteralHandler.js';
import { StringConcatenationHandler } from '@services/resolution/ResolutionService/resolvers/StringConcatenationHandler.js';
import { parse } from '@core/ast';
import { createLocation } from '@tests/utils/testFactories.js';
import { textDirectiveExamples } from '@core/syntax/index.js';
import { ErrorSeverity, FieldAccessError, MeldResolutionError } from '@core/errors/index.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { 
  createValidationServiceMock, 
  createStateServiceMock, 
  createResolutionServiceMock, 
} from '@tests/utils/mocks/serviceMocks.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { MeldPath } from '@core/types';
import { VariableType } from '@core/types';
import type { DirectiveProcessingContext, FormattingContext } from '@core/types/index.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import { mock } from 'vitest-mock-extended';

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
  let testDIContext: TestContextDI;
  let mockProcessingContext: DirectiveProcessingContext;

  beforeEach(async () => {
    testDIContext = TestContextDI.createIsolated();
    await testDIContext.initialize();
    
    // Create mocks using standardized factories
    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    
    // Configure mock implementations
    validationService.validate.mockResolvedValue(undefined);
    stateService.getCurrentFilePath.mockReturnValue('test.meld');
    
    // Mock resolutionService methods (simplified)
    resolutionService.resolveNodes.mockImplementation(async (nodes: InterpolatableValue, context: any): Promise<string> => {
        let result = '';
        for (const node of nodes) {
            if (node.type === 'Text') result += node.content;
            else if (node.type === 'VariableReference') {
                if (node.identifier === 'name') result += 'World';
                else if (node.identifier === 'user' && node.fields?.[0]?.value === 'name') result += 'Alice';
                else if (node.identifier === 'greeting') result += 'Hello';
                else if (node.identifier === 'subject') result += 'World';
                else if (node.identifier === 'config') result += '$PROJECTPATH/docs';
                else if (node.identifier === 'missing' || node.identifier === 'undefined_var') {
                    throw new Error(`Variable not found: ${node.identifier}`);
                }
                else result += `{{${node.identifier}}}`; 
            }
        }
        return result;
    });
    resolutionService.resolveInContext.mockImplementation(async (value: any, context: any): Promise<string> => {
        // Simple mock: return raw value or resolved if variable
        const raw = typeof value === 'object' && value !== null && 'raw' in value ? value.raw : String(value);
        if (raw.includes('{{name}}')) return 'World'; // Example resolution
        return raw;
    });
    // Mock resolvePath if needed by specific tests (e.g., embed source=path)

    // Create mock contexts
    const mockResolutionContext = mock<ResolutionContext>();
    const mockFormattingContext = mock<FormattingContext>();

    // Create the base mock processing context
    mockProcessingContext = {
        state: stateService,
        resolutionContext: mockResolutionContext,
        formattingContext: mockFormattingContext,
        directiveNode: undefined as any, // Placeholder
    };

    // Create handler instance from container
    // Inject necessary services (FileSystemService is needed for @run/@embed)
    testDIContext.registerMock('IValidationService', validationService);
    testDIContext.registerMock('IResolutionService', resolutionService);
    testDIContext.registerMock('IFileSystemService', mock()); // Add basic FS mock
    handler = await testDIContext.container.resolve(TextDirectiveHandler);
  });

  afterEach(async () => {
    await testDIContext?.cleanup();
  });

  describe('execute', () => {
    it('should handle a simple text assignment with string literal', async () => {
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code);
      mockProcessingContext.directiveNode = node;

      const result = await handler.execute(mockProcessingContext);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello', expect.objectContaining({ definedAt: expect.any(Object) }));
      expect(result).toBe(stateService);
    });

    it('should handle text assignment with escaped characters', async () => {
      const example = textDirectiveExamples.atomic.escapedCharacters;
      const node = await createNodeFromExample(example.code);
      mockProcessingContext.directiveNode = node;

      // The parser now handles unescaping, mock resolveNodes to return the direct value
      resolutionService.resolveNodes.mockResolvedValueOnce('Line 1\nLine 2\t"Quoted"'); 

      const result = await handler.execute(mockProcessingContext);
      expect(stateService.setTextVar).toHaveBeenCalledWith('escaped', 'Line 1\nLine 2\t"Quoted"', expect.objectContaining({ definedAt: expect.any(Object) }));
      expect(result).toBe(stateService);
    });

    it('should handle a template literal in text directive', async () => {
      const example = textDirectiveExamples.atomic.templateLiteral;
      const node = await createNodeFromExample(example.code);
      mockProcessingContext.directiveNode = node;
      
      // Mock resolveNodes for template literal content
      resolutionService.resolveNodes.mockResolvedValueOnce('Template content');

      const result = await handler.execute(mockProcessingContext);
      expect(stateService.setTextVar).toHaveBeenCalledWith('message', 'Template content', expect.objectContaining({ definedAt: expect.any(Object) }));
      expect(result).toBe(stateService);
    });

    it('should handle object property interpolation in text value', async () => {
      const example = textDirectiveExamples.combinations.objectInterpolation;
      const node = await createNodeFromExample(example.code.split('\n')[1]);
      mockProcessingContext.directiveNode = node;

      // Mock resolveNodes for this specific interpolation
      resolutionService.resolveNodes.mockResolvedValueOnce('Hello, Alice!'); 
      
      const result = await handler.execute(mockProcessingContext);
      // Corrected expected value based on mock
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello, Alice!', expect.objectContaining({ definedAt: expect.any(Object) }));
      expect(result).toBe(stateService);
    });

    it('should handle path referencing in text values', async () => {
      const example = textDirectiveExamples.combinations.pathReferencing;
      const node = await createNodeFromExample(example.code.split('\n')[5]);
      mockProcessingContext.directiveNode = node;

      // Mock resolveNodes for this specific interpolation
      resolutionService.resolveNodes.mockResolvedValueOnce('Docs are at $PROJECTPATH/docs');

      const result = await handler.execute(mockProcessingContext);
      expect(stateService.setTextVar).toHaveBeenCalledWith('configText', 'Docs are at $PROJECTPATH/docs', expect.objectContaining({ definedAt: expect.any(Object) }));
      expect(result).toBe(stateService);
    });

    it('should return error if text interpolation contains undefined variables', async () => {
      const example = textDirectiveExamples.invalid.undefinedVariable;
      const node = await createNodeFromExample(example.code);
      mockProcessingContext.directiveNode = node;

      // Mock is already set up in beforeEach to throw for 'undefined_var'
      await expect(handler.execute(mockProcessingContext))
        .rejects
        .toThrow(DirectiveError); // Expect wrapped DirectiveError
      await expect(handler.execute(mockProcessingContext))
        .rejects
        .toThrow(/Variable not found: undefined_var/);
    });

    it('should handle basic variable interpolation', async () => {
      const example = textDirectiveExamples.combinations.basicInterpolation;
      const node = await createNodeFromExample(example.code.split('\n')[2]);
      mockProcessingContext.directiveNode = node;

      // Mock is set up in beforeEach
      const result = await handler.execute(mockProcessingContext);
      expect(stateService.setTextVar).toHaveBeenCalledWith('message', 'Hello, World!', expect.objectContaining({ definedAt: expect.any(Object) }));
      expect(result).toBe(stateService);
    });

    it('should register the node as a text directive in the registry', async () => {
      // This test might be redundant now, as it just tests the basic flow
      const example = textDirectiveExamples.atomic.simpleString;
      const node = await createNodeFromExample(example.code);
      mockProcessingContext.directiveNode = node;

      const result = await handler.execute(mockProcessingContext);
      expect(stateService.setTextVar).toHaveBeenCalledWith('greeting', 'Hello', expect.objectContaining({ definedAt: expect.any(Object) }));
      expect(result).toBe(stateService);
    });

    it.skip('should report error for unclosed string', async () => {
      // Skipped: Validation logic is external to the handler now
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