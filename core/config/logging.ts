export const loggingConfig = {
  // Log levels in order of increasing verbosity
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3,
    trace: 4
  },

  // Color scheme for different log levels
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue',
    trace: 'gray'
  },

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
      level: 'debug',
      includeMetadata: true
    },
    parser: {
      level: 'info',
      includeMetadata: true
    },
    interpreter: {
      level: 'debug',
      includeMetadata: true
    },
    filesystem: {
      level: 'info',
      includeMetadata: true
    }
  }
}; 