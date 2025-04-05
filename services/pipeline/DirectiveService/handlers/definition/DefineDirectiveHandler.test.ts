import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import type { IValidationService } from '@services/validation/ValidationService/interface.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/interface.js';
import type { IStateService } from '@services/state/StateService/interface.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { defineDirectiveExamples } from '@core/syntax/index.js';
import { createDefineDirective, createLocation } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';
import { mock } from 'vitest-mock-extended';
import type { ICommandDefinition } from '@core/types/definitions.js';

/**
 * DefineDirectiveHandler Test Status
 * ---------------------------------
 * 
 * MIGRATION STATUS: Complete ✅
 * 
 * This test file has been fully migrated to use:
 * - Centralized syntax examples
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * 
 * Additionally, we have removed dependencies on older helper files where possible,
 * using centralized examples for testing.
 */

// Store created mocks to check calls later
let createdMocks: Record<string, IStateService> = {};

// Corrected Helper function 
const createMockState = (id: string, parent?: IStateService): IStateService => {
  // Create the base mock object with all expected functions
  const newState = {
    getTextVar: vi.fn(), setTextVar: vi.fn(),
    getDataVar: vi.fn(), setDataVar: vi.fn(),
    getPathVar: vi.fn(), setPathVar: vi.fn(),
    getCommandVar: vi.fn(), setCommandVar: vi.fn(), // Ensure this exists
    getAllTextVars: vi.fn().mockReturnValue(new Map()),
    getAllDataVars: vi.fn().mockReturnValue(new Map()),
    getAllPathVars: vi.fn().mockReturnValue(new Map()),
    getAllCommands: vi.fn().mockReturnValue(new Map()), // Ensure this exists and returns Map
    clone: vi.fn(), 
    createChildState: vi.fn(), 
    getStateId: vi.fn().mockReturnValue(id),
    getCurrentFilePath: vi.fn().mockReturnValue('test.meld'),
    setCurrentFilePath: vi.fn(),
    addNode: vi.fn(),
    getNodes: vi.fn().mockReturnValue([]),
    getTransformedNodes: vi.fn().mockReturnValue([]),
    setTransformedNodes: vi.fn(),
    isTransformationEnabled: vi.fn().mockReturnValue(false),
    setTransformationEnabled: vi.fn(),
    hasLocalChanges: vi.fn().mockReturnValue(false),
    getLocalChanges: vi.fn().mockReturnValue([]),
    setImmutable: vi.fn(),
    isImmutable: false,
    getParentState: vi.fn().mockReturnValue(parent),
    mergeChildState: vi.fn(),
    getFormattingContext: vi.fn().mockReturnValue(null) 
  } as unknown as IStateService;

  // Define clone and createChildState implementations *after* newState is fully defined
  newState.clone = vi.fn().mockImplementation(() => {
      const cloneId = `${id}-clone`;
      const cloneState = createMockState(cloneId, newState);
      createdMocks[cloneId] = cloneState; 
      return cloneState;
  }); 
  newState.createChildState = vi.fn().mockImplementation(() => {
      const childId = `${id}-child`;
      const childState = createMockState(childId, newState);
      createdMocks[childId] = childState; 
      return childState;
  });

  createdMocks[id] = newState;
  return newState;
};

