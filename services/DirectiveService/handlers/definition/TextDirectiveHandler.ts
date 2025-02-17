import { DirectiveNode } from 'meld-spec';
import { IDirectiveHandler, DirectiveContext } from '@services/DirectiveService/IDirectiveService.js';
import { IValidationService } from '@services/ValidationService/IValidationService.js';
import { IStateService } from '@services/StateService/IStateService.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/DirectiveService/errors/DirectiveError.js';
import { StringLiteralHandler } from '@services/ResolutionService/resolvers/StringLiteralHandler.js';
import { VariableReferenceResolver } from '@services/ResolutionService/resolvers/VariableReferenceResolver.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';

/**
 * Handler for @text directives
 * Stores text values in state after resolving variables and processing embedded content
 */
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';
  private stringLiteralHandler: StringLiteralHandler;
  private variableReferenceResolver: VariableReferenceResolver;

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {
    this.stringLiteralHandler = new StringLiteralHandler();
    this.variableReferenceResolver = new VariableReferenceResolver(
      stateService,
      resolutionService
    );
  }

  /**
   * Checks if a value appears to be a string literal
   * This is a preliminary check before full validation
   */
  private isStringLiteral(value: string): boolean {
    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    const validQuotes = ["'", '"', '`'];
    return validQuotes.includes(firstChar) && firstChar === lastChar;
  }

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Create a new state for modifications
      const newState = context.state.clone();

      // 2. Validate directive structure
      try {
        await this.validationService.validate(node);
      } catch (error) {
        throw new DirectiveError(
          'Text directive validation failed',
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            context,
            cause: error instanceof Error ? error : undefined,
            location: node.location
          }
        );
      }

      // 3. Get identifier and value from directive
      const { identifier, value } = node.directive;

      // 4. Resolve any variables in the value
      let resolvedValue: string;
      try {
        resolvedValue = await this.resolutionService.resolveInContext(value, {
          ...context,
          allowedVariableTypes: {
            text: true,
            data: true,
            path: true,
            command: true
          }
        });
      } catch (error) {
        if (error instanceof ResolutionError) {
          throw new DirectiveError(
            'Failed to resolve variables in text directive',
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            {
              node,
              context,
              cause: error,
              location: node.location
            }
          );
        }
        throw error;
      }

      // 5. Set the resolved value in the new state
      newState.setTextVar(identifier, resolvedValue);

      return newState;
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        'Failed to process text directive',
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location
        }
      );
    }
  }
} 