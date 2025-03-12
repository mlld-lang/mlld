import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IResolutionService } from '../IResolutionService.js';
import { IResolutionServiceClient } from '../interfaces/IResolutionServiceClient.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';

/**
 * Factory for creating resolution service clients for VariableReferenceResolver
 * This factory is used to break the circular dependency between ResolutionService and VariableReferenceResolver
 */
@injectable()
@Service({
  description: 'Factory for creating resolution service clients'
})
export class ResolutionServiceClientFactory {
  /**
   * Creates a new ResolutionServiceClientFactory
   * @param resolutionService - The resolution service to create clients for
   */
  constructor(@inject('IResolutionService') private resolutionService: IResolutionService) {}
  
  /**
   * Creates a client for the resolution service
   * @returns A client that provides resolution service functionality
   */
  createClient(): IResolutionServiceClient {
    logger.debug('Creating ResolutionServiceClient');
    
    return {
      resolveVariables: async (value, context) => {
        // This is a private method in ResolutionService, but we're exposing it through the client
        // The actual implementation will delegate to the private method
        return this.resolutionService.resolveInContext(value, context);
      }
    };
  }
} 