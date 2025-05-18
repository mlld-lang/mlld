/**
 * State service types for managing Meld state
 */
import { MeldNode } from '@core/types/nodes';
import { MeldVariable } from '@core/types/variables';
import { Result } from '@core/types/common';

/**
 * Changes to be applied to the state
 */
export interface StateChanges {
  /** Variables to add or update */
  variables?: MeldVariable[];
  
  /** Imports to register */
  imports?: ImportDefinition[];
  
  /** Commands to register */
  commands?: CommandDefinition[];
  
  /** Nodes to add to the AST */
  nodes?: MeldNode[];
  
  /** Node replacements */
  replacements?: NodeReplacement[];
}

/**
 * Import definition for state tracking
 */
export interface ImportDefinition {
  /** Name of the import */
  name: string;
  
  /** Path to the imported file */
  path: string;
  
  /** Whether this is a wildcard import */
  isWildcard: boolean;
  
  /** Specific items imported (if not wildcard) */
  items?: string[];
}

/**
 * Command definition for state tracking
 */
export interface CommandDefinition {
  /** Name of the command */
  name: string;
  
  /** Command string */
  command: string;
  
  /** Parameters */
  parameters?: string[];
  
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Node replacement information
 */
export interface NodeReplacement {
  /** Node to replace */
  nodeId: string;
  
  /** Replacement nodes */
  replacements: MeldNode[];
}

/**
 * Interface for the state service
 */
export interface IStateService {
  /** Get a variable by name */
  getVariable(name: string): MeldVariable | undefined;
  
  /** Set a variable */
  setVariable(variable: MeldVariable): void;
  
  /** Get all variables */
  getAllVariables(): MeldVariable[];
  
  /** Add nodes to the state */
  addNodes(nodes: MeldNode[]): void;
  
  /** Get nodes by ID */
  getNode(nodeId: string): MeldNode | undefined;
  
  /** Get all nodes */
  getAllNodes(): MeldNode[];
  
  /** Apply state changes */
  applyChanges(changes: StateChanges): Result<void>;
  
  /** Clear all state */
  clear(): void;
}