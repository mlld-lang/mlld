import type { MeldNode } from '@core/syntax/types/index';
import type { VariableDefinition } from '@core/types/variables'; // Import canonical definition

// Define a serializable structure for state changes
export interface StateChanges {
  variables?: Record<string, VariableDefinition>; // Use canonical VariableDefinition, make optional
  // TODO: Add other state aspects if directives modify more than variables
}

export interface DirectiveResult {
  stateChanges?: StateChanges; // Changed from IStateService | undefined
  replacement?: MeldNode[] | undefined;
}

/**
 * Interface for directive handlers.
 */