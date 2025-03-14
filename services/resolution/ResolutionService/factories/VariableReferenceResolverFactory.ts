import { VariableReferenceResolver } from '@services/resolution/ResolutionService/resolvers/VariableReferenceResolver.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { container, injectable } from 'tsyringe';

/**
 * Factory for creating VariableReferenceResolver instances
 * This factory helps avoid circular dependencies and standardizes resolver creation
 */
@injectable()
export class VariableReferenceResolverFactory {
  constructor() {}

  /**
   * Creates a new VariableReferenceResolver with the required dependencies
   * @param stateService - State service for variable management
   * @param resolutionService - Optional resolution service for nested variables
   * @param parserService - Optional parser service for content parsing
   * @returns A configured VariableReferenceResolver
   */
  createResolver(
    stateService: IStateService,
    resolutionService?: IResolutionService,
    parserService?: IParserService
  ): VariableReferenceResolver {
    // If parser service isn't provided, try to resolve it from container
    if (!parserService) {
      try {
        parserService = container.resolve('ParserService');
      } catch (error) {
        // Optional - if it's not available, resolver will use fallback mechanisms
      }
    }
    
    return new VariableReferenceResolver(
      stateService,
      resolutionService,
      parserService
    );
  }
}