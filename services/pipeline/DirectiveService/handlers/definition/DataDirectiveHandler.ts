import type { 
    DirectiveNode, 
    InterpolatableValue, 
    VariableReferenceNode, 
    TextNode, 
    StructuredPath as AstStructuredPath
} from '@core/syntax/types/nodes.js'; 
// Remove imports for non-existent types
// import type {
//     DataDirectiveData, 
//     EmbedRHSAst, 
//     RunRHSAst   
// } from '@core/syntax/types/directives.js'; 
// import type { DataDirectiveNode } from '@core/syntax/types/nodes.js'; 

import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
// Ensure SourceLocation is imported from the canonical source and aliased
import { 
    JsonValue, 
    VariableOrigin, 
    VariableMetadata, 
    DataVariable,
    IPathVariable,
    createDataVariable,
    MeldVariable,
    VariableType
} from '@core/types/index.js'; 
import { SourceLocation } from '@core/types/common.js'; // Import SourceLocation directly
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { MeldResolutionError, FieldAccessError, PathValidationError, MeldError } from '@core/errors';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler.ts';
import type { DirectiveProcessingContext } from '@core/types/index.js';
// Import command definition types and type guard
import { ICommandDefinition, isBasicCommand } from '@core/types/define.js'; 
// <<< Restore missing imports for path types >>>
import { MeldPath, PathContentType, IFilesystemPathState, IUrlPathState } from '@core/types'; 
import type { VariableDefinition } from '@core/types/variables.js'; // Use relative path
import { isCommandVariable } from '@core/types/guards.js'; // <-- Corrected path based on previous findings
// Re-add IStateService import as it's needed for context.state type checking
import type { IStateService } from '@services/state/StateService/IStateService.js'; 

// Define local interfaces mirroring expected AST structure for type safety
// Based on docs/dev/AST.md
/* // <<< REMOVE LOCAL INTERFACES >>>
interface EmbedRHSStructure {
    subtype: 'embedPath' | 'embedVariable' | 'embedTemplate';
    path?: AstStructuredPath;
    content?: InterpolatableValue;
    section?: string;
    // Add other relevant fields like options, names, headerLevel, underHeader if needed by handler
}

interface RunRHSStructure {
    subtype: 'runCommand' | 'runCode' | 'runCodeParams' | 'runDefined';
    command?: InterpolatableValue | { name: string, args: any[], raw: string };
    language?: string;
    isMultiLine?: boolean;
    parameters?: Array<VariableReferenceNode | string>;
    // Add other relevant fields like underHeader if needed
}
*/

/**
 * Handler for @data directives
 * Stores data values in state after resolving variables and processing embedded content
 */
