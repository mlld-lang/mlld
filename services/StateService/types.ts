import type { MeldNode } from 'meld-spec';

/**
 * Command definition with optional configuration
 */
export interface CommandDefinition {
  readonly command: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Represents an immutable state node in the Meld interpreter
 */
export interface StateNode {
  readonly variables: {
    readonly text: ReadonlyMap<string, string>;
    readonly data: ReadonlyMap<string, unknown>;
    readonly path: ReadonlyMap<string, string>;
  };
  readonly commands: ReadonlyMap<string, CommandDefinition>;
  readonly imports: ReadonlySet<string>;
  readonly nodes: ReadonlyArray<MeldNode>;
  readonly transformedNodes?: ReadonlyArray<MeldNode>;
  readonly filePath?: string;
  readonly parentState?: StateNode;
}

/**
 * Represents an operation performed on the state
 */
export interface StateOperation {
  readonly type: 'create' | 'merge' | 'update';
  readonly timestamp: number;
  readonly source: string;
  readonly details: {
    readonly operation: string;
    readonly key?: string;
    readonly value?: unknown;
  };
}

/**
 * Options for creating a new state node
 */
export interface StateNodeOptions {
  readonly parentState?: StateNode;
  readonly filePath?: string;
  readonly source?: string;
}

/**
 * Factory for creating and manipulating immutable state nodes
 */
export interface IStateFactory {
  /**
   * Creates a new empty state node
   */
  createState(options?: StateNodeOptions): StateNode;

  /**
   * Creates a child state node that inherits from a parent
   */
  createChildState(parent: StateNode, options?: StateNodeOptions): StateNode;

  /**
   * Merges a child state back into its parent, creating a new state node
   */
  mergeStates(parent: StateNode, child: StateNode): StateNode;

  /**
   * Updates a state node with new values, creating a new state node
   */
  updateState(state: StateNode, updates: Partial<StateNode>): StateNode;
} 