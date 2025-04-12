import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { DirectiveNode, DefineDirectiveData, RunDirectiveData } from '@core/syntax/types.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
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
import type { SourceLocation } from '@core/types/common.js';
import type { InterpolatableValue } from '@core/syntax/types/nodes.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import { MeldResolutionError, FieldAccessError } from '@core/errors';
import { VariableMetadata, VariableOrigin } from '@core/types/variables.js';

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
      // Temporarily comment out validation due to potential DirectiveNode/IDirectiveNode type conflict (See Issue #34)
      // await this.validationService.validate(node);

      // 2. Extract data from directive AST node
      const directive = node.directive as DefineDirectiveData;
      const { name, parameters: paramNames, command, value } = directive;
      
      // Parse name for potential embedded metadata
      const nameMetadata = this.parseIdentifier(name);

      // 3. Create the appropriate command definition object (IBasic or ILanguage)
      let commandDefinition: ICommandDefinition;
      const directiveSourceLocation: SourceLocation | undefined = node.location ? {
         filePath: context.currentFilePath ?? 'unknown',
         line: node.location.start.line,
         column: node.location.start.column
      } : undefined;

      // Map parameter names to ICommandParameterMetadata
      const mappedParameters: ICommandParameterMetadata[] = (paramNames || []).map((paramName, index) => ({
          name: paramName,
          position: index + 1,
          // TODO: Add support for required/defaultValue if grammar allows
      }));

      // Construct base metadata (origin will be set by StateService)
      const baseMetadata: Partial<VariableMetadata> = {
          definedAt: directiveSourceLocation
          // Origin will be set to DIRECT_DEFINITION by StateService
      };
      
      if (value !== undefined) {
        // Defined using literal value (e.g., @define cmd = "echo {{var}}")
        // This is always a basic command.
        if (!isInterpolatableValueArray(value)) {
            throw new DirectiveError('Invalid literal value for @define directive', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node, context });
        }
        
        // Resolve the InterpolatableValue to get the final command string
        const resolutionContext = ResolutionContextFactory.create(context.state, context.currentFilePath);
        let resolvedCommandTemplate: string;
        try {
            resolvedCommandTemplate = await this.resolutionService.resolveNodes(value, resolutionContext);
        } catch (error) {
             const errorMsg = `Failed to resolve literal value for command '${nameMetadata.name}'`;
             logger.error(errorMsg, { error });
             throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node, context, cause: error instanceof Error ? error : undefined });
        }

        commandDefinition = {
          type: 'basic',
          name: nameMetadata.name,
          parameters: mappedParameters,
          commandTemplate: resolvedCommandTemplate,
          isMultiline: false, // Literal strings are typically single line unless template literal was used
          sourceLocation: directiveSourceLocation,
          definedAt: Date.now(),
          ...(nameMetadata.metadata && { ...nameMetadata.metadata }) // Spread parsed metadata (riskLevel, description)
        };
      } else if (command) {
        // Defined using @run syntax (e.g., @define cmd = @run [...])
        const runData = command as any; // Use cast based on local interface RunRHSStructure if needed
        const runSubtype = runData.subtype;
        const commandInput = runData.command; // This is InterpolatableValue or command object

        if (!commandInput) {
           throw new DirectiveError('Missing command value within @run for @define directive', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
        }

        let resolvedCommandContent: string;
        let commandIsMultiline = runData.isMultiLine ?? false;
        let commandLanguage = runData.language;

        // Resolve the command content string first
        const resolutionContext = ResolutionContextFactory.create(context.state, context.currentFilePath);
        try {
            if (runSubtype === 'runDefined') {
                 if (typeof commandInput !== 'object' || !('name' in commandInput)) {
                     throw new Error('Invalid command input structure for runDefined subtype');
                 }
                 const cmdVar = context.state.getCommandVar(commandInput.name);
                 if (cmdVar && cmdVar.value && isBasicCommand(cmdVar.value)) { 
                    resolvedCommandContent = cmdVar.value.commandTemplate; 
                 } else {
                    const errorMsg = cmdVar ? `Cannot define command '${nameMetadata.name}' using non-basic command '${commandInput.name}'` : `Command definition '${commandInput.name}' not found`;
                    throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node: node as any, context });
                 }
            } else if (runSubtype === 'runCommand' || runSubtype === 'runCode' || runSubtype === 'runCodeParams') {
                 if (!isInterpolatableValueArray(commandInput)) {
                    throw new Error(`Expected InterpolatableValue for command input with subtype '${runSubtype}'`);
                 }
                 resolvedCommandContent = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
            } else {
                 throw new Error(`Unsupported run subtype '${runSubtype}' encountered in @define handler`);
            }
        } catch (error) {
             const errorMsg = `Failed to resolve @run content for command '${nameMetadata.name}'`;
             logger.error(errorMsg, { error });
             throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node: node as any, context, cause: error instanceof Error ? error : undefined });
        }

        // Now create the definition based on the @run subtype
        if (runSubtype === 'runCommand' || runSubtype === 'runDefined') {
            commandDefinition = {
              type: 'basic',
              name: nameMetadata.name,
              parameters: mappedParameters,
              commandTemplate: resolvedCommandContent, // Use resolved string
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
              codeBlock: resolvedCommandContent, // Use resolved string
              languageParameters: runData.parameters?.map((p: any) => typeof p === 'string' ? p : p.identifier), 
              sourceLocation: directiveSourceLocation,
              definedAt: Date.now(),
              ...(nameMetadata.metadata && { ...nameMetadata.metadata })
            };
        } else {
             // This case is already handled above, but included for completeness
             throw new DirectiveError(`Unsupported @run subtype '${runSubtype}' within @define directive`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
        }
      } else {
         throw new DirectiveError('Invalid @define directive structure: must have a value or an @run command', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
      }
      
      logger.debug('Constructed command definition', { name: commandDefinition.name, type: commandDefinition.type });

      // 4. Create new state for modifications
      const newState = context.state.clone();

      // 5. Store the ICommandDefinition using setCommandVar
      // Pass the baseMetadata containing definedAt
      newState.setCommandVar(commandDefinition.name, commandDefinition, baseMetadata);
      logger.debug(`Stored command '${commandDefinition.name}'`, { definition: commandDefinition });

      return newState;
    } catch (error) {
      // Wrap in DirectiveError if needed
      if (error instanceof DirectiveError) {
        // Ensure location is set if missing
        if (!error.details?.location && node.location) {
          const wrappedError = new DirectiveError(
            error.message,
            error.kind,
            error.code,
            {
              ...(error.details || {}),
              // Add cast here as well if needed
              node: error.details?.node || node as any, 
              location: node.location,
              severity: error.details?.severity || DirectiveErrorSeverity[error.code]
            }
          );
          throw wrappedError;
        }
        throw error;
      }

      // Handle other errors
      const errorCode = (error instanceof MeldResolutionError || error instanceof FieldAccessError)
          ? DirectiveErrorCode.RESOLUTION_FAILED 
          : DirectiveErrorCode.EXECUTION_FAILED;
          
      const resolutionError = new DirectiveError(
        error instanceof Error ? error.message : 'Unknown error in define directive',
        this.kind,
        errorCode,
        {
          // Add cast here
          node: node as any,
          context,
          cause: error instanceof Error ? error : undefined,
          location: node.location,
          severity: DirectiveErrorSeverity[errorCode]
        }
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
    // Check for metadata fields
    const parts = identifier.split('.');
    const name = parts[0];

    if (!name) {
      throw new DirectiveError(
        'Define directive requires a valid identifier',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
          // Add cast here
          node: undefined as any, // Node isn't available here, but error expects it potentially
          severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
        }
      );
    }

    // Handle metadata if present
    if (parts.length > 1) {
      const metaType = parts[1];
      const metaValue = parts.slice(2).join('.') || ''; // Join remaining parts for description

      if (metaType === 'risk') {
        const riskValue = metaValue.toLowerCase();
        if (!['high', 'medium', 'low'].includes(riskValue)) { // Allow 'medium'
          throw new DirectiveError(
            `Invalid risk level '${metaValue}'. Must be high, medium, or low`,
            this.kind,
            DirectiveErrorCode.VALIDATION_FAILED,
            {
              // Add cast here
              node: undefined as any,
              severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
            }
          );
        }
        return { name, metadata: { riskLevel: riskValue as 'high' | 'medium' | 'low' } };
      }

      if (metaType === 'about') {
        // Use the rest of the identifier as the description
        return { name, metadata: { description: metaValue || 'Defined command' } }; // Provide default if empty
      }

      // If not risk or about, treat as invalid metadata
      throw new DirectiveError(
        `Invalid metadata type '${metaType}'. Only risk and about are supported.`,
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        {
           // Add cast here
           node: undefined as any,
           severity: DirectiveErrorSeverity[DirectiveErrorCode.VALIDATION_FAILED]
        }
      );
    }

    // No metadata parts found
    return { name };
  }
} 