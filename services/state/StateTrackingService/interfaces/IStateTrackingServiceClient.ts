import { StateMetadata } from '../IStateTrackingService.js';

/**
 * Client interface for StateTrackingService functionality needed by StateService
 * This interface is used to break the circular dependency between StateTrackingService and StateService
 * 
 * @remarks
 * This client interface exposes only the methods that StateService needs from StateTrackingService.
 * It is implemented by a factory to avoid circular dependencies.
 */
export interface IStateTrackingServiceClient {
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
} 