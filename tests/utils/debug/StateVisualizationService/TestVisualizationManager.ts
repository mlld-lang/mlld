/**
 * @package
 * Test visualization manager for state debugging.
 * 
 * This module provides a simplified interface for test state visualization,
 * with support for different verbosity levels based on test configuration.
 */

import type { IStateVisualizationService, VisualizationConfig, ContextVisualizationConfig } from '@tests/utils/debug/StateVisualizationService/IStateVisualizationService';
import type { IStateHistoryService } from '@tests/utils/debug/StateHistoryService/IStateHistoryService';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import { StateVisualizationFileOutput, FileOutputConfig } from '@tests/utils/debug/StateVisualizationService/FileOutputService';
import { CompactStateVisualization } from '@tests/utils/debug/StateVisualizationService/CompactStateVisualization';
import { serviceLogger } from '@core/utils/logger';

/**
 * Verbosity levels for test output
 */
export enum TestOutputVerbosity {
  /**
   * Minimal output - only error information
   */
  Minimal = 'minimal',
  
  /**
   * Standard output - errors plus basic test state info
   */
  Standard = 'standard',
  
  /**
   * Verbose output - detailed state information 
   */
  Verbose = 'verbose',
  
  /**
   * Debug output - maximum detail for troubleshooting
   */
  Debug = 'debug'
}

/**
 * Configuration for test visualization manager
 */
export interface TestVisualizationConfig {
  /**
   * Verbosity level for console output
   */
  verbosity?: TestOutputVerbosity;
  
  /**
   * If true, visualizations will be written to files instead of console
   */
  outputToFiles?: boolean;
  
  /**
   * Base directory for file outputs
   */
  outputDir?: string;
  
  /**
   * Default visualization format
   */
  defaultFormat?: 'mermaid' | 'dot' | 'json';
  
  /**
   * If true, system state metrics will be included
   */
  includeMetrics?: boolean;
}

/**
 * Manages state visualizations for test environments
 */
export class TestVisualizationManager {
  private fileOutput: StateVisualizationFileOutput;
  private compactVis: CompactStateVisualization;
  private verbosity: TestOutputVerbosity;
  private outputToFiles: boolean;
  private defaultFormat: 'mermaid' | 'dot' | 'json';
  private includeMetrics: boolean;
  
  /**
   * Create a new test visualization manager
   */
  constructor(
    private visualizationService: IStateVisualizationService,
    private historyService: IStateHistoryService,
    private trackingService: IStateTrackingService,
    config: TestVisualizationConfig = {}
  ) {
    this.verbosity = this.resolveVerbosity(config.verbosity);
    this.outputToFiles = config.outputToFiles ?? false;
    this.defaultFormat = config.defaultFormat || 'mermaid';
    this.includeMetrics = config.includeMetrics ?? true;
    
    // Initialize file output service if needed
    const fileConfig: FileOutputConfig = {
      outputDir: config.outputDir || './logs/state-visualization'
    };
    this.fileOutput = new StateVisualizationFileOutput(fileConfig);
    
    // Initialize compact visualization service
    this.compactVis = new CompactStateVisualization(
      this.historyService,
      this.trackingService,
      this.visualizationService
    );
    
    serviceLogger.debug('Test visualization manager initialized', { 
      verbosity: this.verbosity,
      outputToFiles: this.outputToFiles,
      defaultFormat: this.defaultFormat
    });
  }
  
