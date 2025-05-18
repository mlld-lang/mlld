import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import { DirectiveNode, IDirectiveData, DirectiveData } from '@core/syntax/types/index';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { directiveLogger as logger } from '@core/utils/logger';
import { ErrorSeverity } from '@core/errors/MeldError';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import type { 
    ICommandDefinition, 
    IBasicCommandDefinition, 
    ILanguageCommandDefinition, 
    ICommandParameterMetadata
} from '@core/types/exec';
import { isBasicCommand } from '@core/types/exec';
import type { SourceLocation } from '@core/types/common';
import type { InterpolatableValue } from '@core/syntax/types/nodes';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import { MeldResolutionError, FieldAccessError } from '@core/errors';
import { VariableMetadata, VariableOrigin, VariableType, createCommandVariable } from '@core/types/variables';
import type { ResolutionContext } from '@core/types/resolution';
import type { DirectiveProcessingContext } from '@core/types/index';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler.ts';

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
    const node = context.directiveNode as DirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    // Pass the full context for better error details
    const baseErrorDetails = { node: node, context };

    try {
      // Assert directive node structure
      if (!node.directive || node.directive.kind !== 'exec') {
        throw new DirectiveError('Invalid node type provided to ExecDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { ...baseErrorDetails });
      }
      const directive = node.directive as IDirectiveData;
      const { name, parameters: paramNames, command, value } = directive;
     
      // Validator should ensure this, but check for compiler satisfaction
      if (value === undefined && command === undefined) {
        throw new DirectiveError('Internal Error: Define directive lacks required "command" or "value" property after validation.', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { ...baseErrorDetails });
      }
      
      // Parse name for potential embedded metadata
      const nameMetadata = this.parseIdentifier(name);

      // Create the appropriate command definition object
      let commandDefinition: ICommandDefinition;
      const directiveSourceLocation: SourceLocation | undefined = node.location ? {
         filePath: currentFilePath ?? 'unknown',
         line: node.location.start.line,
         column: node.location.start.column
      } : undefined;

      // Map parameter names to ICommandParameterMetadata
      const mappedParameters: ICommandParameterMetadata[] = (paramNames || []).map((paramName: string, index: number) => ({
          name: paramName,
          position: index + 1,
      }));

      // Construct base metadata
      const baseMetadata: VariableMetadata = {
          definedAt: directiveSourceLocation,
          origin: VariableOrigin.DIRECT_DEFINITION,
          createdAt: Date.now(),
          modifiedAt: Date.now()
      };
      
      if (value !== undefined) {
        // Defined using literal value (e.g., @define cmd = "echo {{var}}")
         // Resolve the InterpolatableValue to get the final command string
         let resolvedCommandTemplate: string;
         try {
            // Use resolution context from DirectiveProcessingContext
            resolvedCommandTemplate = await this.resolutionService.resolveNodes(value, resolutionContext);
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

      } else if (command) {
        // Defined using @run syntax
        const runData = command as DirectiveData;
        const runSubtype = runData.subtype;
        const commandInput = runData.command; // Keep assignment, remove check

        let resolvedCommandContent: string;
        let commandIsMultiline = runData.isMultiLine ?? false;
        let commandLanguage = runData.language;

        // Resolve the command content string first
        try {
            if (runSubtype === 'runDefined') {
                 const definedCommand = commandInput as { name: string }; // Assume structure is valid
                 const cmdVar = state.getVariable(definedCommand.name);
                 // Ensure it's a COMMAND type and then check if it's a basic command
                 if (cmdVar?.type === VariableType.COMMAND && cmdVar.value && cmdVar.value.type === 'basic') { 
                    resolvedCommandContent = (cmdVar.value as IBasicCommandDefinition).commandTemplate; 
                 } else {
                    const errorMsg = cmdVar ? `Cannot define command '${nameMetadata.name}' using non-basic command '${definedCommand.name}'` : `Command definition '${definedCommand.name}' not found`;
                    throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...baseErrorDetails });
                 }
            } else {
                // If not 'runDefined', grammar guarantees it's an InterpolatableValueArray for other run subtypes
                resolvedCommandContent = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
            }
        } catch (error) {
            const errorMsg = `Failed to resolve command content for '${nameMetadata.name}'`;
            logger.error(errorMsg, { error });
            const cause = error instanceof Error ? error : undefined;
            throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...baseErrorDetails, cause });
        }

        // Now create the definition based on the @run subtype
        if (runSubtype === 'runCommand' || runSubtype === 'runDefined') {
          const commandDefinition: IBasicCommandDefinition = {
            type: 'basic',
            name: nameMetadata.name,
            parameters: mappedParameters,
            commandTemplate: resolvedCommandContent, 
            isMultiline: commandIsMultiline,
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

        } else {
            // If it's not a basic command or runDefined, it must be a language command
            // Grammar guarantees runSubtype is valid ('runCode' or 'runCodeParams')
            const commandDefinition: ILanguageCommandDefinition = {
              type: 'language',
              name: nameMetadata.name,
              parameters: mappedParameters,
              language: commandLanguage || '',
              codeBlock: resolvedCommandContent, 
              languageParameters: runData.parameters?.map((p: any) => typeof p === 'string' ? p : p.identifier), 
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
      } else {
        // This block should be unreachable due to the initial check L58
        // Throw an internal error just in case.
        throw new DirectiveError('Internal Error: Reached unreachable code in @define handler.', this.kind, DirectiveErrorCode.STATE_ERROR, { ...baseErrorDetails });
      }

    } catch (error) {
      logger.error(`Error handling @define directive: ${error instanceof Error ? error.message : String(error)}`, { error, node: node });
      
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
        error instanceof Error ? error.message : 'Unknown error in define directive',
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
        'Define directive requires a valid base identifier name',
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