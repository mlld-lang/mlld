import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateDebuggerService } from './StateDebuggerService';
import { IStateVisualizationService } from '../StateVisualizationService/IStateVisualizationService';
import { IStateHistoryService } from '../StateHistoryService/IStateHistoryService';
import { IStateTrackingService } from '../StateTrackingService/IStateTrackingService';
import { StateDiagnostic, DebugSessionConfig } from './IStateDebuggerService';

describe('StateDebuggerService', () => {
  // Mock data
  const mockMetadata = {
    type: 'test',
    childStates: ['child1', 'child2'],
    lastModified: Date.now(),
    parentState: null,
    variables: {},
    source: 'test'
  };

  const mockHistory = {
    transformations: [{ type: 'test', timestamp: Date.now() }],
    operations: []
  };

  // Mock services
  const mockVisualizationService = {
    exportStateGraph: vi.fn().mockReturnValue('graph-data'),
    generateHierarchyView: vi.fn(),
    generateTransitionDiagram: vi.fn(),
    generateRelationshipGraph: vi.fn(),
    generateTimeline: vi.fn(),
    getMetrics: vi.fn(),
  } as unknown as IStateVisualizationService;

  const mockHistoryService = {
    getStateHistory: vi.fn().mockResolvedValue(mockHistory),
  } as unknown as IStateHistoryService;

  const mockTrackingService = {
    getStateMetadata: vi.fn().mockResolvedValue(mockMetadata),
  } as unknown as IStateTrackingService;

  let debugService: StateDebuggerService;
  let testSessionId: string;
  const testStateId = 'test-state-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockHistoryService.getStateHistory.mockResolvedValue(mockHistory);
    mockTrackingService.getStateMetadata.mockResolvedValue(mockMetadata);
    debugService = new StateDebuggerService(
      mockVisualizationService,
      mockHistoryService,
      mockTrackingService
    );
  });

  describe('Session Management', () => {
    it('should create a new debug session', () => {
      const config: DebugSessionConfig = {
        captureConfig: {
          capturePoints: ['pre-transform', 'post-transform'],
          includeFields: ['nodes'],
          format: 'full'
        }
      };

      const sessionId = debugService.startSession(config);
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe('string');
    });

    it('should end a debug session and return results', async () => {
      const config: DebugSessionConfig = {
        captureConfig: {
          capturePoints: ['pre-transform'],
          includeFields: ['nodes'],
          format: 'full'
        },
        visualization: { format: 'mermaid' }
      };

      const sessionId = debugService.startSession(config);
      const result = await debugService.endSession(sessionId);

      expect(result).toMatchObject({
        sessionId,
        startTime: expect.any(Number),
        endTime: expect.any(Number),
        diagnostics: expect.any(Array),
        snapshots: expect.any(Map),
      });

      expect(mockVisualizationService.exportStateGraph).toHaveBeenCalledWith(
        config.visualization
      );
    });

    it('should throw error when ending non-existent session', async () => {
      await expect(debugService.endSession('invalid-id'))
        .rejects
        .toThrow('No debug session found');
    });
  });

  describe('State Analysis', () => {
    it('should analyze state and return diagnostics', async () => {
      // Setup mock to trigger warnings
      mockHistoryService.getStateHistory.mockResolvedValueOnce({
        transformations: Array(11).fill({ type: 'test' }),
        operations: []
      });
      mockTrackingService.getStateMetadata.mockResolvedValueOnce({
        type: 'test',
        childStates: Array(21).fill('child'),
        lastModified: Date.now(),
        parentState: null,
        variables: {}
      });

      const diagnostics = await debugService.analyzeState(testStateId);

      expect(diagnostics).toHaveLength(2); // Two warnings
      expect(diagnostics.at(0).type).toBe('warning');
      expect(diagnostics.at(0).message).toContain('transformations');
      expect(diagnostics.at(1).type).toBe('warning');
      expect(diagnostics.at(1).message).toContain('child states');
    });

    it('should run custom analyzers during analysis', async () => {
      const customAnalyzer = vi.fn().mockResolvedValue([{
        stateId: testStateId,
        timestamp: Date.now(),
        type: 'info',
        message: 'Custom analysis'
      }]);

      debugService.registerAnalyzer(customAnalyzer);
      const diagnostics = await debugService.analyzeState(testStateId);

      expect(customAnalyzer).toHaveBeenCalledWith(testStateId);
      expect(diagnostics).toContainEqual(expect.objectContaining({
        message: 'Custom analysis'
      }));
    });

    it('should handle missing state data', async () => {
      mockHistoryService.getStateHistory.mockResolvedValueOnce(null);
      mockTrackingService.getStateMetadata.mockResolvedValueOnce(null);

      const diagnostics = await debugService.analyzeState(testStateId);

      expect(diagnostics).toHaveLength(1);
      expect(diagnostics.at(0).type).toBe('error');
      expect(diagnostics.at(0).message).toContain('Failed to retrieve state');
    });
  });

  describe('Operation Tracing', () => {
    it('should trace successful operations', async () => {
      const operation = vi.fn().mockResolvedValue('success');
      
      const { result, diagnostics } = await debugService.traceOperation(
        testStateId,
        operation
      );

      expect(result).toBe('success');
      expect(diagnostics).toEqual(expect.any(Array));
      expect(mockTrackingService.getStateMetadata).toHaveBeenCalled();
      expect(mockHistoryService.getStateHistory).toHaveBeenCalled();
    });

    it('should handle failed operations', async () => {
      const error = new Error('Operation failed');
      const operation = vi.fn().mockRejectedValue(error);

      try {
        await debugService.traceOperation(testStateId, operation);
        fail('Expected operation to throw');
      } catch (e: any) {
        expect(e).toMatchObject({
          error,
          diagnostics: expect.arrayContaining([
            expect.objectContaining({
              type: 'error',
              message: 'Operation failed'
            })
          ])
        });
      }
    });

    it('should handle missing state data during tracing', async () => {
      mockHistoryService.getStateHistory.mockResolvedValue(null);
      mockTrackingService.getStateMetadata.mockResolvedValue(null);
      const operation = vi.fn().mockResolvedValue('success');

      try {
        await debugService.traceOperation(testStateId, operation);
        fail('Expected operation to throw');
      } catch (e: any) {
        expect(e.error.message).toContain('Failed to retrieve state data');
      }
    });
  });

  describe('State Snapshots', () => {
    it('should get full state snapshot', async () => {
      const snapshot = await debugService.getStateSnapshot(testStateId, 'full');

      expect(snapshot).toMatchObject({
        metadata: mockMetadata,
        history: mockHistory,
        children: expect.any(Array)
      });

      expect(snapshot.children).toHaveLength(mockMetadata.childStates.length);
    });

    it('should get summary state snapshot', async () => {
      const snapshot = await debugService.getStateSnapshot(testStateId, 'summary');

      expect(snapshot).toMatchObject({
        id: testStateId,
        type: mockMetadata.source,
        childCount: mockMetadata.childStates.length,
        transformationCount: mockHistory.transformations.length,
        lastModified: expect.any(Number)
      });
    });

    it('should handle missing state data in snapshots', async () => {
      mockHistoryService.getStateHistory.mockResolvedValue(null);
      mockTrackingService.getStateMetadata.mockResolvedValue(null);

      await expect(debugService.getStateSnapshot(testStateId, 'full'))
        .rejects
        .toThrow('Failed to retrieve state data');
    });
  });

  describe('Debug Reports', () => {
    it('should generate debug report', async () => {
      const config: DebugSessionConfig = {
        captureConfig: {
          capturePoints: ['pre-transform'],
          includeFields: ['nodes'],
          format: 'full'
        }
      };

      const sessionId = debugService.startSession(config);
      const report = await debugService.generateDebugReport(sessionId);

      expect(report).toContain('Debug Session Report');
      expect(report).toContain('Duration:');
      expect(report).toContain('Diagnostics:');
      expect(report).toContain('Metrics:');
      expect(report).toContain('Snapshots:');
    });

    it('should throw error for invalid session', async () => {
      await expect(debugService.generateDebugReport('invalid-id'))
        .rejects
        .toThrow('No debug session found');
    });
  });

  describe('Session Cleanup', () => {
    it('should clear session data', async () => {
      const config: DebugSessionConfig = {
        captureConfig: {
          capturePoints: ['pre-transform'],
          includeFields: ['nodes'],
          format: 'full'
        }
      };

      const sessionId = debugService.startSession(config);
      debugService.clearSession(sessionId);

      await expect(debugService.generateDebugReport(sessionId))
        .rejects
        .toThrow('No debug session found');
    });
  });
}); 