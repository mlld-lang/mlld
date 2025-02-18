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
    
    // Check for matching quotes
    if (!validQuotes.includes(firstChar) || firstChar !== lastChar) {
      return false;
    }

    // Check for unclosed quotes
    let isEscaped = false;
    for (let i = 1; i < value.length - 1; i++) {
      if (value[i] === '\\') {
        isEscaped = !isEscaped;
      } else if (value[i] === firstChar && !isEscaped) {
        return false; // Found an unescaped quote in the middle
      } else {
        isEscaped = false;
      }
    }

    return true;
  }

  public async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Create a new state for modifications
      const newState = context.state.clone();

      // 2. Validate directive structure
      try {
        if (!node || !node.directive) {
          throw new DirectiveError(
            'Invalid directive: missing required fields',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            { node, context }
          );
        }
        await this.validationService.validate(node);
      } catch (error) {
        // If it's already a DirectiveError, just rethrow
        if (error instanceof DirectiveError) {
          throw error;
        }
        // Otherwise wrap in DirectiveError
        const errorMessage = error instanceof Error ? error.message : 'Text directive validation failed';
        throw new DirectiveError(
          errorMessage,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          {
            node,
            context,
            cause: error instanceof Error ? error : new Error(errorMessage),
            location: node.location
          }
        );
      }

      // 3. Get identifier and value from directive
      const { identifier, value } = node.directive;

      // 4. Handle the value based on whether it's a string literal or needs variable resolution
      let resolvedValue: string;
      if (value.startsWith('"') || value.startsWith("'") || value.startsWith('`')) {
        if (!this.isStringLiteral(value)) {
          throw new DirectiveError(
            'Invalid string literal format',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            {
              node,
              context,
              location: node.location
            }
          );
        }
        // For string literals, strip the quotes and handle escapes
        resolvedValue = this.stringLiteralHandler.parseLiteral(value);
      } else {
        // For values with variables, resolve them using the resolution service
        try {
          // Create a resolution context that includes the original state
          const resolutionContext = {
            currentFilePath: context.currentFilePath,
            allowedVariableTypes: {
              text: true,
              data: true,
              path: true,
              command: true
            },
            state: context.state
          };

          // Use the resolution service directly to resolve variables
          resolvedValue = await this.resolutionService.resolveInContext(value, resolutionContext);
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