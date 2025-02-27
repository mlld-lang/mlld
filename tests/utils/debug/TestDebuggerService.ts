import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IStateDebuggerService, DebugSessionConfig, DebugSessionResult, StateCaptureConfig, StateDiagnostic } from './StateDebuggerService/IStateDebuggerService.js';

export interface DebugData {
  operations: Array<{
    type: string;
    timestamp: number;
    data: any;
  }>;
}

export class TestDebuggerService implements IStateDebuggerService {
  private operations: Array<{
    type: string;
    timestamp: number;
    data: any;
  }> = [];
  private isEnabled = false;
  private currentSessionId: string | null = null;
  private sessionStartTime: number | null = null;
  private analyzers: Array<(stateId: string) => Promise<StateDiagnostic[]>> = [];
  private snapshots = new Map<string, any>();

  constructor(private state: IStateService) {}

  initialize(state: IStateService): void {
    this.state = state;
    this.isEnabled = true;
    this.recordOperation('initialize', { state: 'initialized' });
  }

  async startSession(config?: DebugSessionConfig): Promise<string> {
    this.isEnabled = true;
    const sessionId = `session-${Date.now()}`;
    this.currentSessionId = sessionId;
    this.sessionStartTime = Date.now();
    this.recordOperation('startSession', { sessionId, config, timestamp: this.sessionStartTime });
    return sessionId;
  }

  async endSession(sessionId: string): Promise<DebugSessionResult> {
    if (this.currentSessionId !== sessionId) {
      throw new Error(`Invalid session ID: ${sessionId}`);
    }
    const endTime = Date.now();
    this.recordOperation('endSession', { sessionId, timestamp: endTime });
    this.isEnabled = false;
    const result: DebugSessionResult = {
      sessionId,
      startTime: this.sessionStartTime || endTime,
      endTime,
      diagnostics: [],
      snapshots: this.snapshots,
      metrics: {
        duration: endTime - (this.sessionStartTime || endTime),
        operationCount: this.operations.length,
        errorCount: 0
      }
    };
    this.currentSessionId = null;
    this.sessionStartTime = null;
    return result;
  }

  async analyzeState(stateId: string): Promise<StateDiagnostic[]> {
    if (!this.isEnabled) return [];
    const analysis = {
      textVars: Array.from(this.state.getAllTextVars().entries()),
      dataVars: Array.from(this.state.getAllDataVars().entries()),
      nodes: this.state.getNodes(),
      transformedNodes: this.state.getTransformedNodes()
    };
    this.recordOperation('analyzeState', { stateId, analysis });
    
    // Run all registered analyzers
    const diagnostics: StateDiagnostic[] = [];
    for (const analyzer of this.analyzers) {
      const results = await analyzer(stateId);
      diagnostics.push(...results);
    }
    
    return diagnostics;
  }

  async traceOperation<T>(stateId: string, operation: () => Promise<T>): Promise<{ result: T; diagnostics: StateDiagnostic[] }> {
    if (!this.isEnabled) {
      const result = await operation();
      return { result, diagnostics: [] };
    }

    this.recordOperation('traceStart', { stateId });
    try {
      const result = await operation();
      this.recordOperation('traceEnd', { stateId, success: true });
      return { result, diagnostics: [] };
    } catch (error) {
      this.recordOperation('traceEnd', { stateId, success: false, error });
      throw error;
    }
  }

  async getStateSnapshot(stateId: string, format: 'full' | 'summary'): Promise<any> {
    if (!this.isEnabled) return null;
    const snapshot = {
      stateId,
      format,
      timestamp: Date.now(),
      textVars: Array.from(this.state.getAllTextVars().entries()),
      dataVars: Array.from(this.state.getAllDataVars().entries()),
      nodes: this.state.getNodes(),
      transformedNodes: this.state.getTransformedNodes()
    };
    this.snapshots.set(stateId, snapshot);
    this.recordOperation('snapshot', { stateId, format });
    return snapshot;
  }

  async generateDebugReport(sessionId: string): Promise<string> {
    if (this.currentSessionId !== sessionId) {
      return 'No active debug session';
    }
    const operations = this.operations.map(op => {
      try {
        // Handle circular references by only including safe properties
        const safeData = Object.entries(op.data).reduce((acc, [key, value]) => {
          // Only include primitive values and simple objects
          if (
            value === null ||
            typeof value === 'undefined' ||
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean' ||
            (typeof value === 'object' && !('constructor' in value))
          ) {
            acc[key] = value;
          } else if (value instanceof Error) {
            acc[key] = {
              name: value.name,
              message: value.message,
              stack: value.stack
            };
          } else {
            acc[key] = `[${typeof value}]`;
          }
          return acc;
        }, {} as Record<string, any>);
        return `${op.type}: ${JSON.stringify(safeData)}`;
      } catch (error) {
        return `${op.type}: [Error stringifying data: ${error.message}]`;
      }
    }).join('\n');
    return `Debug Report for Session ${sessionId}:\n${operations}`;
  }

  registerAnalyzer(analyzer: (stateId: string) => Promise<StateDiagnostic[]>): void {
    this.analyzers.push(analyzer);
  }

  clearSession(sessionId: string): void {
    if (this.currentSessionId === sessionId) {
      this.operations = [];
      this.snapshots.clear();
      this.currentSessionId = null;
      this.sessionStartTime = null;
    }
  }

  async captureState(label: string, data: any): Promise<void> {
    if (!this.isEnabled) return;
    
    // Capture data and operation
    this.recordOperation('captureState', { label, data });
    
    // Take a snapshot but also include the provided data in it
    const snapshot = await this.getStateSnapshot(label, 'full');
    
    // Merge the provided data with the snapshot
    if (snapshot) {
      const updatedSnapshot = { ...snapshot, capturedData: data };
      this.snapshots.set(label, updatedSnapshot);
    }
  }

  traceSimpleOperation(operation: string, data: any): void {
    if (!this.isEnabled) return;
    this.recordOperation('trace', { operation, data });
  }

  recordOperation(type: string, data: any): void {
    if (!this.isEnabled && type !== 'initialize') return;
    this.operations.push({
      type,
      timestamp: Date.now(),
      data
    });
  }

  async getDebugData(): Promise<DebugData> {
    return {
      operations: this.operations
    };
  }

  reset(): void {
    this.operations = [];
    this.isEnabled = false;
    this.currentSessionId = null;
    this.sessionStartTime = null;
    this.snapshots.clear();
  }

  async visualizeState(format: 'mermaid' | 'dot' = 'mermaid'): Promise<string> {
    if (!this.isEnabled) return '';
    const stateData = {
      textVars: Array.from(this.state.getAllTextVars().entries()),
      dataVars: Array.from(this.state.getAllDataVars().entries()),
      nodes: this.state.getNodes(),
      transformedNodes: this.state.getTransformedNodes()
    };
    this.recordOperation('visualizeState', { format, stateData });
    return format === 'mermaid' ? 
      'graph TD\n  A[State] --> B[Variables]\n  A --> C[Nodes]\n  A --> D[TransformedNodes]\n' :
      'digraph { A [label="State"]; B [label="Variables"]; C [label="Nodes"]; D [label="TransformedNodes"]; A -> B; A -> C; A -> D; }';
  }
} 