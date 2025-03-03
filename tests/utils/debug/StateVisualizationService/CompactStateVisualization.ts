/**
 * @package
 * Enhanced compact state visualization utilities.
 * 
 * This module provides compact visualization formats for state data,
 * optimized for normal test runs with minimal output.
 */

import type { IStateVisualizationService, VisualizationConfig, StateMetrics } from './IStateVisualizationService';
import type { IStateHistoryService, StateOperation, StateTransformation } from '../StateHistoryService/IStateHistoryService';
import type { IStateTrackingService, StateMetadata, StateRelationship } from '../StateTrackingService/IStateTrackingService';
import { serviceLogger } from '@core/utils/logger';

/**
 * Generates compact, test-friendly visualizations of state data
 */
export class CompactStateVisualization {
  constructor(
    private historyService: IStateHistoryService,
    private trackingService: IStateTrackingService,
    private parentService: IStateVisualizationService
  ) {}

  /**
   * Generate a compact summary of a state and its hierarchy
   * @param stateId - The state ID to visualize
   * @returns A compact string representation
   */
  public generateCompactStateSummary(stateId: string): string {
    try {
      // Get state metadata
      const operations = this.historyService.getOperationHistory(stateId);
      const createOp = operations.find(op => op.type === 'create' || op.type === 'merge');
      
      if (!createOp || !createOp.metadata) {
        return `State ${stateId}: No metadata available`;
      }
      
      const metadata = createOp.metadata;
      const lineage = this.trackingService.getStateLineage(stateId);
      const descendants = this.trackingService.getStateDescendants(stateId);
      
      // Format a compact summary
      const lines: string[] = [];
      lines.push(`State ${stateId} (${metadata.source})`);
      
      if (metadata.filePath) {
        lines.push(`  File: ${metadata.filePath}`);
      }
      
      // Add lineage info
      if (lineage.length > 1) {
        const lineageStr = lineage.slice(0, -1).join(' → ');
        lines.push(`  Ancestry: ${lineageStr} → ${stateId}`);
      }
      
      // Add descendant count
      if (descendants.length > 0) {
        lines.push(`  Children: ${descendants.length}`);
      }
      
      // Add operation counts
      const transformCount = operations.filter(op => op.type === 'transform').length;
      if (transformCount > 0) {
        lines.push(`  Transforms: ${transformCount}`);
      }
      
      return lines.join('\n');
    } catch (error) {
      serviceLogger.error('Failed to generate compact state summary', { stateId, error });
      return `State ${stateId}: Error generating summary`;
    }
  }

  /**
   * Generate a compact transformation summary
   * @param stateId - The state ID to visualize transformations for
   * @returns A compact string representation of transformations
   */
  public generateCompactTransformSummary(stateId: string): string {
    try {
      const transformations = this.historyService.getTransformationChain(stateId);
      
      if (transformations.length === 0) {
        return `State ${stateId}: No transformations`;
      }
      
      const lines: string[] = [];
      lines.push(`State ${stateId} transforms (${transformations.length}):`);
      
      // Group transformations by operation type
      const operationGroups = new Map<string, number>();
      transformations.forEach(transform => {
        const count = operationGroups.get(transform.operation) || 0;
        operationGroups.set(transform.operation, count + 1);
      });
      
      // Add operation group summaries
      Array.from(operationGroups.entries()).forEach(([operation, count]) => {
        lines.push(`  ${operation}: ${count}`);
      });
      
      // Add first and last transformation details
      const first = transformations[0];
      const last = transformations[transformations.length - 1];
      
      lines.push(`  First: ${this.formatCompactTransform(first)}`);
      
      if (transformations.length > 1) {
        lines.push(`  Last: ${this.formatCompactTransform(last)}`);
      }
      
      return lines.join('\n');
    } catch (error) {
      serviceLogger.error('Failed to generate compact transform summary', { stateId, error });
      return `State ${stateId}: Error generating transformation summary`;
    }
  }

  /**
   * Generate compact summary of all states in a hierarchy
   * @param rootStateId - The root state to start from
   * @returns A compact text representation
   */
  public generateCompactHierarchySummary(rootStateId: string): string {
    try {
      const descendants = this.trackingService.getStateDescendants(rootStateId);
      const allStates = [rootStateId, ...descendants];
      
      if (allStates.length === 1) {
        return this.generateCompactStateSummary(rootStateId);
      }
      
      const lines: string[] = [];
      lines.push(`State hierarchy from ${rootStateId} (${allStates.length} states):`);
      
      // Add root state
      lines.push(this.generateCompactStateSummary(rootStateId));
      
      // Add direct children only (for brevity)
      const directChildren = descendants.filter(id => {
        const lineage = this.trackingService.getStateLineage(id);
        return lineage[lineage.length - 2] === rootStateId;
      });
      
      if (directChildren.length > 0) {
        lines.push('\nDirect children:');
        directChildren.forEach(childId => {
          lines.push(`- ${this.generateBriefStateSummary(childId)}`);
        });
      }
      
      // Add summary of remaining descendants
      const remainingCount = descendants.length - directChildren.length;
      if (remainingCount > 0) {
        lines.push(`\nAdditional descendants: ${remainingCount}`);
      }
      
      return lines.join('\n');
    } catch (error) {
      serviceLogger.error('Failed to generate compact hierarchy summary', { rootStateId, error });
      return `State ${rootStateId}: Error generating hierarchy summary`;
    }
  }

