import { DirectiveNode, DirectiveData } from '../../../../node_modules/meld-spec/dist/types';
// TODO: Use meld-ast nodes and types instead of meld-spec directly
// TODO: Import MeldDirectiveError from core/errors for proper error hierarchy

import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '../../../ResolutionService/ResolutionContextFactory';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';
import { directiveLogger as logger } from '../../../../core/utils/logger';

/**
 * Handler for @data directives
 * Stores JSON-like data in state
 */
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    // Extract directive early so we can use it in error handling
    const directive = node.directive as DirectiveData & { kind: 'data'; name: string; value: any };

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract name and value
      const { name, value } = directive;

      // 3. Store raw value based on type
      if (typeof value === 'string') {
        try {
          // If it's a string that parses as JSON, store the parsed value
          const parsedValue = JSON.parse(value);
          await this.stateService.setDataVar(name, parsedValue);
        } catch {
          // If it doesn't parse as JSON, store as a string
          await this.stateService.setDataVar(name, value);
        }
      } else {
        // For object literals, store as-is
        await this.stateService.setDataVar(name, value);
      }

      logger.debug('Stored data variable', { name, valueType: typeof value });
    } catch (error) {
      // Log error but don't throw in build mode
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Failed to process data directive', {
          name: directive.name,
          error: error instanceof Error ? error.message : String(error),
          filePath: context.currentFilePath
        });
      } else {
        throw error;
      }
    }
  }
} 