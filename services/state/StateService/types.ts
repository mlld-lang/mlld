import type { MeldNode } from '@core/syntax/types/index';
import type {
  TextVariable,
  DataVariable,
  IPathVariable,
  CommandVariable,
  TransformationOptions
} from '@core/types/index';
import type { IStateService } from './IStateService';

/**
 * Command definition with optional configuration
 * @deprecated This will be replaced by ICommandDefinition from @core/types/define.js
 */
export interface CommandDefinition {
  readonly command: string;
  readonly options?: Readonly<Record<string, unknown>>;
}

/**
 * Represents a state node in the state tree
 */
export interface StateNode {
  stateId: string;
  source?: 'clone' | 'merge' | 'new' | 'child' | 'implicit';
  filePath?: string;
  readonly variables: {
    readonly text: Map<string, TextVariable>;
    readonly data: Map<string, DataVariable>;
    readonly path: Map<string, IPathVariable>;
  };
  readonly commands: Map<string, CommandVariable>;
  readonly nodes: MeldNode[];
  readonly transformedNodes?: MeldNode[];
  readonly imports: Set<string>;
  readonly transformationOptions: TransformationOptions;
  readonly createdAt: number;
  readonly modifiedAt: number;
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