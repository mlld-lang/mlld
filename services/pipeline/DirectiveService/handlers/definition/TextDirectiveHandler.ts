import type { 
    DirectiveNode, 
    InterpolatableValue, 
    VariableReferenceNode, 
    TextNode, 
    StructuredPath // Corrected import name
} from '@core/syntax/types/nodes.js'; // Import AST types
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { ErrorSeverity, FieldAccessError, PathValidationError, MeldResolutionError } from '@core/errors';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { VariableMetadata, TextVariable } from '@core/types/variables.js';
import { VariableOrigin } from '@core/types/variables.js';
import type { SourceLocation } from '@core/types/common.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js'; // Import guard
import { ICommandDefinition, isBasicCommand } from '@core/types/define.js'; 
import type { DirectiveProcessingContext } from '@core/types/index.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';

// Define local interfaces mirroring expected AST structure for RHS
// Consider moving these to a shared types file if used elsewhere
interface EmbedRHSStructure {
    subtype: 'embedPath' | 'embedVariable' | 'embedTemplate';
    path?: StructuredPath; // Use corrected type name
    content?: InterpolatableValue;
    section?: string;
}

interface RunRHSStructure {
    subtype: 'runCommand' | 'runCode' | 'runCodeParams' | 'runDefined';
    command?: InterpolatableValue | { name: string, args: any[], raw: string };
    language?: string;
    isMultiLine?: boolean;
    parameters?: Array<VariableReferenceNode | string>;
}

/**
 * Handler for @text directives
 * Stores text values in state after resolving variables and processing embedded content
 */
