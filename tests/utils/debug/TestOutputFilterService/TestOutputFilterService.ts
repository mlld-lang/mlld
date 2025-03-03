/**
 * @package
 * Test output filtering service implementation.
 *
 * This service provides selective test output control based on
 * test requirements and configuration.
 */

import { serviceLogger } from '@core/utils/logger';
import { TestOutputVerbosity } from '../StateVisualizationService/TestVisualizationManager';
import { ITestOutputFilterService, LogLevel, TestOutputOptions } from './ITestOutputFilterService';

/**
 * Maps verbosity levels to log levels
 */
const VERBOSITY_LOG_LEVEL_MAP = {
  [TestOutputVerbosity.Minimal]: [LogLevel.Error],
  [TestOutputVerbosity.Standard]: [LogLevel.Error, LogLevel.Warning, LogLevel.Info],
  [TestOutputVerbosity.Verbose]: [LogLevel.Error, LogLevel.Warning, LogLevel.Info, LogLevel.Debug],
  [TestOutputVerbosity.Debug]: [LogLevel.Error, LogLevel.Warning, LogLevel.Info, LogLevel.Debug, LogLevel.Trace]
};

/**
 * Default operations to exclude in minimal mode
 */
const DEFAULT_MINIMAL_EXCLUDED_OPERATIONS = [
  'transform',
  'resolve',
  'parse',
  'interpret',
  'validate'
];

/**
 * Default operations to exclude in standard mode
 */
const DEFAULT_STANDARD_EXCLUDED_OPERATIONS = [
  'resolveVariable',
  'validateDirective',
  'parseFragment'
];

/**
 * Implements test output filtering based on test requirements
 */
export class TestOutputFilterService implements ITestOutputFilterService {
  private defaultVerbosity: TestOutputVerbosity = TestOutputVerbosity.Standard;
  private currentVerbosity: TestOutputVerbosity = TestOutputVerbosity.Standard;
  private includeOperations: string[] = [];
  private excludeOperations: string[] = DEFAULT_STANDARD_EXCLUDED_OPERATIONS;
  private includeStateFields: string[] = [];
  private excludeStateFields: string[] = [];
  private maxDepth: number = 3;
  private outputToFiles: boolean = false;
  private outputFileName?: string;
  private alwaysVisualizeStates: string[] = [];

  /**
   * Create a new TestOutputFilterService
   * @param initialConfig - Initial configuration
   */
  constructor(initialConfig?: TestOutputOptions) {
    // Initialize with environment settings
    this.initializeFromEnvironment();
    
    // Apply initial config if provided
    if (initialConfig) {
      this.configureTestOutput(initialConfig);
    }
    
    serviceLogger.debug('TestOutputFilterService initialized', {
      defaultVerbosity: this.defaultVerbosity,
      currentVerbosity: this.currentVerbosity
    });
  }
  
  /**
   * Configure output filtering for the current test
   */
  public configureTestOutput(options: TestOutputOptions): void {
    // Set verbosity
    if (options.verbosity !== undefined) {
      this.currentVerbosity = options.verbosity;
    } else {
      this.currentVerbosity = this.defaultVerbosity;
    }
    
    // Set operation filters
    if (options.includeOperations) {
      this.includeOperations = [...options.includeOperations];
    }
    
    if (options.excludeOperations) {
      this.excludeOperations = [...options.excludeOperations];
    } else {
      // Apply default exclusions based on verbosity
      this.applyDefaultExclusions();
    }
    
    // Set state field filters
    if (options.includeStateFields) {
      this.includeStateFields = [...options.includeStateFields];
    }
    
    if (options.excludeStateFields) {
      this.excludeStateFields = [...options.excludeStateFields];
    }
    
    // Set maximum depth
    if (options.maxDepth !== undefined) {
      this.maxDepth = options.maxDepth;
    }
    
    // Set file output options
    if (options.outputToFiles !== undefined) {
      this.outputToFiles = options.outputToFiles;
    }
    
    if (options.outputFileName) {
      this.outputFileName = options.outputFileName;
    }
    
    // Set always visualize states
    if (options.alwaysVisualizeStates) {
      this.alwaysVisualizeStates = [...options.alwaysVisualizeStates];
    }
    
    serviceLogger.debug('Test output configuration updated', {
      verbosity: this.currentVerbosity,
      includeOps: this.includeOperations.length,
      excludeOps: this.excludeOperations.length
    });
  }
  
  /**
   * Determine if specific operation should be logged
   */
  public shouldLogOperation(operation: string, level: LogLevel = LogLevel.Info): boolean {
    // Always log errors regardless of verbosity
    if (level === LogLevel.Error) {
      return true;
    }
    
    // Check if operation is in include list (explicit inclusion)
    if (this.includeOperations.length > 0 && this.includeOperations.includes(operation)) {
      return true;
    }
    
    // Check if operation is in exclude list (explicit exclusion)
    if (this.excludeOperations.includes(operation)) {
      return false;
    }
    
    // Check if level is permitted by current verbosity
    const allowedLevels = VERBOSITY_LOG_LEVEL_MAP[this.currentVerbosity] || [];
    return allowedLevels.includes(level);
  }
  
  /**
   * Filter state data based on current configuration
   */
  public filterStateOutput(stateData: any, level: LogLevel = LogLevel.Info): any {
    // Skip filtering if we shouldn't log at this level
    if (!this.shouldLogOperation('stateOutput', level)) {
      return null;
    }
    
    // Handle null/undefined
    if (stateData === null || stateData === undefined) {
      return stateData;
    }
    
    // Return primitive types as-is
    if (typeof stateData !== 'object') {
      return stateData;
    }
    
    // Clone the data to avoid modifying the original
    const result = Array.isArray(stateData) 
      ? [...stateData] 
      : { ...stateData };
    
    // Apply field filtering
    try {
      return this.applyFieldFiltering(result, 0);
    } catch (error) {
      serviceLogger.error('Error filtering state output', { error });
      return stateData; // Return original on error
    }
  }
  
