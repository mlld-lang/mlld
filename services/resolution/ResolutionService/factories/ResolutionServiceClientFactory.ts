import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient';
import { resolutionLogger as logger } from '@core/utils/logger';
import type { StructuredPath } from '@core/shared-service-types';
import type { MeldNode, TextNode, VariableReferenceNode, StructuredPath as SyntaxStructuredPath, InterpolatableValue } from '@core/syntax/types/nodes';
import { VariableType } from '@core/types/variables';
import { MeldPath, createMeldPath, unsafeCreateValidatedResourcePath, RawPath } from '@core/types/paths';

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
      resolveVariableReference: async (reference: string, context: ResolutionContext): Promise<string> => {
        if (!this.resolutionService) throw new Error('Resolution service not available in client');
        return await this.resolutionService.resolveInContext(reference, context);
      },
      
      extractSection: async (content: string, heading: string, fuzzyThreshold?: number): Promise<string> => {
        if (!this.resolutionService) throw new Error('Resolution service not available in client');
        return await this.resolutionService.extractSection(content, heading, fuzzyThreshold);
      },
      
      resolveVariables: async (value: string, context: ResolutionContext): Promise<string> => {
        if (!this.resolutionService) throw new Error('Resolution service not available in client');
        return await this.resolutionService.resolveInContext(value, context);
      },
      
      resolveInContext: async (reference: string | StructuredPath, context: ResolutionContext): Promise<string> => {
        if (!this.resolutionService) throw new Error('Resolution service not available in client');
        return await this.resolutionService.resolveInContext(reference, context);
      },
      
      resolveText: async (text: string, context: ResolutionContext): Promise<string> => {
        if (!this.resolutionService) throw new Error('Resolution service not available in client');
        return await this.resolutionService.resolveInContext(text, context);
      },
      
      resolveFile: async (path: string): Promise<string> => {
        if (!this.resolutionService) throw new Error('Resolution service not available in client');
        try {
          const meldPath = createMeldPath(path as RawPath, unsafeCreateValidatedResourcePath(path));
          return await this.resolutionService.resolveFile(meldPath);
        } catch (error) {
          logger.error(`Error in resolveFile client adapter for path: ${path}`, { error });
          throw error; // Re-throw the error
        }
      },
      
      resolveNodes: async (nodes: InterpolatableValue, context: ResolutionContext): Promise<string> => {
        if (!this.resolutionService) throw new Error('Resolution service not available in client');
        return await this.resolutionService.resolveNodes(nodes, context);
      }
    };
  }
}