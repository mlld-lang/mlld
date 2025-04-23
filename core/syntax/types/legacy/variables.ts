import { container } from 'tsyringe';
import { 
  VariableType,
  Field,
  SourceLocation,
  SPECIAL_PATH_VARS,
  ENV_VAR_PREFIX,
  VAR_PATTERNS
} from '@core/syntax/types/interfaces/index';
import { VariableNodeFactory } from '@core/syntax/types/factories/index';

/**
 * Legacy function to create variable reference nodes
 * @deprecated Use VariableNodeFactory directly
 */
export function createVariableReferenceNode(
  identifier: string,
  valueType: VariableType,
  fields?: Field[],
  format?: string,
  location?: SourceLocation
) {
  const factory = container.resolve(VariableNodeFactory);
  return factory.createVariableReferenceNode(identifier, valueType, fields, format, location);
}

/**
 * Legacy function to check if a node is a variable reference node
 * @deprecated Use VariableNodeFactory directly
 */
export function isVariableReferenceNode(node: any) {
  const factory = container.resolve(VariableNodeFactory);
  return factory.isVariableReferenceNode(node);
}

/**
 * Legacy function to validate a field array
 * @deprecated Use VariableNodeFactory directly
 */
export function isValidFieldArray(fields: any[]): fields is Field[] {
  const factory = container.resolve(VariableNodeFactory);
  return factory.isValidFieldArray(fields);
}

// Re-export constants for backward compatibility
export { SPECIAL_PATH_VARS, ENV_VAR_PREFIX, VAR_PATTERNS };
export type { VariableType, Field };