/**
 * @package
 * Interface for state visualization service.
 * 
 * @remarks
 * Provides visualization capabilities for state hierarchies,
 * transitions, relationships, and metrics. Supports multiple
 * output formats for different use cases (e.g., debug, analysis).
 */

import { StateOperation, StateTransformation } from '../StateHistoryService/IStateHistoryService';
import { StateMetadata, StateRelationship } from '../StateTrackingService/IStateTrackingService';

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
} 