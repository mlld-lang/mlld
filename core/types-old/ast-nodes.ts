/**
 * AST Node Types
 * 
 * This file contains the type definitions for the Meld AST
 * It will be populated by the AST explorer during build
 */

/**
 * Base AST Node
 */
export interface ASTNode {
  type: string;
  location?: {
    start: {
      line: number;
      column: number;
    };
    end: {
      line: number;
      column: number;
    };
  };
}

/**
 * Directive Node Base
 */
export interface DirectiveNode extends ASTNode {
  type: 'Directive';
  kind: string;
  subtype: string;
  values: Record<string, any>;
  raw: Record<string, string>;
  meta: {
    sourceType: 'literal' | 'template' | 'directive';
  };
}

// Placeholder for TextDirectiveNode (will be generated from examples)
export type TextDirectiveNode = DirectiveNode;

// Placeholder for RunDirectiveNode (will be generated from examples)
export type RunDirectiveNode = DirectiveNode;

// Placeholder for ImportDirectiveNode (will be generated from examples)
export type ImportDirectiveNode = DirectiveNode;

// Union type of all directive nodes
export type DirectiveUnion = 
  | TextDirectiveNode
  | RunDirectiveNode
  | ImportDirectiveNode;