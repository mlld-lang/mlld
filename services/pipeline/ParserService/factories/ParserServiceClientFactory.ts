import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { IParserService } from '../IParserService';
import type { IParserServiceClient } from '../interfaces/IParserServiceClient';
import { parserLogger as logger } from '@core/utils/logger';
import type { MeldNode } from '@core/ast/types';
import type { InterpolatableValue } from '@core/types';
import type { ParserOptions } from '@core/ast/index';

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
    // process.stdout.write('DEBUG [ParserServiceClientFactory] createClient() called.\n');
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