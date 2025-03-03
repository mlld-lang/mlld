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
  defaultLevel: 'error',

  // Format configuration
  format: {
    timestamp: 'YYYY-MM-DD HH:mm:ss',
    includeTimestamp: true,
    colorize: true
  },

  // Service-specific settings
  services: {
    state: {
      level: 'error',
      includeMetadata: true
    },
    parser: {
      level: 'error',
      includeMetadata: true
    },
    interpreter: {
      level: 'error',
      includeMetadata: true
    },
    filesystem: {
      level: 'error',
      includeMetadata: true
    },
    validation: {
      level: 'error',
      includeMetadata: true
    },
    output: {
      level: 'error',
      includeMetadata: true
    },
    path: {
      level: 'error',
      includeMetadata: true
    },
    directive: {
      level: 'error',
      includeMetadata: true
    },
    circularity: {
      level: 'error',
      includeMetadata: true
    },
    resolution: {
      level: 'error',
      includeMetadata: true
    },
    import: {
      level: 'error',
      includeMetadata: true
    },
    cli: {
      level: 'error'
    },
    embed: {
      level: 'error',
      includeMetadata: true
    }
  }
} as const; 