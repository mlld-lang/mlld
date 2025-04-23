import type { MeldNode } from '@core/syntax/types/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { VariableType, VariableMetadata } from '@core/types/variables.js';

/**
 * Represents the definition of a variable's value within state changes.
 */
export interface VariableValueDefinition {
  type: VariableType;
  value: any; // Value can be of different types based on VariableType
  metadata?: VariableMetadata;
}

/**
 * Represents the delta of state changes resulting from a directive.
 * Currently includes variable changes. Can be extended for commands, etc.
 */
export interface StateDelta {
  variables?: Record<string, VariableValueDefinition>;
  // commands?: Record<string, CommandDefinitionChange>; // Example extension
}

/**
 * Result of directive execution
 */
export interface DirectiveResult {
  /** The updated state after directive execution */
  state: IStateService; // TODO: Review if this should remain - see _plans/REVIEW-AST-VAR-USAGE.md
  /** Optional replacement node for transformation */
  replacement?: MeldNode;
  /** Optional state changes produced by the directive */
  stateChanges?: StateDelta;
}