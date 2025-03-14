import { DirectiveNode, MeldNode, TextNode, CodeFenceNode } from './nodes';
import { VariableReferenceNode } from './variables';
import { Parser } from './parser';

export interface Example {
  input: string;
  ast: DirectiveNode | TextNode | CodeFenceNode | VariableReferenceNode;
  description?: string;
}

export interface ValidationError {
  message: string;
  code: string;
  node?: MeldNode;
  details?: Record<string, unknown>;
}

export interface ValidationContext {
  parser: Parser;
  strict: boolean;
  allowUndefinedVariables?: boolean;
  allowCircularReferences?: boolean;
  allowUnresolvedPaths?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
} 