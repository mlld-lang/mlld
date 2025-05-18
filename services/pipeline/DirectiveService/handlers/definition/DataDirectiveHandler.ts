import type { 
    DirectiveNode, 
    InterpolatableValue, 
    VariableReferenceNode, 
    TextNode, 
    StructuredPath as AstStructuredPath
} from '@core/syntax/types/nodes'; 
// Remove imports for non-existent types
// import type {
//     DataDirectiveData, 
//     EmbedRHSAst, 
//     RunRHSAst   
// } from '@core/syntax/types/directives'; 
// import type { DataDirectiveNode } from '@core/syntax/types/nodes'; 

import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { directiveLogger as logger } from '@core/utils/logger';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { ErrorSeverity } from '@core/errors/MeldError';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
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
} from '@core/types/index'; 
import { SourceLocation } from '@core/types/common'; // Import SourceLocation directly
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import type { IPathService } from '@services/fs/PathService/IPathService';
import { MeldResolutionError, FieldAccessError, PathValidationError, MeldError } from '@core/errors';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler.ts';
import type { DirectiveProcessingContext } from '@core/types/index';
// Import command definition types and type guard
import { ICommandDefinition, isBasicCommand } from '@core/types/define'; 
// <<< Restore missing imports for path types >>>
import { MeldPath, PathContentType, IFilesystemPathState, IUrlPathState } from '@core/types'; 
import type { VariableDefinition } from '@core/types/variables'; // Use relative path
import { isCommandVariable } from '@core/types/guards'; // <-- Corrected path based on previous findings
// Re-add IStateService import as it's needed for context.state type checking
import type { IStateService } from '@services/state/StateService/IStateService'; 

