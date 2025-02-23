import { describe, it, expect, beforeEach } from 'vitest';
import { StateTrackingService } from './StateTrackingService.js';
import type { StateMetadata } from './IStateTrackingService.js';

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

    it('should handle merge target relationships', () => {
      const sourceId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const targetId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      const parentId = service.registerState({
        source: 'new',
        transformationEnabled: true
      });

      service.addRelationship(parentId, targetId, 'parent-child');
      service.addRelationship(sourceId, targetId, 'merge-target');

      const lineage = service.getStateLineage(sourceId);
      expect(lineage).toContain(parentId);
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