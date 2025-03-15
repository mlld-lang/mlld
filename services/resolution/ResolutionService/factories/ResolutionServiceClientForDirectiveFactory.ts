import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IResolutionService, ResolutionContext, StructuredPath } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective.js';
import { resolutionLogger as logger } from '@core/utils/logger.js';
import type { MeldNode } from '@core/syntax/types.js';

/**
 * Factory for creating resolution service clients for DirectiveService
 * This factory is used to break the circular dependency between ResolutionService and DirectiveService
 */
@injectable()
@Service({
  description: 'Factory for creating resolution service clients for directive service'
})
export class ResolutionServiceClientForDirectiveFactory {
  /**
   * Creates a new ResolutionServiceClientForDirectiveFactory
   * @param resolutionService - The resolution service to create clients for
   */
  constructor(@inject('IResolutionService') private resolutionService: IResolutionService) {}
  
  /**
   * Creates a client for the resolution service
   * @returns A client that provides resolution service functionality for directive service
   */
  createClient(): IResolutionServiceClientForDirective {
    logger.debug('Creating ResolutionServiceClientForDirective');
    
    return {
      resolveText: (text: string, context: ResolutionContext): Promise<string> => {
        return this.resolutionService.resolveText(text, context);
      },
      
      resolveData: (ref: string, context: ResolutionContext): Promise<any> => {
        return this.resolutionService.resolveData(ref, context);
      },
      
      resolvePath: (path: string, context: ResolutionContext): Promise<string> => {
        return this.resolutionService.resolvePath(path, context);
      },
      
      resolveContent: (nodes: MeldNode[], context: ResolutionContext): Promise<string> => {
        return this.resolutionService.resolveContent(nodes, context);
      },
      
      resolveInContext: (value: string | StructuredPath, context: ResolutionContext): Promise<string> => {
        return this.resolutionService.resolveInContext(value, context);
      }
    };
  }
} 