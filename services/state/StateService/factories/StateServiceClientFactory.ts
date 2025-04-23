import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IStateServiceClient } from '@services/state/StateService/interfaces/IStateServiceClient';
import { stateLogger as logger } from '@core/utils/logger';

/**
 * Factory for creating state service clients
 * This factory is used to break the circular dependency between StateService and StateTrackingService
 */
@injectable()
@Service({
  description: 'Factory for creating state service clients'
})
export class StateServiceClientFactory {
  /**
   * Creates a new StateServiceClientFactory
   * @param stateService - The state service to create clients for
   */
  constructor(@inject('IStateService') private stateService: IStateService) {}
  
  /**
   * Creates a client for the state service
   * @returns A client that provides state service functionality
   */
  createClient(): IStateServiceClient {
    logger.debug('Creating StateServiceClient');
    
    return {
      getStateId: () => this.stateService.getStateId(),
      getCurrentFilePath: () => this.stateService.getCurrentFilePath(),
      // TODO: Re-implement these if StateTrackingService truly needs raw maps
      // getAllTextVars: () => /* ... */,
      // getAllDataVars: () => /* ... */,
      // getAllPathVars: () => /* ... */,
      // getAllCommands: () => /* ... */,
      isTransformationEnabled: () => this.stateService.isTransformationEnabled()
    };
  }
} 