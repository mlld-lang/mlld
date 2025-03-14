/**
 * Tracks variable resolution attempts for debugging purposes
 */
export class VariableResolutionTracker {
  constructor() {
    this.attempts = [];
    this.enabled = false;
    this.currentAttempt = null;
  }

  /**
   * Configure the tracker
   * @param {Object} config Configuration options
   * @param {boolean} config.enabled Whether tracking is enabled
   */
  configure(config) {
    if (config.enabled !== undefined) {
      this.enabled = !!config.enabled;
    }
  }

  /**
   * Check if tracking is enabled
   * @returns {boolean} True if tracking is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Start tracking an attempt
   * @param {string} variableName Name of the variable being accessed
   * @param {string} operationType Type of operation (e.g., 'getVariable', 'field-access')
   * @param {Object} [metadata] Additional metadata about the attempt
   */
  trackAttemptStart(variableName, operationType, metadata = {}) {
    if (!this.enabled) return;
    
    this.currentAttempt = {
      variableName,
      operationType,
      timestamp: new Date(),
      metadata,
      steps: []
    };
  }

  /**
   * Track a resolution attempt
   * @param {string} variableName Name of the variable being resolved
   * @param {string} operationType Type of operation (e.g., 'text-variable', 'data-variable')
   * @param {boolean} success Whether the resolution was successful
   * @param {any} value The resolved value (if successful)
   * @param {string} [error] Error message (if unsuccessful)
   */
  trackResolutionAttempt(variableName, operationType, success, value, error) {
    if (!this.enabled) return;
    
    const attempt = {
      variableName,
      operationType,
      success,
      value: this.sanitizeValue(value),
      error,
      timestamp: new Date()
    };
    
    // If we're tracking a specific attempt, add this as a step
    if (this.currentAttempt) {
      this.currentAttempt.steps.push(attempt);
      
      // If this is a concluding operation, finalize the current attempt
      if (operationType.endsWith('-success') || 
          (!success && operationType.includes('error'))) {
        this.attempts.push({ ...this.currentAttempt });
        this.currentAttempt = null;
      }
    } else {
      // Otherwise track as a standalone attempt
      this.attempts.push(attempt);
    }
  }

  /**
   * Get all tracked resolution attempts
   * @returns {Array} Array of resolution attempts
   */
  getAttempts() {
    return this.attempts;
  }

  /**
   * Get tracked resolution attempts for a specific variable
   * @param {string} variableName Name of the variable to filter by
   * @returns {Array} Array of resolution attempts for the variable
   */
  getAttemptsForVariable(variableName) {
    return this.attempts.filter(attempt => 
      attempt.variableName === variableName ||
      attempt.variableName.startsWith(`${variableName}.`)
    );
  }

  /**
   * Clear all tracked attempts
   */
  clearAttempts() {
    this.attempts = [];
    this.currentAttempt = null;
  }
  
  /**
   * Sanitize a value for tracking (avoid overly large objects/arrays)
   * @param {any} value The value to sanitize
   * @returns {any} Sanitized value
   * @private
   */
  sanitizeValue(value) {
    // Skip if undefined, null, or primitive
    if (value === undefined || value === null || 
        typeof value !== 'object') {
      return value;
    }
    
    // For arrays, summarize or sample content
    if (Array.isArray(value)) {
      if (value.length <= 3) {
        return value.map(item => this.sanitizeValue(item));
      }
      return {
        __type: 'Array',
        length: value.length,
        sample: value.slice(0, 3).map(item => this.sanitizeValue(item))
      };
    }
    
    // For objects, summarize content
    try {
      const keys = Object.keys(value);
      if (keys.length <= 5) {
        const result = {};
        for (const key of keys) {
          result[key] = this.sanitizeValue(value[key]);
        }
        return result;
      }
      return {
        __type: 'Object',
        keys: keys.slice(0, 5),
        totalKeys: keys.length
      };
    } catch (e) {
      return { __type: 'Unprocessable', error: String(e) };
    }
  }
} 