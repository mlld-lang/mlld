// Define a serializable structure for state changes
export interface StateChanges {
  variables: Record<string, any>;
  // TODO: Add other state aspects if directives modify more than variables
}

export interface DirectiveResult {
  stateChanges?: StateChanges; // Changed from IStateService | undefined
  replacement?: MeldNode[] | undefined;
}

/**
 * Interface for directive handlers.
 */ 