  /**
   * Visualize a state with appropriate verbosity
   * @param stateId - The state ID to visualize
   * @param label - Optional label for the visualization
   * @returns The visualization result as string or file path
   */
  public visualizeState(stateId: string, label?: string): string | null {
    try {
      // Early return for minimal verbosity
      if (this.verbosity === TestOutputVerbosity.Minimal) {
        return null;
      }
      
      // Handle different verbosity levels
      if (this.verbosity === TestOutputVerbosity.Standard) {
        return this.handleStandardVerbosity(stateId, label);
      } else if (this.verbosity === TestOutputVerbosity.Verbose) {
        return this.handleVerboseVerbosity(stateId, label);
      } else if (this.verbosity === TestOutputVerbosity.Debug) {
        return this.handleDebugVerbosity(stateId, label);
      }
      
      return null;
    } catch (error) {
      serviceLogger.error('Failed to visualize state', { stateId, error });
      return `Error visualizing state ${stateId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
  
  /**
   * Visualize multiple states with appropriate verbosity
   * @param stateIds - The state IDs to visualize
   * @param label - Optional label for the visualization
   * @returns The visualization result as string or file path
   */
  public visualizeStates(stateIds: string[], label?: string): string | null {
    try {
      // Early return for minimal verbosity
      if (this.verbosity === TestOutputVerbosity.Minimal || stateIds.length === 0) {
        return null;
      }
      
      if (stateIds.length === 1) {
        return this.visualizeState(stateIds[0], label);
      }
      
      // For relationship visualizations
      const fileName = `state_relationship_${label || 'graph'}`;
      
      if (this.verbosity === TestOutputVerbosity.Standard) {
        // Compact summary of states
        const summary = stateIds.map(id => this.compactVis.generateCompactStateSummary(id)).join('\n\n');
        
        if (this.outputToFiles) {
          return this.fileOutput.writeToFile(summary, fileName, 'text');
        }
        
        return summary;
      } else {
        // Generate relationship graph with appropriate detail level
        const config: VisualizationConfig = {
          format: this.defaultFormat,
          includeMetadata: this.verbosity === TestOutputVerbosity.Debug,
          includeTimestamps: this.verbosity === TestOutputVerbosity.Debug,
        };
        
        const visualization = this.visualizationService.generateRelationshipGraph(stateIds, config);
        
        if (this.outputToFiles) {
          if (this.defaultFormat === 'mermaid') {
            return this.fileOutput.writeMermaidHtml(visualization, fileName, label);
          } else {
            return this.fileOutput.writeToFile(visualization, fileName, this.defaultFormat);
          }
        }
        
        return visualization;
      }
    } catch (error) {
      serviceLogger.error('Failed to visualize states', { stateIds, error });
      return `Error visualizing states: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
  
  /**
   * Visualize variable resolution across states
   * @param variableName - The variable name to trace
   * @param rootStateId - Optional root state to limit scope
   * @param label - Optional label for the visualization
   * @returns The visualization result as string or file path
   */
  public visualizeVariableResolution(variableName: string, rootStateId?: string, label?: string): string | null {
    try {
      // Early return for minimal verbosity
      if (this.verbosity === TestOutputVerbosity.Minimal) {
        return null;
      }
      
      const fileName = `variable_resolution_${variableName}_${label || 'trace'}`;
      
      // Different detail levels based on verbosity
      const config: ContextVisualizationConfig = {
        format: this.defaultFormat,
        includeVars: true,
        includeFilePaths: this.verbosity !== TestOutputVerbosity.Standard,
        includeTimestamps: this.verbosity === TestOutputVerbosity.Debug,
        filterToRelevantVars: this.verbosity !== TestOutputVerbosity.Debug,
      };
      
      const visualization = this.visualizationService.visualizeVariablePropagation(
        variableName,
        rootStateId,
        config
      );
      
      if (this.outputToFiles) {
        if (this.defaultFormat === 'mermaid') {
          return this.fileOutput.writeMermaidHtml(visualization, fileName, `Variable: ${variableName}`);
        } else {
          return this.fileOutput.writeToFile(visualization, fileName, this.defaultFormat);
        }
      }
      
      return visualization;
    } catch (error) {
      serviceLogger.error('Failed to visualize variable resolution', { variableName, rootStateId, error });
      return `Error visualizing variable resolution: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
  
  /**
   * Generate state metrics appropriate for the configured verbosity
   * @returns The metrics result as string or file path
   */
  public generateMetrics(): string | null {
    try {
      // Skip metrics if not enabled or minimal verbosity
      if (!this.includeMetrics || this.verbosity === TestOutputVerbosity.Minimal) {
        return null;
      }
      
      const fileName = 'state_metrics';
      
      if (this.verbosity === TestOutputVerbosity.Standard) {
        // Generate compact metrics summary
        const summary = this.compactVis.generateCompactMetricsSummary();
        
        if (this.outputToFiles) {
          return this.fileOutput.writeToFile(summary, fileName, 'text');
        }
        
        return summary;
      } else {
        // Generate detailed metrics
        const metrics = this.visualizationService.getMetrics();
        const detailedMetrics = JSON.stringify(metrics, null, 2);
        
        if (this.outputToFiles) {
          return this.fileOutput.writeToFile(detailedMetrics, fileName, 'json');
        }
        
        return detailedMetrics;
      }
    } catch (error) {
      serviceLogger.error('Failed to generate metrics', { error });
      return `Error generating metrics: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }
  
  /**
   * Set the verbosity level
   * @param verbosity - The new verbosity level
   */
  public setVerbosity(verbosity: TestOutputVerbosity | string): void {
    this.verbosity = this.resolveVerbosity(verbosity);
    serviceLogger.debug('Test visualization verbosity updated', { verbosity: this.verbosity });
  }
  
  /**
   * Set output mode (console vs files)
   * @param outputToFiles - Whether to output to files
   */
  public setOutputMode(outputToFiles: boolean): void {
    this.outputToFiles = outputToFiles;
    serviceLogger.debug('Test visualization output mode updated', { outputToFiles });
  }
  
  /**
   * Clear all visualization files from the output directory
   * @returns Success indicator
   */
  public clearOutputFiles(): boolean {
    return this.fileOutput.clearOutputDirectory();
  }
  
  /**
   * Handle standard verbosity visualization
   * @private
   */
  private handleStandardVerbosity(stateId: string, label?: string): string | null {
    // Generate compact summary
    const summary = this.compactVis.generateCompactStateSummary(stateId);
    
    if (this.outputToFiles) {
      const fileName = `state_${stateId}_${label || 'summary'}`;
      return this.fileOutput.writeToFile(summary, fileName, 'text');
    }
    
    return summary;
  }
  
  /**
   * Handle verbose verbosity visualization
   * @private
   */
  private handleVerboseVerbosity(stateId: string, label?: string): string | null {
    // Generate both state summary and transformation details
    const stateSummary = this.compactVis.generateCompactStateSummary(stateId);
    const transformSummary = this.compactVis.generateCompactTransformSummary(stateId);
    
    if (this.outputToFiles) {
      const fileName = `state_${stateId}_${label || 'verbose'}`;
      const content = `${stateSummary}\n\n${transformSummary}`;
      return this.fileOutput.writeToFile(content, fileName, 'text');
    }
    
    return `${stateSummary}\n\n${transformSummary}`;
  }
  
  /**
   * Handle debug verbosity visualization
   * @private
   */
  private handleDebugVerbosity(stateId: string, label?: string): string | null {
    // Generate full hierarchy visualization
    const config: VisualizationConfig = {
      format: this.defaultFormat,
      includeMetadata: true,
      includeTimestamps: true,
    };
    
    const visualization = this.visualizationService.generateHierarchyView(stateId, config);
    
    // Add transformation diagram if available
    const transformations = this.historyService.getTransformationChain(stateId);
    let transitionDiagram = '';
    
    if (transformations.length > 0) {
      transitionDiagram = this.visualizationService.generateTransitionDiagram(stateId, config);
    }
    
    if (this.outputToFiles) {
      const fileName = `state_${stateId}_${label || 'debug'}`;
      
      if (this.defaultFormat === 'mermaid') {
        // Create combined HTML with both visualizations
        const combinedMermaid = `${visualization}\n\n${transitionDiagram}`;
        return this.fileOutput.writeMermaidHtml(combinedMermaid, fileName, `State ${stateId} Debug View`);
      } else {
        // Write separate files
        const hierarchyFile = this.fileOutput.writeToFile(
          visualization, 
          `${fileName}_hierarchy`, 
          this.defaultFormat
        );
        
        if (transformations.length > 0) {
          this.fileOutput.writeToFile(
            transitionDiagram,
            `${fileName}_transitions`,
            this.defaultFormat
          );
        }
        
        return hierarchyFile;
      }
    }
    
    // Return combined visualization for console output
    return transformations.length > 0
      ? `${visualization}\n\n${transitionDiagram}`
      : visualization;
  }
  
  /**
   * Resolve verbosity from string or enum value
   * @private
   */
  private resolveVerbosity(verbosity?: TestOutputVerbosity | string): TestOutputVerbosity {
    if (!verbosity) {
      // Check for environment variable
      const envVerbosity = process.env.TEST_LOG_LEVEL || process.env.TEST_VISUALIZATION_LEVEL;
      
      if (envVerbosity) {
        return this.resolveVerbosityFromString(envVerbosity);
      }
      
      // Default to standard
      return TestOutputVerbosity.Standard;
    }
    
    if (typeof verbosity === 'string') {
      return this.resolveVerbosityFromString(verbosity);
    }
    
    return verbosity;
  }
  
  /**
   * Resolve verbosity from string value
   * @private
   */
  private resolveVerbosityFromString(verbosity: string): TestOutputVerbosity {
    switch (verbosity.toLowerCase()) {
      case 'minimal':
      case 'min':
      case 'none':
        return TestOutputVerbosity.Minimal;
        
      case 'standard':
      case 'normal':
      case 'default':
        return TestOutputVerbosity.Standard;
        
      case 'verbose':
      case 'detailed':
        return TestOutputVerbosity.Verbose;
        
      case 'debug':
      case 'full':
      case 'max':
        return TestOutputVerbosity.Debug;
        
      default:
        serviceLogger.warn('Unknown verbosity level, defaulting to standard', { requestedVerbosity: verbosity });
        return TestOutputVerbosity.Standard;
    }
  }
}