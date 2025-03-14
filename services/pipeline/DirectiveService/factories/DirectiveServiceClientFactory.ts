import { injectable, inject, container } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IDirectiveService } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { IDirectiveServiceClient } from '@services/pipeline/DirectiveService/interfaces/IDirectiveServiceClient.js';
import { directiveLogger as logger } from '@core/utils/logger.js';

/**
 * Factory for creating directive service clients
 * This factory is used to break the circular dependency between DirectiveService and ResolutionService
 */
@injectable()
@Service({
  description: 'Factory for creating directive service clients'
})
export class DirectiveServiceClientFactory {
  private directiveService?: IDirectiveService;

  /**
   * Creates a new DirectiveServiceClientFactory
   * No longer directly depends on IDirectiveService to break circular dependency
   */
  constructor() {
    // No direct dependency injection in constructor
  }
  
  /**
   * Lazily initializes the directive service when needed
   * This breaks the circular dependency by deferring the resolution
   */
  private getDirectiveService(): IDirectiveService {
    if (!this.directiveService) {
      logger.debug('Lazily initializing IDirectiveService');
      this.directiveService = container.resolve<IDirectiveService>('IDirectiveService');
    }
    return this.directiveService;
  }
  
  /**
   * Creates a client for the directive service
   * @returns A client that provides directive service functionality
   */
  createClient(): IDirectiveServiceClient {
    logger.debug('Creating DirectiveServiceClient');
    
    return {
      supportsDirective: (kind) => {
        return this.getDirectiveService().supportsDirective(kind);
      },
      
      getSupportedDirectives: () => {
        return this.getDirectiveService().getSupportedDirectives();
      },
      
      handleDirective: (node, context) => {
        return this.getDirectiveService().handleDirective(node, context);
      }
    };
  }
} 