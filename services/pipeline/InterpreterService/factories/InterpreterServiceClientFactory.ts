import { injectable, inject, container } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IInterpreterService, InterpreterOptions } from '@services/pipeline/InterpreterService/IInterpreterService.js';
import type { IInterpreterServiceClient } from '@services/pipeline/InterpreterService/interfaces/IInterpreterServiceClient.js';
import { InterpreterServiceLike, ClientFactory } from '@core/shared-service-types.js';
import { interpreterLogger as logger } from '@core/utils/logger.js';
import type { MeldNode } from '@core/syntax/types/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';

/**
 * Factory for creating interpreter service clients
 * This factory is used to break the circular dependency between InterpreterService and DirectiveService
 */
@injectable()
@Service({
  description: 'Factory for creating interpreter service clients'
})
export class InterpreterServiceClientFactory implements ClientFactory<IInterpreterServiceClient> {
  private interpreterService?: InterpreterServiceLike;

  /**
   * Creates a new InterpreterServiceClientFactory
   * No longer directly depends on IInterpreterService to break circular dependency
   */
  constructor() {
    // No direct dependency injection in constructor
  }
  
  /**
   * Sets the interpreter service directly - use only in tests
   * This method is specifically for test scenarios where we need to directly
   * inject a mock or test implementation of the interpreter service
   * @param service The interpreter service implementation to use
   */
  setInterpreterServiceForTests(service: InterpreterServiceLike): void {
    logger.debug('Setting interpreter service directly for tests');
    this.interpreterService = service;
  }
  
  /**
   * Lazily initializes the interpreter service when needed
   * This breaks the circular dependency by deferring the resolution
   */
  private getInterpreterService(): InterpreterServiceLike {
    if (!this.interpreterService) {
      logger.debug('Lazily initializing IInterpreterService');
      this.interpreterService = container.resolve<IInterpreterService>('IInterpreterService');
    }
    return this.interpreterService;
  }
  
  /**
   * Creates a client for the interpreter service
   * @returns A client that provides interpreter service functionality
   */
  createClient(): IInterpreterServiceClient {
    logger.debug('Creating InterpreterServiceClient');
    
    return {
      interpret: (
        nodes: MeldNode[],
        options?: InterpreterOptions
      ): Promise<IStateService> => {
        return this.getInterpreterService().interpret(nodes, options);
      },
      interpretNode: (
        node: MeldNode,
        state: IStateService,
        options?: InterpreterOptions
      ): Promise<IStateService> => {
        return this.getInterpreterService().interpretNode(node, state, options);
      },
      createChildContext: (
        parentState: IStateService,
        filePath?: string,
        options?: InterpreterOptions
      ): Promise<IStateService> => {
        return this.getInterpreterService().createChildContext(parentState, filePath, options);
      },
    };
  }
} 