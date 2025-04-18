import { injectable, inject, container } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IInterpreterService } from '../IInterpreterService.js';
import type { IInterpreterServiceClient } from '../interfaces/IInterpreterServiceClient.js';
import { interpreterLogger as logger } from '@core/utils/logger.js';
import type { MeldNode } from '@core/syntax/types/index.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { StateServiceLike, InterpreterOptionsBase, ClientFactory, InterpreterServiceLike } from '@core/shared-service-types.js';

/**
 * Factory for creating interpreter service clients
 * This factory is used to break the circular dependency between InterpreterService and DirectiveService
 */
@injectable()
@Service({
  description: 'Factory for creating InterpreterService clients'
})
export class InterpreterServiceClientFactory {
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
      interpret: async (nodes: MeldNode[], options?: InterpreterOptionsBase, initialState?: StateServiceLike): Promise<StateServiceLike> => {
        if (!this.interpreterService) throw new Error('Interpreter service not available in client');
        // Return type matches IInterpreterServiceClient
        return await this.interpreterService.interpret(nodes, options, initialState);
      },
      createChildContext: async (
        parentState: StateServiceLike,
        filePath?: string,
        options?: InterpreterOptionsBase
      ): Promise<StateServiceLike> => {
        if (!this.interpreterService) throw new Error('Interpreter service not available in client');
        // Return type matches IInterpreterServiceClient
        return await this.interpreterService.createChildContext(parentState, filePath, options);
      }
    };
  }
} 