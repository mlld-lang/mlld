/**
 * @package
 * Interface for state tracking service.
 */
export interface IStateTrackingService {
  /**
   * Register a state with the tracking service.
   * @param metadata - The state metadata to register
   */
  registerState(metadata: Partial<StateMetadata>): void;

  /**
   * Add a relationship between two states.
   * @param sourceId - The source state ID
   * @param targetId - The target state ID
   * @param type - The type of relationship
   */
  addRelationship(sourceId: string, targetId: string, type: 'parent-child' | 'merge-source' | 'merge-target'): void;

  /**
   * Get the complete lineage of a state from root to the given state.
   * @param stateId - The ID of the state to get lineage for
   * @param visited - Set of visited states to prevent cycles
   * @returns Array of state IDs representing the lineage from root to target state
   */
  getStateLineage(stateId: string, visited?: Set<string>): string[];

  /**
   * Get all descendants of a state.
   * @param stateId - The ID of the state to get descendants for
   * @param visited - Set of visited states to prevent cycles
   * @returns Array of state IDs representing all descendants
   */
  getStateDescendants(stateId: string, visited?: Set<string>): string[];

  /**
   * Get all registered states.
   * @returns Array of state metadata for all registered states
   */
  getAllStates(): StateMetadata[];

  /**
   * Get metadata for a specific state.
   * @param stateId - The ID of the state to get metadata for
   * @returns The state metadata or undefined if not found
   */
  getStateMetadata(stateId: string): Promise<StateMetadata | undefined>;
}

/**
 * Metadata for a state instance.
 */
export interface StateMetadata {
  id: string;
  parentId?: string;
  source: 'new' | 'clone' | 'child' | 'merge' | 'implicit';
  filePath?: string;
  transformationEnabled: boolean;
  createdAt: number;
  lastModified?: number;
  childStates?: string[];
}

/**
 * Represents a relationship between states.
 */
export interface StateRelationship {
  targetId: string;
  type: 'parent-child' | 'merge-source' | 'merge-target';
} 