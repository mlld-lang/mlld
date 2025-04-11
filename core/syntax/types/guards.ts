import type { InterpolatableValue, TextNode, VariableReferenceNode } from './nodes';

/**
 * Type guard to check if a value is an InterpolatableValue array.
 * Checks if it's an array and if the first element (if any) looks like a TextNode or VariableReferenceNode.
 * TODO: should this go in core/types/guards.ts instead?
 */
export function isInterpolatableValueArray(value: unknown): value is InterpolatableValue {
  return Array.isArray(value) && 
         (value.length === 0 || 
          (value[0] && typeof value[0] === 'object' && ('type' in value[0]) && 
           (value[0].type === 'Text' || value[0].type === 'VariableReference')));
}

// Add other type guards here as needed 