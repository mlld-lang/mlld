/**
 * @package
 * Interface for state visualization service.
 * 
 * @remarks
 * Provides visualization capabilities for state hierarchies,
 * transitions, relationships, and metrics. Supports multiple
 * output formats for different use cases (e.g., debug, analysis).
 */

import { StateOperation, StateTransformation } from '../StateHistoryService/IStateHistoryService.js';
import { StateMetadata, StateRelationship, ContextBoundary, VariableCrossing } from '../StateTrackingService/IStateTrackingService.js';

/**
 * Supported visualization formats
 */
export type VisualizationFormat = 'mermaid' | 'dot' | 'json';

/**
 * Node styling options for visualizations
 */
export interface NodeStyle {
  shape?: 'box' | 'circle' | 'diamond';
  color?: string;
  label?: string;
  tooltip?: string;
}

/**
 * Edge styling options for visualizations
 */
export interface EdgeStyle {
  style?: 'solid' | 'dashed' | 'dotted';
  color?: string;
  label?: string;
  tooltip?: string;
}

/**
 * Configuration for generating visualizations
 */
export interface VisualizationConfig {
  format: VisualizationFormat;
  includeMetadata?: boolean;
  includeTimestamps?: boolean;
  styleNodes?: (metadata: StateMetadata) => NodeStyle;
  styleEdges?: (relationship: StateRelationship) => EdgeStyle;
  timeRange?: {
    start?: number;
    end?: number;
  };
}

/**
 * Configuration for context visualizations
 */
export interface ContextVisualizationConfig extends VisualizationConfig {
  includeVars?: boolean;
  filterToRelevantVars?: boolean;
  highlightBoundaries?: boolean;
  includeBoundaryTypes?: boolean;
  includeFilePaths?: boolean;
}

/**
 * Basic metrics about the state system
 */
export interface StateMetrics {
  totalStates: number;
  statesByType: Record<string, number>;
  averageTransformationsPerState: number;
  maxTransformationChainLength: number;
  averageChildrenPerState: number;
  maxTreeDepth: number;
  operationFrequency: Record<string, number>;
}

/**
 * Core state visualization service interface
 */
export interface IStateVisualizationService {
  /**
   * Generate a hierarchical view of state relationships
   * @param rootStateId - The root state to start visualization from
   * @param config - Visualization configuration
   * @returns Visualization in the specified format
   */
  generateHierarchyView(rootStateId: string, config: VisualizationConfig): string;

  /**
   * Generate a transition diagram showing state transformations
   * @param stateId - The state to show transitions for
   * @param config - Visualization configuration
   * @returns Visualization in the specified format
   */
  generateTransitionDiagram(stateId: string, config: VisualizationConfig): string;

  /**
   * Generate a relationship graph showing state connections
   * @param stateIds - The states to include in the graph
   * @param config - Visualization configuration
   * @returns Visualization in the specified format
   */
  generateRelationshipGraph(stateIds: string[], config: VisualizationConfig): string;

  /**
   * Generate a timeline view of state operations
   * @param stateIds - The states to include in the timeline
   * @param config - Visualization configuration
   * @returns Visualization in the specified format
   */
  generateTimeline(stateIds: string[], config: VisualizationConfig): string;

  /**
   * Calculate and return metrics about the state system
   * @param timeRange - Optional time range to limit metrics to
   * @returns Object containing various metrics
   */
  getMetrics(timeRange?: { start: number; end: number }): StateMetrics;

  /**
   * Export the complete state graph in the specified format
   * @param config - Visualization configuration
   * @returns Complete state graph visualization
   */
  exportStateGraph(config: VisualizationConfig): string;

  /**
   * Generate a context hierarchy visualization showing context boundaries
   * @param rootStateId - The root state to start visualization from
   * @param config - Context visualization configuration
   * @returns Context hierarchy visualization in the specified format
   */
  visualizeContextHierarchy(rootStateId: string, config: ContextVisualizationConfig): string;

  /**
   * Generate a variable propagation visualization showing how variables move across contexts
   * @param variableName - The name of the variable to track propagation for
   * @param rootStateId - Optional root state to limit visualization scope
   * @param config - Context visualization configuration
   * @returns Variable propagation visualization in the specified format
   */
  visualizeVariablePropagation(variableName: string, rootStateId?: string, config?: ContextVisualizationConfig): string;

  /**
   * Generate a combined context and variable flow visualization
   * @param rootStateId - The root state to start visualization from
   * @param config - Context visualization configuration
   * @returns Combined context and variable flow visualization
   */
  visualizeContextsAndVariableFlow(rootStateId: string, config: ContextVisualizationConfig): string;

  /**
   * Generate a resolution path timeline visualization for a specific variable
   * @param variableName - The name of the variable to track resolution for
   * @param rootStateId - Optional root state to limit visualization scope
   * @param config - Context visualization configuration
   * @returns Resolution path timeline visualization
   */
  visualizeResolutionPathTimeline(variableName: string, rootStateId?: string, config?: ContextVisualizationConfig): string;
} 