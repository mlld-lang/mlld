/**
 * Type definitions for the @when conditional directive
 */

import type { DirectiveNode, BaseMlldNode } from './nodes';

/**
 * Modifiers for when block form that control evaluation behavior
 */
export type WhenModifier = 'first';

/**
 * Represents a condition-action pair in when block form
 */
export interface WhenConditionPair {
  condition: BaseMlldNode[];
  action?: BaseMlldNode[];
}

/**
 * Simple form of @when directive: @when <condition> => <action>
 */
export interface WhenSimpleNode extends DirectiveNode {
  kind: 'when';
  subtype: 'whenSimple';
  values: {
    condition: BaseMlldNode[];
    action: BaseMlldNode[];
  };
}

/**
 * Block form of @when directive: @when <var> <modifier>: [...]
 */
export interface WhenBlockNode extends DirectiveNode {
  kind: 'when';
  subtype: 'whenBlock';
  values: {
    variable?: BaseMlldNode[];
    modifier: BaseMlldNode[]; // Text node containing modifier value
    conditions: WhenConditionPair[];
    action?: BaseMlldNode[]; // Optional block-level action
  };
  meta: {
    modifier: WhenModifier;
    conditionCount: number;
    hasVariable?: boolean;
  };
}

/**
 * Match form of @when directive: @when <expression>: [value => action, ...]
 * Evaluates expression and executes actions for all matching conditions
 */
export interface WhenMatchNode extends DirectiveNode {
  kind: 'when';
  subtype: 'whenMatch';
  values: {
    expression: BaseMlldNode[];  // Expression to evaluate
    conditions: WhenConditionPair[]; // value => action pairs
  };
  meta: {
    conditionCount: number;
  };
}

/**
 * Union type for all when directive nodes
 */
export type WhenNode = WhenSimpleNode | WhenBlockNode | WhenMatchNode;

/**
 * Type guard for when simple form
 */
export function isWhenSimpleNode(node: DirectiveNode): node is WhenSimpleNode {
  return node.kind === 'when' && node.subtype === 'whenSimple';
}

/**
 * Type guard for when block form
 */
export function isWhenBlockNode(node: DirectiveNode): node is WhenBlockNode {
  return node.kind === 'when' && node.subtype === 'whenBlock';
}

/**
 * Type guard for when match form
 */
export function isWhenMatchNode(node: DirectiveNode): node is WhenMatchNode {
  return node.kind === 'when' && node.subtype === 'whenMatch';
}

/**
 * Type guard for any when directive
 */
export function isWhenNode(node: DirectiveNode): node is WhenNode {
  return node.kind === 'when';
}

/**
 * Tail modifiers that can be applied to when expression results
 */
export interface TailModifiers {
  pipes?: BaseMlldNode[];
}

/**
 * When expression for value-returning contexts
 * Used in /var and /exe RHS: when: [condition => value, ...]
 */
export interface WhenExpressionNode extends BaseMlldNode {
  type: 'WhenExpression';
  conditions: WhenConditionPair[];
  withClause?: TailModifiers;
  meta: {
    conditionCount: number;
    isValueReturning: true;
    evaluationType: 'expression';
    hasTailModifiers: boolean;
  };
}

/**
 * Type guard for when expressions
 */
export function isWhenExpression(node: BaseMlldNode): node is WhenExpressionNode {
  return node.type === 'WhenExpression';
}