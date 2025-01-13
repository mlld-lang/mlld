import winston from 'winston';

const { combine, timestamp, printf, colorize } = winston.format;

// Custom format for our logs
const meldFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  
  // Add metadata if present
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  
  return msg;
});

// Create the logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    timestamp(),
    colorize(),
    meldFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'error.log', 
      level: 'error',
      dirname: 'logs' 
    }),
    new winston.transports.File({ 
      filename: 'combined.log',
      dirname: 'logs' 
    })
  ]
});

// Convenience methods for different contexts
export const directiveLogger = {
  info: (msg: string, metadata?: object) => logger.info(`[Directive] ${msg}`, metadata),
  error: (msg: string, metadata?: object) => logger.error(`[Directive] ${msg}`, metadata),
  warn: (msg: string, metadata?: object) => logger.warn(`[Directive] ${msg}`, metadata),
  debug: (msg: string, metadata?: object) => logger.debug(`[Directive] ${msg}`, metadata)
};

export const interpreterLogger = {
  info: (msg: string, metadata?: object) => logger.info(`[Interpreter] ${msg}`, metadata),
  error: (msg: string, metadata?: object) => logger.error(`[Interpreter] ${msg}`, metadata),
  warn: (msg: string, metadata?: object) => logger.warn(`[Interpreter] ${msg}`, metadata),
  debug: (msg: string, metadata?: object) => logger.debug(`[Interpreter] ${msg}`, metadata)
};

// Ensure logs directory exists
import { mkdirSync } from 'fs';
try {
  mkdirSync('logs');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
    console.error('Failed to create logs directory:', error);
  }
} 