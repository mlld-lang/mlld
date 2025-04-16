import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IResolutionServiceClient } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClient.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import type { StructuredPath } from '@core/shared-service-types.js';
import { MeldPath, createMeldPath, unsafeCreateValidatedResourcePath, RawPath } from '@core/types/paths.js';
import type { MeldNode, TextNode, VariableReferenceNode, StructuredPath as SyntaxStructuredPath } from '@core/syntax/types/nodes.js';
import { VariableType } from '@core/types/variables.js';

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
      
      resolveFile: async (path: string) => {
        if (!this.resolutionService) throw new Error('Resolution service not available in client');
        const meldPath = createMeldPath(path as RawPath, unsafeCreateValidatedResourcePath(path));
        return await this.resolutionService.resolveFile(meldPath);
      }
    };
  }
}

// Helper function (consider moving to a shared test utility)
const createMockVarNode = (identifier: string): VariableReferenceNode => {
  return {
    type: 'VariableReference',
    identifier,
    valueType: VariableType.TEXT, // Assume text for simplicity
    fields: [],
    isVariableReference: true,
    location: { start: { line: 1, column: 1 }, end: { line: 1, column: identifier.length + 4 } }
  };
}; 