// +++ Import ALL Concrete Handlers +++
import { TextDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/TextDirectiveHandler';
import { DataDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/DataDirectiveHandler';
import { PathDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/PathDirectiveHandler';
import { ExecDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/ExecDirectiveHandler';
import { VarDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/definition/VarDirectiveHandler'; // Assuming it exists
import { RunDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/RunDirectiveHandler';
import { AddDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/AddDirectiveHandler';
import { ImportDirectiveHandler } from '@services/pipeline/DirectiveService/handlers/execution/ImportDirectiveHandler';
// +++ End Handler Imports +++

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
    const baseErrorDetails = { 
      node: node, 
      context: { currentFilePath: currentFilePath ?? undefined } 
    };

    // Assert directive exists before accessing properties
    if (!node.directive) {
       throw new DirectiveError(
          'Directive node is missing the directive property',
          this.kind, 
          DirectiveErrorCode.VALIDATION_FAILED, 
          baseErrorDetails
      );
    }

    const identifier = node.directive.identifier;
    const source = node.directive.source ?? 'literal';
    const value = node.directive.value;
    const embed = node.directive.embed;
    const run = node.directive.run;

    if (!identifier) {
      throw new DirectiveError(
        'Data directive requires an identifier',
        this.kind,
        DirectiveErrorCode.VALIDATION_FAILED,
        baseErrorDetails
      );
    }

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
      
      // Define location using common SourceLocation type
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

      if (source === 'literal') {
        if (value === undefined) {
             throw new DirectiveError('Missing value for @data directive with source="literal"', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
        }
        // Resolve potential variables within the literal value first
        resolvedValue = await this.resolveInterpolatableValuesInData(value, resolutionContext);
      } else if (source === 'run' && run) {
        try {
          const commandInput = run.command;
          const runSubtype = run.subtype;
          if (!commandInput) {
            throw new DirectiveError('Missing command input for @run source', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
          }
          
          let resolvedCommandString: string;

          if (runSubtype === 'runDefined') {
             const definedCommand = commandInput as { name: string };
             if (typeof definedCommand !== 'object' || !definedCommand.name) {
                 throw new DirectiveError('Invalid command input structure for runDefined subtype', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
             }
             const cmdVar = state.getVariable(definedCommand.name, VariableType.COMMAND);
             if (cmdVar && isCommandVariable(cmdVar) && isBasicCommand(cmdVar.value)) { 
                resolvedCommandString = cmdVar.value.commandTemplate; 
             } else {
                const errorMsg = !cmdVar ? `Command definition '${definedCommand.name}' not found` : `Command '${definedCommand.name}' is not a basic command suitable for @data/@run`;
                throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, baseErrorDetails);
             }
          } else if (isInterpolatableValueArray(commandInput)) {
             resolvedCommandString = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
          } else {
             throw new DirectiveError('Invalid command input structure', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
          }
          
          const fsService = this.fileSystemService;
          if (!fsService) {
            throw new DirectiveError('File system service is unavailable for @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, baseErrorDetails);
          }
          
          const { stdout } = await fsService.executeCommand(resolvedCommandString, { cwd: fsService.getCwd() });
          
          try {
            resolvedValue = JSON.parse(stdout);
          } catch (error) {
            throw new DirectiveError(
              `Failed to parse command output as JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
              this.kind,
              DirectiveErrorCode.EXECUTION_FAILED,
              { ...baseErrorDetails, cause: error instanceof Error ? error : undefined }
            );
          }
        } catch (error) {
          if (error instanceof DirectiveError) throw error;
          const code = (error instanceof MeldResolutionError || error instanceof FieldAccessError) ? DirectiveErrorCode.RESOLUTION_FAILED : DirectiveErrorCode.EXECUTION_FAILED;
          const message = code === DirectiveErrorCode.RESOLUTION_FAILED ? 'Failed to resolve command for @data directive' : `Failed to execute command for @data directive: ${error instanceof Error ? error.message : 'Unknown'}`;
          throw new DirectiveError(message, this.kind, code, { ...baseErrorDetails, cause: error instanceof Error ? error : undefined });
        }
      } else if (source === 'embed' && embed) { 
         try {
          const embedSubtype = embed.subtype;
          let fileContent: string;

          if (embedSubtype === 'embedPath') {
            const pathService = this.pathService;
            if (!pathService) {
              throw new DirectiveError('Path service is unavailable for @add processing', this.kind, DirectiveErrorCode.EXECUTION_FAILED, baseErrorDetails);
            }

            const fsService = this.fileSystemService;
            if (!fsService) {
              throw new DirectiveError('File system service is unavailable for @add processing', this.kind, DirectiveErrorCode.EXECUTION_FAILED, baseErrorDetails);
            }

            const resolvedPath = await pathService.resolvePath(embed.path, currentFilePath);
            if (!resolvedPath) {
              throw new DirectiveError('Failed to resolve embed path', this.kind, DirectiveErrorCode.RESOLUTION_FAILED, baseErrorDetails);
            }

            fileContent = await fsService.readFile(resolvedPath);
          } else if (embedSubtype === 'embedVariable') {
            const varName = embed.variable?.name;
            if (!varName) {
              throw new DirectiveError('Missing variable name in @add source', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
            }

            const embedVar = state.getVariable(varName);
            if (!embedVar) {
              throw new DirectiveError(`Variable '${varName}' not found for @add source`, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, baseErrorDetails);
            }

            if (embedVar.type !== VariableType.TEXT && embedVar.type !== VariableType.DATA) {
              throw new DirectiveError(
                `Variable '${varName}' must be of type TEXT or DATA for @add source in @data directive`,
                this.kind,
                DirectiveErrorCode.VALIDATION_FAILED,
                baseErrorDetails
              );
            }

            fileContent = String(embedVar.value);
          } else {
            throw new DirectiveError(`Unsupported @add subtype '${embedSubtype}' in @data directive`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
          }

          try {
            resolvedValue = JSON.parse(fileContent);
          } catch (error) {
            throw new DirectiveError(
              `Embedded content is not valid JSON: ${error instanceof Error ? error.message : 'Unknown error'}`,
              this.kind,
              DirectiveErrorCode.EXECUTION_FAILED,
              { ...baseErrorDetails, cause: error instanceof Error ? error : undefined }
            );
          }
        } catch (error) {
          if (error instanceof DirectiveError) throw error;
          const code = (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) ? DirectiveErrorCode.RESOLUTION_FAILED : DirectiveErrorCode.EXECUTION_FAILED;
          const message = code === DirectiveErrorCode.RESOLUTION_FAILED ? 'Failed to resolve @add source for @data directive' : `Failed to read/process embed source for @data directive: ${error instanceof Error ? error.message : 'Unknown'}`;
          throw new DirectiveError(message, this.kind, code, { ...baseErrorDetails, cause: error instanceof Error ? error : undefined });
        }
      } else {
         const missingStructure = source === 'embed' ? 'embed' : source === 'run' ? 'run' : 'value';
         throw new DirectiveError(
              `Invalid @data directive: source is '${source}' but corresponding '${missingStructure}' property is missing or invalid.`,
              this.kind, 
              DirectiveErrorCode.VALIDATION_FAILED, 
              baseErrorDetails
          );
      }

      // Create the data variable using the factory function
      const dataVariable = createDataVariable(identifier, resolvedValue as JsonValue, baseMetadata);

      // Return DirectiveResult with StateChanges
      return {
        stateChanges: {
          variables: {
            [identifier]: dataVariable
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
                this.kind,
                error.code,
                { 
                  ...(error.details || {}),
                  node: error.details?.node ?? node,
                  context: { currentFilePath: currentFilePath ?? undefined },
                  cause: error.details?.cause instanceof Error ? error.details.cause : undefined 
                }
            );
         }
         throw error;
      } 
      // Wrap unexpected errors
      throw new DirectiveError(
        `Error processing data directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        { 
          node: node,
          context: { currentFilePath: currentFilePath ?? undefined },
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
    context: ResolutionContext
  ): Promise<JsonValue> {
    // If it's an interpolatable value array, resolve it first
    if (isInterpolatableValueArray(data)) {
      const resolvedString = await this.resolutionService.resolveNodes(data, context);
      try {
        // Try to parse the resolved string as JSON
        return JSON.parse(resolvedString);
      } catch {
        // If it's not valid JSON, return the string itself
        return resolvedString;
      }
    }

    // Handle arrays recursively
    if (Array.isArray(data)) {
      const resolvedArray = await Promise.all(
        data.map(item => this.resolveInterpolatableValuesInData(item, context))
      );
      return resolvedArray;
    }

    // Handle objects recursively
    if (typeof data === 'object' && data !== null) {
      const resolvedObject: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        // Handle potential interpolation in both key and value
        let resolvedKey = key;
        if (isInterpolatableValueArray(key)) {
          resolvedKey = await this.resolutionService.resolveNodes(key, context);
        }
        resolvedObject[resolvedKey] = await this.resolveInterpolatableValuesInData(value, context);
      }
      return resolvedObject;
    }

    // For primitive values, return as is
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