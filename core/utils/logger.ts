import winston from 'winston';
import path from 'path';
import { loggingConfig } from '@core/config/logging.js';

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
export function createServiceLogger(serviceName: keyof typeof loggingConfig.services): winston.Logger {
  const serviceConfig = loggingConfig.services[serviceName];
  
  return winston.createLogger({
    level: serviceConfig.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: serviceName },
    transports: [
      new winston.transports.Console({
        level: process.env.NODE_ENV === 'test' ? 'error' : 'info'
      })
    ]
  });
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