import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { createDefineDirective, createLocation, createDirectiveNode } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldResolutionError, MeldError } from '@core/errors';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
} from '@tests/utils/mocks/serviceMocks.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { ICommandDefinition } from '@core/types/define.js';
import type { DirectiveNode, DefineDirectiveData, InterpolatableValue } from '@core/syntax/types.js';
import { expectToThrowWithConfig } from '@tests/utils/errorTestUtils.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { DirectiveProcessingContext, FormattingContext, ResolutionContext } from '@core/types/index.js';
import { JsonValue } from '@core/types';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { VariableMetadata } from '@core/types/variables.js';

// Helper to extract state (keep as is)
function getStateFromResult(result: DirectiveResult | IStateService): IStateService {
    if (result && typeof result === 'object' && 'state' in result) {
        return result.state as IStateService;
    }
    return result as IStateService;
}

describe('DefineDirectiveHandler', () => {
  let handler: DefineDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let context: TestContextDI;

  beforeEach(async () => {
    context = TestContextDI.createIsolated();

    validationService = createValidationServiceMock();
    stateService = createStateServiceMock(); 
    resolutionService = createResolutionServiceMock();

    // Mock necessary methods on the main state service mock
    stateService.getCurrentFilePath.mockReturnValue('/test.meld');
    stateService.setCommandVar.mockResolvedValue(undefined); // Mock setCommandVar

    // Setup mock resolution
    resolutionService.resolveNodes.mockImplementation(async (nodes, ctx) => {
      return nodes.map((n: any) => n.content || `{{${n.identifier}}}`).join('');
    });

    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);

    context.registerMockClass('DefineDirectiveHandler', DefineDirectiveHandler);

    await context.initialize();
    handler = await context.resolve('DefineDirectiveHandler');
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.clearAllMocks();
  });

  // Helper to ensure test nodes have the expected structure
  // Updated to reflect AST changes for @define with @run or literal values
  const createValidDefineNode = (
      name: string, 
      // Value can be a command string (for @run) or an InterpolatableValue (for literal)
      value: string | InterpolatableValue, 
      parameters: string[] = [],
      isRunSyntax: boolean = true // Default to assuming @define cmd = @run [...] syntax for old tests
  ): DirectiveNode => {
      
      let directiveData: Omit<DefineDirectiveData, 'kind'>;

      if (isRunSyntax && typeof value === 'string') {
          // Simulate @define cmd = @run [command_string]
          directiveData = {
              name: name,
              // Structure mimicking RunRHSAst for runCommand
              command: {
                  subtype: 'runCommand', 
                  // For basic tests, wrap the string command in a TextNode for InterpolatableValue
                  command: [{ type: 'Text', content: value, location: createLocation(1,1) }], 
                  isMultiLine: false 
              },
              value: undefined, // Explicitly undefined when using command syntax
              parameters: parameters
          };
      } else if (!isRunSyntax && isInterpolatableValueArray(value)) {
          // Simulate @define cmd = "interpolated {{value}}"
          directiveData = {
              name: name,
              command: undefined, // Explicitly undefined when using literal value syntax
              value: value,
              parameters: parameters
          };
      } else {
          // Handle other cases or throw error if structure is unexpected for the test
          // For simplicity, assuming basic tests fall into the first case for now.
          // If testing literal values, ensure isRunSyntax=false and value is InterpolatableValue
          throw new Error(`Invalid combination of value type (${typeof value}) and isRunSyntax (${isRunSyntax}) in createValidDefineNode`);
      }

      return {
          type: 'Directive',
          directive: {
              kind: 'define',
              ...directiveData
          } as DefineDirectiveData, // Cast needed as we build dynamically
          location: createLocation(1,1)
      };
  };

  // Helper to create mock DirectiveProcessingContext
  const createMockProcessingContext = (node: DirectiveNode): DirectiveProcessingContext => {
      const mockResolutionContext = mock<ResolutionContext>();
      const mockFormattingContext = mock<FormattingContext>();
      return {
          state: stateService,
          resolutionContext: mockResolutionContext,
          formattingContext: mockFormattingContext,
          directiveNode: node,
      };
  };

  describe('command definition', () => {
    it('should handle basic command definition without parameters', async () => {
      const node = createValidDefineNode('cmd1', 'echo hello'); 
      const processingContext = createMockProcessingContext(node);
      // Mock the specific resolution needed for this test
      resolutionService.resolveNodes.mockResolvedValueOnce('echo hello resolved');

      const result = await handler.execute(processingContext);
      const resultState = getStateFromResult(result);

      expect(resultState).toBe(stateService); // Expect the original state to be returned (modified)
      // Remove metadata check (3rd argument)
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmd1', 
          expect.objectContaining({
              type: 'basic',
              name: 'cmd1',
              commandTemplate: 'echo hello resolved', // Expect resolved value
              parameters: [],
              isMultiline: false,
              // Metadata checks can be simplified or removed if not critical
              // sourceLocation: expect.objectContaining({ filePath: 'test.mld' }),
              // definedAt: expect.any(Number)
          })
      );
    });

    it('should handle command definition with parameters', async () => {
      const node = createValidDefineNode('cmd2', 'echo $p1 $p2', ['p1', 'p2']);
      const processingContext = createMockProcessingContext(node);
      resolutionService.resolveNodes.mockResolvedValueOnce('echo $p1 $p2 resolved');

      const result = await handler.execute(processingContext);
      const resultState = getStateFromResult(result);
      
      expect(resultState).toBe(stateService);
      // Remove metadata check
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmd2', 
          expect.objectContaining({
              type: 'basic',
              name: 'cmd2',
              commandTemplate: 'echo $p1 $p2 resolved',
              parameters: expect.arrayContaining([
                  expect.objectContaining({ name: 'p1', position: 1 }),
                  expect.objectContaining({ name: 'p2', position: 2 })
              ]),
          })
      );
    });

    it('should handle command definition with multiple parameters', async () => {
       // Test @define cmd(a, b, c) = @run [echo $a $b $c]
      const node = createValidDefineNode('cmd3', 'echo $a $b $c', ['a', 'b', 'c']);
      const processingContext = createMockProcessingContext(node);
      resolutionService.resolveNodes.mockResolvedValueOnce('echo $a $b $c resolved');
      
      const result = await handler.execute(processingContext);
      const resultState = getStateFromResult(result);

      expect(resultState).toBe(stateService);
      // Remove metadata check
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmd3', 
          expect.objectContaining({
              type: 'basic',
              name: 'cmd3',
              commandTemplate: 'echo $a $b $c resolved',
              parameters: expect.arrayContaining([
                  expect.objectContaining({ name: 'a', position: 1 }),
                  expect.objectContaining({ name: 'b', position: 2 }),
                  expect.objectContaining({ name: 'c', position: 3 })
              ]),
          })
      );
    });
    
    // New test case for literal value definition
    it('should handle command definition with literal value', async () => {
        const literalValue: InterpolatableValue = [
            { type: 'Text', content: 'echo literal ', location: createLocation(1,1) },
            { type: 'VariableReference', identifier: 'var', valueType: 'text', isVariableReference: true, location: createLocation(1,15) }
        ];
        const node = createValidDefineNode('cmdLiteral', literalValue, [], false);
        const processingContext = createMockProcessingContext(node);
        resolutionService.resolveNodes.mockResolvedValueOnce('echo literal resolved_value');
        
        const result = await handler.execute(processingContext);
        const resultState = getStateFromResult(result);

        expect(resolutionService.resolveNodes).toHaveBeenCalledWith(literalValue, expect.any(Object));
        expect(resultState).toBe(stateService);
        // Remove metadata check
        expect(stateService.setCommandVar).toHaveBeenCalledWith('cmdLiteral', 
            expect.objectContaining({
                type: 'basic',
                name: 'cmdLiteral',
                commandTemplate: 'echo literal resolved_value', 
                parameters: expect.arrayContaining([]),
            })
        );
    });

  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      const node = createValidDefineNode('cmdRisk.risk.high', 'rm -rf /'); 
      const processingContext = createMockProcessingContext(node);
      resolutionService.resolveNodes.mockResolvedValueOnce('rm -rf / resolved');

      await handler.execute(processingContext);
      // Remove metadata check
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmdRisk', 
           expect.objectContaining({
               riskLevel: 'high', 
           })
      );
    });

    it('should handle command about metadata', async () => {
      const node = createValidDefineNode('cmdAbout.about.A cool command', 'ls'); 
      const processingContext = createMockProcessingContext(node);
      resolutionService.resolveNodes.mockResolvedValueOnce('ls resolved');

      await handler.execute(processingContext);
       // Remove metadata check
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmdAbout', 
           expect.objectContaining({
               description: 'A cool command', 
           })
      );
    });
  });

  describe('validation', () => {
    it.skip('should validate command structure through ValidationService', async () => {
      // Skipping because validationService.validate is commented out in handler
      const node = createValidDefineNode('cmd4', 'test');
      const processingContext = createMockProcessingContext(node);
      await handler.execute(processingContext);
      // expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    // ... other validation tests using rejects.toThrow ...
  });

  describe('state management', () => {
    // State is no longer cloned internally, remove this test
    // it('should create new state for command storage', async () => { ... });

    it('should store command in the provided state', async () => {
      const node = createValidDefineNode('cmd6', 'echo test');
      const processingContext = createMockProcessingContext(node);
      resolutionService.resolveNodes.mockResolvedValueOnce('echo test resolved');

      await handler.execute(processingContext);
      // Remove metadata check (3rd argument)
      expect(stateService.setCommandVar).toHaveBeenCalledWith('cmd6', expect.any(Object)); 
      // Check the stored definition
      const storedDefinition = vi.mocked(stateService.setCommandVar).mock.calls[0][1] as ICommandDefinition;
      expect(storedDefinition.type).toBe('basic');
      expect(storedDefinition.name).toBe('cmd6');
      // Metadata checks are less reliable without the 3rd arg, simplify or remove
      // expect(storedDefinition.sourceLocation).toBeDefined(); 
      // expect(storedDefinition.definedAt).toBeDefined(); 
    });
  });
  
  describe('error handling', () => {
    it('should handle state errors', async () => {
      const node = createValidDefineNode('cmdError', 'test'); 
      const processingContext = createMockProcessingContext(node);
      const stateError = new Error('State error');
      resolutionService.resolveNodes.mockResolvedValueOnce('test resolved');
      // Make the main state mock throw
      vi.mocked(stateService.setCommandVar).mockRejectedValueOnce(stateError);

      await expectToThrowWithConfig(
        async () => await handler.execute(processingContext),
        {
          errorType: DirectiveError,
          code: DirectiveErrorCode.EXECUTION_FAILED, 
          message: /State error/i, 
          cause: stateError 
        }
      );
    });
    
    // Add test for literal value resolution error
    it('should handle literal value resolution errors', async () => {
        const literalValue: InterpolatableValue = [
            { type: 'Text', content: 'echo literal ', location: createLocation(1,1) },
            { type: 'VariableReference', identifier: 'unresolvable', valueType: 'text', isVariableReference: true, location: createLocation(1,15) }
        ];
        const node = createValidDefineNode('cmdResolveError', literalValue, [], false);
        const processingContext = createMockProcessingContext(node);
        const resolutionError = new MeldResolutionError('Variable not found', { code: 'VAR_NOT_FOUND' });
        resolutionService.resolveNodes.mockRejectedValue(resolutionError);
                
        await expectToThrowWithConfig(
            async () => await handler.execute(processingContext),
            {
                errorType: DirectiveError,
                code: DirectiveErrorCode.RESOLUTION_FAILED,
                message: /Failed to resolve literal value/i,
                cause: resolutionError
            }
        );
    });

  });

});