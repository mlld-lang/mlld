import type { MeldNode } from '@core/syntax/types/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { VariableType, VariableMetadata } from '@core/types/variables.js';
// Import core types
import type { DirectiveResult as CoreDirectiveResult, StateChanges as CoreStateChanges } from '@core/directives/DirectiveHandler.js';

/**
 * Represents the definition of a variable's value within state changes.
 */
export interface VariableValueDefinition {
  type: VariableType;
  value: any; // Value can be of different types based on VariableType
  metadata?: VariableMetadata;
}

// Re-export core types for local usage if needed, though direct import is preferred
export interface DirectiveResult extends CoreDirectiveResult {
  transformedContent?: string; // Optional string content to replace the directive node
}

export type StateChanges = CoreStateChanges;

// TODO: Review if VariableValueDefinition is still needed or if core VariableDefinition suffices.