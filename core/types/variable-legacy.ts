/**
 * Unified variable type definitions for the new @var directive
 * 
 * This file defines types for the new unified @var directive that will
 * eventually replace @text, @data, @path, and @exec. During the transition,
 * both old and new types will coexist.
 */

import { TypedDirectiveNode } from './base';
import { ContentNodeArray, VariableNodeArray } from './values';
import { DirectiveNode, ExecInvocation } from './nodes';
import { 
  DataValue, 
  DataObjectValue, 
  DataArrayValue,
  ForeachCommandExpression,
  ForeachSectionExpression 
} from './data';
import { VariableType, VariableCtx, VariableInternal } from './index';

/**
 * Var directive raw values
 */
export interface VarRaw {
  identifier: string;
  value?: string;
  [key: string]: string | undefined; // Allow additional properties for compatibility
}

/**
 * Var directive metadata
 */
export interface VarMeta {
  inferredType?: 'text' | 'data' | 'path' | 'exec';
  [key: string]: unknown;
}

/**
 * Base Var directive node
 */
export interface VarDirectiveNode extends TypedDirectiveNode<'var', 'varAssignment'> {
  values: VarValues;
  raw: VarRaw;
  meta: VarMeta;
}

/**
 * Var values - can be any type of value
 */
export interface VarValues {
  identifier: VariableNodeArray;
  value?: VarValue; // Optional for declarations without initial value
  [key: string]: any; // Allow additional properties for compatibility
}

/**
 * Unified value type for @var directive - can represent any value type
 */
export type VarValue = 
  | ContentNodeArray // String literals, numbers, booleans, paths
  | DataObjectValue // Objects
  | DataArrayValue // Arrays
  | DirectiveNode // Nested directives (@run, @add, etc.)
  | ExecInvocation // Exec invocations
  | ForeachCommandExpression // Foreach command expressions
  | ForeachSectionExpression // Foreach section expressions
  | VarExecDefinition; // Exec definitions (parameterized commands)

/**
 * Exec definition for @var directive
 */
export interface VarExecDefinition {
  type: 'exec';
  params?: string[];
  body: ExecBody;
}

/**
 * Exec body can be a command template or code block
 */
export type ExecBody = 
  | { type: 'command'; template: ContentNodeArray }
  | { type: 'code'; language: string; template: ContentNodeArray };

/**
 * Var Assignment directive - @var name = value
 */
export interface VarAssignmentDirectiveNode extends VarDirectiveNode {
  subtype: 'varAssignment';
  values: {
    identifier: VariableNodeArray;
    value?: VarValue;
  };
  raw: {
    identifier: string;
    value?: string;
  };
}

/**
 * Extended VariableType enum to include VAR
 */
export enum ExtendedVariableType {
  TEXT = 'text',
  DATA = 'data',
  PATH = 'path',
  COMMAND = 'command',
  IMPORT = 'import',
  EXECUTABLE = 'executable',
  VAR = 'var' // New unified type
}

/**
 * Unified variable type that can represent any value
 */
export interface VarVariable {
  type: ExtendedVariableType.VAR;
  name: string;
  value: any; // Can be any type of value
  mx: VariableCtx & {
    inferredType?: 'text' | 'data' | 'path' | 'exec';
  };
  internal: VariableInternal;
}

/**
 * Extended MlldVariable union to include VarVariable
 */
export type ExtendedMlldVariable = 
  | TextVariable
  | DataVariable
  | PathVariable
  | CommandVariable
  | ImportVariable
  | ExecutableVariable
  | VarVariable;

// Import the existing variable types from index.ts
import type { 
  TextVariable, 
  DataVariable, 
  PathVariable, 
  CommandVariable, 
  ImportVariable,
  ExecutableVariable
} from './index';

/**
 * Create a var variable with optional type inference
 */
export function createVarVariable(
  name: string,
  value: any,
  options?: {
    mx?: Partial<VariableCtx & { inferredType?: string }>;
    internal?: Partial<VariableInternal>;
  }
): VarVariable {
  return {
    type: ExtendedVariableType.VAR,
    name,
    value,
    mx: {
      ...options?.mx
    },
    internal: {
      ...options?.internal
    }
  };
}

/**
 * Type guard to check if variable is a VarVariable
 */
export function isVarVariable(variable: ExtendedMlldVariable): variable is VarVariable {
  return (variable as any).type === ExtendedVariableType.VAR;
}

/**
 * Type guard to check if value is an exec definition
 */
export function isVarExecDefinition(value: VarValue): value is VarExecDefinition {
  return typeof value === 'object' && 
         value !== null && 
         !Array.isArray(value) && 
         'type' in value && 
         value.type === 'exec';
}

/**
 * Convert a VarVariable to a specific typed variable based on inferred type
 */
export function convertVarToTypedVariable(
  varVariable: VarVariable
): TextVariable | DataVariable | PathVariable | CommandVariable {
  const inferredType = varVariable.mx?.inferredType;
  
  switch (inferredType) {
    case 'text':
      return {
        type: VariableType.TEXT,
        name: varVariable.name,
        value: String(varVariable.value),
        mx: varVariable.mx,
        internal: varVariable.internal
      };
    
    case 'path':
      return {
        type: VariableType.PATH,
        name: varVariable.name,
        value: {
          resolvedPath: String(varVariable.value),
          isURL: false
        },
        mx: varVariable.mx,
        internal: varVariable.internal
      };
    
    case 'exec':
      // Convert exec definition to command variable
      if (isVarExecDefinition(varVariable.value)) {
        return {
          type: VariableType.COMMAND,
          name: varVariable.name,
          value: {
            type: varVariable.value.body.type === 'command' ? 'command' : 'code',
            paramNames: varVariable.value.params,
            ...(varVariable.value.body.type === 'command'
              ? { commandTemplate: varVariable.value.body.template }
              : { codeTemplate: varVariable.value.body.template, language: varVariable.value.body.language })
          },
          mx: varVariable.mx,
          internal: varVariable.internal
        };
      }
      // Fall through to data if not a proper exec definition
    
    case 'data':
    default:
      return {
        type: VariableType.DATA,
        name: varVariable.name,
        value: varVariable.value,
        mx: varVariable.mx,
        internal: varVariable.internal
      };
  }
}

/**
 * Infer the type of a var value based on its structure
 */
export function inferVarType(value: VarValue): 'text' | 'data' | 'path' | 'exec' {
  // Check for exec definitions
  if (isVarExecDefinition(value)) {
    return 'exec';
  }
  
  // Check for content node arrays (could be text or path)
  if (Array.isArray(value)) {
    // Simple heuristic: if it looks like a path, treat it as path
    // This would need more sophisticated logic in practice
    const firstNode = value[0];
    if (firstNode?.type === 'Text' && 
        (firstNode.content.startsWith('/') || 
         firstNode.content.startsWith('./') || 
         firstNode.content.startsWith('../'))) {
      return 'path';
    }
    return 'text';
  }
  
  // Objects and arrays are data
  if (typeof value === 'object' && value !== null) {
    return 'data';
  }
  
  // Default to text for primitive values
  return 'text';
}