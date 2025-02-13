import { IStateService } from '../../StateService/IStateService';
import { ResolutionContext, ResolutionErrorCode } from '../IResolutionService';
import { ResolutionError } from '../errors/ResolutionError';

/**
 * Handles resolution of data variables and field access (#{data.field})
 */
export class DataResolver {
  constructor(private stateService: IStateService) {}

  /**
   * Resolve data variables and field access
   */
  async resolve(ref: string, context: ResolutionContext): Promise<any> {
    // Early return if no data variables to resolve
    if (!ref.includes('#{')) {
      return ref;
    }

    let result = ref;
    const varPattern = /#{([^}]+)}/g;
    const matches = ref.match(varPattern);

    if (!matches) {
      return ref;
    }

    // Process each data reference
    for (const match of matches) {
      const path = match.slice(2, -1); // Remove #{ and }
      const [varName, ...fields] = path.split('.');
      
      // Get the base variable
      const value = this.stateService.getDataVar(varName);

      if (value === undefined) {
        throw new ResolutionError(
          `Undefined data variable: ${varName}`,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: varName, context }
        );
      }

      // Access fields if present
      let fieldValue = value;
      if (fields.length > 0 && !context.allowDataFields) {
        throw new ResolutionError(
          'Field access is not allowed in this context',
          ResolutionErrorCode.INVALID_CONTEXT,
          { value: path, context }
        );
      }

      for (const field of fields) {
        if (fieldValue === null || fieldValue === undefined) {
          throw new ResolutionError(
            `Cannot access field '${field}' of undefined or null`,
            ResolutionErrorCode.FIELD_ACCESS_ERROR,
            { value: path, context }
          );
        }

        if (typeof fieldValue !== 'object') {
          throw new ResolutionError(
            `Cannot access field '${field}' of non-object value`,
            ResolutionErrorCode.FIELD_ACCESS_ERROR,
            { value: path, context }
          );
        }

        fieldValue = fieldValue[field];
        if (fieldValue === undefined) {
          throw new ResolutionError(
            `Field not found: ${field} in ${path}`,
            ResolutionErrorCode.FIELD_ACCESS_ERROR,
            { value: path, context }
          );
        }
      }

      // Convert to string if needed
      const stringValue = this.convertToString(fieldValue);
      result = result.split(match).join(stringValue);
    }

    return result;
  }

  /**
   * Extract data variable references from a string
   */
  extractReferences(text: string): string[] {
    const refs: string[] = [];
    const varPattern = /#{([^}]+)}/g;
    let match;

    while ((match = varPattern.exec(text)) !== null) {
      refs.push(match[1].split('.')[0]); // Add the base variable name
    }

    return refs;
  }

  /**
   * Convert a value to its string representation
   */
  private convertToString(value: any): string {
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  }
} 