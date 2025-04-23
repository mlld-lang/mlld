import { describe, it, expect, beforeEach } from 'vitest';
import { StateTrackingService } from '@tests/utils/debug/StateTrackingService/StateTrackingService';
import type { StateMetadata } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService';
import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService';
import { StateHistoryService } from '@tests/utils/debug/StateHistoryService/StateHistoryService';
import type { IStateHistoryService } from '@tests/utils/debug/StateHistoryService/IStateHistoryService';
import type { IStateEventService } from '@services/state/StateEventService/IStateEventService';

class MockStateEventService implements IStateEventService {
  private handlers = new Map<string, Array<{
    handler: (event: any) => void | Promise<void>;
    options?: { filter?: (event: any) => boolean };
  }>>();

  constructor() {
    ['create', 'clone', 'transform', 'merge', 'error'].forEach(type => {
      this.handlers.set(type, []);
    });
  }

  on(type: string, handler: (event: any) => void | Promise<void>, options?: { filter?: (event: any) => boolean }): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.push({ handler, options });
    }
  }

  off(type: string, handler: (event: any) => void | Promise<void>): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      const index = handlers.findIndex(h => h.handler === handler);
      if (index !== -1) {
        handlers.splice(index, 1);
      }
    }
  }

  async emit(event: any): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    for (const { handler, options } of handlers) {
      if (!options?.filter || options.filter(event)) {
        await Promise.resolve(handler(event));
      }
    }
  }
}

