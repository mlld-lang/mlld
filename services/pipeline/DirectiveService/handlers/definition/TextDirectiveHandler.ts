import type { 
    DirectiveNode, 
    InterpolatableValue, 
    VariableReferenceNode, 
    TextNode, 
    StructuredPath as AstStructuredPath
} from '@core/syntax/types/nodes.js'; // Import AST types
import { IDirectiveHandler, DirectiveContext } from '@services/pipeline/DirectiveService/IDirectiveService.js';
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
import type { StateServiceLike } from '@core/shared-service-types.js';
import type { VariableMetadata, TextVariable } from '@core/types/variables.js';
import { VariableOrigin } from '@core/types/variables.js';
import type { SourceLocation } from '@core/types/common.js';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js'; // Import guard
import { ICommandDefinition, isBasicCommand } from '@core/types/define.js'; 

// Define local interfaces mirroring expected AST structure for RHS
interface EmbedRHSStructure {
    subtype: 'embedPath' | 'embedVariable' | 'embedTemplate';
    path?: AstStructuredPath;
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
@Service({
  description: 'Handler for text directives',
  dependencies: [
    { token: 'IValidationService', name: 'validationService' },
    { token: 'IStateService', name: 'stateService' },
    { token: 'IResolutionService', name: 'resolutionService' },
    { token: 'IFileSystemService', name: 'fileSystemService' }
  ]
})
export class TextDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'text';

  constructor(
    @inject('IValidationService') private validationService: IValidationService,
    @inject('IStateService') private stateService: IStateService,
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService
  ) {
    logger.debug('TextDirectiveHandler constructor called', {
      hasValidationService: !!validationService,
      hasStateService: !!stateService,
      hasResolutionService: !!resolutionService,
      hasFileSystemService: !!fileSystemService
    });
  }

  /**
   * Checks if a value appears to be a string literal
   * This is a preliminary check before full validation
   */
  private isStringLiteral(value: string): boolean {
    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    const validQuotes = ['\'', '"', '`'];
    
    // Check for matching quotes
    if (!validQuotes.includes(firstChar) || firstChar !== lastChar) {
      return false;
    }

    // Check for unclosed quotes
    let isEscaped = false;
    for (let i = 1; i < value.length - 1; i++) {
      if (value[i] === '\\') {
        isEscaped = !isEscaped;
      } else if (value[i] === firstChar && !isEscaped) {
        return false; // Found an unescaped quote in the middle
      } else {
        isEscaped = false;
      }
    }

    return true;
  }

