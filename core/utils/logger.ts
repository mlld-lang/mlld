import winston from 'winston';
import path from 'path';
import { loggingConfig } from '../config/logging';

// Add colors to Winston
winston.addColors(loggingConfig.colors);

// Create formatters
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: loggingConfig.format.timestamp }),
  winston.format.colorize({ all: loggingConfig.format.colorize }),
  winston.format.printf(({ level, message, timestamp, service, ...metadata }) => {
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

// Create the logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || loggingConfig.defaultLevel,
  levels: loggingConfig.levels,
  transports: [
    // Console transport
    new winston.transports.Console({
      format: consoleFormat
    }),
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

// Export the Logger interface for type safety
export interface Logger {
  error(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  trace(message: string, context?: Record<string, unknown>): void;
}

// Create a service-specific logger factory
export function createServiceLogger(serviceName: keyof typeof loggingConfig.services): Logger {
  const serviceConfig = loggingConfig.services[serviceName];

  return {
    error(message: string, context?: Record<string, unknown>): void {
      logger.error(message, { service: serviceName, ...context });
    },
    warn(message: string, context?: Record<string, unknown>): void {
      logger.warn(message, { service: serviceName, ...context });
    },
    info(message: string, context?: Record<string, unknown>): void {
      logger.info(message, { service: serviceName, ...context });
    },
    debug(message: string, context?: Record<string, unknown>): void {
      if (serviceConfig.level === 'debug' || serviceConfig.level === 'trace') {
        logger.debug(message, { service: serviceName, ...context });
      }
    },
    trace(message: string, context?: Record<string, unknown>): void {
      if (serviceConfig.level === 'trace') {
        logger.log('trace', message, { service: serviceName, ...context });
      }
    }
  };
}

// Ensure logs directory exists
import fs from 'fs';
if (!fs.existsSync(loggingConfig.files.directory)) {
  fs.mkdirSync(loggingConfig.files.directory);
}

// Configure logger based on environment
if (process.env.NODE_ENV !== 'production') {
  logger.level = 'debug';
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

// Export default logger for general use
export default logger; 