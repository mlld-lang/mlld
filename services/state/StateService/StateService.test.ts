import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StateService } from './StateService.js';
import { StateFactory } from './StateFactory.js';
import type { MeldNode } from 'meld-spec';
import type { IStateEventService, StateEvent } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService.js';
import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService.js';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService.js';
import { TestContextDI } from '@tests/utils/di/TestContextDI.js';
import { StateEventService } from '../StateEventService/StateEventService.js';
import { container } from 'tsyringe';

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

// Base test suite that will be reused for both DI and non-DI modes
function createTestContext(useDI: boolean) {
  // Set up environment based on test mode
  process.env.USE_DI = useDI ? 'true' : 'false';
  
  if (useDI) {
    // Initialize test context with DI
    const testContext = TestContextDI.withDI();
    
    // Register mocks in the container
    const mockEventService = new MockStateEventService();
    container.registerInstance('IStateEventService', mockEventService);
    
    // Resolve the service from the container
    const state = container.resolve(StateService);
    const eventService = mockEventService;
    const stateFactory = container.resolve(StateFactory);
    
    return { state, eventService, testContext, stateFactory };
  } else {
    // Initialize test context without DI
    const testContext = TestContextDI.withoutDI();
    
    // Create services manually for legacy mode
    const mockEventService = new MockStateEventService();
    const stateFactory = new StateFactory(); 
    const state = new StateService(stateFactory);
    state.setEventService(mockEventService);
    const eventService = mockEventService;
    
    return { state, eventService, testContext, stateFactory };
  }
}

