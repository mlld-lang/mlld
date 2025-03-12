import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IResolutionService } from '../IResolutionService.js';
import { IResolutionServiceClient } from '../interfaces/IResolutionServiceClient.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';

/**
 * Factory for creating ResolutionServiceClient instances.
 * This factory is used to break the circular dependency between ResolutionService and ParserService.
 */
@injectable()
@Service({
  description: 'Factory for creating resolution service clients'
})
export class ResolutionServiceClientFactory {
  /**
   * Creates a new ResolutionServiceClientFactory.
   * 
   * @param resolutionService - The resolution service to delegate to
   */
  constructor(@inject('IResolutionService') private resolutionService: IResolutionService) {}
  
  /**
   * Creates a new ResolutionServiceClient that delegates to the ResolutionService.
   * 
   * @returns A client that provides the minimal interface needed by ParserService
   */
  createClient(): IResolutionServiceClient {
    logger.debug('Creating ResolutionServiceClient');
    
    return {
      resolveVariableReference: (reference, options) => 
        this.resolutionService.resolveVariableReference(reference, options),
      
      extractSection: (content, heading, options) => 
        this.resolutionService.extractSection(content, heading, options)
    };
  }
} 