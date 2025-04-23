/**
 * @package
 * Implementation of state debugging service.
 */

import type { IStateDebuggerService, DebugSessionConfig, DebugSessionResult, StateDiagnostic } from '@tests/utils/debug/StateDebuggerService/IStateDebuggerService';
import type { IStateVisualizationService } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService';
import type { IStateHistoryService } from '@tests/utils/debug/StateHistoryService/IStateHistoryService';
import type { IStateTrackingService, StateMetadata } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Implements debugging capabilities by integrating state tracking,
 * history, and visualization services.
 */
export class StateDebuggerService implements IStateDebuggerService {
  private sessions: Map<string, {
    config: DebugSessionConfig;
    startTime: number;
    diagnostics: StateDiagnostic[];
    snapshots: Map<string, any>;
    metrics: Record<string, number>;
  }> = new Map();

  private analyzers: Array<(stateId: string) => Promise<StateDiagnostic[]>> = [];

  constructor(
    private visualizationService: IStateVisualizationService,
    private historyService: IStateHistoryService,
    private trackingService: IStateTrackingService
  ) {}

  public startSession(config: DebugSessionConfig): string {
    const sessionId = uuidv4();
    this.sessions.set(sessionId, {
      config,
      startTime: Date.now(),
      diagnostics: [],
      snapshots: new Map(),
      metrics: {},
    });
    return sessionId;
  }

