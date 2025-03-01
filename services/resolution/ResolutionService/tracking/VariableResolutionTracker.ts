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
  value?: any;
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
    value?: any,
    source?: string,
    contextBoundary?: {
      type: 'parent-to-child' | 'child-to-parent';
      sourceId?: string;
      targetId?: string;
    }
  ): void {
    // Skip when disabled for minimal performance impact
    if (!this.config.enabled) return;
    
    // Apply sampling for high-volume scenarios
    if (this.config.samplingRate !== undefined && Math.random() >= this.config.samplingRate) return;
    
    // Only track specifically watched variables if configured
    if (this.config.watchVariables && 
        this.config.watchVariables.length > 0 && 
        !this.config.watchVariables.includes(variableName)) {
      return;
    }
    
    // Enforce maximum attempts limit to prevent memory issues
    if (this.config.maxAttempts && this.attempts.length >= this.config.maxAttempts) {
      // Remove oldest attempts
      this.attempts.shift();
    }
    
    // Track the attempt
    this.attempts.push({
      variableName,
      context,
      timestamp: Date.now(),
      success,
      value,
      source,
      contextBoundary
    });
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
  }
  
  /**
   * Check if tracking is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
} 