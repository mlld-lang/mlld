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

      // 2. Extract name and command from directive
      const { name, command } = node.directive;
      // Parse any metadata from the name
      const nameMetadata = this.parseIdentifier(name);

      // 3. Process command
      const commandDef = await this.processCommand(command, node);

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

  private async processCommand(commandData: any, node: DirectiveNode): Promise<Omit<CommandDefinition, 'metadata'>> {
    try {
      // Check if we already have a structured command
      if (typeof commandData === 'object' && commandData.kind === 'run' && typeof commandData.command === 'string') {
        const commandStr = commandData.command.trim();
        
        // Extract parameter references
        const referencedParams = this.extractParameterReferences(commandStr);
        
        return {
          parameters: referencedParams,
          command: commandStr
        };
      }
      
      // For backwards compatibility, handle string value that might be JSON
      if (typeof commandData === 'string') {
        try {
          // Try to parse as JSON
          const parsed = JSON.parse(commandData);
          if (parsed.command?.kind === 'run' && typeof parsed.command.command === 'string') {
            const commandStr = parsed.command.command.trim();
            
            // Extract parameter references
            const referencedParams = this.extractParameterReferences(commandStr);
            
            return {
              parameters: referencedParams,
              command: commandStr
            };
          }
        } catch (e) {
          // Not valid JSON, treat as raw command string
          const commandStr = commandData.trim();
          
          // Extract parameter references
          const referencedParams = this.extractParameterReferences(commandStr);
          
          return {
            parameters: referencedParams,
            command: commandStr
          };
        }
      }
      
      throw new DirectiveError(
        'Invalid command format',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          node,
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
        }
      );
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }
      throw new DirectiveError(
        error instanceof Error ? error.message : 'Error processing command',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          node,
          cause: error instanceof Error ? error : undefined,
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
        }
      );
    }
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