/**
 * @package
 * Interface for state debugging service.
 * 
 * @remarks
 * Provides debugging capabilities by integrating state tracking,
 * history, and visualization services. Supports automated diagnostics
 * for failing tests and CLI-based state analysis.
 */

import { VisualizationConfig } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService.js';
import { StateOperation } from '@tests/utils/debug/StateHistoryService/IStateHistoryService.js';
import { StateMetadata } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';

/**
 * Configuration for state capture points
 */
export interface StateCaptureConfig {
  capturePoints: Array<'pre-transform' | 'post-transform' | 'pre-merge' | 'error'>;
  includeFields: Array<'nodes' | 'transformedNodes' | 'variables'>;
  format: 'full' | 'summary';
}

/**
 * Diagnostic result from state analysis
 */
export interface StateDiagnostic {
  stateId: string;
  timestamp: number;
  type: 'error' | 'warning' | 'info';
  message: string;
  context?: {
    operation?: StateOperation;
    metadata?: StateMetadata;
    location?: string;
  };
}

/**
 * Debug session configuration
 */
export interface DebugSessionConfig {
  captureConfig: StateCaptureConfig;
  visualization?: VisualizationConfig;
  traceOperations?: boolean;
  collectMetrics?: boolean;
}

/**
 * Debug session result
 */
export interface DebugSessionResult {
  sessionId: string;
  startTime: number;
  endTime: number;
  diagnostics: StateDiagnostic[];
  snapshots: Map<string, any>;
  metrics?: Record<string, number>;
  visualization?: string;
}

/**
 * Core state debugging service interface
 */
export interface IStateDebuggerService {
  /**
   * Start a new debug session
   * @param config - Debug session configuration
   * @returns Session ID
   */
  startSession(config: DebugSessionConfig): string;

  /**
   * End the current debug session and get results
   * @param sessionId - The session to end
   * @returns Debug session results
   */
  endSession(sessionId: string): Promise<DebugSessionResult>;

  /**
   * Analyze a state for potential issues
   * @param stateId - The state to analyze
   * @returns Array of diagnostics
   */
  analyzeState(stateId: string): Promise<StateDiagnostic[]>;

  /**
   * Trace a state operation and capture debug info
   * @param stateId - The state being operated on
   * @param operation - Function performing the operation
   * @returns Operation result and debug info
   */
  traceOperation<T>(
    stateId: string,
    operation: () => Promise<T>
  ): Promise<{ result: T; diagnostics: StateDiagnostic[] }>;

  /**
   * Get a snapshot of state at a specific point
   * @param stateId - The state to snapshot
   * @param format - Snapshot format ('full' | 'summary')
   * @returns State snapshot
   */
  getStateSnapshot(stateId: string, format: 'full' | 'summary'): Promise<any>;

  /**
   * Generate a CLI-friendly debug report
   * @param sessionId - Debug session to report on
   * @returns Formatted debug report
   */
  generateDebugReport(sessionId: string): Promise<string>;

  /**
   * Register a custom diagnostic analyzer
   * @param analyzer - Function to analyze state and return diagnostics
   */
  registerAnalyzer(
    analyzer: (stateId: string) => Promise<StateDiagnostic[]>
  ): void;

  /**
   * Clear all debug data for a session
   * @param sessionId - Session to clear
   */
  clearSession(sessionId: string): void;
} 