  public async endSession(sessionId: string): Promise<DebugSessionResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No debug session found with ID: ${sessionId}`);
    }

    const result: DebugSessionResult = {
      sessionId,
      startTime: session.startTime,
      endTime: Date.now(),
      diagnostics: session.diagnostics,
      snapshots: session.snapshots,
      metrics: session.metrics,
    };

    if (session.config.visualization) {
      result.visualization = this.visualizationService.exportStateGraph(
        session.config.visualization
      );
    }

    return result;
  }

  public async analyzeState(stateId: string): Promise<StateDiagnostic[]> {
    const diagnostics: StateDiagnostic[] = [];
    
    try {
      // Run all registered analyzers
      for (const analyzer of this.analyzers) {
        try {
          const results = await analyzer(stateId);
          if (results) {
            diagnostics.push(...results);
          }
        } catch (error) {
          diagnostics.push({
            stateId,
            timestamp: Date.now(),
            type: 'error',
            message: `Custom analyzer failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          });
        }
      }

      // Add basic state analysis
      const [metadata, history] = await Promise.all([
        this.trackingService.getStateMetadata(stateId),
        this.historyService.getStateHistory(stateId)
      ]);

      if (!metadata || !history) {
        diagnostics.push({
          stateId,
          timestamp: Date.now(),
          type: 'error',
          message: 'Failed to retrieve state metadata or history'
        });
        return diagnostics;
      }

      // Check for common issues
      if ((metadata.childStates?.length ?? 0) > 10) {
        diagnostics.push({
          stateId,
          timestamp: Date.now(),
          type: 'warning',
          message: 'High number of transformations may indicate complexity issues',
          context: { metadata }
        });
      }

      if ((metadata.childStates?.length ?? 0) > 20) {
        diagnostics.push({
          stateId,
          timestamp: Date.now(),
          type: 'warning',
          message: 'Large number of child states may impact performance',
          context: { metadata }
        });
      }

      return diagnostics;
    } catch (error) {
      return [{
        stateId,
        timestamp: Date.now(),
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error during analysis'
      }];
    }
  }

  public async traceOperation<T>(
    stateId: string,
    operation: () => Promise<T>
  ): Promise<{ result: T; diagnostics: StateDiagnostic[] }> {
    try {
      const startSnapshot = await this.getStateSnapshot(stateId, 'full');
      const startTime = Date.now();
      
      const result = await operation();
      const endSnapshot = await this.getStateSnapshot(stateId, 'full');
      
      // Compare snapshots for changes
      const diagnostics = await this.analyzeStateChanges(
        stateId,
        startSnapshot,
        endSnapshot,
        startTime
      );

      return { result, diagnostics };
    } catch (error) {
      let metadata;
      try {
        metadata = await this.trackingService.getStateMetadata(stateId);
      } catch {
        // Ignore metadata fetch errors in error handling
      }

      const diagnostics: StateDiagnostic[] = [{
        stateId,
        timestamp: Date.now(),
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error',
        context: { metadata }
      }];

      throw { error, diagnostics };
    }
  }

  public async getStateSnapshot(stateId: string, format: 'full' | 'summary'): Promise<any> {
    const metadata = await this.trackingService.getStateMetadata(stateId);
    const history = await this.historyService.getStateHistory(stateId);

    if (!metadata || !history) {
      throw new Error(`Failed to retrieve state data for ID: ${stateId}`);
    }

    if (format === 'summary') {
      return {
        id: stateId,
        type: metadata.source,
        childCount: (metadata.childStates || []).length,
        transformationCount: history.transformations.length,
        lastModified: metadata.lastModified || metadata.createdAt
      };
    }

    const children = await Promise.all(
      (metadata.childStates || []).map(async (id: string) => {
        try {
          return await this.getStateSnapshot(id, 'summary');
        } catch {
          return {
            id,
            type: 'unknown',
            childCount: 0,
            transformationCount: 0,
            lastModified: Date.now()
          };
        }
      })
    );

    return {
      metadata,
      history,
      children
    };
  }

  public async generateDebugReport(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No debug session found with ID: ${sessionId}`);
    }

    const lines: string[] = [
      `Debug Session Report (${sessionId})`,
      `Duration: ${(Date.now() - session.startTime) / 1000}s`,
      '',
      'Diagnostics:',
      ...session.diagnostics.map(d => 
        `[${d.type.toUpperCase()}] ${d.message}`
      ),
      '',
      'Metrics:',
      ...Object.entries(session.metrics).map(([k, v]) => 
        `${k}: ${v}`
      ),
      '',
      'Snapshots:',
      ...Array.from(session.snapshots.entries()).map(([k, v]) =>
        `${k}: ${JSON.stringify(v, null, 2)}`
      )
    ];

    return lines.join('\n');
  }

  public registerAnalyzer(
    analyzer: (stateId: string) => Promise<StateDiagnostic[]>
  ): void {
    this.analyzers.push(analyzer);
  }

  public clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private async analyzeStateChanges(
    stateId: string,
    before: any,
    after: any,
    startTime: number
  ): Promise<StateDiagnostic[]> {
    const diagnostics: StateDiagnostic[] = [];
    
    try {
      const metadata = await this.trackingService.getStateMetadata(stateId);

      if (!metadata) {
        return [{
          stateId,
          timestamp: Date.now(),
          type: 'error',
          message: 'Failed to retrieve state metadata for change analysis'
        }];
      }

      // Analyze structural changes
      const beforeChildCount = before?.metadata?.childStates?.length || 0;
      const afterChildCount = after?.metadata?.childStates?.length || 0;
      
      if (beforeChildCount !== afterChildCount) {
        diagnostics.push({
          stateId,
          timestamp: Date.now(),
          type: 'info',
          message: `Child state count changed from ${beforeChildCount} to ${afterChildCount}`,
          context: { metadata }
        });
      }

      // Analyze transformation changes
      const beforeTransformCount = before?.history?.transformations?.length || 0;
      const afterTransformCount = after?.history?.transformations?.length || 0;
      const newTransformations = afterTransformCount - beforeTransformCount;
      
      if (newTransformations > 0) {
        diagnostics.push({
          stateId,
          timestamp: Date.now(),
          type: 'info',
          message: `${newTransformations} new transformations applied`,
          context: { metadata }
        });
      }

      return diagnostics;
    } catch (error) {
      return [{
        stateId,
        timestamp: Date.now(),
        type: 'error',
        message: error instanceof Error ? error.message : 'Unknown error during change analysis'
      }];
    }
  }
} 