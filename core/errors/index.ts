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

// Define and export shared error codes
export enum ResolutionErrorCode {
  FIELD_ACCESS_ERROR = 'FIELD_ACCESS_ERROR',
  VARIABLE_NOT_FOUND = 'VARIABLE_NOT_FOUND',
  INVALID_VARIABLE_TYPE = 'INVALID_VARIABLE_TYPE',
  CIRCULAR_REFERENCE = 'CIRCULAR_REFERENCE',
  MAX_DEPTH_EXCEEDED = 'MAX_DEPTH_EXCEEDED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  STRINGIFY_FAILED = 'STRINGIFY_FAILED',
  // Add other relevant codes from MeldResolutionError, VariableResolutionError etc.
  // E.g., from MeldResolutionError.ts
  E_PARSE_FAILED = 'E_PARSE_FAILED',
  E_RESOLVE_CONTENT_FAILED = 'E_RESOLVE_CONTENT_FAILED',
  E_RESOLVE_TEXT_FAILED = 'E_RESOLVE_TEXT_FAILED',
  E_RESOLVE_DATA_FAILED = 'E_RESOLVE_DATA_FAILED',
  E_RESOLVE_INVALID_PATH_TYPE = 'E_RESOLVE_INVALID_PATH_TYPE',
  E_UNSUPPORTED_TYPE = 'E_UNSUPPORTED_TYPE',
  E_COMMAND_FAILED = 'E_COMMAND_FAILED',
  E_COMMAND_TYPE_UNSUPPORTED = 'E_COMMAND_TYPE_UNSUPPORTED',
  E_SECTION_NOT_FOUND = 'E_SECTION_NOT_FOUND',
  E_SECTION_EXTRACTION_FAILED = 'E_SECTION_EXTRACTION_FAILED',
  // E.g., from VariableResolutionError.ts
  E_VAR_NOT_FOUND = 'E_VAR_NOT_FOUND', // Duplicate of VARIABLE_NOT_FOUND, choose one
  E_UNEXPECTED_TYPE = 'E_UNEXPECTED_TYPE', // Maybe different from INVALID_VARIABLE_TYPE?
  E_PATH_VALIDATION_FAILED = 'E_PATH_VALIDATION_FAILED',
}

// TODO: Consolidate ErrorCode usage across all error types.
// Other files might have their own enums (PathErrorCode, DirectiveErrorCode etc.)
// that could potentially be merged or referenced here. 