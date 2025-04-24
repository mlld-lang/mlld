/**
 * @package
 * Lightweight tracking for variable resolution attempts
 * 
 * Provides tracking capability to monitor variable resolution attempts
 * with minimal performance impact when disabled
 */

/**
 * Resolution attempt information
 */
export interface ResolutionAttempt {
  variableName: string;
  context: string;
  timestamp: number;
  success: boolean;
  value?: unknown;
  source?: string;
  contextBoundary?: {
    type: 'parent-to-child' | 'child-to-parent';
    sourceId?: string;
    targetId?: string;
  };
}

/**
 * Variable resolution tracking configuration
 */
export interface ResolutionTrackingConfig {
  enabled: boolean;
  samplingRate?: number;
  maxAttempts?: number;
  watchVariables?: string[];
}

/**
 * Tracks variable resolution attempts with minimal performance impact when disabled
 */
export class VariableResolutionTracker {
  private config: ResolutionTrackingConfig = {
    enabled: false,
    samplingRate: 1.0,
    maxAttempts: 1000,
    watchVariables: []
  };
  
  private attempts: ResolutionAttempt[] = [];
  private currentAttempt: any = null;
  
  /**
   * Enables or disables tracking
   */
  configure(config: Partial<ResolutionTrackingConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Reset attempts when disabling
    if (!this.config.enabled) {
      this.attempts = [];
    }
  }
  
  /**
   * Track a variable resolution attempt with minimal overhead when disabled
   */
  trackResolutionAttempt(
    variableName: string, 
    context: string,
    success: boolean, 
    value?: unknown,
    source?: string,
    contextBoundary?: {
      type: 'parent-to-child' | 'child-to-parent';
      sourceId?: string;
      targetId?: string;
    }
  ): void {
    // process.stdout.write(`DEBUG: [Tracker] trackResolutionAttempt ENTERED. Name: ${variableName}, Enabled: ${this.config.enabled}\n`); // LOG ENTRY
    // Skip when disabled for minimal performance impact
    if (!this.config.enabled) return;
    // process.stdout.write(`DEBUG: [Tracker] Passed enabled check.\n`);
    
    // Apply sampling for high-volume scenarios
    if (this.config.samplingRate !== undefined && Math.random() >= this.config.samplingRate) return;
    // process.stdout.write(`DEBUG: [Tracker] Passed sampling check.\n`);
    
    // Only track specifically watched variables if configured
    if (this.config.watchVariables && 
        this.config.watchVariables.length > 0 && 
        !this.config.watchVariables.includes(variableName)) {
      return;
    }
    // process.stdout.write(`DEBUG: [Tracker] Passed watchVariables check.\n`);
    
    // Enforce maximum attempts limit to prevent memory issues
    if (this.config.maxAttempts && this.attempts.length >= this.config.maxAttempts) {
      this.attempts.shift();
    }
    // process.stdout.write(`DEBUG: [Tracker] Passed maxAttempts check.\n`);
    
    // Track the attempt
    const attemptData = {
      variableName,
      context,
      timestamp: Date.now(),
      success,
      value,
      source,
      contextBoundary
    };
    this.attempts.push(attemptData);
    // process.stdout.write(`DEBUG: [Tracker] Pushed attempt for ${variableName}. Total attempts: ${this.attempts.length}\n`); // LOG PUSH
  }
  
  /**
   * Start tracking an attempt
   * @param variableName Name of the variable being accessed
   * @param operationType Type of operation (e.g., 'getVariable', 'field-access')
   * @param metadata Additional metadata about the attempt
   */
  trackAttemptStart(
    variableName: string, 
    operationType: string, 
    metadata: Record<string, any> = {}
  ): void {
    if (!this.config.enabled) return;
    
    this.currentAttempt = {
      variableName,
      operationType,
      timestamp: Date.now(),
      metadata,
      steps: []
    };
  }
  
  /**
   * Get all tracked resolution attempts
   */
  getAttempts(): ResolutionAttempt[] {
    return [...this.attempts];
  }
  
  /**
   * Get resolution attempts for a specific variable
   */
  getAttemptsForVariable(variableName: string): ResolutionAttempt[] {
    return this.attempts.filter(attempt => attempt.variableName === variableName);
  }
  
  /**
   * Clear all tracked attempts
   */
  clearAttempts(): void {
    this.attempts = [];
    this.currentAttempt = null;
  }
  
  /**
   * Check if tracking is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}