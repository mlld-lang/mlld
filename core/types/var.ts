/**
 * Var directive AST node type definitions
 * 
 * This file defines the AST node types for the new @var directive.
 * These types represent the parsed structure from the grammar.
 */

import { TypedDirectiveNode } from './base';
import { ContentNodeArray, VariableNodeArray } from './values';
import { DirectiveNode, ExecInvocation } from './nodes';
import type { PipelineStage } from './run';

/**
 * Data object value structure for var directive
 */
export interface DataObjectValue {
  type: 'object';
  properties: Record<string, DataValue>;
}

/**
 * Data array value structure for var directive
 */
export interface DataArrayValue {
  type: 'array';
  items: DataValue[];
}

/**
 * Foreach command expression structure
 */
export interface ForeachCommandExpression {
  type: 'foreach-command';
  value: {
    type: 'foreach';
    execInvocation: ExecInvocation;
    arrays: (ContentNodeArray | DirectiveNode)[];
    with?: ForeachWithOptions;
    batchPipeline?: ForeachBatchPipeline | null;
    [key: string]: unknown;
  };
  rawText: string;
  batchPipeline?: ForeachBatchPipeline | null;
  [key: string]: unknown;
}

/**
 * Batch pipeline metadata for foreach expressions
 */
export type ForeachBatchPipeline = 
  | PipelineStage[]
  | {
      pipeline: PipelineStage[];
      isBatchPipeline?: boolean;
      [key: string]: unknown;
    };

/**
 * Foreach with-clause options
 */
export interface ForeachWithOptions {
  separator?: unknown;
  template?: unknown;
  batchPipeline?: ForeachBatchPipeline | null;
  isBatchPipeline?: boolean;
  [key: string]: unknown;
}

/**
 * Foreach section expression structure
 */
export interface ForeachSectionExpression {
  type: 'foreachSection';
  template: ContentNodeArray;
  arrays: (ContentNodeArray | DirectiveNode)[];
}

/**
 * Recursive type for data values
 */
export type DataValue = 
  | ContentNodeArray // String literals, numbers, booleans
  | DataObjectValue
  | DataArrayValue
  | DirectiveNode // Nested directive
  | ExecInvocation // Exec invocation
  | ForeachCommandExpression
  | ForeachSectionExpression;

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
 * Var directive values - the parsed AST structure
 */
export interface VarValues {
  identifier: VariableNodeArray;
  value?: VarValue; // Optional for declarations without initial value
  [key: string]: any; // Allow additional properties for compatibility
}

/**
 * AST value type for @var directive - represents parsed values
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
 * Exec definition AST structure
 */
export interface VarExecDefinition {
  type: 'varExec';
  params?: VariableNodeArray[]; // Parameter names as variable nodes
  body: VarExecBody;
}

/**
 * Exec body AST structure
 */
export type VarExecBody = 
  | { type: 'command'; nodes: ContentNodeArray }
  | { type: 'code'; language: string; nodes: ContentNodeArray };

/**
 * Base Var directive AST node
 */
export interface VarDirectiveNode extends TypedDirectiveNode<'var', 'varAssignment'> {
  values: VarValues;
  raw: VarRaw;
  meta: VarMeta;
}

/**
 * Var Assignment directive AST node - @var name = value
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
 * Type guard to check if a node is a var directive
 */
export function isVarDirectiveNode(node: unknown): node is VarDirectiveNode {
  return node && 
         typeof node === 'object' && 
         node.type === 'Directive' && 
         node.kind === 'var';
}

/**
 * Type guard to check if a value is a var exec definition
 */
export function isVarExecDefinition(value: VarValue): value is VarExecDefinition {
  return typeof value === 'object' && 
         value !== null && 
         !Array.isArray(value) && 
         'type' in value && 
         value.type === 'varExec';
}

/**
 * Type guard to check if content is a nested directive
 */
export function isNestedDirective(content: VarValue): content is DirectiveNode {
  return typeof content === 'object' &&
         content !== null &&
         !Array.isArray(content) && 
         'kind' in content;
}

/**
 * Type guard to check if content is a data object
 */
export function isDataObject(value: VarValue): value is DataObjectValue {
  return typeof value === 'object' && 
         value !== null &&
         !Array.isArray(value) && 
         'type' in value && 
         value.type === 'object';
}

/**
 * Type guard to check if content is a data array
 */
export function isDataArray(value: VarValue): value is DataArrayValue {
  return typeof value === 'object' && 
         value !== null &&
         !Array.isArray(value) && 
         'type' in value && 
         value.type === 'array';
}

/**
 * Type guard to check if value is a primitive (string, number, boolean, null)
 */
export function isPrimitiveValue(value: unknown): value is string | number | boolean | null {
  return value === null || 
         typeof value === 'string' || 
         typeof value === 'number' || 
         typeof value === 'boolean';
}

/**
 * Type guard to check if value is a directive node
 */
export function isDirectiveValue(value: unknown): value is DirectiveNode {
  return typeof value === 'object' &&
         value !== null &&
         'type' in value &&
         value.type === 'Directive' &&
         'kind' in value;
}

/**
 * Type guard to check if value is a variable reference node
 */
export function isVariableReferenceValue(value: unknown): value is ContentNodeArray {
  if (!Array.isArray(value)) return false;
  return value.some(node => 
    typeof node === 'object' &&
    node !== null &&
    'type' in node &&
    node.type === 'VariableReference'
  );
}

/**
 * Type guard to check if value is a template (array with Text/VariableReference nodes)
 */
export function isTemplateValue(value: unknown): value is ContentNodeArray {
  if (!Array.isArray(value)) return false;
  return value.some(node => 
    typeof node === 'object' &&
    node !== null &&
    'type' in node &&
    (node.type === 'Text' || node.type === 'VariableReference')
  );
}

/**
 * Type guard to check if value is a data object value
 */
export function isDataObjectValue(value: unknown): value is DataObjectValue {
  return typeof value === 'object' && 
         value !== null &&
         !Array.isArray(value) && 
         'type' in value && 
         value.type === 'object';
}

/**
 * Type guard to check if value is a data array value
 */
export function isDataArrayValue(value: unknown): value is DataArrayValue {
  return typeof value === 'object' && 
         value !== null &&
         !Array.isArray(value) && 
         'type' in value && 
         value.type === 'array';
}

/**
 * Type guard to check if value is an embed directive
 */
export function isEmbedDirectiveValue(value: unknown): boolean {
  return isDirectiveValue(value) && value.kind === 'embed';
}

/**
 * Type guard to check if value is a run directive
 */
export function isRunDirectiveValue(value: unknown): boolean {
  return isDirectiveValue(value) && value.kind === 'run';
}

/**
 * Type guard to check if content is a nested embed directive
 */
export function isNestedEmbedDirective(content: unknown): boolean {
  return isDirectiveValue(content) && content.kind === 'embed';
}

/**
 * Type guard to check if content is a nested run directive
 */
export function isNestedRunDirective(content: unknown): boolean {
  return isDirectiveValue(content) && content.kind === 'run';
}

/**
 * Type guard to check if content is a content node array (primitive value)
 */
export function isContentNodes(value: VarValue): value is ContentNodeArray {
  return Array.isArray(value);
}

/**
 * Type guard to check if var contains a foreach expression
 */
export function isForeachExpression(value: VarValue): value is ForeachCommandExpression | ForeachSectionExpression {
  return typeof value === 'object' && 
         value !== null &&
         !Array.isArray(value) && 
         'type' in value && 
         (value.type === 'foreach-command' || value.type === 'foreach-section');
}
