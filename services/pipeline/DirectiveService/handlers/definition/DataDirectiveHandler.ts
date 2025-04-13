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
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService, ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
// Ensure SourceLocation is imported from the canonical source and aliased
import { 
    JsonValue, 
    SourceLocation as CoreSourceLocation, // Alias import
    VariableOrigin, 
    VariableMetadata, 
    DataVariable,
    IPathVariable 
} from '@core/types/index.js'; 
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import type { IPathService } from '@services/fs/PathService/IPathService.js';
import { MeldResolutionError, FieldAccessError, PathValidationError, MeldError } from '@core/errors';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import type { DirectiveProcessingContext } from '@core/types/index.js';
// Import command definition types and type guard
import { ICommandDefinition, isBasicCommand } from '@core/types/define.js'; 
// <<< Restore missing imports for path types >>>
import { MeldPath, PathContentType, IFilesystemPathState, IUrlPathState } from '@core/types'; 

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
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService,
    @inject('IPathService') private pathService: IPathService
  ) {}

  // Update execute signature
  public async execute(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    const state = context.state;
    const node = context.directiveNode as DirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();

    const directive = node.directive; 
    const identifier = directive.identifier;
    const source = directive.source;
    const value = directive.value; // May be literal or InterpolatableValue
    const embed = directive.embed; // Type should come from AST types
    const run = directive.run; // Type should come from AST types

    logger.debug('Processing data directive', {
      location: node.location,
      identifier,
      source,
      hasValue: value !== undefined,
      hasEmbed: embed !== undefined,
      hasRun: run !== undefined
    });

    // await this.validationService.validate(node); // Keep commented

    logger.info('[DataDirectiveHandler] Processing:', { identifier, source });

    try {
      let resolvedValue: unknown;
      
      // <<< Define location using CoreSourceLocation type explicitly >>>
      let directiveSourceLocation: CoreSourceLocation | undefined = undefined;
      if (node.location?.start && typeof currentFilePath === 'string') {
          directiveSourceLocation = { 
              filePath: currentFilePath, 
              line: node.location.start.line,
              column: node.location.start.column,
          };
      }

      if (source === 'literal') {
        // Value should exist for literal source
        if (value === undefined) {
             throw new DirectiveError('Missing value for @data directive with source=\"literal\"' , this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node, context: { currentFilePath: currentFilePath ?? undefined } });
        }
        resolvedValue = await this.resolveInterpolatableValuesInData(value, resolutionContext);
      } else if (source === 'run' && run) { // Check if run structure exists
        try {
          const commandInput = run.command;
          const runSubtype = run.subtype;
          if (!commandInput) throw new Error('Missing command input for @run source');
          
          let resolvedCommandString: string;

          if (runSubtype === 'runDefined') {
             if (typeof commandInput !== 'object' || !('name' in commandInput)) {
                 throw new Error('Invalid command input structure for runDefined subtype');
             }
             const cmdVar = state.getCommandVar(commandInput.name); // Use state from context
             if (cmdVar && cmdVar.value && isBasicCommand(cmdVar.value)) { 
                resolvedCommandString = cmdVar.value.commandTemplate; 
             } else {
                const errorMsg = cmdVar ? `Command '${commandInput.name}' is not a basic command suitable for @data/@run` : `Command definition '${commandInput.name}' not found`;
                throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node: node, context: { currentFilePath: currentFilePath ?? undefined } });
             }
          } else if (runSubtype === 'runCommand' || runSubtype === 'runCode' || runSubtype === 'runCodeParams') {
             if (!isInterpolatableValueArray(commandInput)) {
                throw new Error(`Expected InterpolatableValue for command input with subtype '${runSubtype}'`);
             }
             resolvedCommandString = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
          } else {
             throw new Error(`Unsupported run subtype '${runSubtype}' encountered in @data handler`);
          }
          
          const fsService = this.fileSystemService;
          if (!fsService) {
            throw new DirectiveError('File system service is unavailable for @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context: { currentFilePath: currentFilePath ?? undefined } });
          }
          
          const { stdout } = await fsService.executeCommand(resolvedCommandString, { cwd: fsService.getCwd() });
          
          try {
            resolvedValue = JSON.parse(stdout);
          } catch (parseError) {
            throw new DirectiveError(
              `Failed to parse command output as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
              this.kind, 
              DirectiveErrorCode.EXECUTION_FAILED, 
              { node: node, context: { currentFilePath: currentFilePath ?? undefined }, cause: parseError instanceof Error ? parseError : undefined }
            );
          }
          logger.debug('Executed command and parsed JSON for @data directive', { resolvedCommand: resolvedCommandString, output: resolvedValue });
        } catch (error) {
            if (error instanceof DirectiveError) throw error; 
            const code = (error instanceof MeldResolutionError || error instanceof FieldAccessError) ? DirectiveErrorCode.RESOLUTION_FAILED : DirectiveErrorCode.EXECUTION_FAILED;
            const message = (code === DirectiveErrorCode.RESOLUTION_FAILED) ? 'Failed to resolve command for @data directive' : `Failed to execute command for @data directive: ${error instanceof Error ? error.message : 'Unknown'}`;
            throw new DirectiveError(message, this.kind, code, { node: node, context: { currentFilePath: currentFilePath ?? undefined }, cause: error instanceof Error ? error : undefined });
        }
      } else if (source === 'embed' && embed) { // Check if embed structure exists
         try {
          const embedSubtype = embed.subtype;
          let fileContent: string;

          if (embedSubtype === 'embedPath') {
              const embedPathObject = embed.path;
              if (!embedPathObject) {
                 throw new DirectiveError('Missing path for @embed source (subtype: embedPath)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node, context: { currentFilePath: currentFilePath ?? undefined } }); 
              }
              const resolvedEmbedPathString = await this.resolutionService.resolveInContext(embedPathObject, resolutionContext);
              const validatedMeldPath = await this.resolutionService.resolvePath(resolvedEmbedPathString, resolutionContext);
              
              if (validatedMeldPath.contentType !== 'filesystem') {
                  throw new DirectiveError(`Cannot embed non-filesystem path: ${resolvedEmbedPathString}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node, context: { currentFilePath: currentFilePath ?? undefined } }); 
              }

              const fsService = this.fileSystemService;
              if (!fsService) {
                throw new DirectiveError('File system service is unavailable for @embed execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node, context: { currentFilePath: currentFilePath ?? undefined } }); 
              }
              fileContent = await fsService.readFile(validatedMeldPath.validatedPath);

          } else if (embedSubtype === 'embedVariable') {
              const embedPathObject = embed.path;
              if (!embedPathObject) {
                 throw new DirectiveError('Missing variable reference for @embed source (subtype: embedVariable)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node, context: { currentFilePath: currentFilePath ?? undefined } }); 
              }
              fileContent = await this.resolutionService.resolveInContext(embedPathObject.raw, resolutionContext);

          } else if (embedSubtype === 'embedTemplate') {
              const templateContent = embed.content;
              if (!templateContent || !isInterpolatableValueArray(templateContent)) {
                  throw new DirectiveError('Missing or invalid content for @embed source (subtype: embedTemplate)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node, context: { currentFilePath: currentFilePath ?? undefined } }); 
              }
              fileContent = await this.resolutionService.resolveNodes(templateContent, resolutionContext);
          } else {
             throw new DirectiveError(`Unsupported embed subtype: ${embedSubtype}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node, context: { currentFilePath: currentFilePath ?? undefined } }); 
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
              { node: node, context: { currentFilePath: currentFilePath ?? undefined }, cause: parseError instanceof Error ? parseError : undefined }
            );
          }
          logger.debug('Embedded content and parsed JSON for @data directive', { subtype: embedSubtype, section: embed.section, output: resolvedValue });
        } catch (error) {
            if (error instanceof DirectiveError) throw error;
            const code = (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) ? DirectiveErrorCode.RESOLUTION_FAILED : DirectiveErrorCode.EXECUTION_FAILED;
            const message = code === DirectiveErrorCode.RESOLUTION_FAILED ? 'Failed to resolve @embed source for @data directive' : `Failed to read/process embed source for @data directive: ${error instanceof Error ? error.message : 'Unknown'}`;
            throw new DirectiveError(message, this.kind, code, { node: node, context: { currentFilePath: currentFilePath ?? undefined }, cause: error instanceof Error ? error : undefined });
        }
      } else {
         // Handle cases where source is set but the corresponding structure is missing
         const missingStructure = source === 'embed' ? 'embed' : source === 'run' ? 'run' : 'value';
         throw new DirectiveError(
              `Invalid @data directive: source is '${source}' but corresponding '${missingStructure}' property is missing.`,
              this.kind, 
              DirectiveErrorCode.VALIDATION_FAILED, 
              { node: node, context: { currentFilePath: currentFilePath ?? undefined } }
          );
      }

      logger.info('[DataDirectiveHandler] Setting data var:', { identifier, resolvedValue: JSON.stringify(resolvedValue) });
      
      const metadata: Partial<VariableMetadata> = {
          origin: VariableOrigin.DIRECT_DEFINITION, 
          definedAt: directiveSourceLocation 
      };
      
      // <<< Call setDataVar with 3 args, casting state explicitly >>>
      await (state as IStateService).setDataVar(identifier, resolvedValue as JsonValue, metadata);
      
      // <<< Return state directly, casting state explicitly for clarity >>>
      return { state: state as IStateService, replacement: undefined }; 

    } catch (error) {
      if (error instanceof DirectiveError) {
        throw error;
      } 
      // <<< Ensure final error uses correct CoreSourceLocation for details if possible >>>
      let errorLocation: CoreSourceLocation | undefined = undefined;
      if (node.location?.start && typeof currentFilePath === 'string') {
          errorLocation = { 
              filePath: currentFilePath, 
              line: node.location.start.line,
              column: node.location.start.column,
          };
      }
      throw new DirectiveError(
        `Error processing data directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'data',
        DirectiveErrorCode.EXECUTION_FAILED,
        { 
          node: node, 
          context: { currentFilePath: currentFilePath ?? undefined }, // Keep context simple here
          cause: error instanceof Error ? error : undefined,
          location: errorLocation // Pass the potentially undefined CoreSourceLocation here
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