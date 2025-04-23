/**
 * @package
 * Interface for test output filtering service.
 *
 * This interface defines the contract for controlling test output verbosity
 * and filtering based on test requirements.
 */

import { TestOutputVerbosity } from '@tests/utils/debug/StateVisualizationService/TestVisualizationManager';

/**
 * Log levels for filtering operations
 */
export enum LogLevel {
  /**
   * Error level - always shown
   */
  Error = 'error',
  
  /**
   * Warning level - shown in standard and above
   */
  Warning = 'warning',
  
  /**
   * Info level - shown in standard and above
   */
  Info = 'info',
  
  /**
   * Debug level - shown in verbose and above
   */
  Debug = 'debug',
  
  /**
   * Trace level - shown only in debug mode
   */
  Trace = 'trace'
}

/**
 * Configuration options for test output filtering
 */
export interface TestOutputOptions {
  /**
   * Overall verbosity level 
   */
  verbosity?: TestOutputVerbosity;
  
  /**
   * Specific operations to include
   */
  includeOperations?: string[];
  
  /**
   * Specific operations to exclude
   */
  excludeOperations?: string[];
  
  /**
   * Filter state fields to include
   */
  includeStateFields?: string[];
  
  /**
   * Filter state fields to exclude
   */
  excludeStateFields?: string[];
  
  /**
   * Maximum nesting level for state objects
   */
  maxDepth?: number;
  
  /**
   * Control file output behavior
   */
  outputToFiles?: boolean;
  
  /**
   * Output file name template
   */
  outputFileName?: string;
  
  /**
   * States to always visualize regardless of verbosity
   */
  alwaysVisualizeStates?: string[];
}

/**
 * Interface for test output filtering service
 */
export interface ITestOutputFilterService {
  /**
   * Configure output filtering for the current test
   * @param options Test output options
   */
  configureTestOutput(options: TestOutputOptions): void;
  
  /**
   * Determine if specific operation should be logged
   * @param operation Operation name or type
   * @param level Log level for the operation
   * @returns Whether the operation should be logged
   */
  shouldLogOperation(operation: string, level?: LogLevel): boolean;
  
  /**
   * Filter state data based on current configuration
   * @param stateData State data to filter
   * @param level Log level for the state data
   * @returns Filtered state data
   */
  filterStateOutput(stateData: any, level?: LogLevel): any;
  
  /**
   * Determine if state should be visualized
   * @param stateId State ID to check
   * @returns Whether the state should be visualized
   */
  shouldVisualizeState(stateId: string): boolean;
  
  /**
   * Set default verbosity level
   * @param verbosity Verbosity level
   */
  setDefaultVerbosity(verbosity: TestOutputVerbosity): void;
  
  /**
   * Get current verbosity level
   * @returns Current verbosity level
   */
  getVerbosity(): TestOutputVerbosity;
  
  /**
   * Reset output configuration
   */
  reset(): void;
}