  // Use generic DirectiveNode until specific TextDirectiveNode is confirmed/needed
  async execute(node: DirectiveNode, context: DirectiveContext): Promise<StateServiceLike> {
    logger.debug('Processing text directive', {
      location: node.location,
      context: {
        currentFilePath: context.currentFilePath,
        stateExists: !!context.state,
        // stateMethods: context.state ? Object.keys(context.state) : 'undefined' // Can be noisy
      },
      directive: node.directive
    });
    
    try {
      // 1. Create a new state for modifications
      const newState = context.state.clone();
      const directiveSourceLocation: SourceLocation | undefined = node.location?.start ? {
        filePath: context.currentFilePath ?? 'unknown',
        line: node.location.start.line,
        column: node.location.start.column
      } : undefined;

      // 2. Validate directive structure
      // Temporarily comment out validation due to potential DirectiveNode/IDirectiveNode type conflict (See Issue #34)
      // await this.validationService.validate(node); 

      // 3. Get identifier and RHS details from directive
      const { identifier, value, source } = node.directive;
      const embed = node.directive.embed as EmbedRHSStructure | undefined;
      const run = node.directive.run as RunRHSStructure | undefined;
      
      // 4. Handle different sources
      let resolvedValue: string;
      
      // Create resolution context
      const resolutionContext = ResolutionContextFactory.forTextDirective(
        context.state, // Use original state for resolution lookups
        context.currentFilePath
      );

      if (source === 'literal') {
          // Value should be InterpolatableValue array
          if (!isInterpolatableValueArray(value)) {
             throw new DirectiveError(`Invalid value type for @text source 'literal'. Expected InterpolatableValue array.`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
          }
          resolvedValue = await this.resolutionService.resolveNodes(value, resolutionContext);

      } else if (source === 'run' && run) {
        try {
          const commandInput = run.command;
          const runSubtype = run.subtype;
          if (!commandInput) throw new Error('Missing command input for @run source');
          
          let resolvedCommandString: string;
          if (runSubtype === 'runDefined') {
             if (typeof commandInput !== 'object' || !('name' in commandInput)) {
                 throw new Error('Invalid command input structure for runDefined subtype');
             }
             const cmdVar = context.state.getCommandVar(commandInput.name);
             if (cmdVar && cmdVar.value && isBasicCommand(cmdVar.value)) { 
                resolvedCommandString = cmdVar.value.commandTemplate; 
             } else {
                const errorMsg = cmdVar ? `Command '${commandInput.name}' is not a basic command suitable for @text/@run` : `Command definition '${commandInput.name}' not found`;
                throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node: node as any, context });
             }
          } else if (runSubtype === 'runCommand' || runSubtype === 'runCode' || runSubtype === 'runCodeParams') {
             if (!isInterpolatableValueArray(commandInput)) {
                throw new Error(`Expected InterpolatableValue for command input with subtype '${runSubtype}'`);
             }
             resolvedCommandString = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
          } else {
             throw new Error(`Unsupported run subtype '${runSubtype}' encountered in @text handler`);
          }
          
          // Ensure FileSystemService is available (already injected)
          if (!this.fileSystemService) {
            throw new DirectiveError('File system service is unavailable for @run execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node: node as any, context });
          }
          
          const { stdout } = await this.fileSystemService.executeCommand(
              resolvedCommandString,
              { cwd: this.fileSystemService.getCwd() } 
          );
          resolvedValue = stdout.replace(/\n$/, ''); // Trim trailing newline

          logger.debug('Executed command for @text directive', { resolvedCommand: resolvedCommandString, output: resolvedValue });

        } catch (error) {
          if (error instanceof DirectiveError) throw error;
          if (error instanceof MeldResolutionError || error instanceof FieldAccessError) {
            throw new DirectiveError('Failed to resolve command for @text directive', this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node: node as any, context, cause: error });
          } else if (error instanceof Error) {
            throw new DirectiveError(`Failed to execute command for @text directive: ${error.message}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node: node as any, context, cause: error });
          }
          throw error; // Re-throw unexpected errors
        }
      } else if (source === 'embed' && embed) {
        try {
          const embedSubtype = embed.subtype;
          let fileContent: string;

          if (embedSubtype === 'embedPath') {
              const embedPathObject = embed.path;
              if (!embedPathObject) {
                 throw new DirectiveError('Missing path for @embed source (subtype: embedPath)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
              }
              const valueToResolve = embedPathObject.interpolatedValue ?? embedPathObject.raw;
              const resolvedEmbedPathString = await this.resolutionService.resolveInContext(valueToResolve, resolutionContext);
              const validatedMeldPath = await this.resolutionService.resolvePath(resolvedEmbedPathString, resolutionContext);
              
              if (validatedMeldPath.contentType !== 'filesystem') {
                  throw new DirectiveError(`Cannot embed non-filesystem path: ${resolvedEmbedPathString}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
              }
              if (!this.fileSystemService) { // Check injected service
                throw new DirectiveError('File system service is unavailable for @embed execution', this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node: node as any, context });
              }
              fileContent = await this.fileSystemService.readFile(validatedMeldPath.validatedPath);

          } else if (embedSubtype === 'embedVariable') {
              const embedPathObject = embed.path; 
              if (!embedPathObject) {
                 throw new DirectiveError('Missing variable reference for @embed source (subtype: embedVariable)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
              }
              fileContent = await this.resolutionService.resolveInContext(embedPathObject.raw, resolutionContext);

          } else if (embedSubtype === 'embedTemplate') {
              const templateContent = embed.content;
              if (!templateContent || !isInterpolatableValueArray(templateContent)) { 
                  throw new DirectiveError('Missing or invalid content for @embed source (subtype: embedTemplate)', this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
              }
              fileContent = await this.resolutionService.resolveNodes(templateContent, resolutionContext);
          } else {
             throw new DirectiveError(`Unsupported embed subtype: ${embedSubtype}`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node: node as any, context });
          }
          
          if (embed.section) {
             resolvedValue = await this.resolutionService.extractSection(fileContent, embed.section);
          } else {
             resolvedValue = fileContent;
          }
          
          logger.debug('Resolved @embed source for @text directive', { subtype: embedSubtype, section: embed.section, finalValueLength: resolvedValue.length });
          
        } catch (error) {
          if (error instanceof DirectiveError) throw error;
          if (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) {
            throw new DirectiveError('Failed to resolve @embed source for @text directive', this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node: node as any, context, cause: error });
          } else if (error instanceof Error) {
            throw new DirectiveError(`Failed to read/process embed source for @text directive: ${error.message}`, this.kind, DirectiveErrorCode.EXECUTION_FAILED, { node: node as any, context, cause: error });
          }
          throw error; // Re-throw unexpected errors
        }
      } else {
        // Fallback/error for invalid source or missing data
         throw new DirectiveError(
              `Unsupported source type '${source}' or missing embed/run data for @text directive`,
              this.kind, 
              DirectiveErrorCode.VALIDATION_FAILED, 
              { node: node as any, context }
          );
      }

      // 5. Set the resolved value in the new state
      const metadata: Partial<VariableMetadata> = {
          origin: VariableOrigin.DIRECT_DEFINITION,
          // Cast to any as workaround for SourceLocation conflict (Issue #34)
          definedAt: directiveSourceLocation as any 
      };
      
      await newState.setTextVar(identifier, resolvedValue, metadata);

      return newState;
    } catch (error) {
      // If it's already a DirectiveError, just rethrow
      if (error instanceof DirectiveError) {
        throw error;
      }
      
      // Otherwise, wrap it in a DirectiveError
      // Ensure location is passed correctly, even if potentially undefined
      const details = {
          node,
          cause: error instanceof Error ? error : undefined,
          location: node?.location,
          context: context
      };
      
      throw new DirectiveError(
        `Failed to process text directive: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        details
      );
    }
  }
} 