@injectable()
@Service({
  description: 'Handler for @data directives'
})
export class DataDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'data';

  constructor(
    // Removed unused IValidationService injection based on audit
    // @inject('IValidationService') private validationService: IValidationService, 
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService,
    @inject('IPathService') private pathService: IPathService
  ) {}

  // Rename execute to handle and update return type
  public async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    const state = context.state;
    const node = context.directiveNode as DirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    // Pass the full context to error details
    const errorDetails = { 
      node: node, 
      context: context // Pass the full context object
    };

    // Assert directive exists before accessing properties
    if (!node.directive) {
       throw new DirectiveError(
          `Directive node is missing the 'directive' property.`,
          this.kind, 
          DirectiveErrorCode.VALIDATION_FAILED, 
          errorDetails // Pass updated errorDetails
      );
    }

    const identifier = node.directive.identifier;
    const source = node.directive.source ?? 'literal'; // Default source to literal if missing
    const value = node.directive.value; // May be literal or InterpolatableValue
    const embed = node.directive.embed; // Type should come from AST types
    const run = node.directive.run; // Type should come from AST types

    logger.debug('Processing data directive', {
      location: node.location,
      identifier,
      source,
      hasValue: value !== undefined,
      hasEmbed: embed !== undefined,
      hasRun: run !== undefined
    });

    try {
      let resolvedValue: unknown;
      let valueToParse: unknown;
      
      // Define location using common SourceLocation type
      let directiveSourceLocation: SourceLocation | undefined = undefined;
      if (node.location?.start && typeof currentFilePath === 'string') {
          directiveSourceLocation = { 
              filePath: currentFilePath, 
              line: node.location.start.line,
              column: node.location.start.column,
          };
      }

      if (source === 'literal') {
        if (value === undefined) {
             throw new DirectiveError('Missing value for @data directive with source=\"literal\"' , this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
        }
        // Resolve potential variables within the literal value first
        valueToParse = await this.resolveInterpolatableValuesInData(value, resolutionContext);
      } else if (source === 'run' && run) {
        try {
          // Use direct properties from run (AST structure)
          const commandInput = run.command;
          const runSubtype = run.subtype;
          if (!commandInput) throw new DirectiveError('Missing command input for @run source', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
          
          let resolvedCommandString: string;

          if (runSubtype === 'runDefined') {
             // Type assertion for commandInput based on subtype
             const definedCommand = commandInput as { name: string, args: any[], raw: string };
             if (typeof definedCommand !== 'object' || !definedCommand.name) {
                 throw new DirectiveError('Invalid command input structure for runDefined subtype', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
             }
             // Use generic getVariable and type guard
             const cmdVar = state.getVariable(definedCommand.name, VariableType.COMMAND); 
             if (cmdVar && isCommandVariable(cmdVar) && isBasicCommand(cmdVar.value)) { 
                resolvedCommandString = cmdVar.value.commandTemplate; 
             } else {
                const errorMsg = !cmdVar ? `Command definition '${definedCommand.name}' not found` : `Command '${definedCommand.name}' is not a basic command suitable for @data/@run`;
                throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, errorDetails);
             }
          } else if (runSubtype === 'runCommand' || runSubtype === 'runCode' || runSubtype === 'runCodeParams') {
             // Type assertion for commandInput based on subtype
             const interpolatableCommand = commandInput as InterpolatableValue;
             if (!isInterpolatableValueArray(interpolatableCommand)) {
                throw new DirectiveError(`Expected InterpolatableValue for command input with subtype '${runSubtype}'`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
             }
             resolvedCommandString = await this.resolutionService.resolveNodes(interpolatableCommand, resolutionContext);
          } else {
             throw new DirectiveError(`Unsupported run subtype '${runSubtype}' encountered in @data handler`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
          }
          
          const fsService = this.fileSystemService;
          if (!fsService) {
            throw new DirectiveError('File system service is unavailable for @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, errorDetails);
          }
          
          const { stdout } = await fsService.executeCommand(resolvedCommandString, { cwd: fsService.getCwd() });
          
          try {
            resolvedValue = JSON.parse(stdout);
          } catch (parseError) {
            throw new DirectiveError(
              `Failed to parse command output as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
              this.kind, 
              DirectiveErrorCode.EXECUTION_FAILED, 
              { ...errorDetails, cause: parseError instanceof Error ? parseError : undefined }
            );
          }
          logger.debug('Executed command and parsed JSON for @data directive', { resolvedCommand: resolvedCommandString, output: resolvedValue });
          valueToParse = resolvedValue;
        } catch (error) {
            if (error instanceof DirectiveError) throw error; 
            const code = (error instanceof MeldResolutionError || error instanceof FieldAccessError) ? DirectiveErrorCode.RESOLUTION_FAILED : DirectiveErrorCode.EXECUTION_FAILED;
            const message = (code === DirectiveErrorCode.RESOLUTION_FAILED) ? 'Failed to resolve command for @data directive' : `Failed to execute command for @data directive: ${error instanceof Error ? error.message : 'Unknown'}`;
            throw new DirectiveError(message, this.kind, code, { ...errorDetails, cause: error instanceof Error ? error : undefined });
        }
      } else if (source === 'embed' && embed) { 
         try {
          // Use direct properties from embed (AST structure)
          const embedSubtype = embed.subtype;
          let fileContent: string;

          if (embedSubtype === 'embedPath') {
              const embedPathObject = embed.path;
              if (!embedPathObject) {
                 throw new DirectiveError('Missing path for @embed source (subtype: embedPath)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails); 
              }
              // Resolve path string first
              const valueToResolve = embedPathObject.interpolatedValue ?? embedPathObject.raw;
              const resolvedEmbedPathString = await this.resolutionService.resolveInContext(valueToResolve, resolutionContext);
              // Then validate the resolved path
              const validatedMeldPath = await this.resolutionService.resolvePath(resolvedEmbedPathString, resolutionContext);
              
              if (validatedMeldPath.contentType !== 'filesystem') {
                  throw new DirectiveError(`Cannot embed non-filesystem path: ${resolvedEmbedPathString}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails); 
              }

              const fsService = this.fileSystemService;
              if (!fsService) {
                throw new DirectiveError('File system service is unavailable for @embed execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, errorDetails); 
              }
              fileContent = await fsService.readFile(validatedMeldPath.validatedPath);

          } else if (embedSubtype === 'embedVariable') {
              const embedPathObject = embed.path;
              if (!embedPathObject) {
                 throw new DirectiveError('Missing variable reference for @embed source (subtype: embedVariable)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails); 
              }
              // Resolve the variable reference directly
              fileContent = await this.resolutionService.resolveInContext(embedPathObject, resolutionContext);

          } else if (embedSubtype === 'embedTemplate') {
              const templateContent = embed.content;
              if (!templateContent || !isInterpolatableValueArray(templateContent)) {
                  throw new DirectiveError('Missing or invalid content for @embed source (subtype: embedTemplate)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails); 
              }
              fileContent = await this.resolutionService.resolveNodes(templateContent, resolutionContext);
          } else {
             throw new DirectiveError(`Unsupported embed subtype: ${embedSubtype}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails); 
          }
          
          if (embed.section) {
             fileContent = await this.resolutionService.extractSection(fileContent, embed.section);
          }

          try {
            resolvedValue = JSON.parse(fileContent);
          } catch (parseError) {
             throw new DirectiveError(
              `Failed to parse embedded content as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
              this.kind, 
              DirectiveErrorCode.EXECUTION_FAILED, 
              { ...errorDetails, cause: parseError instanceof Error ? parseError : undefined }
            );
          }
          logger.debug('Embedded content and parsed JSON for @data directive', { subtype: embedSubtype, section: embed.section, output: resolvedValue });
          valueToParse = resolvedValue;
        } catch (error) {
            if (error instanceof DirectiveError) throw error;
            const code = (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) ? DirectiveErrorCode.RESOLUTION_FAILED : DirectiveErrorCode.EXECUTION_FAILED;
            const message = code === DirectiveErrorCode.RESOLUTION_FAILED ? 'Failed to resolve @embed source for @data directive' : `Failed to read/process embed source for @data directive: ${error instanceof Error ? error.message : 'Unknown'}`;
            throw new DirectiveError(message, this.kind, code, { ...errorDetails, cause: error instanceof Error ? error : undefined });
        }
      } else {
         // Handle cases where source is set but the corresponding structure is missing or invalid
         const missingStructure = source === 'embed' ? 'embed' : source === 'run' ? 'run' : 'value';
         throw new DirectiveError(
              `Invalid @data directive: source is '${source}' but corresponding '${missingStructure}' property is missing or invalid.`,
              this.kind, 
              DirectiveErrorCode.VALIDATION_FAILED, 
              errorDetails
          );
      }

      // --- Modify JSON Parsing Step --- 
      let finalValue: JsonValue;
      if (typeof valueToParse === 'string') {
        try {
          // Use standard JSON.parse()
          finalValue = JSON.parse(valueToParse); 
          logger.debug('Successfully parsed resolved string as JSON', { identifier });
        } catch (parseError) {
          // Update error details structure here too
          throw new DirectiveError(
            `Failed to parse value for @data directive '${identifier}' as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
            this.kind, 
            DirectiveErrorCode.VALIDATION_FAILED, 
            { ...errorDetails, cause: parseError instanceof Error ? parseError : undefined }
          );
        }
      } else {
        // Assume non-string value is already valid JSON (or primitive)
        // Remove JsonUtils.isValidJsonValue check
        finalValue = valueToParse as JsonValue; 
      }
      // --- End JSON Parsing Step --- 

      logger.info('[DataDirectiveHandler] Resolved data var:', { identifier, finalValue: JSON.stringify(finalValue) });
      
      const metadata: VariableMetadata = {
          origin: VariableOrigin.DIRECT_DEFINITION, 
          definedAt: directiveSourceLocation,
          createdAt: Date.now(),
          modifiedAt: Date.now()
      };
      
      // <<< Create VariableDefinition for StateChanges >>>
      const variableDefinition: VariableDefinition = {
          type: VariableType.DATA,
          value: finalValue,
          metadata: metadata
      };
      
      // Return NEW DirectiveResult shape
      return { 
         stateChanges: { 
            variables: { 
                [identifier]: variableDefinition 
            }
         }
      }; 

    } catch (error) {
      if (error instanceof DirectiveError) {
         // Ensure details are attached if missing by re-throwing
         if (!error.details?.context) {
            // Throw a new error, copying relevant info
            throw new DirectiveError(
                error.message,
                this.kind, // Use handler's kind
                error.code,
                { 
                  ...(error.details || {}), // Copy existing details
                  node: error.details?.node ?? node, // Ensure node is included
                  context: context, // Pass the full context
                  // Copy cause if it exists and is an Error
                  cause: error.details?.cause instanceof Error ? error.details.cause : undefined 
                }
            );
         }
         throw error; // Re-throw original if context was already present
      } 
      // Wrap unexpected errors
      throw new DirectiveError(
        `Error processing data directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.kind, // Use this.kind
        DirectiveErrorCode.EXECUTION_FAILED,
        { 
          node: node, // Ensure node is included
          context: context, // Pass the full context
          cause: error instanceof Error ? error : undefined,
        }
      );
    }
  }

  /**
   * Recursively traverses an object/array, resolving any InterpolatableValue arrays found.
   */
  private async resolveInterpolatableValuesInData(
    data: unknown,
    context: ResolutionContext // Ensure this uses the correct context
  ): Promise<JsonValue> {
    if (isInterpolatableValueArray(data)) {
      logger.debug('[resolveInterpolatableValuesInData] Resolving InterpolatableValue Array:', data);
      const resolvedString = await this.resolutionService.resolveNodes(data, context);
      logger.debug('[resolveInterpolatableValuesInData] Resolved to:', resolvedString);
      return resolvedString;
    }
    if (Array.isArray(data)) {
      const resolvedArray: JsonValue[] = [];
      for (const item of data) {
          resolvedArray.push(await this.resolveInterpolatableValuesInData(item, context));
      }
      return resolvedArray;
    }
    if (typeof data === 'object' && data !== null) {
      const resolvedObject: Record<string, JsonValue> = {};
      for (const [key, value] of Object.entries(data)) {
        logger.debug(`[resolveInterpolatableValuesInData] Resolving key "${key}":`, value);
        resolvedObject[key] = await this.resolveInterpolatableValuesInData(value, context);
      }
      return resolvedObject;
    }
    return data as JsonValue;
  }

  /**
   * Validate resolved value against schema (Placeholder)
   */
  private async validateSchema(
    value: any,
    schema: string,
    node: DirectiveNode
  ): Promise<void> {
    logger.debug('Schema validation requested (Not Implemented)', { schema, location: node.location });
    // TODO: Implement schema validation logic
  }
} 