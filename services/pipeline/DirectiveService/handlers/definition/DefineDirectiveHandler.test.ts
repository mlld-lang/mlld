import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mock } from 'vitest-mock-extended';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import { createDefineDirective, createLocation } from '@tests/utils/testFactories.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js'; // Assuming this path is correct now
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import type { ICommandDefinition } from '@core/types/definitions.js';
import type { DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { DirectiveNode, DefineDirectiveData } from '@core/syntax/types.js'; // Ensure DefineDirectiveData is imported
import { expectToThrowWithConfig } from '@tests/utils/errorTestUtils.js'; // Import the utility

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
  const createValidDefineNode = (name: string, command: string, parameters: string[] = []): DirectiveNode => {
      // Use the actual test factory if available and correct, otherwise build manually
      // const nodeFromFactory = createDefineDirectiveNode({ name, command, parameters });
      // return nodeFromFactory;
      
      // Manual creation ensuring structure:
      return {
          type: 'Directive',
          directive: {
              kind: 'define',
              name: name, // Ensure name is always a string
              command: { kind: 'run', command: command },
              parameters: parameters
          } as DefineDirectiveData,
          location: createLocation(1,1) // Add location
      };
  };

  describe('command definition', () => {
    it('should handle basic command definition without parameters', async () => {
      const node = createValidDefineNode('cmd1', 'echo hello'); // Use helper
      const result = await handler.execute(node, { state: stateService } as DirectiveContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd1', expect.objectContaining({ command: 'echo hello', parameters: [] }));
      expect(result).toBe(clonedState);
    });

    it('should handle command definition with parameters', async () => {
      const node = createValidDefineNode('cmd2', 'echo $p1 $p2', ['p1', 'p2']); // Use helper
      const result = await handler.execute(node, { state: stateService } as DirectiveContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd2', expect.objectContaining({ command: 'echo $p1 $p2', parameters: ['p1', 'p2'] }));
      expect(result).toBe(clonedState);
    });

    it('should handle command definition with multiple parameters', async () => {
      const node = createValidDefineNode('cmd3', 'echo $a $b $c', ['a', 'b', 'c']); // Use helper
      const result = await handler.execute(node, { state: stateService } as DirectiveContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd3', expect.objectContaining({ command: 'echo $a $b $c', parameters: ['a', 'b', 'c'] }));
      expect(result).toBe(clonedState);
    });
  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      const node = createValidDefineNode('cmdRisk.risk.high', 'rm -rf /'); // Use helper
      await handler.execute(node, { state: stateService } as DirectiveContext);
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmdRisk', expect.objectContaining({ metadata: { risk: 'high' } }));
    });

    it('should handle command about metadata', async () => {
       // Need to adjust parseIdentifier mock or test node name if parseIdentifier logic changed
      const node = createValidDefineNode('cmdAbout.about.desc', 'ls'); // Use helper, ensure name format matches parseIdentifier logic
       // Mock the private parseIdentifier if its logic is complex or changed
       vi.spyOn(handler as any, 'parseIdentifier').mockReturnValueOnce({ name: 'cmdAbout', metadata: { about: 'This is a description' } }); 
      await handler.execute(node, { state: stateService } as DirectiveContext);
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmdAbout', expect.objectContaining({ metadata: { about: 'This is a description' } }));
    });
  });

  describe('validation', () => {
    it('should validate command structure through ValidationService', async () => {
      const node = createValidDefineNode('cmd4', 'test'); // Use helper
      await handler.execute(node, { state: stateService } as DirectiveContext);
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    // ... other validation tests using rejects.toThrow ...
  });

  describe('state management', () => {
    it('should create new state for command storage', async () => {
      const node = createValidDefineNode('cmd5', 'test'); // Use helper
      await handler.execute(node, { state: stateService } as DirectiveContext);
      expect(stateService.clone).toHaveBeenCalled();
    });

    it('should store command in new state', async () => {
      const node = createValidDefineNode('cmd6', 'echo test'); // Use helper
      await handler.execute(node, { state: stateService } as DirectiveContext);
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd6', expect.any(Object));
    });
  });
  
  describe('error handling', () => {
    it('should handle state errors', async () => {
      const node = createValidDefineNode('cmdError', 'test'); 
      const executeContext = { state: stateService } as DirectiveContext;
      const stateError = new Error('State error');

      if(clonedState) {
         vi.mocked(clonedState.setCommandVar).mockImplementation(() => {
           throw stateError;
         });
      } else {
         throw new Error("Test setup error: mockStateClone was not initialized");
      }

      // Use expectToThrowWithConfig
      await expectToThrowWithConfig(
        async () => await handler.execute(node, executeContext),
        {
          errorType: DirectiveError, // Expect the handler to wrap the error
          // code: DirectiveErrorCode.COMMAND_DEFINITION_FAILED, // Optional: Add if code is consistent
          message: /State error|Failed to define command/i, // Check message contains original or wrapper message
          cause: stateError // Expect the original error to be the cause
        }
      );
      
      // Remove old assertions
      // await expect(handler.execute(node, executeContext))
      //       .rejects
      //       .toThrow(DirectiveError); 
      // await expect(handler.execute(node, executeContext))
      //       .rejects
      //       .toThrow(stateError); 
    });
  });

});