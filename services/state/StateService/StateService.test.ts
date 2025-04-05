// TODO: [StateService Merge Tracking Test Failure - 2024-08-26]
// The test 'StateService > State Tracking > should track merge relationships via client'
// consistently fails. 
// Expected: After mockReset(trackingClient), service.mergeChildState(child) should make exactly 
// one call to trackingClient.registerRelationship with type 'merge-source'.
// Actual: It makes 0 calls after the reset.
// Investigation Notes:
// - StateService.mergeChildState code *appears* correct, calling this.trackingClient.addRelationship('merge-source').
// - Test setup uses TestContextDI and correctly registers the mockTrackingClientFactory.
// - Tried both with and without mockReset before the merge call; failure mode changes but persists.
// - All other tests in this suite pass, including other trackingClient interactions (create, clone).
// - Linter errors are resolved.
// Potential Cause: Unknown. Suspect subtle interaction between DI, mocking, StateTrackingServiceClientFactory,
// or the specific internal logic within mergeChildState preventing the client call under test conditions.
// Decision: Pausing investigation to proceed with Phase 2 refactoring. Revisit if becomes blocker or during
// tracking service refactor.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateService } from '@services/state/StateService/StateService.js';
import { StateFactory } from '@services/state/StateService/StateFactory.js';
import { IStateEventService } from '@services/state/StateEventService/IStateEventService.js';
import { createMockStateEventService } from '@tests/utils/mocks/serviceMocks.js';
import { MeldNode, TextNode } from '@core/syntax/types/index.js';
import { VariableType, PathContentType, ICommandDefinition, IFilesystemPathState, IUrlPathState, createTextVariable, createDataVariable, RelativePath, createPathVariable } from '@core/types/index.js';
import { unsafeCreateValidatedResourcePath } from '@core/types/paths.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService.js';
import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService.js';
import { IStateHistoryService } from '@tests/utils/debug/StateHistoryService/IStateHistoryService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { StateEventService } from '@services/state/StateEventService/StateEventService.js';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import { StateTrackingServiceClientFactory } from '@services/state/StateTrackingService/factories/StateTrackingServiceClientFactory.js';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient.js';

class MockStateEventService implements IStateEventService {
  private handlers = new Map<string, Array<{
    handler: (event: StateEvent) => void | Promise<void>;
    options?: { filter?: (event: StateEvent) => boolean };
  }>>();

  constructor() {
    ['create', 'clone', 'transform', 'merge', 'error'].forEach(type => {
      this.handlers.set(type, []);
    });
  }

