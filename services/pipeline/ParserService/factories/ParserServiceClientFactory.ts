import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { IParserServiceClient } from '@services/pipeline/ParserService/interfaces/IParserServiceClient.js';
import { parserLogger as logger } from '@core/utils/logger.js';
import type { MeldNode, InterpolatableValue } from '@core/syntax/types/nodes.js';
import type { ParserOptions } from '@core/ast/index.js';

/**
 * Factory for creating ParserServiceClient instances.
 * This factory is used to break the circular dependency between ParserService and ResolutionService.
 */
@injectable()
@Service({
  description: 'Factory for creating parser service clients'
})
export class ParserServiceClientFactory {
  /**
   * Creates a new ParserServiceClientFactory.
   * 
   * @param parserService - The parser service to delegate to
   */
  constructor(@inject('IParserService') private parserService: IParserService) {}
  
  /**
   * Creates a new ParserServiceClient that delegates to the ParserService.
   * 
   * @returns A client that provides the minimal interface needed by ResolutionService
   */
  createClient(): IParserServiceClient {
    logger.debug('Creating ParserServiceClient');
    
    return {
      parseString: async (content: string, options?: { filePath?: string }): Promise<MeldNode[]> => {
        return this.parserService.parse(content, options?.filePath);
      },
      parseFile: async (filePath: string): Promise<MeldNode[]> => {
        return this.parserService.parseWithLocations(filePath, filePath);
      }
    };
  }
} 