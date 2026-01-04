import type { SourceLocation } from '@core/types';
import { MlldCommandExecutionError } from '@core/errors';

/**
 * Interface for collected error information
 */
export interface CollectedError {
  error: MlldCommandExecutionError;
  command: string;
  timestamp: Date;
  duration: number;
  sourceLocation?: SourceLocation;
  context?: CommandExecutionContext;
}

/**
 * Interface for command execution context
 */
export interface CommandExecutionContext {
  sourceLocation?: SourceLocation;
  directiveNode?: any; // MlldNode
  filePath?: string;
  directiveType?: string;
  workingDirectory?: string;
  streamingEnabled?: boolean;
  pipelineId?: string;
  stageIndex?: number;
  parallelIndex?: number;
  streamId?: string;
  emitEffect?: (chunk: string, source: 'stdout' | 'stderr') => void;
  suppressTerminal?: boolean;
  bus?: import('../eval/pipeline/stream-bus').StreamBus;
}

/**
 * Interface for processed output metadata
 */
export interface ProcessedOutput {
  output: string;
  truncated: boolean;
  originalLength: number;
  actualLines: number;
  maxLinesApplied?: number;
}

/**
 * ErrorUtils provides utilities for error collection, processing, and output management.
 * These handle command execution errors and output processing.
 */
export class ErrorUtils {
  private collectedErrors: CollectedError[] = [];

  /**
   * Collect a command execution error with metadata
   */
  collectError(
    error: MlldCommandExecutionError,
    command: string,
    duration: number,
    context?: CommandExecutionContext
  ): void {
    this.collectedErrors.push({
      error,
      command,
      timestamp: new Date(),
      duration,
      sourceLocation: context?.sourceLocation,
      context
    });
  }

  /**
   * Get all collected errors
   */
  getCollectedErrors(): CollectedError[] {
    return [...this.collectedErrors];
  }

  /**
   * Clear all collected errors
   */
  clearCollectedErrors(): void {
    this.collectedErrors = [];
  }

  /**
   * Process command output with optional line limiting
   * Currently returns full output but provides metadata about potential truncation
   */
  static processOutput(output: string, maxLines?: number): ProcessedOutput {
    const lines = output.split('\n');
    const actualLines = lines.length;
    
    // For now, we return the full output regardless of maxLines
    // This preserves the current behavior where truncation is disabled
    const processedOutput = output;
    
    return {
      output: processedOutput,
      truncated: false, // Currently always false since truncation is disabled
      originalLength: output.length,
      actualLines,
      maxLinesApplied: maxLines
    };
  }

  /**
   * Get error statistics for debugging
   */
  getErrorStats() {
    const stats = {
      totalErrors: this.collectedErrors.length,
      errorsByType: {} as Record<string, number>,
      averageDuration: 0,
      commandsWithErrors: new Set<string>()
    };

    if (this.collectedErrors.length === 0) {
      return stats;
    }

    let totalDuration = 0;
    
    for (const collected of this.collectedErrors) {
      // Count by error type
      const errorType = collected.error.constructor.name;
      stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
      
      // Track duration
      totalDuration += collected.duration;
      
      // Track unique commands that had errors
      stats.commandsWithErrors.add(collected.command);
    }

    stats.averageDuration = totalDuration / this.collectedErrors.length;

    return {
      ...stats,
      commandsWithErrors: Array.from(stats.commandsWithErrors)
    };
  }

  /**
   * Get recent errors (within specified time window)
   */
  getRecentErrors(windowMs: number = 60000): CollectedError[] {
    const cutoff = new Date(Date.now() - windowMs);
    return this.collectedErrors.filter(error => error.timestamp >= cutoff);
  }

  /**
   * Check if a command has failed recently
   */
  hasRecentFailures(command: string, windowMs: number = 30000): boolean {
    const recentErrors = this.getRecentErrors(windowMs);
    return recentErrors.some(error => error.command === command);
  }

  /**
   * Format error for display
   */
  static formatError(collected: CollectedError): string {
    const location = collected.sourceLocation 
      ? ` at ${collected.sourceLocation.file}:${collected.sourceLocation.line}`
      : '';
    
    return `[${collected.timestamp.toISOString()}] Command "${collected.command}" failed${location}: ${collected.error.message} (took ${collected.duration}ms)`;
  }

  /**
   * Create error summary report
   */
  createErrorReport(): string {
    if (this.collectedErrors.length === 0) {
      return 'No errors collected.';
    }

    const stats = this.getErrorStats();
    const lines: string[] = [];
    
    lines.push(`# Error Report (${this.collectedErrors.length} errors)`);
    lines.push('');
    lines.push(`**Average Duration:** ${stats.averageDuration.toFixed(2)}ms`);
    lines.push(`**Commands with Errors:** ${stats.commandsWithErrors.length}`);
    lines.push('');
    
    lines.push('## Error Types');
    for (const [type, count] of Object.entries(stats.errorsByType)) {
      lines.push(`- ${type}: ${count}`);
    }
    lines.push('');
    
    lines.push('## Recent Errors');
    const recent = this.getRecentErrors();
    for (const error of recent.slice(-5)) { // Show last 5 recent errors
      lines.push(`- ${ErrorUtils.formatError(error)}`);
    }
    
    return lines.join('\n');
  }
}
