import type { StateMetadata } from '@tests/utils/debug/StateTrackingService/IStateTrackingService.js';

/**
 * Client interface for StateTrackingService functionality needed by StateService
 * This interface is used to break the circular dependency between StateTrackingService and StateService
 * 
 * @remarks
 * This client interface exposes only the methods that StateService needs from StateTrackingService.
 * It is implemented by a factory to avoid circular dependencies.
 */
interface IStateTrackingServiceClient {
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
  addRelationship(sourceId: string, targetId: string, type: 'parent-child' | 'merge-source' | 'merge-target' | 'clone-original'): void;

  /**
   * Register a relationship between two states with additional metadata.
   * @param relationship - The relationship details including source, target, type, and metadata
   */
  registerRelationship(relationship: {
    sourceId: string;
    targetId: string;
    type: 'parent-child' | 'merge-source' | 'merge-target' | 'clone-original';
    timestamp: number;
    source: string;
  }): void;

  /**
   * Register an event for a state.
   * @param event - The event details
   */
  registerEvent?(event: {
    stateId: string;
    type: string;
    timestamp: number;
    details?: any;
    source: string;
  }): void;

  /**
   * Check if a state is registered with the tracking service.
   * @param stateId - The state ID to check
   * @returns Whether the state is registered
   */
  hasState?(stateId: string): boolean;

  /**
   * Get metadata for a state.
   * @param stateId - The state ID to get metadata for
   * @returns The state metadata, or undefined if not found
   */
  getStateMetadata?(stateId: string): Partial<StateMetadata> | undefined;

  /**
   * Get the parent state ID of a state.
   * @param stateId - The state ID to get the parent for
   * @returns The parent state ID, or undefined if not found
   */
  getParentState?(stateId: string): string | undefined;

  /**
   * Get child state IDs of a state.
   * @param stateId - The state ID to get children for
   * @returns An array of child state IDs
   */
  getChildStates?(stateId: string): string[];

  /**
   * Get relationships for a state.
   * @param stateId - The state ID to get relationships for
   * @returns An array of relationships
   */
  getRelationships?(stateId: string): Array<{
    type: string;
    targetId: string;
  }>;

  /**
   * Get all descendant state IDs of a state.
   * @param stateId - The state ID to get descendants for 
   * @returns An array of descendant state IDs
   */
  getStateDescendants?(stateId: string): string[];
} 

export type { IStateTrackingServiceClient }; 