describe('DefineDirectiveHandler', () => {
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let clonedState: any;
  let handler: DefineDirectiveHandler;
  let context: TestContextDI;
  let mockStateClone: IStateService; 

  beforeEach(async () => {
    createdMocks = {}; 
    context = TestContextDI.createIsolated();

    validationService = createValidationServiceMock();
    stateService = createStateServiceMock(); 
    resolutionService = createResolutionServiceMock();

    // Fix: Instantiate mockStateClone *before* mocking its methods
    mockStateClone = createMockState('initial-clone', stateService); 
    // Now mock the clone method on the original stateService to return this instance
    stateService.clone = vi.fn().mockReturnValue(mockStateClone);

    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);

    context.registerMockClass('DefineDirectiveHandler', DefineDirectiveHandler);

    await context.initialize();
    handler = await context.resolve('DefineDirectiveHandler');
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('command definition', () => {
    it('should handle basic command definition without parameters', async () => {
      const node = {
        ...createDefineDirective(
          'greet',
          'echo "Hello"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'greet',
          command: {
            kind: 'run',
            command: 'echo "Hello"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('greet', expect.objectContaining({ command: 'echo "Hello"', parameters: [] }));
      expect(result).toBe(mockStateClone);
    });

    it('should handle command definition with parameters', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'greet',
          'echo "Hello {{name}}"',
          ['name'],
          createLocation(1, 1, 1, 30)
        ),
        directive: {
          kind: 'define',
          name: 'greet',
          command: {
            kind: 'run',
            command: 'echo "Hello {{name}}"'
          },
          parameters: ['name']
        }
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['name']);

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('greet', expect.objectContaining({ command: 'echo "Hello {{name}}"', parameters: ['name'] }));
      expect(result).toBe(mockStateClone);
    });

    it('should handle command definition with multiple parameters', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'greet',
          'echo "Hello {{first}} {{last}}"',
          ['first', 'last'],
          createLocation(1, 1, 1, 40)
        ),
        directive: {
          kind: 'define',
          name: 'greet',
          command: {
            kind: 'run',
            command: 'echo "Hello {{first}} {{last}}"'
          },
          parameters: ['first', 'last']
        }
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['first', 'last']);

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('greet', expect.objectContaining({ command: 'echo "Hello {{first}} {{last}}"', parameters: ['first', 'last'] }));
      expect(result).toBe(mockStateClone);
    });
  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'risky.risk.high',
          'rm -rf /',
          [],
          createLocation(1, 1, 1, 25)
        ),
        directive: {
          kind: 'define',
          name: 'risky.risk.high',
          command: {
            kind: 'run',
            command: 'rm -rf /'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('risky', expect.objectContaining({ command: 'rm -rf /', metadata: { risk: 'high' } }));
      expect(result).toBe(mockStateClone);
    });

    it('should handle command about metadata', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd.about',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 25)
        ),
        directive: {
          kind: 'define',
          name: 'cmd.about',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('cmd', expect.objectContaining({ command: 'echo "test"', metadata: { about: 'This is a description' } }));
      expect(result).toBe(mockStateClone);
    });
  });

  describe('validation', () => {
    it('should validate command structure through ValidationService', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'cmd',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('cmd', expect.objectContaining({ command: 'echo "test"', parameters: [] }));
      expect(result).toBe(mockStateClone);
    });

    it('should reject empty commands', async () => {
      const node = createDefineDirective(
        'invalid',
        '',
        [],
        createLocation(1, 1, 1, 20)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Command cannot be empty', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should reject missing parameters referenced in command', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello {{name}}"',
        [],
        createLocation(1, 1, 1, 30)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Parameter name is referenced in command but not declared', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should reject invalid parameter names', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello {{123invalid}}"',
        ['123invalid'],
        createLocation(1, 1, 1, 35)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid parameter name: 123invalid', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should reject duplicate parameter names', async () => {
      // MIGRATION LOG:
      // Original: Used createDefineDirective with hardcoded values
      // Migration: Using centralized invalid examples
      // Notes: This test is testing duplicate parameter validation
      
      // Get the invalid example for duplicate parameters
      const invalidExample = defineDirectiveExamples.invalid.duplicateParameter;
      
      // We can't use createNodeFromExample here because the parser would reject this invalid syntax
      // Instead, we create a mock node that simulates the invalid state
      const node = {
        ...createDefineDirective(
          'bad',
          'echo "{{name}}"',
          ['name', 'name'], // Duplicate parameter
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'bad',
          command: {
            kind: 'run',
            command: 'echo "{{name}}"'
          },
          parameters: ['name', 'name'] // Duplicate parameter
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock the validation service to throw an error for duplicate parameters
      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError(
          invalidExample.expectedError.message,
          'define',
          DirectiveErrorCode.VALIDATION_FAILED
        );
      });

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    it('should reject invalid metadata fields', async () => {
      const node = createDefineDirective(
        'cmd.invalid',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid metadata field. Only risk and about are supported', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });
  });

  describe('state management', () => {
    it('should create new state for command storage', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'cmd',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
    });

    it('should store command in new state', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'cmd',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('cmd', expect.any(Object));
      expect(result).toBe(mockStateClone);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createDefineDirective(
        '',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid command', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle resolution errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "{{undefined}}"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Resolution error', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle state errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(clonedState.setCommandVar).mockImplementation(() => {
        throw new Error('State error');
      });

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefineDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DefineDirectiveHandler.js';
import type { IValidationService } from '@services/validation/ValidationService/interface.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/interface.js';
import type { IStateService } from '@services/state/StateService/interface.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { defineDirectiveExamples } from '@core/syntax/index.js';
import { createDefineDirective, createLocation } from '@tests/utils/testFactories.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import {
  createValidationServiceMock,
  createStateServiceMock,
  createResolutionServiceMock,
  createDirectiveErrorMock
} from '@tests/utils/mocks/serviceMocks.js';
import { mock } from 'vitest-mock-extended';
import type { ICommandDefinition } from '@core/types/definitions.js';

/**
 * DefineDirectiveHandler Test Status
 * ---------------------------------
 * 
 * MIGRATION STATUS: Complete ✅
 * 
 * This test file has been fully migrated to use:
 * - Centralized syntax examples
 * - TestContextDI for container management
 * - Standardized mock factories with vitest-mock-extended
 * 
 * Additionally, we have removed dependencies on older helper files where possible,
 * using centralized examples for testing.
 */

// Store created mocks to check calls later
let createdMocks: Record<string, IStateService> = {};

// Corrected Helper function 
const createMockState = (id: string, parent?: IStateService): IStateService => {
  // Create the base mock object with all expected functions
  const newState = {
    getTextVar: vi.fn(), setTextVar: vi.fn(),
    getDataVar: vi.fn(), setDataVar: vi.fn(),
    getPathVar: vi.fn(), setPathVar: vi.fn(),
    getCommandVar: vi.fn(), setCommandVar: vi.fn(), // Ensure this exists
    getAllTextVars: vi.fn().mockReturnValue(new Map()),
    getAllDataVars: vi.fn().mockReturnValue(new Map()),
    getAllPathVars: vi.fn().mockReturnValue(new Map()),
    getAllCommands: vi.fn().mockReturnValue(new Map()), // Ensure this exists and returns Map
    clone: vi.fn(), 
    createChildState: vi.fn(), 
    getStateId: vi.fn().mockReturnValue(id),
    getCurrentFilePath: vi.fn().mockReturnValue('test.meld'),
    setCurrentFilePath: vi.fn(),
    addNode: vi.fn(),
    getNodes: vi.fn().mockReturnValue([]),
    getTransformedNodes: vi.fn().mockReturnValue([]),
    setTransformedNodes: vi.fn(),
    isTransformationEnabled: vi.fn().mockReturnValue(false),
    setTransformationEnabled: vi.fn(),
    hasLocalChanges: vi.fn().mockReturnValue(false),
    getLocalChanges: vi.fn().mockReturnValue([]),
    setImmutable: vi.fn(),
    isImmutable: false,
    getParentState: vi.fn().mockReturnValue(parent),
    mergeChildState: vi.fn(),
    getFormattingContext: vi.fn().mockReturnValue(null) 
  } as unknown as IStateService;

  // Define clone and createChildState implementations *after* newState is fully defined
  newState.clone = vi.fn().mockImplementation(() => {
      const cloneId = `${id}-clone`;
      // Create the clone, passing the *current* newState as its parent
      const cloneState = createMockState(cloneId, newState);
      createdMocks[cloneId] = cloneState; 
      return cloneState;
  }); 
  newState.createChildState = vi.fn().mockImplementation(() => {
      const childId = `${id}-child`;
      // Create the child, passing the *current* newState as its parent
      const childState = createMockState(childId, newState);
      createdMocks[childId] = childState; 
      return childState;
  });

  createdMocks[id] = newState;
  return newState;
};

describe('DefineDirectiveHandler', () => {
  let validationService: ReturnType<typeof createValidationServiceMock>;
  let stateService: ReturnType<typeof createStateServiceMock>;
  let resolutionService: ReturnType<typeof createResolutionServiceMock>;
  let clonedState: any;
  let handler: DefineDirectiveHandler;
  let context: TestContextDI;
  let mockStateClone: IStateService; // To capture the clone

  beforeEach(async () => {
    createdMocks = {}; // Reset mocks
    context = TestContextDI.createIsolated();

    validationService = createValidationServiceMock();
    stateService = createStateServiceMock();
    resolutionService = createResolutionServiceMock();
    
    // Mock the clone method specifically for stateService to capture the clone instance
    mockStateClone = createMockState('initial-clone', stateService); 
    stateService.clone = vi.fn().mockReturnValue(mockStateClone);

    context.registerMock('IValidationService', validationService);
    context.registerMock('IStateService', stateService);
    context.registerMock('IResolutionService', resolutionService);

    // Register the handler using its class
    context.registerMockClass('DefineDirectiveHandler', DefineDirectiveHandler);

    await context.initialize();
    handler = await context.resolve('DefineDirectiveHandler');
  });

  afterEach(async () => {
    await context?.cleanup();
  });

  describe('command definition', () => {
    it('should handle basic command definition without parameters', async () => {
      const node = {
        ...createDefineDirective(
          'greet',
          'echo "Hello"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'greet',
          command: {
            kind: 'run',
            command: 'echo "Hello"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('greet', expect.objectContaining({ command: 'echo "Hello"', parameters: [] }));
      expect(result).toBe(mockStateClone);
    });

    it('should handle command definition with parameters', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'greet',
          'echo "Hello {{name}}"',
          ['name'],
          createLocation(1, 1, 1, 30)
        ),
        directive: {
          kind: 'define',
          name: 'greet',
          command: {
            kind: 'run',
            command: 'echo "Hello {{name}}"'
          },
          parameters: ['name']
        }
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['name']);

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('greet', expect.objectContaining({ command: 'echo "Hello {{name}}"', parameters: ['name'] }));
      expect(result).toBe(mockStateClone);
    });

    it('should handle command definition with multiple parameters', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'greet',
          'echo "Hello {{first}} {{last}}"',
          ['first', 'last'],
          createLocation(1, 1, 1, 40)
        ),
        directive: {
          kind: 'define',
          name: 'greet',
          command: {
            kind: 'run',
            command: 'echo "Hello {{first}} {{last}}"'
          },
          parameters: ['first', 'last']
        }
      };

      // Mock the extractParameterReferences method to return the expected parameters
      vi.spyOn(handler as any, 'extractParameterReferences').mockReturnValueOnce(['first', 'last']);

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('greet', expect.objectContaining({ command: 'echo "Hello {{first}} {{last}}"', parameters: ['first', 'last'] }));
      expect(result).toBe(mockStateClone);
    });
  });

  describe('metadata handling', () => {
    it('should handle command risk metadata', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'risky.risk.high',
          'rm -rf /',
          [],
          createLocation(1, 1, 1, 25)
        ),
        directive: {
          kind: 'define',
          name: 'risky.risk.high',
          command: {
            kind: 'run',
            command: 'rm -rf /'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('risky', expect.objectContaining({ command: 'rm -rf /', metadata: { risk: 'high' } }));
      expect(result).toBe(mockStateClone);
    });

    it('should handle command about metadata', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd.about',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 25)
        ),
        directive: {
          kind: 'define',
          name: 'cmd.about',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('cmd', expect.objectContaining({ command: 'echo "test"', metadata: { about: 'This is a description' } }));
      expect(result).toBe(mockStateClone);
    });
  });

  describe('validation', () => {
    it('should validate command structure through ValidationService', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'cmd',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(validationService.validate).toHaveBeenCalledWith(node);
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('cmd', expect.objectContaining({ command: 'echo "test"', parameters: [] }));
      expect(result).toBe(mockStateClone);
    });

    it('should reject empty commands', async () => {
      const node = createDefineDirective(
        'invalid',
        '',
        [],
        createLocation(1, 1, 1, 20)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Command cannot be empty', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should reject missing parameters referenced in command', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello {{name}}"',
        [],
        createLocation(1, 1, 1, 30)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Parameter name is referenced in command but not declared', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should reject invalid parameter names', async () => {
      const node = createDefineDirective(
        'greet',
        'echo "Hello {{123invalid}}"',
        ['123invalid'],
        createLocation(1, 1, 1, 35)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid parameter name: 123invalid', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should reject duplicate parameter names', async () => {
      // MIGRATION LOG:
      // Original: Used createDefineDirective with hardcoded values
      // Migration: Using centralized invalid examples
      // Notes: This test is testing duplicate parameter validation
      
      // Get the invalid example for duplicate parameters
      const invalidExample = defineDirectiveExamples.invalid.duplicateParameter;
      
      // We can't use createNodeFromExample here because the parser would reject this invalid syntax
      // Instead, we create a mock node that simulates the invalid state
      const node = {
        ...createDefineDirective(
          'bad',
          'echo "{{name}}"',
          ['name', 'name'], // Duplicate parameter
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'bad',
          command: {
            kind: 'run',
            command: 'echo "{{name}}"'
          },
          parameters: ['name', 'name'] // Duplicate parameter
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      // Mock the validation service to throw an error for duplicate parameters
      vi.mocked(validationService.validate).mockImplementationOnce(() => {
        throw new DirectiveError(
          invalidExample.expectedError.message,
          'define',
          DirectiveErrorCode.VALIDATION_FAILED
        );
      });

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(validationService.validate).toHaveBeenCalledWith(node);
    });

    it('should reject invalid metadata fields', async () => {
      const node = createDefineDirective(
        'cmd.invalid',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid metadata field. Only risk and about are supported', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });
  });

  describe('state management', () => {
    it('should create new state for command storage', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'cmd',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
    });

    it('should store command in new state', async () => {
      // Create a more complete mock node that matches what the handler expects
      const node = {
        ...createDefineDirective(
          'cmd',
          'echo "test"',
          [],
          createLocation(1, 1, 1, 20)
        ),
        directive: {
          kind: 'define',
          name: 'cmd',
          command: {
            kind: 'run',
            command: 'echo "test"'
          },
          parameters: []
        }
      };

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      const result = await handler.execute(node, executeContext);
      expect(stateService.clone).toHaveBeenCalled();
      expect(mockStateClone.setCommandVar).toHaveBeenCalledWith('cmd', expect.any(Object));
      expect(result).toBe(mockStateClone);
    });
  });

  describe('error handling', () => {
    it('should handle validation errors', async () => {
      const node = createDefineDirective(
        '',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Invalid command', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle resolution errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "{{undefined}}"',
        [],
        createLocation(1, 1, 1, 25)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(validationService.validate).mockRejectedValueOnce(
        new DirectiveError('Resolution error', 'define')
      );

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });

    it('should handle state errors', async () => {
      const node = createDefineDirective(
        'cmd',
        'echo "test"',
        [],
        createLocation(1, 1, 1, 20)
      );

      const executeContext = {
        state: stateService,
        currentFilePath: 'test.meld'
      };

      vi.mocked(stateService.clone).mockReturnValue(clonedState);
      vi.mocked(clonedState.setCommandVar).mockImplementation(() => {
        throw new Error('State error');
      });

      const error = await handler.execute(node, executeContext).catch(e => e);
      expect(error).toBeInstanceOf(DirectiveError);
      expect(error.details?.location).toBeDefined();
    });
  });
});