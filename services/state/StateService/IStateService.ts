import type { MeldNode } from '@core/ast/types';
import type { MeldVariable } from '@core/types';

/**
 * Minimal state service interface following "AST Knows All" philosophy.
 * 
 * StateService is a simple container for variables and nodes.
 * All intelligence resides in the AST types and service layer.
 */
export interface IStateService {
  /**
   * Unique identifier for this state instance
   */
  readonly stateId: string;
  
  /**
   * Current file path being processed
   */
  currentFilePath: string | null;
  
  // Variable storage methods
  
  /**
   * Get a variable by name
   */
  getVariable(name: string): MeldVariable | undefined;
  
  /**
   * Set a variable (replaces if exists)
   */
  setVariable(variable: MeldVariable): void;
  
  /**
   * Get all variables as a Map
   */
  getAllVariables(): Map<string, MeldVariable>;
  
  // Node storage methods
  
  /**
   * Add a node to the state
   */
  addNode(node: MeldNode): void;
  
  /**
   * Get all nodes
   */
  getNodes(): MeldNode[];
  
  // State management
  
  /**
   * Create a child state that inherits variables from this state
   */
  createChild(): IStateService;
}