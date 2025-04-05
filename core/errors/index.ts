/**
 * Central export point for Meld error types.
 */

// Export all error types from the errors directory
export { MeldError, ErrorSeverity } from './MeldError.js';
export { MeldParseError } from './MeldParseError.js';
export { MeldResolutionError } from './MeldResolutionError.js';
export { MeldInterpreterError } from './MeldInterpreterError.js';
export { MeldImportError } from './MeldImportError.js';
export { MeldFileSystemError } from './MeldFileSystemError.js';
export { MeldFileNotFoundError } from './MeldFileNotFoundError.js';
export { MeldOutputError } from './MeldOutputError.js';
export { MeldDirectiveError } from './MeldDirectiveError.js';
export { PathValidationError } from './PathValidationError.js';
export { ServiceInitializationError } from './ServiceInitializationError.js'; 

// Export error message collections
export * from './messages/index.js'; 

// Add exports for specific errors as they are created:
export * from './FieldAccessError.js';
export * from './VariableResolutionError.js';
export * from './PathValidationError.js';
export * from './MeldResolutionError.js';
export * from './MeldFileNotFoundError.js';
// ... other specific errors 