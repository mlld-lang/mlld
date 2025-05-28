import { MlldInterpreterError, InterpreterLocation, MlldInterpreterErrorOptions } from './MlldInterpreterError';
import { ErrorSeverity } from './MlldError';
import { formatLocationForError } from '@core/utils/locationFormatter';

export interface VariableRedefinitionContext {
  variableName: string;
  existingLocation?: InterpreterLocation;
  newLocation?: InterpreterLocation;
  filePath?: string;
  suggestion?: string;
}

export interface VariableRedefinitionErrorOptions extends MlldInterpreterErrorOptions {
  context?: VariableRedefinitionContext;
}

/**
 * Error thrown when attempting to redefine an immutable variable
 */
export class VariableRedefinitionError extends MlldInterpreterError {
  public readonly variableRedefinitionContext?: VariableRedefinitionContext;

  constructor(
    message: string,
    options: VariableRedefinitionErrorOptions = {}
  ) {
    const context = options.context;
    const location = context?.newLocation;
    
    // Build enhanced error message with locations
    let enhancedMessage = message; // Use the specific message passed to constructor
    
    if (context?.existingLocation) {
      const locStr = formatLocationForError(context.existingLocation);
      enhancedMessage += `. Originally defined at ${locStr}`;
    }
    
    if (context?.suggestion) {
      enhancedMessage += `. ${context.suggestion}`;
    }

    super(
      enhancedMessage,
      'variable-redefinition',
      location,
      {
        ...options,
        code: 'VARIABLE_REDEFINITION',
        severity: options.severity || ErrorSeverity.Critical
      }
    );

    this.name = 'VariableRedefinitionError';
    this.variableRedefinitionContext = context;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, VariableRedefinitionError.prototype);
  }

  /**
   * Create error for same-file redefinition
   */
  static forSameFile(
    variableName: string,
    existingLocation: InterpreterLocation,
    newLocation: InterpreterLocation
  ): VariableRedefinitionError {
    return new VariableRedefinitionError(
      `Variable '${variableName}' is already defined and cannot be redefined`,
      {
        context: {
          variableName,
          existingLocation,
          newLocation,
          filePath: newLocation?.filePath,
          suggestion: 'Variables in mlld are immutable by design. Use a different variable name or remove one of the definitions.'
        }
      }
    );
  }

  /**
   * Create error for import conflict
   */
  static forImportConflict(
    variableName: string,
    existingLocation: InterpreterLocation,
    newLocation: InterpreterLocation,
    importPath?: string,
    isExistingImported?: boolean
  ): VariableRedefinitionError {
    let message: string;
    let suggestion: string;
    
    if (isExistingImported) {
      message = `Variable '${variableName}' is already imported and cannot be redefined locally`;
      suggestion = importPath
        ? `Consider using import aliases: @import { ${variableName} as ${variableName}Imported } from "${importPath}"`
        : 'Consider using import aliases or a different variable name';
    } else {
      message = `Variable '${variableName}' is already defined locally and cannot be imported`;
      suggestion = `Consider using import aliases: @import { ${variableName} as ${variableName}Imported } from the import file`;
    }

    return new VariableRedefinitionError(
      message,
      {
        context: {
          variableName,
          existingLocation,
          newLocation,
          filePath: newLocation?.filePath,
          suggestion
        }
      }
    );
  }
}