  on(type: string, handler: (event: StateEvent) => void | Promise<void>, options?: { filter?: (event: StateEvent) => boolean }): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.push({ handler, options });
    }
  }

  off(type: string, handler: (event: StateEvent) => void | Promise<void>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.findIndex(h => h.handler === handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async emit(event: StateEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    for (const { handler, options } of handlers) {
      if (!options?.filter || options.filter(event)) {
        await Promise.resolve(handler(event));
      }
    }
  }

  getHandlers(type: string): Array<{
    handler: (event: StateEvent) => void | Promise<void>;
    options?: { filter?: (event: StateEvent) => boolean };
  }> {
    return this.handlers.get(type) || [];
  }
}

// Test context creation function - DI-only approach with isolated container
async function createTestContext() {
  const testContext = TestContextDI.createIsolated();
  await testContext.initialize();
  
  // Create mocks
  const mockEventService = new MockStateEventService();
  const mockTrackingService = mockDeep<IStateTrackingService>();
  
  // Create mock factory and client
  const mockTrackingClient = mockDeep<IStateTrackingServiceClient>();
  const mockTrackingClientFactory = {
    createClient: () => mockTrackingClient
  };
  
  // Register mocks with the context
  testContext.registerMock('IStateEventService', mockEventService);
  testContext.registerMock('StateEventService', mockEventService);
  testContext.registerMock('IStateTrackingService', mockTrackingService);
  testContext.registerMock('StateTrackingService', mockTrackingService);
  testContext.registerMock('StateTrackingServiceClientFactory', mockTrackingClientFactory);
  
  // Resolve the services from the container with proper await
  const stateFactory = await testContext.container.resolve(StateFactory);
  const state = await testContext.container.resolve(StateService);
  
  return { 
    state, 
    eventService: mockEventService, 
    testContext, 
    stateFactory,
    trackingService: mockTrackingService,
    trackingClient: mockTrackingClient
  };
}

// Main test suite - using DI-only mode
describe('StateService', () => {
  let context: Awaited<ReturnType<typeof createTestContext>>;
  
  beforeEach(async () => {
    context = await createTestContext();
  });
  
  afterEach(async () => {
    await context?.testContext?.cleanup();
  });
  
  // Helper functions to get current state in tests
  const getState = () => context.state;
  const getEventService = () => context.eventService;
  
  // Define the tests for state functionality
  describe('Basic functionality', () => {
    it('should set and get text variables', () => {
      const state = getState();
      const variable = state.setTextVar('greeting', 'Hello');
      // Check returned variable
      expect(variable).toMatchObject({
        type: VariableType.TEXT,
        name: 'greeting',
        value: 'Hello',
      });
      expect(variable.metadata).toBeDefined();

      // Check retrieval
      const retrieved = state.getTextVar('greeting');
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable); // Check if the same object is retrieved
      expect(retrieved?.value).toBe('Hello');
    });

    it('should return undefined for non-existent text variables', () => {
      const state = getState();
      expect(state.getTextVar('nonexistent')).toBeUndefined();
    });

    it('should get all text variables', () => {
      const state = getState();
      state.setTextVar('greeting', 'Hello');
      state.setTextVar('farewell', 'Goodbye');

      const vars = state.getAllTextVars();
      expect(vars.size).toBe(2);
      // Check if the map contains the correct typed objects
      expect(vars.get('greeting')).toMatchObject({ type: VariableType.TEXT, name: 'greeting', value: 'Hello' });
      expect(vars.get('farewell')).toMatchObject({ type: VariableType.TEXT, name: 'farewell', value: 'Goodbye' });
    });

    it('should set and get data variables', () => {
      const state = getState();
      const dataValue = { foo: 'bar', nested: { num: 1 } };
      const variable = state.setDataVar('config', dataValue);
      // Check returned variable
      expect(variable).toMatchObject({
        type: VariableType.DATA,
        name: 'config',
        value: dataValue,
      });
      expect(variable.metadata).toBeDefined();

      // Check retrieval
      const retrieved = state.getDataVar('config');
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value).toEqual(dataValue);
      // Ensure deep equality check works for nested objects
      expect(retrieved?.value).toEqual(dataValue);
    });

    it('should set and get path variables (filesystem)', () => {
      const state = getState();
      const fsPathValue: IFilesystemPathState = {
        contentType: PathContentType.FILESYSTEM,
        originalValue: './some/path.txt',
        isValidSyntax: true,
        isSecure: true,
        isAbsolute: false,
        validatedPath: unsafeCreateValidatedResourcePath('./some/path.txt') as RelativePath,
        exists: undefined
      };
      const variable = state.setPathVar('local', fsPathValue);
      
      expect(variable.name).toBe('local');
      expect(variable.value).toEqual(fsPathValue);
      expect(variable.type).toBe(VariableType.PATH);
      
      const retrieved = state.getPathVar('local');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('local');
      expect(retrieved?.value).toEqual(fsPathValue);
      expect(retrieved?.type).toBe(VariableType.PATH);
    });
    
    // Add a test case for URL path variables
    it('should set and get path variables (URL)', () => {
      const state = getState();
      const urlValue: IUrlPathState = {
        contentType: PathContentType.URL,
        originalValue: 'https://example.com',
        isValidated: true,
        fetchStatus: 'not_fetched',
        validatedPath: unsafeCreateValidatedResourcePath('https://example.com')
      };
      const variable = state.setPathVar('remote', urlValue);
      
      expect(variable.name).toBe('remote');
      expect(variable.value).toEqual(urlValue);
      expect(variable.type).toBe(VariableType.PATH);
      
      const retrieved = state.getPathVar('remote');
      expect(retrieved).toBeDefined();
      expect(retrieved?.name).toBe('remote');
      expect(retrieved?.value).toEqual(urlValue);
      expect(retrieved?.type).toBe(VariableType.PATH);
    });

    // Add tests for CommandVariables
    it('should set and get command variables', () => {
      const state = getState();
      // Define a simple command definition structure (assuming ICommandDefinition shape)
      const commandDef: ICommandDefinition = { 
        type: 'basic', // Assuming 'basic' command type from define-spec
        command: 'echo "{{msg}}"', 
        parameters: ['msg'] 
      };
      const variable = state.setCommandVar('echoCmd', commandDef);
      
      // Check returned variable
      expect(variable).toMatchObject({
        type: VariableType.COMMAND,
        name: 'echoCmd',
        value: expect.objectContaining({ // Check nested value structure
          type: 'basic',
          command: 'echo "{{msg}}"',
          parameters: expect.arrayContaining(['msg'])
        })
      });
      expect(variable.metadata).toBeDefined();

      // Check retrieval
      const retrieved = state.getCommandVar('echoCmd');
      expect(retrieved).toBeDefined();
      expect(retrieved).toEqual(variable);
      expect(retrieved?.value).toEqual(commandDef);
    });

    it('should add and get nodes', () => {
      const state = getState();
      const node: TextNode = {
        type: 'Text',
        content: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      state.addNode(node);
      expect(state.getNodes()).toEqual([node]);
    });

    it('should add and check imports', () => {
      const state = getState();
      state.addImport('test.md');
      expect(state.hasImport('test.md')).toBe(true);
    });

    it('should emit events for state operations', () => {
      const state = getState();
      const eventService = getEventService();
      const handler = vi.fn();
      eventService.on('transform', handler);

      state.setCurrentFilePath('test.meld');
      state.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'transform',
        source: 'setTextVar:test'
      }));
    });

    it('should create child state with inherited properties (typed)', () => {
      const state = getState();
      const parentTextVar = state.setTextVar('parentText', 'value');
      const parentDataVar = state.setDataVar('parentData', { key: 'data' });
      const parentPathVar = state.setPathVar('parentPath', { 
        contentType: PathContentType.FILESYSTEM, 
        originalValue: './parent', 
        isValidSyntax: true, 
        isSecure: true, 
        isAbsolute: false 
      } as IFilesystemPathState);
      const parentCmdVar = state.setCommandVar('parentCmd', { type: 'basic', command: 'echo parent' } as ICommandDefinition);
      
      const child = state.createChildState();
      
      // Check inherited variables are the correct typed objects
      expect(child.getTextVar('parentText')).toEqual(parentTextVar);
      expect(child.getDataVar('parentData')).toEqual(parentDataVar);
      expect(child.getPathVar('parentPath')).toEqual(parentPathVar);
      expect(child.getCommandVar('parentCmd')).toEqual(parentCmdVar);
      
      // Modify child, check parent is unaffected
      child.setTextVar('childText', 'childValue');
      expect(state.getTextVar('childText')).toBeUndefined();
      child.setTextVar('parentText', 'newValueInChild'); // Overwrite inherited
      expect(state.getTextVar('parentText')?.value).toBe('value'); // Parent remains unchanged
    });

    it('should clone state properly (deep copy)', () => {
      const state = getState();
      const originalText = state.setTextVar('originalText', 'value');
      const originalData = state.setDataVar('originalData', { nested: { val: 1 } });
      const originalPathValue: IFilesystemPathState = { contentType: PathContentType.FILESYSTEM, originalValue: './orig', isValidSyntax: true, isSecure: true, isAbsolute: false };
      const originalPath = state.setPathVar('originalPath', originalPathValue);
      const originalCmdValue: ICommandDefinition = { type: 'basic', command: 'echo orig' };
      const originalCmd = state.setCommandVar('originalCmd', originalCmdValue);
      state.setTransformationEnabled(true);
      state.setTransformationOptions({ enabled: true, preserveOriginal: false, transformNested: false});
      
      const clone = state.clone();
      
      // Basic checks
      expect(clone).toBeInstanceOf(StateService);
      expect(clone.getStateId()).not.toBe(state.getStateId());
      expect(clone.isTransformationEnabled()).toBe(true);
      expect(clone.getTransformationOptions()).toEqual({ enabled: true, preserveOriginal: false, transformNested: false});
      
      // Check variables exist and have same value initially
      expect(clone.getTextVar('originalText')?.value).toBe('value');
      expect(clone.getDataVar('originalData')?.value).toEqual({ nested: { val: 1 } });
      expect(clone.getPathVar('originalPath')?.value).toEqual(originalPathValue);
      expect(clone.getCommandVar('originalCmd')?.value).toEqual(originalCmdValue);
      
      // --- Deep Copy Verification --- 
      
      // 1. Modify primitive value in clone
      clone.setTextVar('originalText', 'clonedValue');
      expect(state.getTextVar('originalText')?.value).toBe('value'); // Original unchanged
      
      // 2. Modify nested object in clone's data variable
      const clonedDataVar = clone.getDataVar('originalData');
      (clonedDataVar?.value as any).nested.val = 2;
      expect((state.getDataVar('originalData')?.value as any).nested.val).toBe(1); // Original unchanged
      
      // 3. Modify nested object in clone's path variable value
      const clonedPathVar = clone.getPathVar('originalPath');
      (clonedPathVar?.value as IFilesystemPathState).originalValue = './cloned';
      expect((state.getPathVar('originalPath')?.value as IFilesystemPathState).originalValue).toBe('./orig'); // Original unchanged
      
      // 4. Modify nested object in clone's command variable value
      const clonedCmdVar = clone.getCommandVar('originalCmd');
      (clonedCmdVar?.value as any).command = 'echo cloned'; 
      expect((state.getCommandVar('originalCmd')?.value as any).command).toBe('echo orig'); // Original unchanged

      // Verify modifications don't affect original (old check - redundant but safe)
      clone.setTextVar('new', 'value');
      expect(state.getTextVar('new')).toBeUndefined();
    });
  });
  
  describe('Generic Variable Methods', () => {
    let state: StateService;

    beforeEach(() => {
      state = getState(); // Get fresh state for each test
      state.setTextVar('myText', 'text val');
      state.setDataVar('myData', { key: 'data val' });
      state.setPathVar('myPath', { contentType: PathContentType.FILESYSTEM, originalValue: './path', isValidSyntax: true } as IFilesystemPathState);
      state.setCommandVar('myCmd', { type: 'basic', command: 'echo cmd' } as ICommandDefinition);
    });

    it('getVariable should retrieve variable by name, checking types in order', () => {
      expect(state.getVariable('myText')?.value).toBe('text val');
      expect(state.getVariable('myData')?.value).toEqual({ key: 'data val' });
      expect((state.getVariable('myPath')?.value as IFilesystemPathState)?.originalValue).toBe('./path');
      expect((state.getVariable('myCmd')?.value as ICommandDefinition)?.command).toBe('echo cmd');
      expect(state.getVariable('nonExistent')).toBeUndefined();
    });

    it('getVariable should retrieve variable by name and specific type', () => {
      expect(state.getVariable('myText', VariableType.TEXT)?.value).toBe('text val');
      expect(state.getVariable('myText', VariableType.DATA)).toBeUndefined(); // Wrong type
      expect(state.getVariable('myData', VariableType.DATA)?.value).toEqual({ key: 'data val' });
      expect(state.getVariable('myData', VariableType.PATH)).toBeUndefined(); // Wrong type
      expect(state.getVariable('myPath', VariableType.PATH)).toBeDefined();
      expect(state.getVariable('myCmd', VariableType.COMMAND)).toBeDefined();
    });

    it('setVariable should store variables correctly based on type', () => {
      const newTextVar = createTextVariable('newText', 'new');
      const newDataVar = createDataVariable('newData', [1, 2]);
      state.setVariable(newTextVar);
      state.setVariable(newDataVar);
      expect(state.getTextVar('newText')).toEqual(newTextVar);
      expect(state.getDataVar('newData')).toEqual(newDataVar);
    });

    it('hasVariable should check existence by name', () => {
      expect(state.hasVariable('myText')).toBe(true);
      expect(state.hasVariable('myData')).toBe(true);
      expect(state.hasVariable('myPath')).toBe(true);
      expect(state.hasVariable('myCmd')).toBe(true);
      expect(state.hasVariable('nonExistent')).toBe(false);
    });

    it('hasVariable should check existence by name and specific type', () => {
      expect(state.hasVariable('myText', VariableType.TEXT)).toBe(true);
      expect(state.hasVariable('myText', VariableType.DATA)).toBe(false);
      expect(state.hasVariable('myData', VariableType.DATA)).toBe(true);
      expect(state.hasVariable('myPath', VariableType.PATH)).toBe(true);
      expect(state.hasVariable('myCmd', VariableType.COMMAND)).toBe(true);
    });

    it('removeVariable should remove variable by name (all types)', () => {
      expect(state.removeVariable('myText')).toBe(true);
      expect(state.hasVariable('myText')).toBe(false);
      expect(state.removeVariable('myData')).toBe(true);
      expect(state.hasVariable('myData')).toBe(false);
      expect(state.removeVariable('nonExistent')).toBe(false);
    });

    it('removeVariable should remove variable by name and specific type', () => {
      expect(state.removeVariable('myText', VariableType.DATA)).toBe(false); // Wrong type
      expect(state.hasVariable('myText', VariableType.TEXT)).toBe(true);
      expect(state.removeVariable('myText', VariableType.TEXT)).toBe(true);
      expect(state.hasVariable('myText', VariableType.TEXT)).toBe(false);
    });
  });
  
  describe('DI-specific tests', () => {
    it('should be resolvable from container', () => {
      const service = context.testContext.container.resolve(StateService);
      expect(service).toBeInstanceOf(StateService);
    });
    
    it('should work with injected dependencies', () => {
      const eventService = context.testContext.container.resolve<IStateEventService>('IStateEventService');
      const stateFactory = context.testContext.container.resolve(StateFactory);
      expect(eventService).toBeDefined();
      expect(stateFactory).toBeDefined();
    });
    
    it('should initialize with factory through DI', () => {
      const factory = new StateFactory();
      context.testContext.registerMock(StateFactory, factory);
      const service = context.testContext.container.resolve(StateService);
      expect(service).toBeInstanceOf(StateService);
    });
  });
  
  // State tracking tests
  describe('State Tracking', () => {
    let service: StateService;
    let trackingService: StateTrackingService;
    let eventService: MockStateEventService;
    let visualizationService: StateVisualizationService;
    let debuggerService: StateDebuggerService;
    let historyService: StateHistoryService;
    let stateFactory: StateFactory;
    let testContext: TestContextDI;
    let trackingServiceClientFactory: StateTrackingServiceClientFactory;
    let trackingClient: IStateTrackingServiceClient;

    beforeEach(() => {
      testContext = TestContextDI.create({ isolatedContainer: true });
      
      stateFactory = new StateFactory();
      testContext.registerMock(StateFactory, stateFactory);
      
      eventService = new MockStateEventService();
      testContext.registerMock('IStateEventService', eventService);
      
      trackingService = new StateTrackingService();
      testContext.registerMock('IStateTrackingService', trackingService);
      testContext.registerMock('StateTrackingService', trackingService);
      
      trackingClient = mockDeep<IStateTrackingServiceClient>();
      const mockTrackingClientFactory = { createClient: () => trackingClient };
      testContext.registerMock('StateTrackingServiceClientFactory', mockTrackingClientFactory);
      
      historyService = new StateHistoryService(eventService);
      testContext.registerMock('StateHistoryService', historyService);
      
      visualizationService = new StateVisualizationService(historyService as any, trackingService);
      testContext.registerMock('StateVisualizationService', visualizationService);
      
      debuggerService = new StateDebuggerService(visualizationService, historyService as any, trackingService);
      testContext.registerMock('StateDebuggerService', debuggerService);
      
      service = testContext.container.resolve(StateService);
      service.setTrackingService(trackingService);
    });
    
    afterEach(async () => {
      await testContext.cleanup();
    });

    it('should register state with tracking service client', () => {
      const stateId = service.getStateId();
      expect(stateId).toBeDefined();
      expect(trackingClient.registerState).toHaveBeenCalledWith(expect.objectContaining({
         id: stateId,
         source: 'child' // Initial registration source
      }));
    });

    it('should track parent-child relationships via client', () => {
      const parentId = service.getStateId()!;
      // Reset mocks before action
      mockReset(trackingClient);
      
      const child = service.createChildState();
      const childId = child.getStateId()!;

      expect(trackingClient.registerRelationship).toHaveBeenCalledWith(expect.objectContaining({
        sourceId: parentId,
        targetId: childId,
        type: 'parent-child'
      }));
      // Check event registration if relevant
      expect(trackingClient.registerEvent).toHaveBeenCalledWith(expect.objectContaining({ 
         type: 'created-child',
         stateId: parentId
      }));
    });

    it('should register cloned state in tracking service and track relationship via client', () => {
      const originalId = service.getStateId()!;
      
      // Reset mock before cloning to isolate the call during clone
      mockReset(trackingClient);
      
      const cloned = service.clone();
      const clonedId = cloned.getStateId()!;

      // Verify the cloned state is registered *after* cloning
      expect(trackingClient.registerState).toHaveBeenCalledTimes(1); 
      expect(trackingClient.registerState).toHaveBeenCalledWith(expect.objectContaining({
         id: clonedId, 
         source: 'clone' 
      }));
      expect(clonedId).toBeDefined();
      
      // Check if the relationship was registered via the client
      expect(trackingClient.registerRelationship).toHaveBeenCalledTimes(1);
      expect(trackingClient.registerRelationship).toHaveBeenCalledWith(expect.objectContaining({
        sourceId: originalId,
        targetId: clonedId,
        type: 'clone-original' 
      }));
    });

    it('should track merge relationships via client', () => {
      const parentId = service.getStateId()!;
      const child = service.createChildState();
      const childId = child.getStateId()!;
      
      // Reset mocks before action
      mockReset(trackingClient);

      service.mergeChildState(child);

      // Expect ONLY the merge-source call after the reset
      expect(trackingClient.registerRelationship).toHaveBeenCalledTimes(1);
      // Ensure the single call is for merge-source
      expect(trackingClient.registerRelationship).toHaveBeenCalledWith(
         expect.objectContaining({
           sourceId: parentId,
           targetId: childId,
           type: 'merge-source' // <<< Check for merge-source
         })
       );
      // Remove or comment out the check for parent-child, as it was reset
      /*
      expect(trackingClient.registerRelationship).toHaveBeenCalledWith(
         expect.objectContaining({
           sourceId: parentId,
           targetId: childId,
           type: 'parent-child' 
         }));
      */
    });

    // This test checks if the tracking client is invoked for child state creation
    it('should invoke tracking client when child state is created', () => {
      // Use the service created in beforeEach which uses the mock client factory
      const parent = service;
      const parentId = parent.getStateId()!;

      // Reset mock before action
      mockReset(trackingClient);

      const child = parent.createChildState();
      const childId = child.getStateId();
      
      expect(childId).toBeDefined();

      // Assert that the MOCK client was called to register the child state
      expect(trackingClient.registerState).toHaveBeenCalledWith(expect.objectContaining({
        id: childId,
        parentId: parentId,
        source: 'child'
      }));
      
      // Assert parent-child relationship registration on the client
      expect(trackingClient.registerRelationship).toHaveBeenCalledWith(expect.objectContaining({
        sourceId: parentId,
        targetId: childId,
        type: 'parent-child'
      }));
    });

    it('should track state descendants', () => {
      const testContext = TestContextDI.createIsolated();
      
      stateFactory = new StateFactory();
      testContext.registerMock(StateFactory, stateFactory);
      
      eventService = new MockStateEventService();
      testContext.registerMock('IStateEventService', eventService);
      
      trackingService = new StateTrackingService();
      testContext.registerMock('IStateTrackingService', trackingService);
      testContext.registerMock('StateTrackingService', trackingService);
      
      const trackingServiceClientFactory = new StateTrackingServiceClientFactory(trackingService);
      testContext.registerMock('StateTrackingServiceClientFactory', trackingServiceClientFactory);
      
      historyService = new StateHistoryService(eventService);
      testContext.registerMock('StateHistoryService', historyService);
      
      visualizationService = new StateVisualizationService(historyService as any, trackingService);
      testContext.registerMock('StateVisualizationService', visualizationService);
      
      debuggerService = new StateDebuggerService(visualizationService, historyService as any, trackingService);
      testContext.registerMock('StateDebuggerService', debuggerService);
      
      service = new StateService(stateFactory, eventService, trackingServiceClientFactory);

      const rootId = service.getStateId();
      const child1 = service.createChildState();
      const child1Id = child1.getStateId();
      const child2 = service.createChildState();
      const child2Id = child2.getStateId();
      
      if (!rootId || !child1Id || !child2Id) {
        throw new Error('State ID is undefined, cannot proceed with descendant check.');
      }

      const descendants = trackingService.getStateDescendants(rootId);
      expect(descendants).toHaveLength(2);
      expect(descendants).toContain(child1Id);
      expect(descendants).toContain(child2Id);
    });
  });
}); 