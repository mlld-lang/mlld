/**
 * @package
 * Context debugger service that extends the state debugger with context-specific visualization methods.
 * 
 * @remarks
 * This service wraps the StateDebuggerService and adds methods for visualizing context hierarchies,
 * variable propagation, and other context-specific debugging features.
 */

import { StateDebuggerService } from '@tests/utils/debug/StateDebuggerService/StateDebuggerService';
import { IStateVisualizationService } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService';
import { IStateHistoryService } from '@tests/utils/debug/StateHistoryService/IStateHistoryService';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';

/**
 * Configuration for enabling the context debugger
 */
export interface ContextDebuggerConfig {
  trackStates?: boolean;
  trackTimestamps?: boolean;
  trackOperations?: boolean;
  trackVariables?: boolean;
}

/**
 * Context debugger service that extends the state debugger with context-specific visualization methods
 */
export class ContextDebuggerService extends StateDebuggerService {
  constructor(
    visualizationService: IStateVisualizationService,
    historyService: IStateHistoryService,
    trackingService: IStateTrackingService
  ) {
    super(visualizationService, historyService, trackingService);
  }

  /**
   * Enable the context debugger with the specified configuration
   * @param config - Configuration for enabling the context debugger
   */
  public enable(config: ContextDebuggerConfig): void {
    // Store the configuration for later use
    this._debugConfig = config;
    
    // No need to call enableTracking as these methods don't exist
    // Just store the configuration for reference
  }

  /**
   * Visualize the context hierarchy starting from the specified root state
   * @param rootStateId - The root state to start visualization from
   * @param format - Output format (mermaid, dot, json)
   * @param options - Visualization options
   * @returns Context hierarchy visualization in the specified format
   */
  public visualizeContextHierarchy(
    rootStateId: string,
    format: 'mermaid' | 'dot' | 'json' = 'mermaid',
    options: {
      includeVars?: boolean;
      includeTimestamps?: boolean;
      includeFilePaths?: boolean;
    } = {}
  ): string {
    return this.visualizationService.visualizeContextHierarchy(rootStateId, {
      format,
      includeVariables: options.includeVars ?? true,
      includeTimestamps: options.includeTimestamps ?? true,
      includeFilePaths: options.includeFilePaths ?? true
    });
  }

  /**
   * Visualize variable propagation across contexts
   * @param variableName - The name of the variable to track propagation for
   * @param rootStateId - Optional root state to limit visualization scope
   * @param format - Output format (mermaid, dot, json)
   * @param options - Visualization options
   * @returns Variable propagation visualization in the specified format
   */
  public visualizeVariablePropagation(
    variableName: string,
    rootStateId: string,
    format: 'mermaid' | 'dot' | 'json' = 'mermaid',
    options: {
      includeTimestamps?: boolean;
      includeFilePaths?: boolean;
    } = {}
  ): string {
    return this.visualizationService.visualizeVariablePropagation(variableName, rootStateId, {
      format,
      includeTimestamps: options.includeTimestamps ?? true,
      includeFilePaths: options.includeFilePaths ?? true,
      includeVariables: true
    });
  }

  /**
   * Visualize contexts and variable flow in a combined diagram
   * @param rootStateId - The root state to start visualization from
   * @param format - Output format (mermaid, dot, json)
   * @returns Combined context and variable flow visualization
   */
  public visualizeContextsAndVariableFlow(
    rootStateId: string,
    format: 'mermaid' | 'dot' | 'json' = 'mermaid'
  ): string {
    return this.visualizationService.visualizeContextsAndVariableFlow(rootStateId, {
      format,
      includeVariables: true,
      includeTimestamps: true,
      includeFilePaths: true
    });
  }

  /**
   * Visualize the timeline of variable resolution
   * @param variableName - The name of the variable to track resolution for
   * @param rootStateId - Optional root state to limit visualization scope
   * @param format - Output format (mermaid, dot, json)
   * @returns Variable resolution timeline visualization
   */
  public visualizeResolutionTimeline(
    variableName: string,
    rootStateId: string,
    format: 'mermaid' | 'dot' | 'json' = 'mermaid'
  ): string {
    return this.visualizationService.visualizeResolutionPathTimeline(variableName, rootStateId, {
      format,
      includeVariables: true,
      includeTimestamps: true,
      includeFilePaths: true
    });
  }

  // Private property to store the debug configuration
  private _debugConfig: ContextDebuggerConfig = {
    trackStates: false,
    trackTimestamps: false,
    trackOperations: false,
    trackVariables: false
  };
} 