@injectable()
@Service({
  description: 'Handler for @text directives'
})
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';

  constructor(
    // Removed unused IValidationService injection based on audit
    // @inject('IValidationService') private validationService: IValidationService,
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService // Assuming FS is used
  ) {}

  /**
   * Checks if a value appears to be a string literal
   * @deprecated This logic is typically handled by the parser.
   */
  // private isStringLiteral(value: string): boolean { ... } // REMOVED

  async execute(context: DirectiveProcessingContext): Promise<IStateService | DirectiveResult> {
    const state = context.state;
    const node = context.directiveNode as DirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    // Standardized context for errors
    const errorDetailsContext = { 
      node: node, 
      context: context // Pass the full processing context
    };

    logger.debug('Processing text directive', {
      location: node.location,
      context: {
        currentFilePath: currentFilePath,
        stateExists: !!state,
      },
      directive: node.directive
    });
    
    try {
      const directiveSourceLocation: SourceLocation | undefined = node.location?.start ? {
        filePath: currentFilePath ?? 'unknown',
        line: node.location.start.line,
        column: node.location.start.column
      } : undefined;

      // Use more specific type assertion if possible, or keep as any
      const { identifier, value, source = 'literal', embed, run } = node.directive as any;
      
      let resolvedValue: string;
      
      if (source === 'literal') {
          if (typeof value === 'string') {
              // Resolve strings that might contain interpolation
              resolvedValue = await this.resolutionService.resolveInContext(value, resolutionContext);
          } else if (isInterpolatableValueArray(value)) {
              // Resolve the array of nodes into a single string
              logger.debug('Text value is InterpolatableValue, resolving nodes...');
              resolvedValue = await this.resolutionService.resolveNodes(value, resolutionContext);
              logger.debug('Resolved InterpolatableValue to string:', resolvedValue);
          } else {
             throw new DirectiveError(
               `Invalid value type for @text source 'literal'. Expected string or InterpolatableValue array.`,
                this.kind, 
                DirectiveErrorCode.VALIDATION_FAILED, 
                errorDetailsContext
             );
          }
      } else if (source === 'run' && run) {
        const runDetails = run as RunRHSStructure;
        process.stdout.write(`[TextDirectiveHandler LOG] Entered source=run block\n`);
        process.stdout.write(`[TextDirectiveHandler LOG] run object: ${JSON.stringify(runDetails)}\n`);
        process.stdout.write(`[TextDirectiveHandler LOG] runSubtype: ${runDetails.subtype}\n`);
        process.stdout.write(`[TextDirectiveHandler LOG] commandInput: ${JSON.stringify(runDetails.command)}\n`);
        try {
          const commandInput = runDetails.command;
          const runSubtype = runDetails.subtype;
          if (!commandInput) throw new DirectiveError('Missing command input for @run source', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
          
          let resolvedCommandString: string;

          if (runSubtype === 'runDefined') {
             if (typeof commandInput !== 'object' || !('name' in commandInput)) {
                 throw new DirectiveError('Invalid command input structure for runDefined subtype', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
             }
             const cmdVar = state.getCommandVar(commandInput.name); // Use IStateService method
             if (cmdVar && cmdVar.value && isBasicCommand(cmdVar.value)) { 
                // Assuming commandTemplate holds the string to run for @text
                resolvedCommandString = cmdVar.value.commandTemplate; 
             } else {
                const errorMsg = cmdVar ? `Command '${commandInput.name}' is not a basic command suitable for @text/@run` : `Command definition '${commandInput.name}' not found`;
                throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, errorDetailsContext);
             }
          } else if (runSubtype === 'runCommand' || runSubtype === 'runCode' || runSubtype === 'runCodeParams') {
             if (!isInterpolatableValueArray(commandInput)) {
                // This check might be redundant if AST guarantees this structure
                throw new DirectiveError(`Expected InterpolatableValue for command input with subtype '${runSubtype}'`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
             }
             resolvedCommandString = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
          } else {
             throw new DirectiveError(`Unsupported run subtype '${runSubtype}' encountered in @text handler`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
          }
          process.stdout.write(`[TextDirectiveHandler LOG] Resolved command string: ${resolvedCommandString}\n`);
          
          if (!this.fileSystemService) {
            // Throw specific error if service is missing
            throw new DirectiveError('File system service is unavailable for @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, errorDetailsContext);
          }
          
          process.stdout.write(`[TextDirectiveHandler LOG] Calling executeCommand with: ${resolvedCommandString}\n`);
          // Use IFileSystemService method
          const { stdout } = await this.fileSystemService.executeCommand(
              resolvedCommandString,
              { cwd: this.fileSystemService.getCwd() } 
          );
          resolvedValue = stdout.replace(/\n$/, ''); // Remove trailing newline

          logger.debug('Executed command for @text directive', { resolvedCommand: resolvedCommandString, output: resolvedValue });

        } catch (error) {
          if (error instanceof DirectiveError) throw error;
          // Include original error as cause
          if (error instanceof MeldResolutionError || error instanceof FieldAccessError) {
            throw new DirectiveError('Failed to resolve command for @text directive', this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...errorDetailsContext, cause: error instanceof Error ? error : undefined });
          } else if (error instanceof Error) {
            throw new DirectiveError(`Failed to execute command for @text directive: ${error.message}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED, { ...errorDetailsContext, cause: error });
          }
          // Re-throw unknown errors, checking instanceof Error for cause
          throw new DirectiveError('Unknown error during @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { ...errorDetailsContext, cause: error instanceof Error ? error : undefined });
        }
      } else if (source === 'embed' && embed) {
        const embedDetails = embed as EmbedRHSStructure;
        try {
          const embedSubtype = embedDetails.subtype;
          let fileContent: string;

          if (embedSubtype === 'embedPath') {
              const embedPathObject = embedDetails.path;
              if (!embedPathObject) {
                 throw new DirectiveError('Missing path for @embed source (subtype: embedPath)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
              }
              // Resolve path string first
              const valueToResolve = embedPathObject.interpolatedValue ?? embedPathObject.raw;
              const resolvedEmbedPathString = await this.resolutionService.resolveInContext(valueToResolve, resolutionContext);
              // Then validate and normalize the resolved path string
              const validatedMeldPath = await this.resolutionService.resolvePath(resolvedEmbedPathString, resolutionContext);
              
              if (validatedMeldPath.contentType !== 'filesystem') {
                  throw new DirectiveError(`Cannot embed non-filesystem path: ${resolvedEmbedPathString}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
              }
              if (!this.fileSystemService) { 
                throw new DirectiveError('File system service is unavailable for @embed execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, errorDetailsContext);
              }
              // Use validated path from MeldPath object
              fileContent = await this.fileSystemService.readFile(validatedMeldPath.validatedPath);

          } else if (embedSubtype === 'embedVariable') {
              const embedPathObject = embedDetails.path; 
              if (!embedPathObject) {
                 throw new DirectiveError('Missing variable reference for @embed source (subtype: embedVariable)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
              }
              // Resolve the variable reference represented by embedPathObject.raw
              fileContent = await this.resolutionService.resolveInContext(embedPathObject.raw, resolutionContext);

          } else if (embedSubtype === 'embedTemplate') {
              const templateContent = embedDetails.content;
              if (!templateContent || !isInterpolatableValueArray(templateContent)) { 
                  throw new DirectiveError('Missing or invalid content for @embed source (subtype: embedTemplate)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
              }
              // Resolve the template content nodes
              fileContent = await this.resolutionService.resolveNodes(templateContent, resolutionContext);
          } else {
             // Should not happen if parser validation is correct
             throw new DirectiveError(`Unsupported embed subtype: ${embedSubtype}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetailsContext);
          }
          
          // Extract section if specified
          if (embedDetails.section) {
             // Use IResolutionService method
             resolvedValue = await this.resolutionService.extractSection(fileContent, embedDetails.section);
          } else {
             resolvedValue = fileContent;
          }
          
          logger.debug('Resolved @embed source for @text directive', { subtype: embedSubtype, section: embedDetails.section, finalValueLength: resolvedValue.length });
          
        } catch (error) {
          if (error instanceof DirectiveError) throw error;
          // Include original error as cause
          if (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) {
            throw new DirectiveError('Failed to resolve @embed source for @text directive', this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...errorDetailsContext, cause: error instanceof Error ? error : undefined });
          } else if (error instanceof Error) {
            throw new DirectiveError(`Failed to read/process embed source for @text directive: ${error.message}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED, { ...errorDetailsContext, cause: error });
          }
           // Re-throw unknown errors, checking instanceof Error for cause
          throw new DirectiveError('Unknown error during @embed execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { ...errorDetailsContext, cause: error instanceof Error ? error : undefined });
        }
      } else {
        throw new DirectiveError(
              `Unsupported source type '${source}' for @text directive`,
              this.kind, 
              DirectiveErrorCode.VALIDATION_FAILED, 
              errorDetailsContext
          );
      }

      // Prepare metadata for the variable
      const metadata: Partial<VariableMetadata> = {
          origin: VariableOrigin.DIRECT_DEFINITION,
          definedAt: directiveSourceLocation
      };
      
      // Use IStateService method to set the variable
      await state.setTextVar(identifier, resolvedValue);

      // Return the updated state
      return state as IStateService;
    } catch (error) {
      // Ensure all thrown errors are DirectiveErrors with consistent details
      if (error instanceof DirectiveError) {
        // Ensure context is included in details if missing
        if (!error.details?.context) { 
           // Need to re-throw a NEW error here as details might be readonly
           throw new DirectiveError(
              error.message,
              this.kind,
              error.code,
              { 
                ...(error.details || {}), 
                ...errorDetailsContext, 
                // Access cause from details if it exists and is an Error
                cause: error.details?.cause instanceof Error ? error.details.cause : undefined 
              }
           );
        }
        throw error;
      }
      
      // Wrap unexpected errors in a new DirectiveError
      throw new DirectiveError(
        `Failed to process text directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        { 
          ...errorDetailsContext, 
          cause: error instanceof Error ? error : undefined 
        }
      );
    }
  }
} 