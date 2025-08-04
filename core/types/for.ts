import type { DirectiveNode, BaseMlldNode, VariableReferenceNode } from './primitives';

/**
 * Directive node for /for loops
 * Represents: /for @var in @collection => action
 */
export interface ForDirective extends DirectiveNode {
  kind: 'for';
  subtype: 'for';
  values: {
    /** Iteration variable (e.g., @item) */
    variable: VariableReferenceNode[];
    /** Collection to iterate over */
    source: BaseMlldNode[];
    /** Action to execute for each item */
    action: BaseMlldNode[];
  };
  meta: {
    hasVariables: true;
    actionType: 'single';
  };
}

/**
 * Expression node for for...in expressions
 * Represents: for @var in @collection => expression
 * Used in /var and /exe assignments to collect results
 */
export interface ForExpression extends BaseMlldNode {
  type: 'ForExpression';
  /** Iteration variable */
  variable: VariableReferenceNode;
  /** Collection to iterate over */
  source: BaseMlldNode[];
  /** Expression to evaluate for each item */
  expression: BaseMlldNode[];
  meta: {
    isForExpression: true;
  };
}

/**
 * Type guard for ForDirective
 */
export function isForDirective(node: DirectiveNode): node is ForDirective {
  return node.kind === 'for' && node.subtype === 'for';
}

/**
 * Type guard for ForExpression
 */
export function isForExpression(node: BaseMlldNode): node is ForExpression {
  return node.type === 'ForExpression';
}