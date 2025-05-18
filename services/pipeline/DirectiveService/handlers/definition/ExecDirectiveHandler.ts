import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { directiveLogger as logger } from '@core/utils/logger';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { 
    ICommandDefinition, 
    IBasicCommandDefinition, 
    ILanguageCommandDefinition, 
    ICommandParameterMetadata
} from '@core/types/exec';
import type { SourceLocation } from '@core/types/common';
import { MeldResolutionError, FieldAccessError } from '@core/errors';
import { VariableMetadata, VariableOrigin, VariableType, createCommandVariable } from '@core/types/variables';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { DirectiveResult } from '@core/directives/DirectiveHandler.ts';
import type { ExecDirectiveNode } from '@core/ast/types/exec';
import type { RunDirectiveNode } from '@core/ast/types/run';

@injectable()
@Service({
  description: 'Handler for @exec directives'
})
export class ExecDirectiveHandler implements IDirectiveHandler {
  public readonly kind = 'exec';

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IResolutionService') private resolutionService: IResolutionService
  ) {}

  async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    const state: IStateService = context.state;
    const node = context.directiveNode as ExecDirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    // Pass the full context for better error details
    const baseErrorDetails = { node: node, context };

    try {
      // Assert directive node structure - now check node.kind directly
      if (!node || node.kind !== 'exec') {
        throw new DirectiveError('Invalid node type provided to ExecDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { ...baseErrorDetails });
      }
      
      const { values, raw, meta } = node;
      const identifier = values.identifier?.[0]?.content || raw.identifier;
      
      // Handle parameters from AST
      const paramNames = values.params.map(param => {
        if ('identifier' in param) {
          return param.identifier;
        }
        return '';
      }).filter(p => p);
      
      // Parse name for potential embedded metadata
      const nameMetadata = this.parseIdentifier(identifier);

      // Map parameter names to ICommandParameterMetadata
      const mappedParameters: ICommandParameterMetadata[] = paramNames.map((paramName: string, index: number) => ({
          name: paramName,
          position: index + 1,
      }));

      // Create the appropriate command definition object
      const directiveSourceLocation: SourceLocation | undefined = node.location ? {
         filePath: currentFilePath ?? 'unknown',
         line: node.location.start.line,
         column: node.location.start.column
      } : undefined;

      // Construct base metadata
      const baseMetadata: VariableMetadata = {
          definedAt: directiveSourceLocation,
          origin: VariableOrigin.DIRECT_DEFINITION,
          createdAt: Date.now(),
          modifiedAt: Date.now()
      };

      // Check if we have a literal value command or code
      if (values.value && !values.command && !values.code) {
        // Simple exec with literal value (e.g., @exec cmd = "echo {{var}}")
        // Resolve the value to get the final command string
        let resolvedCommandTemplate: string;
        try {
           resolvedCommandTemplate = await this.resolutionService.resolveNodes(values.value, resolutionContext);
        } catch (error) {
            const errorMsg = `Failed to resolve literal value for command '${nameMetadata.name}'`;
            logger.error(errorMsg, { error });
            const cause = error instanceof Error ? error : undefined;
            throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...baseErrorDetails, cause });
        }

        const commandDefinition: IBasicCommandDefinition = {
         type: 'basic',
         name: nameMetadata.name,
         parameters: mappedParameters,
         commandTemplate: resolvedCommandTemplate,
         isMultiline: false, 
         sourceLocation: directiveSourceLocation,
         definedAt: Date.now(),
         ...(nameMetadata.metadata && { ...nameMetadata.metadata }) 
       };

       logger.debug('Constructed basic command definition', { name: commandDefinition.name });

       // Create the command variable using the factory function
       const variableDefinition = createCommandVariable(commandDefinition.name, commandDefinition, baseMetadata);

       // Return DirectiveResult with StateChanges
       return {
         stateChanges: {
           variables: {
             [commandDefinition.name]: {
               type: VariableType.COMMAND,
               value: commandDefinition,
               metadata: baseMetadata
             }
           }
         }
       };
      } 
      
      // Handle exec with run syntax
      if (values.command) {
        // For execCommand subtype - @exec command = @run [command]
        let resolvedCommandContent: string;
        
        try {
          resolvedCommandContent = await this.resolutionService.resolveNodes(values.command, resolutionContext);
        } catch (error) {
          const errorMsg = `Failed to resolve command content for '${nameMetadata.name}'`;
          logger.error(errorMsg, { error });
          const cause = error instanceof Error ? error : undefined;
          throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...baseErrorDetails, cause });
        }

        const commandDefinition: IBasicCommandDefinition = {
          type: 'basic',
          name: nameMetadata.name,
          parameters: mappedParameters,
          commandTemplate: resolvedCommandContent,
          isMultiline: meta.isMultiLine || false,
          sourceLocation: directiveSourceLocation,
          definedAt: Date.now(),
          ...(nameMetadata.metadata && { ...nameMetadata.metadata })
        };

        logger.debug('Constructed basic command definition via @run', { name: commandDefinition.name });

        // Create the command variable using the factory function
        const variableDefinition = createCommandVariable(commandDefinition.name, commandDefinition, baseMetadata);

        // Return DirectiveResult with StateChanges
        return {
          stateChanges: {
            variables: {
              [commandDefinition.name]: {
                type: VariableType.COMMAND,
                value: commandDefinition,
                metadata: baseMetadata
              }
            }
          }
        };
      } 
      
      // Handle exec with code - @exec command = @run language [code]
      if (values.code && values.lang) {
        // For execCode subtype
        let resolvedCodeContent: string;
        const language = values.lang[0]?.content || raw.lang || '';
        
        try {
          resolvedCodeContent = await this.resolutionService.resolveNodes(values.code, resolutionContext);
        } catch (error) {
          const errorMsg = `Failed to resolve code content for '${nameMetadata.name}'`;
          logger.error(errorMsg, { error });
          const cause = error instanceof Error ? error : undefined;
          throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...baseErrorDetails, cause });
        }

        const commandDefinition: ILanguageCommandDefinition = {
          type: 'language',
          name: nameMetadata.name,
          parameters: mappedParameters,
          language: language,
          codeBlock: resolvedCodeContent,
          languageParameters: raw.params, // Use raw params for language parameters
          sourceLocation: directiveSourceLocation,
          definedAt: Date.now(),
          ...(nameMetadata.metadata && { ...nameMetadata.metadata })
        };

        logger.debug('Constructed language command definition via @run', { name: commandDefinition.name });

        // Create the command variable using the factory function
        const variableDefinition = createCommandVariable(commandDefinition.name, commandDefinition, baseMetadata);

        // Return DirectiveResult with StateChanges
        return {
          stateChanges: {
            variables: {
              [commandDefinition.name]: {
                type: VariableType.COMMAND,
                value: commandDefinition,
                metadata: baseMetadata
              }
            }
          }
        };
      }
      
      // Handle command reference form where we're referencing an existing command
      if (values.commandRef) {
        // This handles cases like @exec newCmd = @run @existingCmd
        const referencedCommandName = values.commandRef[0]?.content;
        if (!referencedCommandName) {
          throw new DirectiveError('Referenced command name is missing', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { ...baseErrorDetails });
        }
        
        // Get the referenced command from state
        const cmdVar = state.getVariable(referencedCommandName);
        if (!cmdVar || cmdVar.type !== VariableType.COMMAND) {
          const errorMsg = `Command definition '${referencedCommandName}' not found`;
          throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...baseErrorDetails });
        }
        
        // Create a new command based on the referenced one, with new parameters
        const existingCommand = cmdVar.value as ICommandDefinition;
        let newCommandDefinition: ICommandDefinition;
        
        if (existingCommand.type === 'basic') {
          newCommandDefinition = {
            ...existingCommand,
            name: nameMetadata.name,
            parameters: mappedParameters,
            sourceLocation: directiveSourceLocation,
            definedAt: Date.now(),
            ...(nameMetadata.metadata && { ...nameMetadata.metadata })
          };
        } else {
          newCommandDefinition = {
            ...existingCommand,
            name: nameMetadata.name,
            parameters: mappedParameters,
            sourceLocation: directiveSourceLocation,
            definedAt: Date.now(),
            ...(nameMetadata.metadata && { ...nameMetadata.metadata })
          };
        }
        
        logger.debug('Created command definition from reference', { name: nameMetadata.name, referencedCommand: referencedCommandName });
        
        // Return DirectiveResult with StateChanges
        return {
          stateChanges: {
            variables: {
              [nameMetadata.name]: {
                type: VariableType.COMMAND,
                value: newCommandDefinition,
                metadata: baseMetadata
              }
            }
          }
        };
      }
      
      // If we reach here, the exec directive is missing required content
      throw new DirectiveError('Exec directive must have a value, command, code, or commandRef', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { ...baseErrorDetails });

    } catch (error) {
      logger.error(`Error handling @exec directive: ${error instanceof Error ? error.message : String(error)}`, { error, node: node });
      
      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        // Get original cause from details
        const originalCause = error.details?.cause instanceof Error ? error.details.cause : undefined;
        // Create new details object, preserving original cause if available
        const newDetails = { 
          ...(error.details || {}), 
          ...baseErrorDetails, 
          cause: originalCause // Ensure cause is preserved correctly
        };
        // Ensure context is set
        if (!error.details?.context) {
          newDetails.context = baseErrorDetails.context;
        } 
        // Re-throw with original message, kind from handler (this.kind), original code, and combined details
        throw new DirectiveError(error.message, this.kind, error.code, newDetails);
      }

      // Handle other errors
      const errorCode = (error instanceof MeldResolutionError || error instanceof FieldAccessError)
          ? DirectiveErrorCode.RESOLUTION_FAILED 
          : DirectiveErrorCode.EXECUTION_FAILED;
          
      const cause = error instanceof Error ? error : undefined;
      const details = { ...baseErrorDetails, cause };
      
      const resolutionError = new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error in exec directive',
        this.kind,
        errorCode,
        details
      );

      throw resolutionError;
    }
  }

  private parseIdentifier(identifier: string): { 
      name: string; 
      metadata?: { 
          riskLevel?: 'low' | 'medium' | 'high'; 
          description?: string; 
      } 
  } {
    const parts = identifier.split('.');
    const name = parts[0];

    if (!name) {
      throw new DirectiveError(
        'Exec directive requires a valid base identifier name',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {} // Cannot provide node details here easily
      );
    }

    if (parts.length > 1) {
      const metaType = parts[1];
      const metaValue = parts.slice(2).join('.') || '';

      if (metaType === 'risk') {
        const riskValue = metaValue.toLowerCase();
        if (!['high', 'medium', 'low'].includes(riskValue)) {
          throw new DirectiveError(
            `Invalid risk level '${metaValue}'. Must be high, medium, or low`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            {}
          );
        }
        return { name, metadata: { riskLevel: riskValue as 'high' | 'medium' | 'low' } };
      }

      if (metaType === 'about') {
        return { name, metadata: { description: metaValue || 'Defined command' } };
      }

      throw new DirectiveError(
        `Invalid metadata type '${metaType}'. Only risk and about are supported.`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {}
      );
    }
    return { name };
  }
} 