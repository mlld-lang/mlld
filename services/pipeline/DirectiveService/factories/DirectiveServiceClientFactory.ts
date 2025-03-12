import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IDirectiveService } from '../IDirectiveService.js';
import { IDirectiveServiceClient } from '../interfaces/IDirectiveServiceClient.js';
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
  /**
   * Creates a new DirectiveServiceClientFactory
   * @param directiveService - The directive service to create clients for
   */
  constructor(@inject('IDirectiveService') private directiveService: IDirectiveService) {}
  
  /**
   * Creates a client for the directive service
   * @returns A client that provides directive service functionality
   */
  createClient(): IDirectiveServiceClient {
    logger.debug('Creating DirectiveServiceClient');
    
    return {
      supportsDirective: (kind) => {
        return this.directiveService.supportsDirective(kind);
      },
      
      getSupportedDirectives: () => {
        return this.directiveService.getSupportedDirectives();
      }
    };
  }
} 