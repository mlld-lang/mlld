import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IStateTrackingService } from '../IStateTrackingService.js';
import { IStateTrackingServiceClient } from '../interfaces/IStateTrackingServiceClient.js';
import { stateLogger as logger } from '@core/utils/logger.js';

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
      addRelationship: (sourceId, targetId, type) => 
        this.trackingService.addRelationship(sourceId, targetId, type),
      registerRelationship: (relationship) => 
        this.trackingService.registerRelationship(relationship)
    };
  }
} 