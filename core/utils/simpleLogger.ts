export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  [key: string]: unknown;
}

/**
 * Interface for the simple Logger
 */
export interface ISimpleLogger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

/**
 * Simple logger implementation for minimal logging needs
 */
export class Logger implements ISimpleLogger {
  constructor(private namespace: string) {}

  debug(message: string, context: LogContext = {}): void {
    this.log('debug', message, context);
  }

  info(message: string, context: LogContext = {}): void {
    this.log('info', message, context);
  }

  warn(message: string, context: LogContext = {}): void {
    this.log('warn', message, context);
  }

  error(message: string, context: LogContext = {}): void {
    this.log('error', message, context);
  }

  private log(level: LogLevel, message: string, context: LogContext): void {
    // In test mode, suppress all logs except errors
    if (process.env.NODE_ENV === 'test' && level !== 'error') {
      return;
    }

    // Only output to console when not in test mode
    if (process.env.NODE_ENV !== 'test') {
      const timestamp = new Date().toISOString();
      console.log(JSON.stringify({
        timestamp,
        level,
        namespace: this.namespace,
        message,
        ...context
      }));
    }
  }
}

// Create namespaced loggers - maintain exported singleton for backward compatibility
export const fsLogger = new Logger('filesystem'); 