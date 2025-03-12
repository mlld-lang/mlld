import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { VariableReferenceResolver } from '../resolvers/VariableReferenceResolver.js';
import { IVariableReferenceResolverClient } from '../interfaces/IVariableReferenceResolverClient.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';

/**
 * Factory for creating variable reference resolver clients
 * This factory is used to break the circular dependency between ResolutionService and VariableReferenceResolver
 */
@injectable()
@Service({
  description: 'Factory for creating variable reference resolver clients'
})
export class VariableReferenceResolverClientFactory {
  /**
   * Creates a new VariableReferenceResolverClientFactory
   * @param variableReferenceResolver - The variable reference resolver to create clients for
   */
  constructor(private variableReferenceResolver: VariableReferenceResolver) {}
  
  /**
   * Creates a client for the variable reference resolver
   * @returns A client that provides variable reference resolver functionality
   */
  createClient(): IVariableReferenceResolverClient {
    logger.debug('Creating VariableReferenceResolverClient');
    
    return {
      resolve: (text, context) => {
        return this.variableReferenceResolver.resolve(text, context);
      },
      
      setResolutionTracker: (tracker) => {
        this.variableReferenceResolver.setResolutionTracker(tracker);
      }
    };
  }
} 