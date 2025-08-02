import { MlldDirectiveError } from './MlldDirectiveError';
import type { SourceLocation } from '@core/types';

/**
 * Error thrown when an exec parameter name conflicts with an existing variable.
 * This is to avoid ambiguity in parameter substitution.
 */
export class ExecParameterConflictError extends MlldDirectiveError {
  constructor(
    paramName: string,
    execName: string,
    existingVarLocation: SourceLocation,
    execLocation: SourceLocation
  ) {
    const message = `Exec parameter '${paramName}' in '@${execName}' conflicts with existing variable '@${paramName}'. To avoid ambiguity, mlld doesn't allow exec parameters to use the same name as defined variables. Consider renaming the parameter.`;
    
    super(message, 'exe', {
      context: {
        nodeType: 'exec-parameter-conflict',
        paramName,
        execName,
        existingVarLocation: `${existingVarLocation.filePath}:${existingVarLocation.line}:${existingVarLocation.column}`,
        directiveTrace: {}
      },
      location: execLocation
    });
    
    this.name = 'ExecParameterConflict';
  }

  getHelpText(): string {
    const context = this.details as any;
    return `💡 Consider renaming the parameter to avoid conflicts, e.g., '@${context.execName}(${context.paramName}Data)' or '@${context.execName}(items)'`;
  }
}