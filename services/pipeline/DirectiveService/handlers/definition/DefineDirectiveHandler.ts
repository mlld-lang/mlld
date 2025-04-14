import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveNode, IDirectiveData, DirectiveData } from '@core/syntax/types/index.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { 
    ICommandDefinition, 
    IBasicCommandDefinition, 
    ILanguageCommandDefinition, 
    ICommandParameterMetadata
} from '@core/types/define.js';
import { isBasicCommand } from '@core/types/define.js';
import type { SourceLocation } from '@core/types/common.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import { MeldResolutionError, FieldAccessError } from '@core/errors';
import { VariableMetadata, VariableOrigin } from '@core/types/variables.js';
import type { ResolutionContext } from '@core/types/resolution.js';
import type { DirectiveProcessingContext } from '@core/types/index.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';

@injectable()
@Service({
  description: 'Handler for @define directives'
})
export class DefineDirectiveHandler implements IDirectiveHandler {
  public readonly kind = 'define';

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IResolutionService') private resolutionService: IResolutionService
  ) {}

  async execute(context: DirectiveProcessingContext): Promise<IStateService | DirectiveResult> {
    const state = context.state;
    const node = context.directiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    const baseErrorDetails = { 
      node: node, 
      context: { currentFilePath: currentFilePath ?? undefined } 
    };

    try {
      // Removed commented-out validation call
      // // await this.validationService.validate(node);

      // Assert directive node structure
      if (!node.directive || node.directive.kind !== 'define') {
          throw new DirectiveError('Invalid node type provided to DefineDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
      }
      const directive = node.directive as IDirectiveData;
      const { name, parameters: paramNames, command, value } = directive;
      
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

      // Construct base metadata (origin will be set by StateService)
      const baseMetadata: Partial<VariableMetadata> = {
          definedAt: directiveSourceLocation,
          origin: VariableOrigin.DIRECT_DEFINITION // Set origin here
      };
      
      if (value !== undefined) {
        // Defined using literal value (e.g., @define cmd = "echo {{var}}")
        if (!isInterpolatableValueArray(value)) {
            throw new DirectiveError('Invalid literal value for @define directive', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
        }
        
        // Resolve the InterpolatableValue to get the final command string
        let resolvedCommandTemplate: string;
        try {
            // Use resolution context from DirectiveProcessingContext
            resolvedCommandTemplate = await this.resolutionService.resolveNodes(value, resolutionContext);
        } catch (error) {
             const errorMsg = `Failed to resolve literal value for command '${nameMetadata.name}'`;
             logger.error(errorMsg, { error });
             const cause = error instanceof Error ? error : undefined;
             const details = { ...baseErrorDetails, cause };
             throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, details);
        }

        commandDefinition = {
          type: 'basic',
          name: nameMetadata.name,
          parameters: mappedParameters,
          commandTemplate: resolvedCommandTemplate,
          isMultiline: false, 
          sourceLocation: directiveSourceLocation,
          definedAt: Date.now(),
          ...(nameMetadata.metadata && { ...nameMetadata.metadata }) 
        };
      } else if (command) {
        // Defined using @run syntax
        const runData = command as DirectiveData;
        const runSubtype = runData.subtype;
        const commandInput = runData.command; 

        if (!commandInput) {
           throw new DirectiveError('Missing command value within @run for @define directive', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
        }

        let resolvedCommandContent: string;
        let commandIsMultiline = runData.isMultiLine ?? false;
        let commandLanguage = runData.language;

        // Resolve the command content string first
        try {
            if (runSubtype === 'runDefined') {
                 const definedCommand = commandInput as { name: string };
                 if (typeof definedCommand !== 'object' || !definedCommand.name) {
                     throw new DirectiveError('Invalid command input structure for runDefined subtype', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
                 }
                 const cmdVar = state.getCommandVar(definedCommand.name);
                 if (cmdVar?.value && isBasicCommand(cmdVar.value)) { 
                    resolvedCommandContent = cmdVar.value.commandTemplate; 
                 } else {
                    const errorMsg = cmdVar ? `Cannot define command '${nameMetadata.name}' using non-basic command '${definedCommand.name}'` : `Command definition '${definedCommand.name}' not found`;
                    throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, baseErrorDetails);
                 }
            } else if (runSubtype === 'runCommand' || runSubtype === 'runCode' || runSubtype === 'runCodeParams') {
                 const interpolatableCommand = commandInput as InterpolatableValue;
                 if (!isInterpolatableValueArray(interpolatableCommand)) {
                    throw new DirectiveError(`Expected InterpolatableValue for command input with subtype '${runSubtype}'`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
                 }
                 // Use resolution context from DirectiveProcessingContext
                 resolvedCommandContent = await this.resolutionService.resolveNodes(interpolatableCommand, resolutionContext);
            } else {
                 throw new DirectiveError(`Unsupported run subtype '${runSubtype}' encountered in @define handler`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
            }
        } catch (error) {
             const errorMsg = `Failed to resolve @run content for command '${nameMetadata.name}'`;
             logger.error(errorMsg, { error });
             const cause = error instanceof Error ? error : undefined;
             const details = { ...baseErrorDetails, cause };
             throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, details);
        }

        // Now create the definition based on the @run subtype
        if (runSubtype === 'runCommand' || runSubtype === 'runDefined') {
            commandDefinition = {
              type: 'basic',
              name: nameMetadata.name,
              parameters: mappedParameters,
              commandTemplate: resolvedCommandContent, 
              isMultiline: commandIsMultiline,
              sourceLocation: directiveSourceLocation,
              definedAt: Date.now(),
              ...(nameMetadata.metadata && { ...nameMetadata.metadata })
            };
        } else if (runSubtype === 'runCode' || runSubtype === 'runCodeParams') {
            commandDefinition = {
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
        } else {
             throw new DirectiveError(`Unsupported @run subtype '${runSubtype}' within @define directive`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
        }
      } else {
         throw new DirectiveError('Invalid @define directive structure: must have a value or an @run command', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
      }
      
      logger.debug('Constructed command definition', { name: commandDefinition.name, type: commandDefinition.type });

      // Store the ICommandDefinition using setCommandVar on the provided state
      state.setCommandVar(commandDefinition.name, commandDefinition);
      logger.debug(`Stored command '${commandDefinition.name}'`, { definition: commandDefinition });

      // Return the modified state
      return state;
    } catch (error) {
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
        // Re-throw with original message, KIND FROM HANDLER (this.kind), original code, and combined details
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