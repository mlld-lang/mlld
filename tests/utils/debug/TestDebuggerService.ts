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
    this.recordOperation('startSession', { sessionId, config, timestamp: Date.now() });
    return sessionId;
  }

  async endSession(sessionId: string): Promise<DebugSessionResult> {
    if (this.currentSessionId !== sessionId) {
      throw new Error(`Invalid session ID: ${sessionId}`);
    }
    this.recordOperation('endSession', { sessionId, timestamp: Date.now() });
    this.isEnabled = false;
    this.currentSessionId = null;
    return {
      sessionId,
      operations: this.operations,
      metrics: {
        duration: 0,
        operationCount: this.operations.length,
        errorCount: 0
      }
    };
  }

  analyzeState(config?: StateCaptureConfig): Promise<StateDiagnostic[]> {
    if (!this.isEnabled) return Promise.resolve([]);
    const analysis = {
      textVars: Array.from(this.state.getAllTextVars().entries()),
      dataVars: Array.from(this.state.getAllDataVars().entries())
    };
    this.recordOperation('analyzeState', analysis);
    return Promise.resolve([{
      type: 'state_analysis',
      severity: 'info',
      message: 'State analysis completed',
      details: analysis
    }]);
  }

  traceOperation(operation: string, data: any): void {
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
  }

  async visualizeState(format: 'mermaid' | 'dot' = 'mermaid'): Promise<string> {
    if (!this.isEnabled) return '';
    const stateData = {
      textVars: Array.from(this.state.getAllTextVars().entries()),
      dataVars: Array.from(this.state.getAllDataVars().entries())
    };
    this.recordOperation('visualizeState', { format, stateData });
    return format === 'mermaid' ? 
      'graph TD\n  A[State] --> B[Variables]\n' :
      'digraph { A [label="State"]; B [label="Variables"]; A -> B; }';
  }
} 