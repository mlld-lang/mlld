import winston from 'winston';
import path from 'path';
import { loggingConfig } from '@core/config/logging';
// Removed tsyringe imports - no longer using dependency injection
import fs from 'fs';

/**
 * Interface for the standard Logger to enable DI resolution
 */
export interface ILogger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  trace(message: string, context?: Record<string, unknown>): void;
  level: string;
}

/**
 * Interface for the LoggerFactory to enable DI resolution
 */
export interface ILoggerFactory {
  createServiceLogger(serviceName: keyof typeof loggingConfig.services): winston.Logger;
}

// Add colors to Winston
winston.addColors(loggingConfig.colors);

// Create formatters
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: loggingConfig.format.timestamp }),
  winston.format.colorize({ all: loggingConfig.format.colorize }),
  winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
    // In non-debug mode, use more concise output
    if (process.env.MLLD_DEBUG !== 'true') {
      // Only show error messages, no debug/info/etc
      if (!level.includes('error')) {
        return '';
      }
      // For errors, include minimal context
      return `Error: ${message}`;
    }
    
    // Full verbose output for debug mode
    let msg = `${timestamp} [${level}]${service ? ` [${service}]` : ''} ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += '\n' + JSON.stringify(metadata, null, 2);
    }
    return msg;
  })
);

const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: loggingConfig.format.timestamp }),
  winston.format.json()
);

// Determine the log level based on environment variables
const getLogLevel = () => {
  // Explicit LOG_LEVEL takes precedence
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL;
  }
  
  // During tests, respect TEST_LOG_LEVEL or default to silent for minimal output
  if (process.env.NODE_ENV === 'test') {
    return process.env.TEST_LOG_LEVEL || 'error';
  }
  
  // In debug mode use debug level
  if (process.env.MLLD_DEBUG === 'true') {
    return 'debug';
  }
  
  // Otherwise use the default level
  return loggingConfig.defaultLevel;
};

/**
 * Factory service for creating Winston loggers
 */
export class LoggerFactory implements ILoggerFactory {
  /**
   * Create a service-specific logger
   * @param serviceName The name of the service to create a logger for
   * @returns A Winston logger configured for the specified service
   */
  createServiceLogger(serviceName: keyof typeof loggingConfig.services): winston.Logger {
    const serviceConfig = loggingConfig.services[serviceName];
    
    // Determine the service-specific log level based on environment variables
    const getServiceLogLevel = () => {
      // Explicit LOG_LEVEL takes precedence
      if (process.env.LOG_LEVEL) {
        return process.env.LOG_LEVEL;
      }
      
      // During tests, respect TEST_LOG_LEVEL or default to error for minimal output
      if (process.env.NODE_ENV === 'test') {
        return process.env.TEST_LOG_LEVEL || 'error';
      }
      
      // In debug mode use debug level
      if (process.env.MLLD_DEBUG === 'true') {
        return 'debug';
      }
      
      // Otherwise use the service's configured level
      return serviceConfig.level;
    };
    
    const logger = winston.createLogger({
      level: getServiceLogLevel(),
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: serviceName },
      transports: [
        // Only use console transport outside of tests
        ...(process.env.NODE_ENV === 'test' ? [] : [
          new winston.transports.Console({
            format: consoleFormat,
            level: getServiceLogLevel()
          })
        ])
      ]
    });

    // Add a method to update the log level
    let currentLevel = serviceConfig.level;
    Object.defineProperty(logger, 'level', {
      get() {
        return currentLevel;
      },
      set(newLevel: string) {
        currentLevel = newLevel;
        logger.transports.forEach(transport => {
          transport.level = newLevel;
        });
      }
    });

    return logger;
  }
}

// Singleton instance for backward compatibility
export const loggerFactory = new LoggerFactory();

// Create the logger instance
export const logger = winston.createLogger({
  level: getLogLevel(),
  levels: loggingConfig.levels,
  transports: [
    // Console transport (but not during silent test)
    ...((process.env.NODE_ENV === 'test' && !process.env.TEST_LOG_LEVEL) ? [] : [
      new winston.transports.Console({
        format: consoleFormat
      })
    ]),
    // File transport for all logs
    new winston.transports.File({
      filename: path.join(loggingConfig.files.directory, loggingConfig.files.mainLog),
      format: fileFormat,
      maxsize: loggingConfig.files.maxSize,
      maxFiles: loggingConfig.files.maxFiles,
      tailable: loggingConfig.files.tailable
    }),
    // Separate file for errors
    new winston.transports.File({
      filename: path.join(loggingConfig.files.directory, loggingConfig.files.errorLog),
      level: 'error',
      format: fileFormat,
      maxsize: loggingConfig.files.maxSize,
      maxFiles: loggingConfig.files.maxFiles,
      tailable: loggingConfig.files.tailable
    })
  ]
});

// Backward compatibility function for creating service loggers
export function createServiceLogger(serviceName: keyof typeof loggingConfig.services): winston.Logger {
  return loggerFactory.createServiceLogger(serviceName);
}

// Ensure logs directory exists
if (!fs.existsSync(loggingConfig.files.directory)) {
  fs.mkdirSync(loggingConfig.files.directory);
}

// Add a stream interface for use with other logging tools
export const logStream = {
  write: (message: string): void => {
    logger.info(message.trim());
  }
};

// Create service loggers
export const stateLogger = createServiceLogger('state');
export const parserLogger = createServiceLogger('parser');
export const interpreterLogger = createServiceLogger('interpreter');
export const filesystemLogger = createServiceLogger('filesystem');
export const validationLogger = createServiceLogger('validation');
export const outputLogger = createServiceLogger('output');
export const pathLogger = createServiceLogger('path');
export const directiveLogger = createServiceLogger('directive');
export const circularityLogger = createServiceLogger('circularity');
export const resolutionLogger = createServiceLogger('resolution');
export const importLogger = createServiceLogger('import');
export const cliLogger = createServiceLogger('cli');
export const embedLogger = createServiceLogger('embed');

// Export default logger for general use
export default logger;

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  const fileTransport = new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error'
  });

  // Add to all loggers
  [
    cliLogger,
    directiveLogger,
    interpreterLogger,
    parserLogger,
    outputLogger,
    filesystemLogger,
    pathLogger,
    stateLogger
  ].forEach(logger => {
    logger.add(fileTransport);
  });
} 