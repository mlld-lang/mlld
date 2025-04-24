import type {
  StateMetadataBase,
  StateRelationshipBase,
  StateTrackingServiceBase
} from '@core/shared/types';
import { VariableType } from '@core/types/variables';

/**
 * @package
 * Interface for state tracking service.
 */
interface IStateTrackingService extends StateTrackingServiceBase {
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
   * Register a relationship between two states with additional metadata.
   * @param relationship - The relationship details including source, target, type, and metadata
   */
  registerRelationship(relationship: {
    sourceId: string;
    targetId: string;
    type: 'parent-child' | 'merge-source' | 'merge-target';
    timestamp: number;
    source: string;
  }): void;

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
  getStateMetadata(stateId: string): StateMetadata | undefined;

  /**
   * Track a context boundary between two states.
   * @param sourceStateId - The source state ID
   * @param targetStateId - The target state ID
   * @param boundaryType - The type of boundary
   * @param filePath - Optional file path associated with the boundary
   */
  trackContextBoundary(
    sourceStateId: string, 
    targetStateId: string, 
    boundaryType: 'import' | 'embed',
    filePath?: string
  ): void;

  /**
   * Track a variable crossing between two states.
   * @param sourceStateId - The source state ID
   * @param targetStateId - The target state ID
   * @param variableName - The name of the variable
   * @param variableType - The type of variable
   * @param alias - Optional alias for the variable in the target state
   */
  trackVariableCrossing(
    sourceStateId: string,
    targetStateId: string,
    variableName: string,
    variableType: VariableType,
    alias?: string
  ): void;

  /**
   * Get all context boundaries.
   * @returns Array of context boundaries
   */
  getContextBoundaries(): ContextBoundary[];

  /**
   * Get variable crossings for a state.
   * @param stateId - The ID of the state to get variable crossings for
   * @returns Array of variable crossings
   */
  getVariableCrossings(stateId: string): VariableCrossing[];

  /**
   * Get the context hierarchy for a state.
   * @param rootStateId - The ID of the root state
   * @returns Context hierarchy information
   */
  getContextHierarchy(rootStateId: string): ContextHierarchyInfo;
}

/**
 * Metadata for a state instance.
 */
interface StateMetadata extends StateMetadataBase {
  childStates?: string[];
}

/**
 * Represents a relationship between states.
 */
interface StateRelationship extends StateRelationshipBase {}

/**
 * Represents a context boundary between states.
 */
interface ContextBoundary {
  sourceStateId: string;
  targetStateId: string;
  boundaryType: 'import' | 'embed';
  filePath?: string;
  createdAt: number;
}

/**
 * Represents a variable crossing between states.
 */
interface VariableCrossing {
  sourceStateId: string;
  targetStateId: string;
  variableName: string;
  variableType: 'text' | 'data' | 'path' | 'command';
  timestamp: number;
  alias?: string;
}

/**
 * Information about the context hierarchy.
 */
interface ContextHierarchyInfo {
  rootStateId: string;
  states: StateMetadata[];
  boundaries: ContextBoundary[];
  variableCrossings: VariableCrossing[];
}

export type { 
  IStateTrackingService, 
  StateMetadata, 
  StateRelationship, 
  ContextBoundary, 
  VariableCrossing, 
  ContextHierarchyInfo 
}; 