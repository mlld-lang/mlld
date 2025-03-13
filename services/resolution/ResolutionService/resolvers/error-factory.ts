import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { ResolutionErrorCode } from '@services/resolution/ResolutionService/IResolutionService.js';

/**
 * Factory to create consistent error objects for variable resolution
 */
export class VariableResolutionErrorFactory {
  /**
   * Create an error for a variable not found
   */
  static variableNotFound(variableName: string): MeldResolutionError {
    return new MeldResolutionError(
      `Variable ${variableName} not found`,
      {
        code: ResolutionErrorCode.VARIABLE_NOT_FOUND,
        severity: ErrorSeverity.Error,
        details: { variable: variableName, variableName }
      }
    );
  }
  
  /**
   * Create an error for a field not found
   */
  static fieldNotFound(variableName: string, field: string): MeldResolutionError {
    return new MeldResolutionError(
      `Field ${field} not found in variable ${variableName}`,
      {
        code: ResolutionErrorCode.FIELD_NOT_FOUND,
        severity: ErrorSeverity.Error,
        details: { variable: variableName, field, variableName }
      }
    );
  }
  
  /**
   * Create an error for invalid access (e.g., field access on primitive)
   */
  static invalidAccess(variableName: string, message: string): MeldResolutionError {
    return new MeldResolutionError(
      message,
      {
        code: ResolutionErrorCode.INVALID_ACCESS,
        severity: ErrorSeverity.Error,
        details: { variable: variableName, variableName }
      }
    );
  }
  
  /**
   * Create an error for array index out of bounds
   */
  static indexOutOfBounds(
    path: string, 
    index: number, 
    length: number
  ): MeldResolutionError {
    return new MeldResolutionError(
      `Array index ${index} out of bounds for array of length ${length}`,
      {
        code: ResolutionErrorCode.INVALID_ACCESS,
        severity: ErrorSeverity.Error,
        details: { path, index, length }
      }
    );
  }
  
  /**
   * Create a general field access error
   */
  static fieldAccessError(
    message: string, 
    variableName: string
  ): MeldResolutionError {
    return new MeldResolutionError(
      message,
      {
        code: ResolutionErrorCode.FIELD_ACCESS_ERROR,
        severity: ErrorSeverity.Recoverable,
        details: { variableName }
      }
    );
  }
}