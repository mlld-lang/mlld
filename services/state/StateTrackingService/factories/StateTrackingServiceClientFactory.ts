import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { IStateTrackingService } from '@tests/utils/debug/StateTrackingService/IStateTrackingService';
import type { IStateTrackingServiceClient } from '@services/state/StateTrackingService/interfaces/IStateTrackingServiceClient';
import { stateLogger as logger } from '@core/utils/logger';

/**
 * Factory for creating state tracking service clients
 * This factory is used to break the circular dependency between StateTrackingService and StateService
 */
@injectable()
@Service({
  description: 'Factory for creating state tracking service clients'
})
export class StateTrackingServiceClientFactory {
  /**
   * Creates a new StateTrackingServiceClientFactory
   * @param trackingService - The state tracking service to create clients for
   */
  constructor(@inject('IStateTrackingService') private trackingService: IStateTrackingService) {}
  
  /**
   * Creates a client for the state tracking service
   * @returns A client that provides state tracking service functionality
   */
  createClient(): IStateTrackingServiceClient {
    logger.debug('Creating StateTrackingServiceClient');
    
    return {
      registerState: (metadata) => this.trackingService.registerState(metadata),
      addRelationship: (sourceId, targetId, type) => {
        // The client interface supports 'clone-original' but the service doesn't
        // Map 'clone-original' to 'parent-child' for backward compatibility
        const mappedType = type === 'clone-original' ? 'parent-child' : type;
        this.trackingService.addRelationship(sourceId, targetId, mappedType);
      },
      registerRelationship: (relationship) => {
        // The client interface supports 'clone-original' but the service doesn't
        // Map 'clone-original' to 'parent-child' for backward compatibility
        const mappedRelationship = {
          ...relationship,
          type: relationship.type === 'clone-original' ? 'parent-child' : relationship.type
        };
        this.trackingService.registerRelationship(mappedRelationship);
      },
      registerEvent: (event) => {
        // Optional method
        logger.debug('registerEvent not available in base IStateTrackingService');
      },
      hasState: (stateId) => {
        // Use getAllStates to check if a state exists
        return this.trackingService.getAllStates().some(state => state.id === stateId);
      },
      getStateMetadata: (stateId) => this.trackingService.getStateMetadata(stateId),
      getParentState: (stateId) => {
        // Get the parent ID from metadata
        const metadata = this.trackingService.getStateMetadata(stateId);
        return metadata?.parentId;
      },
      getChildStates: (stateId) => {
        // Get all states and filter for children
        return this.trackingService.getAllStates()
          .filter(state => state.parentId === stateId)
          .map(state => state.id);
      },
      getRelationships: (stateId) => {
        // Not directly available, so return empty array
        return [];
      },
      getStateDescendants: (stateId) => this.trackingService.getStateDescendants(stateId)
    };
  }
} 