import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { StateVisualizationService } from '@tests/utils/debug/StateVisualizationService/StateVisualizationService.js';
import { IStateHistoryService, StateOperation, StateTransformation } from '@tests/utils/debug/StateHistoryService/IStateHistoryService.js';
import type { IStateTrackingService, StateMetadata } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';
import { VisualizationConfig, VisualizationFormat } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService.js';
import { mockDeep } from 'vitest-mock-extended';

describe('StateVisualizationService', () => {
  let mockHistoryService: ReturnType<typeof mockDeep<IStateHistoryService>>;
  let mockTrackingService: ReturnType<typeof mockDeep<IStateTrackingService>>;
  let visualizationService: StateVisualizationService;

  beforeEach(() => {
    mockHistoryService = mockDeep<IStateHistoryService>();
    mockTrackingService = mockDeep<IStateTrackingService>();
    mockTrackingService.getAllStates.mockReturnValue([]);

    visualizationService = new StateVisualizationService(
      mockHistoryService,
      mockTrackingService,
    );
  });

  describe('Hierarchy View Generation', () => {
    const mockMetadata: StateMetadata = {
      id: 'root',
      source: 'new',
      transformationEnabled: true,
      createdAt: Date.now(),
    };

    beforeEach(() => {
      mockHistoryService.getOperationHistory.mockReturnValue([{
        type: 'create',
        stateId: 'root',
        source: 'test',
        timestamp: Date.now(),
        metadata: mockMetadata,
      }]);
    });

    it('generates mermaid format hierarchy', () => {
      const mockLineage = ['root', 'parent', 'child'];
      const mockDescendants = ['child1', 'child2'];
      
      mockTrackingService.getStateLineage.mockReturnValue(mockLineage);
      mockTrackingService.getStateDescendants.mockReturnValue(mockDescendants);

      const config: VisualizationConfig = {
        format: 'mermaid',
        includeMetadata: true,
      };

      const result = visualizationService.generateHierarchyView('root', config);
      expect(result).toContain('graph TD;');
      expect(result).toContain('root[new]'); // Check node format
      expect(result).toMatch(/style="box,#[0-9A-F]{6}"/); // Check styling
      expect(mockTrackingService.getStateLineage).toHaveBeenCalledWith('root');
      expect(mockTrackingService.getStateDescendants).toHaveBeenCalledWith('root');
    });

    it('generates dot format hierarchy', () => {
      mockTrackingService.getStateLineage.mockReturnValue(['root']);
      mockTrackingService.getStateDescendants.mockReturnValue(['child']);

      const config: VisualizationConfig = {
        format: 'dot',
        includeMetadata: true,
      };

      const result = visualizationService.generateHierarchyView('root', config);
      expect(result).toContain('digraph G {');
      expect(result).toMatch(/"root" \[label="root\\nnew"/); // Check node format
      expect(result).toMatch(/shape="box"/); // Check styling
    });

    it('generates json format with complete metadata', () => {
      mockTrackingService.getStateLineage.mockReturnValue(['root']);
      mockTrackingService.getStateDescendants.mockReturnValue([]);

      const config: VisualizationConfig = {
        format: 'json',
        includeMetadata: true,
      };

      const result = visualizationService.generateHierarchyView('root', config);
      const parsed = JSON.parse(result);
      expect(parsed).toHaveProperty('nodes');
      expect(parsed).toHaveProperty('edges');
      expect(parsed.nodes[0]).toMatchObject({
        id: 'root',
        source: 'new',
      });
    });

    it('handles empty state hierarchies gracefully', () => {
      mockTrackingService.getStateLineage.mockReturnValue([]);
      mockTrackingService.getStateDescendants.mockReturnValue([]);

      const config: VisualizationConfig = {
        format: 'mermaid',
      };

      const result = visualizationService.generateHierarchyView('root', config);
      expect(result).toContain('graph TD;');
      expect(result.split('\n')).toHaveLength(1); // Only contains header
    });

    it('throws error for unsupported format', () => {
      const config = {
        format: 'invalid' as VisualizationFormat,
      };

      expect(() => 
        visualizationService.generateHierarchyView('root', config)
      ).toThrow('Unsupported format: invalid');
    });
  });

  describe('Transition Diagram Generation', () => {
    it('visualizes state transformations', () => {
      const mockTransformations = [
        {
          stateId: 'state1',
          timestamp: 1000,
          operation: 'update',
          source: 'test',
          before: { value: 1 },
          after: { value: 2 },
        },
      ];

      mockHistoryService.getTransformationChain.mockReturnValue(mockTransformations);

      const config: VisualizationConfig = {
        format: 'mermaid',
        includeTimestamps: true,
      };

      const result = visualizationService.generateTransitionDiagram('state1', config);
      expect(mockHistoryService.getTransformationChain).toHaveBeenCalledWith('state1');
      // TODO: Add more specific assertions once implementation is complete
    });

    it('handles empty transformation chain', () => {
      mockHistoryService.getTransformationChain.mockReturnValue([]);

      const config: VisualizationConfig = {
        format: 'mermaid',
      };

      const result = visualizationService.generateTransitionDiagram('state1', config);
      expect(result).toBe(''); // Or whatever empty state representation we decide
    });
  });

  describe('Timeline Generation', () => {
    const mockOperations: StateOperation[] = [
      {
        type: 'create',
        stateId: 'state1',
        source: 'test',
        timestamp: 1000,
      },
      {
        type: 'transform',
        stateId: 'state1',
        source: 'test',
        timestamp: 2000,
      },
    ];

    beforeEach(() => {
      mockHistoryService.getOperationHistory.mockReturnValue(mockOperations);
    });

    it('generates timeline of operations', () => {
      const config: VisualizationConfig = {
        format: 'mermaid',
        includeTimestamps: true,
      };

      const result = visualizationService.generateTimeline(['state1'], config);
      expect(mockHistoryService.getOperationHistory).toHaveBeenCalledWith('state1');
      // TODO: Add more specific assertions once implementation is complete
    });

    it('sorts operations by timestamp', () => {
      const config: VisualizationConfig = {
        format: 'mermaid',
        includeTimestamps: true,
      };

      const result = visualizationService.generateTimeline(['state1'], config);
      // TODO: Verify sorting once implementation is complete
    });
  });

  describe('Metrics Calculation', () => {
    const mockOperations: StateOperation[] = [
      {
        type: 'create',
        stateId: 'state1',
        source: 'test',
        timestamp: 1000,
      },
      {
        type: 'transform',
        stateId: 'state1',
        source: 'test',
        timestamp: 2000,
      },
    ];

    beforeEach(() => {
      mockHistoryService.queryHistory.mockReturnValue(mockOperations);
    });

    it('calculates system metrics within time range', () => {
      const timeRange = {
        start: 0,
        end: 3000,
      };

      const metrics = visualizationService.getMetrics(timeRange);
      expect(mockHistoryService.queryHistory).toHaveBeenCalledWith({ timeRange });
      expect(metrics).toHaveProperty('totalStates');
      expect(metrics).toHaveProperty('statesByType');
      expect(metrics).toHaveProperty('operationFrequency');
    });

    it('handles empty operation set', () => {
      mockHistoryService.queryHistory.mockReturnValue([]);
      const metrics = visualizationService.getMetrics();
      expect(metrics.totalStates).toBe(0);
      expect(metrics.operationFrequency).toEqual({});
    });
  });

  describe('Custom Styling', () => {
    const mockMetadata: StateMetadata = {
      id: 'root',
      source: 'new',
      transformationEnabled: true,
      createdAt: Date.now(),
    };

    beforeEach(() => {
      mockHistoryService.getOperationHistory.mockReturnValue([{
        type: 'create',
        stateId: 'root',
        source: 'test',
        timestamp: Date.now(),
        metadata: mockMetadata,
      }]);
    });

    it('applies custom node styles', () => {
      mockTrackingService.getStateLineage.mockReturnValue(['root']);
      mockTrackingService.getStateDescendants.mockReturnValue([]);

      const config: VisualizationConfig = {
        format: 'dot',
        styleNodes: () => ({
          shape: 'circle',
          color: '#FF0000',
        }),
      };

      const result = visualizationService.generateHierarchyView('root', config);
      expect(result).toContain('circle');
      expect(result).toContain('#FF0000');
    });

    it('applies custom edge styles', () => {
      mockTrackingService.getStateLineage.mockReturnValue(['root', 'child']);
      mockTrackingService.getStateDescendants.mockReturnValue([]);

      const config: VisualizationConfig = {
        format: 'dot',
        styleEdges: () => ({
          style: 'dotted',
          color: '#00FF00',
        }),
      };

      const result = visualizationService.generateHierarchyView('root', config);
      expect(result).toContain('dotted');
      expect(result).toContain('#00FF00');
    });

    it('falls back to default styles when custom styling not provided', () => {
      mockTrackingService.getStateLineage.mockReturnValue(['root']);
      mockTrackingService.getStateDescendants.mockReturnValue([]);

      const config: VisualizationConfig = {
        format: 'dot',
      };

      const result = visualizationService.generateHierarchyView('root', config);
      expect(result).toContain('box'); // Default shape
      expect(result).toMatch(/#[0-9A-F]{6}/); // Default color
    });
  });

  describe('Transformation Diagram Generation', () => {
    it('generates sequential transformation steps', () => {
      const transformations: StateTransformation[] = [
        {
          stateId: 'state1',
          timestamp: 1000,
          operation: 'update',
          source: 'test',
          before: { value: 1 },
          after: { value: 2 },
        },
        {
          stateId: 'state1',
          timestamp: 2000,
          operation: 'merge',
          source: 'test',
          before: { value: 2 },
          after: { value: 3 },
        },
      ];
      
      mockHistoryService.getTransformationChain.mockReturnValue(transformations);
      
      const result = visualizationService.generateTransitionDiagram('state1', {
        format: 'mermaid',
        includeTimestamps: true,
      });
      
      // Verify transformation sequence
      expect(result).toContain('graph LR;'); // Left to right flow
      expect(result).toContain('value: 1');
      expect(result).toContain('value: 2');
      expect(result).toContain('value: 3');
      expect(result).toContain('update');
      expect(result).toContain('merge');
      expect(result).toMatch(/1000.*update/); // Timestamp with operation
      expect(result).toMatch(/2000.*merge/);
    });

    it('handles complex state values in transformations', () => {
      const transformations: StateTransformation[] = [
        {
          stateId: 'state1',
          timestamp: 1000,
          operation: 'update',
          source: 'test',
          before: { nested: { value: 1, array: [1, 2] } },
          after: { nested: { value: 2, array: [2, 3] } },
        },
      ];
      
      mockHistoryService.getTransformationChain.mockReturnValue(transformations);
      
      const result = visualizationService.generateTransitionDiagram('state1', {
        format: 'mermaid',
        includeTimestamps: true,
      });
      
      // Verify complex value handling
      expect(result).toContain('nested.value: 1');
      expect(result).toContain('nested.value: 2');
      expect(result).toContain('array: [1,2]');
      expect(result).toContain('array: [2,3]');
    });
  });

  describe('Timeline Generation', () => {
    it('handles overlapping operations from multiple states', () => {
      const state1Ops: StateOperation[] = [
        { type: 'create', stateId: 'state1', source: 'test', timestamp: 1000 },
        { type: 'transform', stateId: 'state1', source: 'test', timestamp: 3000 },
      ];
      const state2Ops: StateOperation[] = [
        { type: 'create', stateId: 'state2', source: 'test', timestamp: 2000 },
        { type: 'transform', stateId: 'state2', source: 'test', timestamp: 4000 },
      ];
      
      mockHistoryService.getOperationHistory
        .mockReturnValueOnce(state1Ops)
        .mockReturnValueOnce(state2Ops);
      
      const result = visualizationService.generateTimeline(['state1', 'state2'], {
        format: 'mermaid',
        includeTimestamps: true,
      });
      
      // Verify timeline format
      expect(result).toContain('gantt');
      expect(result).toMatch(/1000.*state1.*create/);
      expect(result).toMatch(/2000.*state2.*create/);
      expect(result).toMatch(/3000.*state1.*transform/);
      expect(result).toMatch(/4000.*state2.*transform/);
    });

    it('groups operations by state in timeline', () => {
      const state1Ops: StateOperation[] = [
        { type: 'create', stateId: 'state1', source: 'test', timestamp: 1000 },
        { type: 'transform', stateId: 'state1', source: 'test', timestamp: 2000 },
      ];
      
      mockHistoryService.getOperationHistory.mockReturnValue(state1Ops);
      
      const result = visualizationService.generateTimeline(['state1'], {
        format: 'mermaid',
        includeTimestamps: true,
      });
      
      // Verify state grouping
      expect(result).toContain('section state1');
      expect(result).toMatch(/create.*1000/);
      expect(result).toMatch(/transform.*2000/);
    });
  });

  describe('Metrics Calculation', () => {
    it('calculates complex metrics correctly', () => {
      const operations: StateOperation[] = [
        { type: 'create', stateId: 'state1', source: 'new', timestamp: 1000 },
        { type: 'create', stateId: 'state2', source: 'clone', timestamp: 2000 },
        { type: 'transform', stateId: 'state1', source: 'test', timestamp: 3000 },
        { type: 'transform', stateId: 'state1', source: 'test', timestamp: 4000 },
        { type: 'merge', stateId: 'state3', source: 'merge', timestamp: 5000 },
      ];
      
      mockHistoryService.queryHistory.mockReturnValue(operations);
      
      const metrics = visualizationService.getMetrics();
      
      expect(metrics.totalStates).toBe(3);
      expect(metrics.statesByType).toEqual({
        new: 1,
        clone: 1,
        merge: 1,
      });
      expect(metrics.averageTransformationsPerState).toBe(2/3); // 2 transforms / 3 states
      expect(metrics.operationFrequency).toEqual({
        create: 2,
        transform: 2,
        merge: 1,
      });
    });

    it('calculates tree depth metrics', () => {
      // Mock a tree structure: root -> child1 -> grandchild
      mockTrackingService.getStateLineage
        .mockReturnValueOnce(['root'])
        .mockReturnValueOnce(['root', 'child1'])
        .mockReturnValueOnce(['root', 'child1', 'grandchild']);
      
      const operations: StateOperation[] = [
        { type: 'create', stateId: 'root', source: 'new', timestamp: 1000 },
        { type: 'create', stateId: 'child1', source: 'new', timestamp: 2000 },
        { type: 'create', stateId: 'grandchild', source: 'new', timestamp: 3000 },
      ];
      
      mockHistoryService.queryHistory.mockReturnValue(operations);
      
      const metrics = visualizationService.getMetrics();
      
      expect(metrics.maxTreeDepth).toBe(3); // root -> child1 -> grandchild
      expect(metrics.averageChildrenPerState).toBe(1); // Each parent has 1 child
    });
  });

  describe('Relationship Graph Generation', () => {
    beforeEach(() => {
      // Mock state metadata
      mockHistoryService.getOperationHistory.mockImplementation((stateId) => {
        const operations: StateOperation[] = [];
        if (stateId === 'root') {
          operations.push({
            type: 'create',
            stateId: 'root',
            source: 'new',
            timestamp: 1000,
            metadata: {
              id: 'root',
              source: 'new',
              transformationEnabled: true,
              createdAt: 1000,
            },
          });
        } else if (stateId === 'child1') {
          operations.push({
            type: 'create',
            stateId: 'child1',
            source: 'clone',
            timestamp: 2000,
            metadata: {
              id: 'child1',
              source: 'clone',
              transformationEnabled: true,
              createdAt: 2000,
            },
          });
        } else if (stateId === 'merged') {
          operations.push({
            type: 'merge',
            stateId: 'merged',
            source: 'merge',
            timestamp: 3000,
            parentId: 'root',
            metadata: {
              id: 'merged',
              source: 'merge',
              transformationEnabled: true,
              createdAt: 3000,
            },
          });
        }
        return operations;
      });

      // Mock lineage and descendants
      mockTrackingService.getStateLineage.mockImplementation((stateId) => {
        switch (stateId) {
          case 'root':
            return ['root'];
          case 'child1':
            return ['root', 'child1'];
          case 'merged':
            return ['root', 'merged'];
          default:
            return [];
        }
      });

      mockTrackingService.getStateDescendants.mockImplementation((stateId) => {
        switch (stateId) {
          case 'root':
            return ['child1', 'merged'];
          default:
            return [];
        }
      });
    });

    it('generates mermaid format relationship graph', () => {
      const result = visualizationService.generateRelationshipGraph(['root'], {
        format: 'mermaid',
        includeMetadata: true,
      });

      // Check basic structure
      expect(result).toContain('graph TD;');
      
      // Check nodes
      expect(result).toContain('root[new]');
      expect(result).toContain('child1[clone]');
      expect(result).toContain('merged[merge]');
      
      // Check relationships
      expect(result).toMatch(/root.*-->.*child1/);
      expect(result).toMatch(/root.*-->.*merged/);
      
      // Check styling
      expect(result).toMatch(/style.*fill:#[0-9A-F]{6}/);
      expect(result).toMatch(/linkStyle.*stroke:/);
    });

    it('generates dot format relationship graph', () => {
      const result = visualizationService.generateRelationshipGraph(['root'], {
        format: 'dot',
        includeMetadata: true,
      });

      // Check basic structure
      expect(result).toContain('digraph G {');
      expect(result).toContain('rankdir=TB;');
      
      // Check nodes
      expect(result).toMatch(/"root".*label="root\\nnew"/);
      expect(result).toMatch(/"child1".*label="child1\\nclone"/);
      expect(result).toMatch(/"merged".*label="merged\\nmerge"/);
      
      // Check relationships
      expect(result).toMatch(/"root".*->.*"child1"/);
      expect(result).toMatch(/"root".*->.*"merged"/);
      
      // Check styling
      expect(result).toMatch(/shape="[^"]+"/);
      expect(result).toMatch(/color="#[0-9A-F]{6}"/);
      expect(result).toMatch(/style="[^"]+"/);
    });

    it('generates json format relationship graph', () => {
      const result = visualizationService.generateRelationshipGraph(['root'], {
        format: 'json',
        includeMetadata: true,
      });

      const parsed = JSON.parse(result);
      
      // Check structure
      expect(parsed).toHaveProperty('nodes');
      expect(parsed).toHaveProperty('edges');
      
      // Check nodes
      expect(parsed.nodes).toHaveLength(3); // root, child1, merged
      expect(parsed.nodes.find((n: any) => n.id === 'root')).toBeTruthy();
      expect(parsed.nodes.find((n: any) => n.id === 'child1')).toBeTruthy();
      expect(parsed.nodes.find((n: any) => n.id === 'merged')).toBeTruthy();
      
      // Check edges
      expect(parsed.edges).toContainEqual(expect.objectContaining({
        sourceId: 'root',
        targetId: 'child1',
        type: 'parent-child',
      }));
      expect(parsed.edges).toContainEqual(expect.objectContaining({
        sourceId: 'root',
        targetId: 'merged',
        type: 'merge-source',
      }));
    });

    it('handles cycles in state relationships', () => {
      // Mock a cyclic relationship
      mockTrackingService.getStateLineage.mockImplementation((stateId) => {
        switch (stateId) {
          case 'state1':
            return ['state1', 'state2'];
          case 'state2':
            return ['state2', 'state1'];
          default:
            return [];
        }
      });

      const result = visualizationService.generateRelationshipGraph(['state1', 'state2'], {
        format: 'json',
        includeMetadata: true,
      });

      const parsed = JSON.parse(result);
      expect(parsed.nodes).toBeDefined();
      expect(parsed.edges).toBeDefined();
      // Should not enter infinite recursion
    });

    it('handles empty state set', () => {
      const result = visualizationService.generateRelationshipGraph([], {
        format: 'mermaid',
        includeMetadata: true,
      });

      expect(result).toContain('graph TD;');
      expect(result.split('\n')).toHaveLength(1); // Only contains header
    });

    it('throws error for unsupported format', () => {
      expect(() => 
        visualizationService.generateRelationshipGraph(['root'], {
          format: 'invalid' as any,
          includeMetadata: true,
        })
      ).toThrow('Unsupported format: invalid');
    });
  });
}); 