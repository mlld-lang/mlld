import { DirectiveNode, MeldNode, TextNode, CodeFenceNode } from './nodes';
import { Parser } from './parser';

export interface Example {
  input: string;
  ast: DirectiveNode;
  description?: string;
}

export interface ValidationError {
  message: string;
  expected?: any;
  received?: any;
  location?: {
    line: number;
    column: number;
  };
}

export interface ValidationContext {
  parser: Parser;
  currentExample?: Example;
  currentConstraint?: string;
}

export interface ImplementationValidator {
  validateSyntax(context: ValidationContext, examples: Example[]): ValidationResult;
  validateConstraints(context: ValidationContext, constraints: string[]): ValidationResult;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
} 