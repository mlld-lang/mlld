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

  describe('command definition', () => {
    it('should handle basic command definition without parameters', async () => {
      const node = createDefineDirective('greet', 'echo "Hello"');
      const executeContext = { state: stateService, currentFilePath: 'test.meld' } as DirectiveContext;
      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('greet', expect.objectContaining({ command: 'echo "Hello"', parameters: [] }));
      expect(result).toBe(clonedState);
    });

    it('should handle command definition with parameters', async () => {
      const node = createDefineDirective('greet', 'echo "Hello {{name}}"', ['name']);
      const executeContext = { state: stateService, currentFilePath: 'test.meld' } as DirectiveContext;
       vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['name']); // Mock private method if needed
      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('greet', expect.objectContaining({ command: 'echo "Hello {{name}}"', parameters: ['name'] }));
      expect(result).toBe(clonedState);
    });

     it('should handle command definition with multiple parameters', async () => {
       const node = createDefineDirective('greet', 'echo "Hello {{first}} {{last}}"', ['first', 'last']);
       const executeContext = { state: stateService, currentFilePath: 'test.meld' } as DirectiveContext;
       vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['first', 'last']);
       const result = await handler.execute(node, executeContext);
       expect(stateService.clone).toHaveBeenCalled();
       expect(clonedState.setCommandVar).toHaveBeenCalledWith('greet', expect.objectContaining({ command: 'echo "Hello {{first}} {{last}}"', parameters: ['first', 'last'] }));
       expect(result).toBe(clonedState);
     });
  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      const node = createDefineDirective('risky.risk.high', 'rm -rf /');
      const executeContext = { state: stateService, currentFilePath: 'test.meld' } as DirectiveContext;
      await handler.execute(node, executeContext);
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('risky', expect.objectContaining({ metadata: { risk: 'high' } }));
    });

    it('should handle command about metadata', async () => {
      const node = createDefineDirective('cmd.about', 'echo "test"');
      const executeContext = { state: stateService, currentFilePath: 'test.meld' } as DirectiveContext;
       vi.spyOn(handler as any, 'parseIdentifier').mockReturnValueOnce({ name: 'cmd', metadata: { about: 'This is a description' } }); // Mock specific part if needed
      await handler.execute(node, executeContext);
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd', expect.objectContaining({ metadata: { about: 'This is a description' } }));
    });
  });

  describe('validation', () => {
    it('should validate command structure through ValidationService', async () => {
      const node = createDefineDirective('cmd', 'echo "test"');
      const executeContext = { state: stateService, currentFilePath: 'test.meld' } as DirectiveContext;
      await handler.execute(node, executeContext);
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    // ... other validation tests using rejects.toThrow ...
  });

  describe('state management', () => {
    it('should create new state for command storage', async () => {
      const node = createDefineDirective('cmd5', 'test');
      const executeContext = { state: stateService, currentFilePath: 'test.meld' } as DirectiveContext;
      await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
    });

    it('should store command in new state', async () => {
      const node = createDefineDirective('cmd6', 'echo test');
      const executeContext = { state: stateService, currentFilePath: 'test.meld' } as DirectiveContext;
      await handler.execute(node, executeContext);
      expect(clonedState.setCommandVar).toHaveBeenCalledWith('cmd6', expect.any(Object));
    });
  });
  
  describe('error handling', () => {
    it('should handle state errors', async () => {
      const node = createDefineDirective('cmdError', 'test');
      const executeContext = { state: stateService } as DirectiveContext;
      const stateError = new Error('State error');

      // Mock the clone's method directly
      vi.mocked(clonedState.setCommandVar).mockImplementation(() => {
        throw stateError;
      });

      await expect(handler.execute(node, executeContext))
            .rejects
            .toThrow(DirectiveError);
      await expect(handler.execute(node, executeContext))
            .rejects
            .toThrow(stateError); 
    });
  });

});