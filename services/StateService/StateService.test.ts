import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateService } from './StateService.js';
import type { MeldNode } from 'meld-spec';
import type { IStateEventService, StateEvent } from '../StateEventService/IStateEventService.js';
import type { IStateTrackingService } from '../StateTrackingService/IStateTrackingService.js';
import { StateTrackingService } from '../StateTrackingService/StateTrackingService.js';
import { StateVisualizationService } from '../StateVisualizationService/StateVisualizationService.js';
import { StateDebuggerService } from '../StateDebuggerService/StateDebuggerService.js';
import { StateHistoryService } from '../StateHistoryService/StateHistoryService.js';

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

describe('StateService', () => {
  let state: StateService;
  let eventService: MockStateEventService;

  beforeEach(() => {
    eventService = new MockStateEventService();
    state = new StateService();
    state.setEventService(eventService);
  });

  describe('text variables', () => {
    it('should set and get text variables', () => {
      state.setTextVar('greeting', 'Hello');
      expect(state.getTextVar('greeting')).toBe('Hello');
    });

    it('should return undefined for non-existent text variables', () => {
      expect(state.getTextVar('nonexistent')).toBeUndefined();
    });

    it('should get all text variables', () => {
      state.setTextVar('greeting', 'Hello');
      state.setTextVar('farewell', 'Goodbye');

      const vars = state.getAllTextVars();
      expect(vars.size).toBe(2);
      expect(vars.get('greeting')).toBe('Hello');
      expect(vars.get('farewell')).toBe('Goodbye');
    });

    it('should get local text variables', () => {
      state.setTextVar('local', 'value');
      expect(state.getLocalTextVars().get('local')).toBe('value');
    });
  });

  describe('data variables', () => {
    it('should set and get data variables', () => {
      const data = { foo: 'bar' };
      state.setDataVar('config', data);
      expect(state.getDataVar('config')).toEqual(data);
    });

    it('should return undefined for non-existent data variables', () => {
      expect(state.getDataVar('nonexistent')).toBeUndefined();
    });

    it('should get all data variables', () => {
      state.setDataVar('config1', { foo: 'bar' });
      state.setDataVar('config2', { baz: 'qux' });

      const vars = state.getAllDataVars();
      expect(vars.size).toBe(2);
      expect(vars.get('config1')).toEqual({ foo: 'bar' });
      expect(vars.get('config2')).toEqual({ baz: 'qux' });
    });

    it('should get local data variables', () => {
      state.setDataVar('local', { value: true });
      expect(state.getLocalDataVars().get('local')).toEqual({ value: true });
    });
  });

  describe('path variables', () => {
    it('should set and get path variables', () => {
      state.setPathVar('root', '/path/to/root');
      expect(state.getPathVar('root')).toBe('/path/to/root');
    });

    it('should return undefined for non-existent path variables', () => {
      expect(state.getPathVar('nonexistent')).toBeUndefined();
    });

    it('should get all path variables', () => {
      state.setPathVar('root', '/root');
      state.setPathVar('temp', '/tmp');

      const vars = state.getAllPathVars();
      expect(vars.size).toBe(2);
      expect(vars.get('root')).toBe('/root');
      expect(vars.get('temp')).toBe('/tmp');
    });
  });

  describe('commands', () => {
    it('should set and get commands', () => {
      state.setCommand('test', 'echo test');
      expect(state.getCommand('test')).toEqual({ command: 'echo test' });
    });

    it('should set and get commands with options', () => {
      state.setCommand('test', { command: 'echo test', options: { silent: true } });
      expect(state.getCommand('test')).toEqual({ command: 'echo test', options: { silent: true } });
    });

    it('should get all commands', () => {
      state.setCommand('cmd1', 'echo 1');
      state.setCommand('cmd2', 'echo 2');

      const commands = state.getAllCommands();
      expect(commands.size).toBe(2);
      expect(commands.get('cmd1')).toEqual({ command: 'echo 1' });
      expect(commands.get('cmd2')).toEqual({ command: 'echo 2' });
    });
  });

  describe('nodes', () => {
    it('should add and get nodes', () => {
      const node: MeldNode = {
        type: 'text',
        value: 'test',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 4 } }
      };
      state.addNode(node);
      expect(state.getNodes()).toEqual([node]);
    });

    it('should append content as text node', () => {
      state.appendContent('test content');
      const nodes = state.getNodes();
      expect(nodes).toHaveLength(1);
      expect(nodes[0].type).toBe('Text');
      expect(nodes[0].content).toBe('test content');
    });
  });

  describe('imports', () => {
    it('should add and check imports', () => {
      state.addImport('test.md');
      expect(state.hasImport('test.md')).toBe(true);
    });

    it('should remove imports', () => {
      state.addImport('test.md');
      state.removeImport('test.md');
      expect(state.hasImport('test.md')).toBe(false);
    });

    it('should get all imports', () => {
      state.addImport('file1.md');
      state.addImport('file2.md');

      const imports = state.getImports();
      expect(imports.size).toBe(2);
      expect(imports.has('file1.md')).toBe(true);
      expect(imports.has('file2.md')).toBe(true);
    });
  });

  describe('file path', () => {
    it('should set and get current file path', () => {
      state.setCurrentFilePath('/test/file.md');
      expect(state.getCurrentFilePath()).toBe('/test/file.md');
    });

    it('should return null when no file path is set', () => {
      expect(state.getCurrentFilePath()).toBeNull();
    });
  });

  describe('event emission', () => {
    it('should emit create event when creating child state', () => {
      const handler = vi.fn();
      eventService.on('create', handler);

      state.setCurrentFilePath('test.meld');
      const child = state.createChildState();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'create',
        source: 'createChildState',
        location: {
          file: 'test.meld'
        }
      }));
    });

    it('should emit clone event when cloning state', () => {
      const handler = vi.fn();
      eventService.on('clone', handler);

      state.setCurrentFilePath('test.meld');
      const cloned = state.clone();

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'clone',
        source: 'clone',
        location: {
          file: 'test.meld'
        }
      }));
    });

    it('should emit merge event when merging child state', () => {
      const handler = vi.fn();
      eventService.on('merge', handler);

      state.setCurrentFilePath('test.meld');
      const child = state.createChildState();
      state.mergeChildState(child);

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'merge',
        source: 'mergeChildState',
        location: {
          file: 'test.meld'
        }
      }));
    });

    it('should emit transform event for state updates', () => {
      const handler = vi.fn();
      eventService.on('transform', handler);

      state.setCurrentFilePath('test.meld');
      state.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'transform',
        source: 'setTextVar:test',
        location: {
          file: 'test.meld'
        }
      }));
    });

    it('should inherit event service in child states', () => {
      const handler = vi.fn();
      eventService.on('transform', handler);

      const child = state.createChildState();
      child.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalled();
    });

    it('should propagate event service to cloned states', () => {
      const handler = vi.fn();
      eventService.on('transform', handler);

      const cloned = state.clone();
      cloned.setTextVar('test', 'value');

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('should prevent modifications when immutable', () => {
      state.setImmutable();
      expect(() => state.setTextVar('test', 'value')).toThrow('Cannot modify immutable state');
    });

    it('should create child state', () => {
      state.setTextVar('parent', 'value');
      const child = state.createChildState();
      expect(child.getTextVar('parent')).toBe('value');
    });

    it('should merge child state', () => {
      const child = state.createChildState();
      child.setTextVar('child', 'value');
      state.mergeChildState(child);
      expect(state.getTextVar('child')).toBe('value');
    });

    it('should clone state', () => {
      state.setTextVar('original', 'value');
      const clone = state.clone();
      expect(clone.getTextVar('original')).toBe('value');

      // Verify modifications don't affect original
      clone.setTextVar('new', 'value');
      expect(state.getTextVar('new')).toBeUndefined();
    });

    it('should track local changes', () => {
      expect(state.hasLocalChanges()).toBe(true);
      expect(state.getLocalChanges()).toEqual(['state']);
    });
  });

  describe('State Tracking', () => {
    let service: StateService;
    let trackingService: IStateTrackingService;
    let eventService: MockStateEventService;
    let visualizationService: StateVisualizationService;
    let debuggerService: StateDebuggerService;
    let historyService: StateHistoryService;

    beforeEach(() => {
      service = new StateService();
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

    it('should track clone relationships', () => {
      const originalId = service.getStateId()!;
      const cloned = service.clone();
      const clonedId = cloned.getStateId()!;

      expect(trackingService.getRelationships(originalId)).toHaveLength(1);
      expect(trackingService.getRelationships(originalId)[0].type).toBe('parent-child');
      expect(trackingService.getRelationships(originalId)[0].targetId).toBe(clonedId);
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

    it('should track state lineage', async () => {
      // Start debug session with enhanced configuration
      const debugSessionId = await debuggerService.startSession({
        captureConfig: {
          capturePoints: ['pre-transform', 'post-transform', 'error'],
          includeFields: ['nodes', 'transformedNodes', 'variables', 'metadata'],
          format: 'full'
        },
        visualization: {
          format: 'mermaid',
          includeMetadata: true,
          includeTimestamps: true
        }
      });

      try {
        // Get initial state ID and visualize it
        const rootId = service.getStateId()!;
        console.log('Initial State:');
        console.log(await visualizationService.generateHierarchyView(rootId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Create child state
        const child = service.createChildState();
        const childId = child.getStateId()!;
        console.log('\nAfter Creating Child:');
        console.log(await visualizationService.generateHierarchyView(rootId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Create grandchild state
        const grandchild = child.createChildState();
        const grandchildId = grandchild.getStateId()!;
        console.log('\nAfter Creating Grandchild:');
        console.log(await visualizationService.generateHierarchyView(rootId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Get and verify lineage
        const lineage = trackingService.getStateLineage(grandchildId);
        console.log('\nState Lineage:', lineage);

        // Generate transition diagram
        console.log('\nState Transitions:');
        console.log(await visualizationService.generateTransitionDiagram(grandchildId, {
          format: 'mermaid',
          includeTimestamps: true
        }));

        // Verify lineage
        expect(lineage).toHaveLength(3); // Root -> Child -> Grandchild
        expect(lineage[0]).toBe(rootId); // Root first
        expect(lineage[1]).toBe(childId); // Then child
        expect(lineage[2]).toBe(grandchildId); // Then grandchild

        // Get and log complete debug report
        const report = await debuggerService.generateDebugReport(debugSessionId);
        console.log('\nComplete Debug Report:', report);
      } catch (error) {
        // Log error diagnostics
        const errorReport = await debuggerService.generateDebugReport(debugSessionId);
        console.error('Error Debug Report:', errorReport);
        throw error;
      } finally {
        await service.services.debugger.endSession(debugSessionId);
      }
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