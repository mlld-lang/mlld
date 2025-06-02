/**
 * Type definitions for the @when conditional directive
 */

import type { DirectiveNode, BaseMlldNode } from './nodes';

/**
 * Modifiers for when block form that control evaluation behavior
 */
export type WhenModifier = 'first' | 'all' | 'any';

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
 * Union type for all when directive nodes
 */
export type WhenNode = WhenSimpleNode | WhenBlockNode;

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
 * Type guard for any when directive
 */
export function isWhenNode(node: DirectiveNode): node is WhenNode {
  return node.kind === 'when';
}