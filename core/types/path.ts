/**
 * Path directive type definitions
 */
import { DirectiveNode, TypedDirectiveNode } from './base';
import { VariableNodeArray, PathNodeArray } from './values';
import { PathRaw } from './raw';
import { PathDirectiveMeta } from './meta';
import { TTLValue } from './primitives';
import { WithClause } from './run';

/**
 * Path directive values structure
 */
export interface PathValues {
  // Common to all path directive subtypes
  identifier: VariableNodeArray;
  path: PathNodeArray;
  ttl?: TTLValue;
  withClause?: WithClause;
}

/**
 * Base Path directive node
 */
export interface PathDirectiveNode extends TypedDirectiveNode<'path', 'pathAssignment'> {
  values: PathValues;
  raw: PathRaw;
  meta: PathDirectiveMeta;
}

/**
 * Path Assignment directive - @path var = "$PROJECTPATH/value"
 */
export interface PathAssignmentDirectiveNode extends PathDirectiveNode {
  subtype: 'pathAssignment';
  values: {
    identifier: VariableNodeArray;
    path: PathNodeArray;
    ttl?: TTLValue;
    withClause?: WithClause;
  };
  raw: {
    identifier: string;
    path: string;
  };
}

/**
 * Type guard to check if node is a path directive
 */
export function isPathDirective(node: DirectiveNode): node is PathDirectiveNode {
  return node.kind === 'path';
}

/**
 * Type guard to check if node is a path assignment directive
 */
export function isPathAssignmentDirective(node: DirectiveNode): node is PathAssignmentDirectiveNode {
  return isPathDirective(node) && node.subtype === 'pathAssignment';
}

/**
 * Type guard to check if node has a special variable path
 */
export function hasSpecialVariablePath(node: PathAssignmentDirectiveNode): boolean {
  // Check if the path contains a special variable reference (HOMEPATH, PROJECTPATH, etc.)
  if (node.values.path.length > 0) {
    const firstComponent = node.values.path[0];
    if (firstComponent.type === 'string' && 
        (firstComponent.value.startsWith('$HOMEPATH') || 
         firstComponent.value.startsWith('$~') ||
         firstComponent.value.startsWith('$PROJECTPATH') ||
         firstComponent.value.startsWith('$.'))) {
      return true;
    }
    
    // For interpolated strings, check components
    if (firstComponent.type === 'interpolated' && 
        firstComponent.components && 
        firstComponent.components.length > 0 &&
        firstComponent.components[0].type === 'specialVariable') {
      return true;
    }
  }
  
  return false;
}