/**
 * Central export point for Meld error types.
 */

// Export all error types from the errors directory
export { MeldError, ErrorSeverity } from './MeldError';
export { MeldParseError } from './MeldParseError';
export { MeldResolutionError } from './MeldResolutionError';
export { MeldInterpreterError } from './MeldInterpreterError';
export { MeldImportError } from './MeldImportError';
export { MeldFileSystemError } from './MeldFileSystemError';
export { MeldFileNotFoundError } from './MeldFileNotFoundError';
export { MeldOutputError } from './MeldOutputError';
export { MeldDirectiveError } from './MeldDirectiveError';
export { PathValidationError } from './PathValidationError';
export { ServiceInitializationError } from './ServiceInitializationError'; 

// Export error message collections
export * from './messages/index'; 

// Add exports for specific errors as they are created:
export * from './FieldAccessError';
export * from './VariableResolutionError';
export * from './PathValidationError';
export * from './MeldResolutionError';
export * from './MeldFileNotFoundError';
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