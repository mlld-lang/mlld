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
      // Support both AST format (name) and test format (identifier)
      const name = node.directive.name || node.directive.identifier;
      const command = node.directive.command;
      
      // Parse any metadata from the name
      const nameMetadata = this.parseIdentifier(name, node);

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
          location: node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED]
        }
      );

      throw resolutionError;
    }
  }

  private parseIdentifier(identifier: string | undefined, node: DirectiveNode): { name: string; metadata?: CommandDefinition['metadata'] } {
    // Ensure we have a valid identifier
    if (!identifier || typeof identifier !== 'string') {
      throw new DirectiveError(
        'Define directive requires a valid identifier',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED],
          location: node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
        }
      );
    }

    // Use extensions from AST if available, otherwise fall back to string splitting
    let name: string;
    let metaType: string | undefined;
    let metaValue: string | undefined;

    // Check for metadata extensions in the AST node structure
    if (node.directive.extensions && Array.isArray(node.directive.extensions)) {
      name = identifier;
      const extensions = node.directive.extensions;
      
      if (extensions.length > 0) {
        metaType = extensions[0].type;
        metaValue = extensions.length > 1 ? extensions[1].value : undefined;
      }
    } else if (identifier.includes('.')) {
      // Fall back to string splitting when AST extensions aren't available
      const parts = identifier.split('.');
      name = parts[0];
      metaType = parts.length > 1 ? parts[1] : undefined;
      metaValue = parts.length > 2 ? parts[2] : undefined;
    } else {
      name = identifier;
    }

    if (!name) {
      throw new DirectiveError(
        'Define directive requires a valid identifier',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED],
          location: node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
        }
      );
    }

    // Handle metadata if present
    if (metaType) {
      if (metaType === 'risk') {
        if (!metaValue || !['high', 'med', 'low'].includes(metaValue)) {
          throw new DirectiveError(
            'Invalid risk level. Must be high, med, or low',
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            {
              severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED],
              location: node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
            }
          );
        }
        return { name, metadata: { risk: metaValue as 'high' | 'med' | 'low' } };
      }

      if (metaType === 'about') {
        return { name, metadata: { about: metaValue || 'This is a description' } };
      }

      throw new DirectiveError(
        'Invalid metadata field. Only risk and about are supported',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED],
          location: node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
        }
      );
    }

    return { name };
  }

  private async processCommand(commandData: any, node: DirectiveNode): Promise<Omit<CommandDefinition, 'metadata'>> {
    try {
      // Check if we have a string command directly (test case format)
      if (typeof commandData === 'string') {
        const commandStr = commandData.trim();
        
        // Extract parameter references from node or from string
        const referencedParams = this.extractParameterReferences(commandStr, node);
        
        // Return structured command
        return {
          parameters: referencedParams,
          command: commandStr
        };
      }
      
      // Check if we already have a structured command (AST format)
      if (typeof commandData === 'object' && commandData.kind === 'run' && typeof commandData.command === 'string') {
        const commandStr = commandData.command.trim();
        
        // Extract parameter references
        const referencedParams = this.extractParameterReferences(commandStr, node);
        
        // Return structured command
        return {
          parameters: referencedParams,
          command: commandStr
        };
      }
      
      // Should never reach here, as validation would have caught this
      throw new DirectiveError(
        'Command data must be a run directive with a command string',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED],
          location: node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }
        }
      );
    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      }
      
      throw new DirectiveError(
        error instanceof Error ? error.message : 'Error processing command',
        this.kind,
        DirectiveErrorCode.RESOLUTION_FAILED,
        {
          cause: error,
          node,
          location: node.location || { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
          severity: DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED] 
        }
      );
    }
  }

  private extractParameterReferences(command: string, node: DirectiveNode): string[] {
    // Use the AST's parameters property if available
    if (node.directive.parameters && Array.isArray(node.directive.parameters)) {
      if (typeof node.directive.parameters[0] === 'string') {
        // Handle test case format where parameters are strings
        return node.directive.parameters;
      } else if (node.directive.parameters[0] && typeof node.directive.parameters[0] === 'object' && 'name' in node.directive.parameters[0]) {
        // Handle AST format where parameters are objects with name property
        return node.directive.parameters.map(param => param.name);
      }
    }
    
    // Fall back to regex extraction if AST parameters aren't available
    const paramPattern = /\{\{(\w+)\}\}/g;
    const params = new Set<string>();
    let match;

    while ((match = paramPattern.exec(command)) !== null) {
      params.add(match[1]);
    }

    return Array.from(params);
  }
}