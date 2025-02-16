import { DirectiveNode, TextDirective } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';

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

      // 2. Get validated directive
      const directive = node.directive as TextDirective;
      const { identifier, value } = directive;

      // 3. Process value based on type
      if (!value) {
        throw new DirectiveError(
          'Text directive requires a value',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { node }
        );
      }

      // Check if this is a pass-through directive
      if (value.startsWith('@embed') || value.startsWith('@run') || value.startsWith('@call')) {
        await this.stateService.setTextVar(identifier, value);
        return;
      }

      // Create resolution context
      const resolutionContext = ResolutionContextFactory.forTextDirective(
        context.currentFilePath
      );

      // Resolve variables in the value
      const resolvedValue = await this.resolutionService.resolveInContext(
        value,
        resolutionContext
      );

      // 4. Store in state
      await this.stateService.setTextVar(identifier, resolvedValue);

      logger.debug('Text directive processed successfully', {
        identifier,
        value: resolvedValue,
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