// Main test suite with conditional describe blocks for each mode
describe('StateService', () => {
  // Define the shared tests that will be run for both modes
  function defineSharedTests(getState: () => StateService, getEventService: () => IStateEventService) {
    // Using function with parameters to access the correct state
    
    it('should set and get text variables', () => {
      const state = getState();
      state.setTextVar('greeting', 'Hello');
      expect(state.getTextVar('greeting')).toBe('Hello');
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
      expect(vars.get('greeting')).toBe('Hello');
      expect(vars.get('farewell')).toBe('Goodbye');
    });

    it('should set and get data variables', () => {
      const state = getState();
      const data = { foo: 'bar' };
      state.setDataVar('config', data);
      expect(state.getDataVar('config')).toEqual(data);
    });

    it('should set and get path variables', () => {
      const state = getState();
      state.setPathVar('root', '/path/to/root');
      expect(state.getPathVar('root')).toBe('/path/to/root');
    });

    it('should set and get commands', () => {
      const state = getState();
      state.setCommand('test', 'echo test');
      expect(state.getCommand('test')).toEqual({ command: 'echo test' });
    });

    it('should add and get nodes', () => {
      const state = getState();
      const node: MeldNode = {
        type: 'text',
        value: 'test',
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

    it('should create child state with inherited properties', () => {
      const state = getState();
      state.setTextVar('parent', 'value');
      const child = state.createChildState();
      expect(child.getTextVar('parent')).toBe('value');
    });

    it('should clone state properly', () => {
      const state = getState();
      state.setTextVar('original', 'value');
      const clone = state.clone();
      expect(clone.getTextVar('original')).toBe('value');

      // Verify modifications don't affect original
      clone.setTextVar('new', 'value');
      expect(state.getTextVar('new')).toBeUndefined();
    });
  }

  // Legacy non-DI mode tests
  describe('Legacy Mode (without DI)', () => {
    let context: ReturnType<typeof createTestContext>;
    
    beforeEach(() => {
      context = createTestContext(false);
    });
    
    afterEach(async () => {
      await context.testContext.cleanup();
    });
    
    // Helper functions to get current state in tests
    const getState = () => context.state;
    const getEventService = () => context.eventService as MockStateEventService;
    
    describe('Basic functionality', () => {
      defineSharedTests(getState, getEventService);
    });
    
    describe('Additional legacy-mode tests', () => {
      it('should initialize with factory without requiring DI', () => {
        const factory = new StateFactory();
        const service = new StateService(factory);
        expect(service).toBeInstanceOf(StateService);
      });
    });
  });
  
  // DI mode tests
  describe('DI Mode (with TSyringe)', () => {
    let context: ReturnType<typeof createTestContext>;
    
    beforeEach(() => {
      context = createTestContext(true);
    });
    
    afterEach(async () => {
      await context.testContext.cleanup();
    });
    
    // Helper functions to get current state in tests
    const getState = () => context.state;
    const getEventService = () => context.eventService;
    
    describe('Basic functionality', () => {
      defineSharedTests(getState, getEventService);
    });
    
    describe('Additional DI-mode tests', () => {
      it('should be resolvable from container', () => {
        const service = container.resolve(StateService);
        expect(service).toBeInstanceOf(StateService);
      });
      
      it('should work with injected dependencies', () => {
        const eventService = container.resolve<IStateEventService>('IStateEventService');
        const stateFactory = container.resolve(StateFactory);
        expect(eventService).toBeDefined();
        expect(stateFactory).toBeDefined();
      });
    });
  });
  
  // State tracking tests - these are more specialized and can run in non-DI mode
  describe('State Tracking', () => {
    let service: StateService;
    let trackingService: IStateTrackingService;
    let eventService: MockStateEventService;
    let visualizationService: StateVisualizationService;
    let debuggerService: StateDebuggerService;
    let historyService: StateHistoryService;
    let stateFactory: StateFactory;
    let testContext: TestContextDI;

    beforeEach(() => {
      process.env.USE_DI = 'false';
      testContext = TestContextDI.withoutDI();
      
      stateFactory = new StateFactory();
      service = new StateService(stateFactory);
      eventService = new MockStateEventService();
      trackingService = new StateTrackingService();
      historyService = new StateHistoryService(eventService);
      visualizationService = new StateVisualizationService(historyService, trackingService);
      debuggerService = new StateDebuggerService(visualizationService, historyService, trackingService);
      
      service.setEventService(eventService);
      service.setTrackingService(trackingService);
      
      // Add services to the service instance for visualization and debugging
      (service as any).services = {
        visualization: visualizationService,
        debugger: debuggerService,
        history: historyService,
        tracking: trackingService,
        events: eventService
      };
    });
    
    afterEach(async () => {
      await testContext.cleanup();
    });

    it('should register state with tracking service', () => {
      const stateId = service.getStateId();
      expect(stateId).toBeDefined();
      expect(trackingService.hasState(stateId!)).toBe(true);

      const metadata = trackingService.getStateMetadata(stateId!);
      expect(metadata).toBeDefined();
      expect(metadata?.source).toBe('new');
      expect(metadata?.transformationEnabled).toBe(false);
    });

    it('should track parent-child relationships', () => {
      const parentId = service.getStateId()!;
      const child = service.createChildState();
      const childId = child.getStateId()!;

      expect(trackingService.getParentState(childId)).toBe(parentId);
      expect(trackingService.getChildStates(parentId)).toContain(childId);

      const relationships = trackingService.getRelationships(parentId);
      expect(relationships).toHaveLength(1);
      expect(relationships[0].type).toBe('parent-child');
      expect(relationships[0].targetId).toBe(childId);
    });

    it.skip('should register cloned state in tracking service', () => {
      const originalId = service.getStateId()!;
      const cloned = service.clone();
      const clonedId = cloned.getStateId()!;

      // Just verify the cloned state is registered properly
      expect(trackingService.hasState(clonedId)).toBe(true);
      expect(cloned.getStateId()).toBeDefined();
    });

    it('should track merge relationships', () => {
      const parentId = service.getStateId()!;
      const child = service.createChildState();
      const childId = child.getStateId()!;

      service.mergeChildState(child);

      const relationships = trackingService.getRelationships(parentId);
      expect(relationships).toHaveLength(2); // parent-child + merge-source
      expect(relationships.some(r => r.type === 'merge-source')).toBe(true);
      expect(relationships.some(r => r.type === 'parent-child')).toBe(true);
      expect(relationships.find(r => r.type === 'merge-source')?.targetId).toBe(childId);
    });

    it('should inherit tracking service from parent', () => {
      const parent = service;
      const child = parent.createChildState();

      expect(child.getStateId()).toBeDefined();
      expect(trackingService.hasState(child.getStateId()!)).toBe(true);
    });

    it('should track state descendants', () => {
      const rootId = service.getStateId()!;
      const child1 = service.createChildState();
      const child1Id = child1.getStateId()!;
      const child2 = service.createChildState();
      const child2Id = child2.getStateId()!;
      const grandchild = child1.createChildState();
      const grandchildId = grandchild.getStateId()!;

      const descendants = trackingService.getStateDescendants(rootId);
      expect(descendants).toHaveLength(3);
      expect(descendants).toContain(child1Id);
      expect(descendants).toContain(child2Id);
      expect(descendants).toContain(grandchildId);
    });
  });
}); 