describe('StateTrackingService', () => {
  let service: StateTrackingService;

  beforeEach(() => {
    service = new StateTrackingService();
  });

  describe('State Registration', () => {
    it('should register a new state with generated ID', () => {
      const metadata: Partial<StateMetadata> = {
        source: 'new',
        transformationEnabled: true
      };

      const stateId = service.registerState(metadata);
      expect(stateId).toBeDefined();
      expect(typeof stateId).toBe('string');
      expect(stateId.length).toBeGreaterThan(0);
    });

    it('should store complete metadata', () => {
      const metadata: Partial<StateMetadata> = {
        source: 'clone',
        parentId: 'parent-123',
        filePath: 'test.meld',
        transformationEnabled: true
      };

      const stateId = service.registerState(metadata);
      const stored = service.getStateMetadata(stateId);

      expect(stored).toBeDefined();
      expect(stored?.source).toBe('clone');
      expect(stored?.parentId).toBe('parent-123');
      expect(stored?.filePath).toBe('test.meld');
      expect(stored?.transformationEnabled).toBe(true);
    });
  });

  describe('State Lineage', () => {
    it('should return empty array for non-existent state', () => {
      const lineage = service.getStateLineage('non-existent');
      expect(lineage).toEqual([]);
    });

    it('should return single state for root state', () => {
      const rootId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const lineage = service.getStateLineage(rootId);
      expect(lineage).toEqual([rootId]);
    });

    it('should return correct lineage for simple parent-child relationship', () => {
      const rootId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const childId = service.registerState({
        source: 'child',
        parentId: rootId,
        transformationEnabled: true
      });

      service.addRelationship(rootId, childId, 'parent-child');

      const lineage = service.getStateLineage(childId);
      expect(lineage).toEqual([rootId, childId]);
    });

    it('should handle multi-level lineage', () => {
      const rootId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const child1Id = service.registerState({
        source: 'child',
        parentId: rootId,
        transformationEnabled: true
      });

      const child2Id = service.registerState({
        source: 'child',
        parentId: child1Id,
        transformationEnabled: true
      });

      service.addRelationship(rootId, child1Id, 'parent-child');
      service.addRelationship(child1Id, child2Id, 'parent-child');

      const lineage = service.getStateLineage(child2Id);
      expect(lineage).toEqual([rootId, child1Id, child2Id]);
    });

    it('should handle circular relationships', () => {
      const state1Id = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const state2Id = service.registerState({
        source: 'child',
        parentId: state1Id,
        transformationEnabled: true
      });

      const state3Id = service.registerState({
        source: 'child',
        parentId: state2Id,
        transformationEnabled: true
      });

      service.addRelationship(state1Id, state2Id, 'parent-child');
      service.addRelationship(state2Id, state3Id, 'parent-child');
      service.addRelationship(state3Id, state1Id, 'parent-child'); // Creates a cycle

      const lineage = service.getStateLineage(state3Id);
      expect(lineage).toEqual([state1Id, state2Id, state3Id]);
    });
  });

  describe('State Descendants', () => {
    it('should return empty array for non-existent state', () => {
      const descendants = service.getStateDescendants('non-existent');
      expect(descendants).toEqual([]);
    });

    it('should return empty array for leaf state', () => {
      const leafId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const descendants = service.getStateDescendants(leafId);
      expect(descendants).toEqual([]);
    });

    it('should return immediate children', () => {
      const rootId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const child1Id = service.registerState({
        source: 'child',
        parentId: rootId,
        transformationEnabled: true
      });

      const child2Id = service.registerState({
        source: 'child',
        parentId: rootId,
        transformationEnabled: true
      });

      service.addRelationship(rootId, child1Id, 'parent-child');
      service.addRelationship(rootId, child2Id, 'parent-child');

      const descendants = service.getStateDescendants(rootId);
      expect(descendants).toContain(child1Id);
      expect(descendants).toContain(child2Id);
      expect(descendants.length).toBe(2);
    });

    it('should return all descendants in complex hierarchy', () => {
      const rootId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const child1Id = service.registerState({
        source: 'child',
        parentId: rootId,
        transformationEnabled: true
      });

      const child2Id = service.registerState({
        source: 'child',
        parentId: rootId,
        transformationEnabled: true
      });

      const grandchild1Id = service.registerState({
        source: 'child',
        parentId: child1Id,
        transformationEnabled: true
      });

      const grandchild2Id = service.registerState({
        source: 'child',
        parentId: child2Id,
        transformationEnabled: true
      });

      service.addRelationship(rootId, child1Id, 'parent-child');
      service.addRelationship(rootId, child2Id, 'parent-child');
      service.addRelationship(child1Id, grandchild1Id, 'parent-child');
      service.addRelationship(child2Id, grandchild2Id, 'parent-child');

      const descendants = service.getStateDescendants(rootId);
      expect(descendants).toContain(child1Id);
      expect(descendants).toContain(child2Id);
      expect(descendants).toContain(grandchild1Id);
      expect(descendants).toContain(grandchild2Id);
      expect(descendants.length).toBe(4);
    });
  });

  describe('Merge Operations', () => {
    let service: StateTrackingService;
    let trackingService: IStateTrackingService;
    let eventService: MockStateEventService;
    let visualizationService: StateVisualizationService;
    let debuggerService: StateDebuggerService;
    let historyService: StateHistoryService;

    beforeEach(() => {
      service = new StateTrackingService();
      eventService = new MockStateEventService();
      trackingService = service; // StateTrackingService is itself the tracking service
      historyService = new StateHistoryService(eventService);
      visualizationService = new StateVisualizationService(historyService, trackingService);
      debuggerService = new StateDebuggerService(visualizationService, historyService, trackingService);
      
      // Set up bidirectional service connections
      (service as any).eventService = eventService;
      (service as any).services = {
        visualization: visualizationService,
        debugger: debuggerService,
        history: historyService,
        events: eventService
      };
    });

    it('should handle merge source relationships', () => {
      const sourceId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const targetId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      service.addRelationship(sourceId, targetId, 'merge-source');

      const descendants = service.getStateDescendants(sourceId);
      expect(descendants).toContain(targetId);
    });

    it('should handle merge target relationships', async () => {
      // Start debug session with enhanced configuration
      const debugSessionId = await debuggerService.startSession({
        captureConfig: {
          capturePoints: ['pre-transform', 'post-transform', 'error'],
          includeFields: ['nodes', 'transformedNodes', 'variables', 'metadata', 'relationships'],
          format: 'full'
        },
        visualization: {
          format: 'mermaid',
          includeMetadata: true,
          includeTimestamps: true
        }
      });

      try {
        // Create initial states with event emission
        const sourceId = service.registerState({
          source: 'new',
          transformationEnabled: true
        });
        console.log('Created source state:', sourceId);
        eventService.emit('create', { type: 'create', stateId: sourceId, source: 'registerState' });

        const targetId = service.registerState({
          source: 'new',
          transformationEnabled: true
        });
        console.log('Created target state:', targetId);
        eventService.emit('create', { type: 'create', stateId: targetId, source: 'registerState' });

        const parentId = service.registerState({
          source: 'new',
          transformationEnabled: true
        });
        console.log('Created parent state:', parentId);
        eventService.emit('create', { type: 'create', stateId: parentId, source: 'registerState' });

        // Visualize initial states
        console.log('\nInitial States:');
        console.log(await visualizationService.generateHierarchyView(sourceId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Add parent-child relationship
        service.addRelationship(parentId, targetId, 'parent-child');
        console.log('\nAdded parent-child relationship:', {
          parent: parentId,
          child: targetId,
          parentMetadata: service.getStateMetadata(parentId),
          childMetadata: service.getStateMetadata(targetId),
          parentRelationships: service.getRelationships(parentId),
          childRelationships: service.getRelationships(targetId)
        });
        eventService.emit('transform', {
          type: 'transform',
          source: 'addRelationship:parent-child',
          stateId: parentId,
          targetId: targetId
        });

        // Visualize after parent-child relationship
        console.log('\nAfter Parent-Child Relationship:');
        console.log(await visualizationService.generateHierarchyView(parentId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Add merge-target relationship
        service.addRelationship(sourceId, targetId, 'merge-target');
        console.log('\nAdded merge-target relationship:', {
          source: sourceId,
          target: targetId,
          sourceMetadata: service.getStateMetadata(sourceId),
          targetMetadata: service.getStateMetadata(targetId),
          sourceRelationships: service.getRelationships(sourceId),
          targetRelationships: service.getRelationships(targetId)
        });
        eventService.emit('transform', {
          type: 'transform',
          source: 'addRelationship:merge-target',
          stateId: sourceId,
          targetId: targetId
        });

        // Visualize after merge-target relationship
        console.log('\nAfter Merge-Target Relationship:');
        console.log(await visualizationService.generateHierarchyView(sourceId, {
          format: 'mermaid',
          includeMetadata: true
        }));

        // Generate transition diagram
        console.log('\nState Transitions:');
        console.log(await visualizationService.generateTransitionDiagram(sourceId, {
          format: 'mermaid',
          includeTimestamps: true
        }));

        // Get and verify lineage
        const lineage = service.getStateLineage(sourceId);
        console.log('\nState Lineage:', {
          sourceId,
          targetId,
          parentId,
          lineage,
          sourceMetadata: service.getStateMetadata(sourceId),
          targetMetadata: service.getStateMetadata(targetId),
          parentMetadata: service.getStateMetadata(parentId),
          sourceRelationships: service.getRelationships(sourceId),
          targetRelationships: service.getRelationships(targetId),
          parentRelationships: service.getRelationships(parentId)
        });

        // Verify lineage includes parent
        expect(lineage).toContain(parentId);

        // Get and log complete debug report
        const report = await debuggerService.generateDebugReport(debugSessionId);
        console.log('\nComplete Debug Report:', report);
      } catch (error) {
        // Log error diagnostics
        const errorReport = await debuggerService.generateDebugReport(debugSessionId);
        console.error('Error Debug Report:', errorReport);
        throw error;
      } finally {
        await debuggerService.endSession(debugSessionId);
      }
    });

    it('should handle complex merge scenarios', () => {
      // Create a complex hierarchy with merges
      const rootId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const branch1Id = service.registerState({
        source: 'child',
        parentId: rootId,
        transformationEnabled: true
      });

      const branch2Id = service.registerState({
        source: 'child',
        parentId: rootId,
        transformationEnabled: true
      });

      const mergeTargetId = service.registerState({
        source: 'merge',
        transformationEnabled: true
      });

      // Set up relationships
      service.addRelationship(rootId, branch1Id, 'parent-child');
      service.addRelationship(rootId, branch2Id, 'parent-child');
      service.addRelationship(branch1Id, mergeTargetId, 'merge-source');
      service.addRelationship(branch2Id, mergeTargetId, 'merge-target');

      // Verify lineage
      const lineage = service.getStateLineage(mergeTargetId);
      expect(lineage).toContain(rootId);
      expect(lineage).toContain(branch1Id);

      // Verify descendants
      const descendants = service.getStateDescendants(rootId);
      expect(descendants).toContain(branch1Id);
      expect(descendants).toContain(branch2Id);
      expect(descendants).toContain(mergeTargetId);
    });
  });
}); 