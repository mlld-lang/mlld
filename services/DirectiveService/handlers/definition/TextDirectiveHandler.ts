import { DirectiveNode, TextDirective } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService';
import { IValidationService } from '../../../ValidationService/IValidationService';
import { IStateService } from '../../../StateService/IStateService';
import { IResolutionService } from '../../../ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '../../../ResolutionService/ResolutionContextFactory';
import { directiveLogger as logger } from '../../../../core/utils/logger';
import { DirectiveError, DirectiveErrorCode } from '../../errors/DirectiveError';

/**
 * Handler for @text directives
 * Stores text values in state after resolving variables and processing embedded content
 */
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<void> {
    logger.debug('Processing text directive', {
      location: node.location,
      context
    });

    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);
      const directive = node.directive as TextDirective;

      // 2. Extract name and value
      const { name, value } = directive;

      // 3. Process value based on type
      let resolvedValue: string;

      if (value.startsWith('@embed') || value.startsWith('@run') || value.startsWith('@call')) {
        // For embedded content, we need to process the directive
        // This will be handled by the appropriate handler via DirectiveService
        resolvedValue = value; // Keep as is - will be processed by interpreter
      } else {
        // For regular string values, resolve any variables
        const resolutionContext = ResolutionContextFactory.forTextDirective(
          context.currentFilePath
        );

        // Remove quotes from string literals before resolution
        const unquotedValue = this.removeQuotes(value);
        resolvedValue = await this.resolutionService.resolveInContext(
          unquotedValue,
          resolutionContext
        );
      }

      // 4. Store in state
      await this.stateService.setTextVar(name, resolvedValue);

      logger.debug('Text directive processed successfully', {
        name,
        location: node.location
      });
    } catch (error) {
      logger.error('Failed to process text directive', {
        location: node.location,
        error
      });

      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error.message,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error
        }
      );
    }
  }

  /**
   * Remove quotes from a string literal while preserving the content
   */
  private removeQuotes(value: string): string {
    const firstChar = value[0];
    if (["'", '"', '`'].includes(firstChar) && value.endsWith(firstChar)) {
      return value.slice(1, -1);
    }
    return value;
  }
} 