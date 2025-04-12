import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { createDefineDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { MeldResolutionError } from '@core/errors';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js'; // Assuming this path is correct now
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { ICommandDefinition } from '@core/types/definitions.js';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveNode, DefineDirectiveData, InterpolatableValue } from '@core/syntax/types.js'; // Ensure DefineDirectiveData is imported
import { expectToThrowWithConfig } from '@tests/utils/errorTestUtils.js'; // Import the utility
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';

// NOTE: The createMockState helper is NOT used here, setup is simpler

describe('DefineDirectiveHandler', () => {
  let handler: DefineDirectiveHandler;
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let context: TestContextDI;
  let clonedState: any; // Keep the simple any type for the clone mock

  beforeEach(async () => {
    context = TestContextDI.createIsolated();

    validationService = createValidationServiceMock();
    stateService = createStateServiceMock(); 
    resolutionService = createResolutionServiceMock();

    // Simple mock for the clone
    clonedState = {
        setCommandVar: vi.fn() // Ensure the correct method exists on the clone mock
    };
    stateService.clone = vi.fn().mockReturnValue(clonedState);

    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);

    context.registerMockClass('DefineDirectiveHandler', DefineDirectiveHandler);

    await context.initialize();
    handler = await context.resolve('DefineDirectiveHandler');
  });

  afterEach(async () => {
    await context?.cleanup();
    vi.clearAllMocks(); // Clear mocks
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

  describe('command definition', () => {
    it('should handle basic command definition without parameters', async () => {
      // Test @define cmd = @run [echo hello]
      const node = createValidDefineNode('cmd1', 'echo hello'); 
      const result = await handler.execute(node, { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext);
      expect(stateService.clone).toHaveBeenCalled();
      // Expecting IBasicCommandDefinition and metadata object
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd1', 
          expect.objectContaining({
              type: 'basic',
              name: 'cmd1',
              commandTemplate: expect.arrayContaining([expect.objectContaining({ type: 'Text', content: 'echo hello' })]),
              parameters: expect.arrayContaining([]),
              isMultiline: false,
              sourceLocation: expect.objectContaining({ // Expect sourceLocation
                  filePath: 'test.mld',
                  line: 1, 
                  column: 1
              }),
              definedAt: expect.any(Number) // Expect definedAt timestamp
          }),
          expect.objectContaining({ // Expect metadata object
              definedAt: expect.objectContaining({ 
                  filePath: 'test.mld',
                  line: 1, 
                  column: 1
              })
          })
      );
      expect(result).toBe(clonedState);
    });

    it('should handle command definition with parameters', async () => {
      // Test @define cmd(p1, p2) = @run [echo $p1 $p2]
      const node = createValidDefineNode('cmd2', 'echo $p1 $p2', ['p1', 'p2']);
      const result = await handler.execute(node, { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd2', 
          expect.objectContaining({
              type: 'basic',
              name: 'cmd2',
              commandTemplate: expect.arrayContaining([expect.objectContaining({ type: 'Text', content: 'echo $p1 $p2' })]),
              parameters: expect.arrayContaining([
                  expect.objectContaining({ name: 'p1', position: 1 }),
                  expect.objectContaining({ name: 'p2', position: 2 })
              ]),
              isMultiline: false,
              sourceLocation: expect.any(Object), // Check existence
              definedAt: expect.any(Number) // Check existence
          }),
          expect.objectContaining({ // Expect metadata object
              definedAt: expect.any(Object)
          })
      );
      expect(result).toBe(clonedState);
    });

    it('should handle command definition with multiple parameters', async () => {
       // Test @define cmd(a, b, c) = @run [echo $a $b $c]
      const node = createValidDefineNode('cmd3', 'echo $a $b $c', ['a', 'b', 'c']);
      const result = await handler.execute(node, { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd3', 
          expect.objectContaining({
              type: 'basic',
              name: 'cmd3',
              commandTemplate: expect.arrayContaining([expect.objectContaining({ type: 'Text', content: 'echo $a $b $c' })]),
              parameters: expect.arrayContaining([
                  expect.objectContaining({ name: 'a', position: 1 }),
                  expect.objectContaining({ name: 'b', position: 2 }),
                  expect.objectContaining({ name: 'c', position: 3 })
              ]),
              isMultiline: false,
              sourceLocation: expect.any(Object), // Check existence
              definedAt: expect.any(Number) // Check existence
          }),
          expect.objectContaining({ // Expect metadata object
              definedAt: expect.any(Object)
          })
      );
      expect(result).toBe(clonedState);
    });
    
    // New test case for literal value definition
    it('should handle command definition with literal value', async () => {
        const literalValue: InterpolatableValue = [
            { type: 'Text', content: 'echo literal ', location: createLocation(1,1) },
            { type: 'VariableReference', identifier: 'var', valueType: 'text', isVariableReference: true, location: createLocation(1,15) }
        ];
        const node = createValidDefineNode('cmdLiteral', literalValue, [], false); // isRunSyntax = false

        // Mock resolution for the literal value
        resolutionService.resolveNodes.mockResolvedValueOnce('echo literal resolved_value');
        
        const result = await handler.execute(node, { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext);
        expect(stateService.clone).toHaveBeenCalled();
        expect(resolutionService.resolveNodes).toHaveBeenCalledWith(literalValue, expect.any(Object));
        expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmdLiteral', 
            expect.objectContaining({
                type: 'basic',
                name: 'cmdLiteral',
                commandTemplate: 'echo literal resolved_value', // Expect the resolved string here
                parameters: expect.arrayContaining([]),
                isMultiline: false,
                sourceLocation: expect.any(Object), // Check existence
                definedAt: expect.any(Number) // Check existence
            }),
            expect.objectContaining({ // Expect metadata object
                definedAt: expect.any(Object)
            })
        );
        expect(result).toBe(clonedState);
    });

  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      const node = createValidDefineNode('cmdRisk.risk.high', 'rm -rf /'); 
      await handler.execute(node, { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext);
      // Check that the command definition contains riskLevel
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmdRisk', 
           expect.objectContaining({
               riskLevel: 'high', 
               sourceLocation: expect.any(Object),
               definedAt: expect.any(Number)
           }),
           expect.objectContaining({ // Expect metadata object
               definedAt: expect.any(Object)
           })
      );
    });

    it('should handle command about metadata', async () => {
      const node = createValidDefineNode('cmdAbout.about.A cool command', 'ls'); 
      await handler.execute(node, { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext);
       // Check that the command definition contains description
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmdAbout', 
           expect.objectContaining({
               description: 'A cool command', 
               sourceLocation: expect.any(Object),
               definedAt: expect.any(Number)
           }),
           expect.objectContaining({ // Expect metadata object
               definedAt: expect.any(Object)
           })
      );
    });
  });

  describe('validation', () => {
    it('should validate command structure through ValidationService', async () => {
      const node = createValidDefineNode('cmd4', 'test');
      await handler.execute(node, { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext);
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    // ... other validation tests using rejects.toThrow ...
  });

  describe('state management', () => {
    it('should create new state for command storage', async () => {
      const node = createValidDefineNode('cmd5', 'test');
      await handler.execute(node, { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext);
      expect(stateService.clone).toHaveBeenCalled();
    });

    it('should store command in new state', async () => {
      const node = createValidDefineNode('cmd6', 'echo test');
      await handler.execute(node, { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext);
      // Check it was called with the name, the command def, and metadata
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd6', expect.any(Object), expect.any(Object)); 
      // Optionally, check the type of the stored definition
      const storedDefinition = vi.mocked(clonedState.setCommandVar).mock.calls[0][1] as ICommandDefinition;
      expect(storedDefinition.type).toBe('basic');
      expect(storedDefinition.name).toBe('cmd6');
      expect(storedDefinition.sourceLocation).toBeDefined();
      expect(storedDefinition.definedAt).toBeDefined();
      // Check the metadata argument
      const storedMetadata = vi.mocked(clonedState.setCommandVar).mock.calls[0][2] as Partial<VariableMetadata>;
      expect(storedMetadata.definedAt).toBeDefined();
    });
  });
  
  describe('error handling', () => {
    it('should handle state errors', async () => {
      const node = createValidDefineNode('cmdError', 'test'); 
      const executeContext = { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext;
      const stateError = new Error('State error');

      if(clonedState) {
         vi.mocked(clonedState.setCommandVar).mockImplementation(() => {
           throw stateError;
         });
      } else {
         throw new Error('Test setup error: mockStateClone was not initialized');
      }

      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(
        async () => await handler.execute(node, executeContext),
        {
          errorType: DirectiveError, // Expect the handler to wrap the error
          // code: DirectiveErrorCode.COMMAND_DEFINITION_FAILED, // Optional: Add if code is consistent
          message: /State error/i, // Check message contains original error message
          cause: stateError // Expect the original error to be the cause
        }
      );
    });
    
    // Add test for literal value resolution error
    it('should handle literal value resolution errors', async () => {
        const literalValue: InterpolatableValue = [
            { type: 'Text', content: 'echo literal ', location: createLocation(1,1) },
            { type: 'VariableReference', identifier: 'unresolvable', valueType: 'text', isVariableReference: true, location: createLocation(1,15) }
        ];
        const node = createValidDefineNode('cmdResolveError', literalValue, [], false); // isRunSyntax = false
        // Provide options object including the error code
        const resolutionError = new MeldResolutionError('Variable not found', { code: 'VAR_NOT_FOUND' });

        // Mock resolution service to throw
        resolutionService.resolveNodes.mockRejectedValue(resolutionError);
        
        const executeContext = { state: stateService, currentFilePath: 'test.mld' } as DirectiveContext;
        
        await expectToThrowWithConfig(
            async () => await handler.execute(node, executeContext),
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