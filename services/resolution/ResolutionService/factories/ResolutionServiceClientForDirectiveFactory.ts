import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { IResolutionService, ResolutionContext, StructuredPath } from '@services/resolution/ResolutionService/IResolutionService';
import type { IResolutionServiceClientForDirective } from '@services/resolution/ResolutionService/interfaces/IResolutionServiceClientForDirective';
import { resolutionLogger as logger } from '@core/utils/logger';
import type { MeldNode, VariableReferenceNode } from '@core/ast/types';
import { JsonValue } from '@core/types';

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
      
      resolveData: (node: VariableReferenceNode, context: ResolutionContext): Promise<JsonValue> => {
        return this.resolutionService.resolveData(node, context);
      },
      
      resolvePath: (path: string | StructuredPath, context: ResolutionContext): Promise<string> => {
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