  /**
   * Determine if state should be visualized
   */
  public shouldVisualizeState(stateId: string): boolean {
    // Always visualize specific states regardless of verbosity
    if (this.alwaysVisualizeStates.includes(stateId)) {
      return true;
    }
    
    // Determine based on verbosity
    switch (this.currentVerbosity) {
      case TestOutputVerbosity.Minimal:
        return false;
      case TestOutputVerbosity.Standard:
        return true; // Visualize all states in standard mode
      case TestOutputVerbosity.Verbose:
      case TestOutputVerbosity.Debug:
        return true;
      default:
        return true;
    }
  }
  
  /**
   * Set default verbosity level
   */
  public setDefaultVerbosity(verbosity: TestOutputVerbosity): void {
    this.defaultVerbosity = verbosity;
    // Also set current verbosity if not explicitly configured
    this.currentVerbosity = verbosity;
    // Update exclusions based on new verbosity
    this.applyDefaultExclusions();
    
    serviceLogger.debug('Default verbosity updated', { 
      defaultVerbosity: this.defaultVerbosity,
      currentVerbosity: this.currentVerbosity 
    });
  }
  
  /**
   * Get current verbosity level
   */
  public getVerbosity(): TestOutputVerbosity {
    return this.currentVerbosity;
  }
  
  /**
   * Reset output configuration to defaults
   */
  public reset(): void {
    this.currentVerbosity = this.defaultVerbosity;
    this.includeOperations = [];
    this.applyDefaultExclusions();
    this.includeStateFields = [];
    this.excludeStateFields = [];
    this.alwaysVisualizeStates = [];
    
    serviceLogger.debug('Test output configuration reset to defaults');
  }
  
  /**
   * Initialize settings from environment variables
   * @private
   */
  private initializeFromEnvironment(): void {
    // Check for test verbosity environment variable
    const envVerbosity = process.env.TEST_OUTPUT_VERBOSITY || 
                         process.env.TEST_VERBOSITY || 
                         process.env.TEST_LOG_LEVEL;
    
    if (envVerbosity) {
      this.setVerbosityFromString(envVerbosity);
    }
    
    // Check for file output environment variable
    const envFileOutput = process.env.TEST_OUTPUT_TO_FILES;
    if (envFileOutput === 'true' || envFileOutput === '1') {
      this.outputToFiles = true;
    }
    
    // Check for output directory
    if (process.env.TEST_OUTPUT_DIR) {
      // Use as base for output file name
      this.outputFileName = `${process.env.TEST_OUTPUT_DIR}/test_output`;
    }
  }
  
  /**
   * Set verbosity from string value
   * @private
   */
  private setVerbosityFromString(verbosity: string): void {
    switch (verbosity.toLowerCase()) {
      case 'minimal':
      case 'min':
      case 'none':
        this.setDefaultVerbosity(TestOutputVerbosity.Minimal);
        break;
      case 'standard':
      case 'normal':
      case 'default':
        this.setDefaultVerbosity(TestOutputVerbosity.Standard);
        break;
      case 'verbose':
      case 'detailed':
        this.setDefaultVerbosity(TestOutputVerbosity.Verbose);
        break;
      case 'debug':
      case 'full':
      case 'max':
        this.setDefaultVerbosity(TestOutputVerbosity.Debug);
        break;
      default:
        serviceLogger.warn('Unknown verbosity level, defaulting to standard', { requestedVerbosity: verbosity });
        this.setDefaultVerbosity(TestOutputVerbosity.Standard);
    }
  }
  
  /**
   * Apply default operation exclusions based on verbosity
   * @private
   */
  private applyDefaultExclusions(): void {
    switch (this.currentVerbosity) {
      case TestOutputVerbosity.Minimal:
        this.excludeOperations = [...DEFAULT_MINIMAL_EXCLUDED_OPERATIONS];
        break;
      case TestOutputVerbosity.Standard:
        this.excludeOperations = [...DEFAULT_STANDARD_EXCLUDED_OPERATIONS];
        break;
      case TestOutputVerbosity.Verbose:
        this.excludeOperations = []; // No exclusions in verbose mode
        break;
      case TestOutputVerbosity.Debug:
        this.excludeOperations = []; // No exclusions in debug mode
        break;
    }
  }
  
  /**
   * Apply field filtering to an object
   * @private
   */
  private applyFieldFiltering(data: any, depth: number): any {
    // Handle null/undefined
    if (data === null || data === undefined) {
      return data;
    }
    
    // Return primitives as-is
    if (typeof data !== 'object') {
      return data;
    }
    
    // Check max depth before processing
    if (depth > this.maxDepth) {
      if (Array.isArray(data)) {
        return `[Array(${data.length})]`;
      } else {
        return '[Object]';
      }
    }
    
    // Handle arrays
    if (Array.isArray(data)) {
      // For test purposes, we need to preserve the original structure
      // but limit the depth of nested objects
      return data.map(item => this.applyFieldFiltering(item, depth + 1));
    }
    
    // Handle objects
    const result: any = {};
    
    // Process each field
    for (const key in data) {
      // Skip if explicitly excluded
      if (this.excludeStateFields.includes(key)) {
        continue;
      }
      
      // Include only if in includeStateFields (if specified)
      if (this.includeStateFields.length > 0 && !this.includeStateFields.includes(key)) {
        continue;
      }
      
      // Process value recursively
      result[key] = this.applyFieldFiltering(data[key], depth + 1);
    }
    
    return result;
  }
}