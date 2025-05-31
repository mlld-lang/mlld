/**
 * Type definitions for the output directive
 */
import { 
  TypedDirectiveNode,
  BaseMlldNode,
  TextNode,
  VariableReferenceNode
} from './base';

// Output directive subtypes
export type OutputSubtype = 
  | 'outputResolver'
  | 'outputFile' 
  | 'outputCommand';

// Base output directive interface
export interface OutputDirectiveBase extends TypedDirectiveNode<'output', OutputSubtype> {
  kind: 'output';
  values: {
    source: VariableReferenceNode[];
    target: BaseMlldNode[];
    format?: TextNode[];
  };
  raw: {
    source: string;
    target: string;
    format?: string;
  };
  meta: {
    targetType: OutputSubtype;
    format: string;
    explicitFormat: boolean;
  };
}

// Specific output directive types
export interface OutputResolverDirective extends OutputDirectiveBase {
  subtype: 'outputResolver';
}

export interface OutputFileDirective extends OutputDirectiveBase {
  subtype: 'outputFile';
}

export interface OutputCommandDirective extends OutputDirectiveBase {
  subtype: 'outputCommand';
}

// Union of all output directive types
export type OutputDirective = 
  | OutputResolverDirective
  | OutputFileDirective
  | OutputCommandDirective;

// Type guards
export function isOutputDirective(node: BaseMlldNode): node is OutputDirective {
  return node.type === 'Directive' && (node as any).kind === 'output';
}

export function isOutputResolverDirective(node: BaseMlldNode): node is OutputResolverDirective {
  return isOutputDirective(node) && node.subtype === 'outputResolver';
}

export function isOutputFileDirective(node: BaseMlldNode): node is OutputFileDirective {
  return isOutputDirective(node) && node.subtype === 'outputFile';
}

export function isOutputCommandDirective(node: BaseMlldNode): node is OutputCommandDirective {
  return isOutputDirective(node) && node.subtype === 'outputCommand';
}