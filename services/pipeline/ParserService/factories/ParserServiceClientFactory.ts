import { injectable, inject } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import { IParserService } from '../IParserService.js';
import { IParserServiceClient } from '../interfaces/IParserServiceClient.js';
import { parserLogger as logger } from '@core/utils/logger.js';

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
      parseString: (content, options) => this.parserService.parseString(content, options),
      parseFile: (filePath) => this.parserService.parseFile(filePath)
    };
  }
} 