/**
 * Central export point for Mlld error types.
 */

// Export all error types from the errors directory
export { MlldError, ErrorSeverity } from './MlldError';
export { MlldParseError } from './MlldParseError';
export { MlldResolutionError } from './MlldResolutionError';
export { MlldInterpreterError } from './MlldInterpreterError';
export { MlldImportError } from './MlldImportError';
export { MlldFileSystemError } from './MlldFileSystemError';
export { MlldFileNotFoundError } from './MlldFileNotFoundError';
export { MlldOutputError } from './MlldOutputError';
export { MlldDirectiveError } from './MlldDirectiveError';
export { PathValidationError } from './PathValidationError';
export { DataEvaluationError } from './DataEvaluationError';
export { VariableRedefinitionError } from './VariableRedefinitionError';
export { MlldCommandExecutionError } from './MlldCommandExecutionError';
export type { CommandExecutionDetails } from './MlldCommandExecutionError';
export { MlldDependencyError } from './MlldDependencyError';
export { MlldConditionError } from './MlldConditionError';
export { MlldDenialError } from './denial';
export type { DenialContext, DenialCode } from './denial';
export { ResolverError, ResolverErrorCode } from './ResolverError';
export type { ResolverErrorDetails } from './ResolverError';
export { MlldWhenExpressionError } from './MlldWhenExpressionError';
export type { WhenExpressionErrorDetails } from './MlldWhenExpressionError';
export { DeprecationError } from './DeprecationError';
export { GuardError } from './GuardError';
export { GuardRetrySignal } from './GuardRetrySignal';
export { MlldSecurityError } from './MlldSecurityError';
export { CircularReferenceError } from './CircularReferenceError';
export type { CircularReferenceErrorContext } from './CircularReferenceError';
export { MlldBailError, BAIL_EXIT_CODE, isBailError } from './MlldBailError';

// Export error message collections
export * from './messages/index'; 

// Add exports for specific errors as they are created:
export * from './FieldAccessError';
export * from './VariableResolutionError';
export * from './PathValidationError';
export * from './MlldResolutionError';
export * from './MlldFileNotFoundError';
export * from './DataEvaluationError';
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
  // Add other relevant codes from MlldResolutionError, VariableResolutionError etc.
  // E.g., from MlldResolutionError.ts
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
