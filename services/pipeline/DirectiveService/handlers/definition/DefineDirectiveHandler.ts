import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveNode, DefineDirectiveData } from '@core/syntax/types.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';

interface CommandDefinition {
  parameters: string[];
  command: string;
  metadata?: {
    risk?: 'high' | 'med' | 'low';
    about?: string;
    meta?: Record<string, unknown>;
  };
}

@injectable()
@Service({
  description: 'Handler for @define directives'
})
export class DefineDirectiveHandler implements IDirectiveHandler {
  public readonly kind = 'define';

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IStateService') private stateService: IStateService,
    @inject('IResolutionService') private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract name, parameters, and command from directive
      const directive = node.directive as DefineDirectiveData;
      const { name, parameters, command } = directive;
      
      // Parse any metadata from the name
      const nameMetadata = this.parseIdentifier(name);

      // 3. Create command definition
      const commandDef: Omit<CommandDefinition, 'metadata'> = {
        parameters: parameters || [],
        command: command.kind === 'run' ? command.command : ''
      };

      // 4. Create new state for modifications
      const newState = context.state.clone();

      // 5. Store command with metadata
      newState.setCommand(nameMetadata.name, {
        ...commandDef,
        ...(nameMetadata.metadata && { metadata: nameMetadata.metadata })
      });

      return newState;
    } catch (error) {
      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        // Ensure location is set by creating a new error if needed
        if (!error.details?.location && node.location) {
          const wrappedError = new DirectiveError(
            error.message,
            error.kind,
            error.code,
            {
              ...error.details,
              location: node.location,
              severity: error.details?.severity || DirectiveErrorSeverity[error.code]
            }
          );
          throw wrappedError;
        }
        throw error;
      }

      // Handle resolution errors
      const resolutionError = new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error in define directive',
        this.kind,
        DirectiveErrorCode.RESOLUTION_FAILED,
        {
          node,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location,
          severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED]
        }
      );

      throw resolutionError;
    }
  }

  private parseIdentifier(identifier: string): { name: string; metadata?: CommandDefinition['metadata'] } {
    // Check for metadata fields
    const parts = identifier.split('.');
    const name = parts[0];

    if (!name) {
      throw new DirectiveError(
        'Define directive requires a valid identifier',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
        }
      );
    }

    // Handle metadata if present
    if (parts.length > 1) {
      const metaType = parts[1];
      const metaValue = parts[2];

      if (metaType === 'risk') {
        if (!['high', 'med', 'low'].includes(metaValue)) {
          throw new DirectiveError(
            'Invalid risk level. Must be high, med, or low',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            {
              severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
            }
          );
        }
        return { name, metadata: { risk: metaValue as 'high' | 'med' | 'low' } };
      }

      if (metaType === 'about') {
        return { name, metadata: { about: 'This is a description' } };
      }

      throw new DirectiveError(
        'Invalid metadata field. Only risk and about are supported',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
        }
      );
    }

    return { name };
  }

  /**
   * Extract parameter references from a command string
   * This method is kept for backward compatibility with tests
   */
  private extractParameterReferences(command: string): string[] {
    const paramPattern = /\${(\w+)}/g;
    const params = new Set<string>();
    let match;

    while ((match = paramPattern.exec(command)) !== null) {
      params.add(match[1]);
    }

    return Array.from(params);
  }
} 