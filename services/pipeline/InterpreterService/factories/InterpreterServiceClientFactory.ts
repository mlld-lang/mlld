import { injectable, inject, container as globalContainer, DependencyContainer } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IInterpreterService } from '../IInterpreterService.js';
import type { IInterpreterServiceClient } from '../interfaces/IInterpreterServiceClient.js';
import { interpreterLogger as logger } from '@core/utils/logger.js';
import type { MeldNode } from '@core/syntax/types/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { InterpreterOptionsBase } from '@core/shared-service-types.js';
import type { ICircularityService } from '@services/resolution/CircularityService/ICircularityService.js';

/**
 * Factory for creating interpreter service clients
 * This factory is used to break the circular dependency between InterpreterService and DirectiveService
 */
@injectable()
@Service({
  description: 'Factory for creating InterpreterService clients'
})
export class InterpreterServiceClientFactory {
  private interpreterService?: IInterpreterService;
  private container: DependencyContainer;

  /**
   * Creates a new InterpreterServiceClientFactory
   * Injects the container using the 'DependencyContainer' token.
   */
  constructor(
    @inject('DependencyContainer') container: DependencyContainer
  ) {
    this.container = container || globalContainer; // Fallback just in case
    const containerId = (this.container as any).id || (this.container === globalContainer ? 'global' : 'unknown');

    if (this.container === globalContainer) {
      logger.warn('InterpreterServiceClientFactory resolved using global container, might cause issues in tests.');
    }
  }

  /**
   * Sets the interpreter service directly - use only in tests
   * This method is specifically for test scenarios where we need to directly
   * inject a mock or test implementation of the interpreter service
   * @param service The interpreter service implementation to use
   */
  setInterpreterServiceForTests(service: IInterpreterService): void {
    logger.debug('Setting interpreter service directly for tests');
    this.interpreterService = service;
  }
  
  /**
   * Lazily initializes the interpreter service when needed using the factory's container.
   * This breaks the circular dependency by deferring the resolution.
   */
  private getInterpreterService(): IInterpreterService {
    if (!this.interpreterService) {
      logger.debug('Lazily initializing IInterpreterService using factory container', { containerId: (this.container as any).id || 'global' });
      // Use the injected container instance
      this.interpreterService = this.container.resolve<IInterpreterService>('IInterpreterService');
    }
    if (!this.interpreterService) {
      throw new Error('Failed to resolve IInterpreterService from container in factory');
    }
    return this.interpreterService;
  }
  
  /**
   * Creates a client for the interpreter service
   * @returns A client that provides interpreter service functionality
   */
  createClient(): IInterpreterServiceClient {

    logger.debug('Creating InterpreterServiceClient');
    // Ensure the service is fetched using the correct container before creating client methods
    const service = this.getInterpreterService(); 
    
    return {
      interpret: async (nodes: MeldNode[], options?: InterpreterOptionsBase, initialState?: IStateService, circularityService?: ICircularityService): Promise<IStateService> => {
        // Use the already fetched service instance
        return await service.interpret(nodes, options, initialState, circularityService);
      },
      createChildContext: async (
        parentState: IStateService,
        filePath?: string,
        options?: InterpreterOptionsBase
      ): Promise<IStateService> => {
        // Use the already fetched service instance
        return await service.createChildContext(parentState, filePath, options);
      }
    };
  }
} 