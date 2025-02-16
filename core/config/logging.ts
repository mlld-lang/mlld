import { config } from 'winston';

export const loggingConfig = {
  // Log levels in order of increasing verbosity
  levels: config.npm.levels,

  // Color scheme for different log levels
  colors: config.npm.colors,

  // File configuration
  files: {
    directory: 'logs',
    mainLog: 'meld.log',
    errorLog: 'error.log',
    maxSize: 5242880, // 5MB
    maxFiles: 5,
    tailable: true
  },

  // Default level based on environment
  defaultLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',

  // Format configuration
  format: {
    timestamp: 'YYYY-MM-DD HH:mm:ss',
    includeTimestamp: true,
    colorize: true
  },

  // Service-specific settings
  services: {
    state: {
      level: 'info',
      includeMetadata: true
    },
    parser: {
      level: 'info',
      includeMetadata: true
    },
    interpreter: {
      level: 'info',
      includeMetadata: true
    },
    filesystem: {
      level: 'info',
      includeMetadata: true
    },
    validation: {
      level: 'info',
      includeMetadata: true
    },
    output: {
      level: 'info',
      includeMetadata: true
    },
    path: {
      level: 'info',
      includeMetadata: true
    },
    directive: {
      level: 'info',
      includeMetadata: true
    },
    circularity: {
      level: 'info',
      includeMetadata: true
    },
    resolution: {
      level: 'info',
      includeMetadata: true
    },
    import: {
      level: 'info',
      includeMetadata: true
    },
    cli: {
      level: 'info'
    },
    embed: {
      level: 'info',
      includeMetadata: true
    }
  }
} as const; 