import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IStateServiceClient } from '@services/state/StateService/interfaces/IStateServiceClient.js';
import { stateLogger as logger } from '@core/utils/logger.js';

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
      getAllTextVars: () => this.stateService.getAllTextVars(),
      getAllDataVars: () => this.stateService.getAllDataVars(),
      getAllPathVars: () => this.stateService.getAllPathVars(),
      getAllCommands: () => this.stateService.getAllCommands(),
      isTransformationEnabled: () => this.stateService.isTransformationEnabled()
    };
  }
} 