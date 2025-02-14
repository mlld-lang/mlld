type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: unknown;
}

class Logger {
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
    // In test mode, we might want to suppress logs or redirect them
    if (process.env.NODE_ENV === 'test') {
      return;
    }

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

// Create namespaced loggers
export const fsLogger = new Logger('filesystem'); 