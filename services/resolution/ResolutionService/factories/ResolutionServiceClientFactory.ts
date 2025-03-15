import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IResolutionService, ResolutionContext, StructuredPath } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient.js';
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
      resolveVariables: async (value: string, context: ResolutionContext): Promise<string> => {
        // This is a private method in ResolutionService, but we're exposing it through the client
        // The actual implementation will delegate to the private method
        return this.resolutionService.resolveInContext(value, context);
      },
      
      resolveVariableReference: async (reference: string, context: ResolutionContext): Promise<string> => {
        // Use resolveInContext for variable references
        return this.resolutionService.resolveInContext(reference, context);
      },
      
      extractSection: (content: string, heading: string, fuzzyThreshold?: number): Promise<string> => {
        // Use extractSection from the resolution service
        return this.resolutionService.extractSection(content, heading, fuzzyThreshold);
      },
      
      resolveText: async (text: string, context: ResolutionContext): Promise<string> => {
        // Use resolveText from the resolution service
        return this.resolutionService.resolveText(text, context);
      },
      
      resolveInContext: async (reference: string | StructuredPath, context: ResolutionContext): Promise<string> => {
        // Use resolveInContext from the resolution service
        return this.resolutionService.resolveInContext(reference, context);
      }
    };
  }
} 