  /**
   * Generate compact metrics summary
   * @param timeRange - Optional time range
   * @returns A compact text representation of metrics
   */
  public generateCompactMetricsSummary(timeRange?: { start: number; end: number }): string {
    try {
      const metrics = this.parentService.getMetrics(timeRange);
      
      const lines: string[] = [];
      lines.push('State metrics summary:');
      lines.push(`  Total states: ${metrics.totalStates}`);
      
      // Add state type breakdown
      if (Object.keys(metrics.statesByType).length > 0) {
        lines.push('  State types:');
        Object.entries(metrics.statesByType).forEach(([type, count]) => {
          lines.push(`    ${type}: ${count}`);
        });
      }
      
      // Add transformation metrics
      lines.push(`  Avg transforms/state: ${metrics.averageTransformationsPerState.toFixed(1)}`);
      lines.push(`  Max transform chain: ${metrics.maxTransformationChainLength}`);
      
      // Add structure metrics
      lines.push(`  Max tree depth: ${metrics.maxTreeDepth}`);
      lines.push(`  Avg children/state: ${metrics.averageChildrenPerState.toFixed(1)}`);
      
      return lines.join('\n');
    } catch (error) {
      serviceLogger.error('Failed to generate compact metrics summary', { error });
      return 'Error generating metrics summary';
    }
  }

  /**
   * Export a compact state graph summary to a file
   * @param stateIds - The state IDs to include
   * @param outputPath - The output file path
   * @returns Success indicator
   */
  public exportCompactStateGraphToFile(stateIds: string[], outputPath: string): boolean {
    try {
      const fs = require('fs');
      const lines: string[] = [];
      
      lines.push('# State Graph Summary');
      lines.push(`Generated: ${new Date().toISOString()}`);
      lines.push(`States: ${stateIds.length}`);
      lines.push('');
      
      // Add state summaries
      stateIds.forEach(stateId => {
        lines.push(this.generateCompactStateSummary(stateId));
        lines.push('');
      });
      
      // Add transformation summaries
      lines.push('# Transformation Summaries');
      stateIds.forEach(stateId => {
        const transformations = this.historyService.getTransformationChain(stateId);
        if (transformations.length > 0) {
          lines.push(this.generateCompactTransformSummary(stateId));
          lines.push('');
        }
      });
      
      // Add metrics
      lines.push('# Metrics');
      lines.push(this.generateCompactMetricsSummary());
      
      // Write to file
      fs.writeFileSync(outputPath, lines.join('\n'));
      return true;
    } catch (error) {
      serviceLogger.error('Failed to export compact state graph', { stateIds, outputPath, error });
      return false;
    }
  }
  
  /**
   * Format a transformation in a compact way
   * @private
   */
  private formatCompactTransform(transform: StateTransformation): string {
    const beforeKeys = Object.keys(transform.before || {});
    const afterKeys = Object.keys(transform.after || {});
    
    const changedKeys = afterKeys.filter(key => {
      const beforeVal = transform.before?.[key];
      const afterVal = transform.after?.[key];
      return JSON.stringify(beforeVal) !== JSON.stringify(afterVal);
    });
    
    const newKeys = afterKeys.filter(key => !beforeKeys.includes(key));
    const removedKeys = beforeKeys.filter(key => !afterKeys.includes(key));
    
    return `${transform.operation} (${changedKeys.length} changed, ${newKeys.length} added, ${removedKeys.length} removed)`;
  }
  
  /**
   * Generate a very brief single-line summary of a state
   * @private
   */
  private generateBriefStateSummary(stateId: string): string {
    try {
      const operations = this.historyService.getOperationHistory(stateId);
      const createOp = operations.find(op => op.type === 'create' || op.type === 'merge');
      
      if (!createOp || !createOp.metadata) {
        return `State ${stateId}`;
      }
      
      const metadata = createOp.metadata;
      const transformCount = operations.filter(op => op.type === 'transform').length;
      
      return `State ${stateId} (${metadata.source}, ${transformCount} transforms)`;
    } catch (error) {
      return `State ${stateId}`;
    }
  }
}