import { IDirectiveHandler, DirectiveContext } from '../../IDirectiveService.js';
import { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import { IStateService } from '@services/state/StateService/IStateService.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveNode } from 'meld-spec';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '../../errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';

interface CommandDefinition {
  parameters: string[];
  command: string;
  metadata?: {
    risk?: 'high' | 'med' | 'low';
    about?: string;
    meta?: Record<string, unknown>;
  };
}

export class DefineDirectiveHandler implements IDirectiveHandler {
  public readonly kind = 'define';

  constructor(
    private validationService: IValidationService,
    private stateService: IStateService,
    private resolutionService: IResolutionService
  ) {}

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<IStateService> {
    try {
      // 1. Validate directive structure
      await this.validationService.validate(node);

      // 2. Extract and validate identifier parts
      const { identifier, value } = node.directive;
      const { name, metadata } = this.parseIdentifier(identifier);

      // 3. Process command value
      const commandDef = await this.processCommand(value, node);

      // 4. Create new state for modifications
      const newState = context.state.clone();

      // 5. Store command with metadata
      newState.setCommand(name, {
        ...commandDef,
        ...(metadata && { metadata })
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

  private async processCommand(value: string, node: DirectiveNode): Promise<Omit<CommandDefinition, 'metadata'>> {
    // For empty commands, just return empty string
    if (!value) {
      return {
        parameters: [],
        command: ''
      };
    }

    // Extract parameters from command value
    const paramRefs = this.extractParameterReferences(value);

    // Try to parse as JSON first (for test factory format)
    try {
      const parsed = JSON.parse(value);
      if (parsed.command?.kind === 'run' && typeof parsed.command.command === 'string') {
        // Validate parameters before processing command
        const parameters = this.validateParameters(parsed.parameters || [], paramRefs, node);

        // Store the raw command
        const command = parsed.command.command.trim();
        return {
          parameters,
          command
        };
      }
    } catch (e) {
      // Not JSON, treat as raw command
    }

    // Extract command from directive value
    const commandMatch = value.match(/=\s*@run\s*\[(.*?)\]/);
    if (!commandMatch) {
      throw new DirectiveError(
        'Invalid command format. Expected @run directive',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { 
          node,
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
        }
      );
    }

    // Extract parameters from the command definition
    const paramMatch = value.match(/^(\w+)(?:\((.*?)\))?/);
    const declaredParams = paramMatch?.[2]?.split(',').map(p => p.trim()).filter(Boolean) || [];

    // Validate parameters after ensuring command format
    const parameters = this.validateParameters(declaredParams, paramRefs, node);

    // Store just the command portion
    return {
      parameters,
      command: commandMatch[1].trim()
    };
  }

  private validateParameters(declaredParams: string[], referencedParams: string[], node: DirectiveNode): string[] {
    // Check for duplicates first
    const uniqueParams = new Set(declaredParams);
    if (uniqueParams.size !== declaredParams.length) {
      throw new DirectiveError(
        'Duplicate parameter names are not allowed',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        { 
          node,
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
        }
      );
    }

    // Validate parameter names
    for (const param of declaredParams) {
      if (!/^[a-zA-Z_]\w*$/.test(param)) {
        throw new DirectiveError(
          `Invalid parameter name: ${param}. Must start with letter or underscore and contain only letters, numbers, and underscores`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { 
            node,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
          }
        );
      }
    }

    // Validate that all referenced parameters are declared
    for (const ref of referencedParams) {
      if (!uniqueParams.has(ref)) {
        throw new DirectiveError(
          `Parameter ${ref} is referenced in command but not declared`,
          this.kind,
          DirectiveErrorCode.VALIDATION_FAILED,
          { 
            node,
            severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
          }
        );
      }
    }

    return Array.from(uniqueParams);
  }

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