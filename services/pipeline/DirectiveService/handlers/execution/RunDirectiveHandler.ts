import type { DirectiveNode, DirectiveContext, MeldNode, TextNode, StructuredPath, VariableReferenceNode, InterpolatableValue } from '@core/syntax/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { ErrorSeverity, MeldError, MeldResolutionError, FieldAccessError } from '@core/errors';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { RunDirectiveData } from '@core/syntax/types.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { PathValidationError } from '@core/errors';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { DirectiveProcessingContext, ResolutionContext } from '@core/types/index.js';
import type { ICommandDefinition } from '@core/types/define.js';
import { isBasicCommand } from '@core/types/define.js';
import type { SourceLocation } from '@core/types/common.js';
import { type VariableMetadata, VariableOrigin } from '@core/types/variables.js';
import type { VariableDefinition } from '../../../../../core/variables/VariableTypes';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import { createTextVariable, VariableType } from '@core/types/variables.js';
import type { DirectiveResult, StateChanges } from '@core/directives/DirectiveHandler.ts';

/**
 * Handler for @run directives
 * Executes commands and stores their output in state
 */
@injectable()
@Service({
  description: 'Handler for @run directives'
})
export class RunDirectiveHandler implements IDirectiveHandler {
  readonly kind = 'run';

  constructor(
    @inject('IResolutionService') private resolutionService: IResolutionService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService
  ) {}

  // ADDED: Missing helper method to create and write to a temp file
  private async createTempScriptFile(content: string, language: string): Promise<string> {
    const filePath = this.getTempFilePath(language);
    try {
      await this.fileSystemService.writeFile(filePath, content);
      logger.debug('Created temporary script file', { path: filePath, language });
      return filePath;
    } catch (error) {
      logger.error('Failed to create temporary script file', { path: filePath, error });
      // Re-throw as a more specific error or handle as appropriate
      throw new DirectiveError(
        `Failed to create temporary script file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.kind,
        DirectiveErrorCode.FILESYSTEM_ERROR,
        { cause: error instanceof Error ? error : undefined }
      );
    }
  }

  async handle(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    const state: IStateService = context.state;
    const node = context.directiveNode as DirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    const baseErrorDetails = { 
      node: node 
    }; 
    
    // <<< Declare tempFilePath *outside* the try block >>>
    let tempFilePath: string | undefined;

    try {
      if (!node.directive || node.directive.kind !== 'run') {
          throw new DirectiveError('Invalid node type provided to RunDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
      }
      const directive = node.directive as IDirectiveData;
      const { 
          subtype, 
          command: commandInput, 
          language, 
          parameters: languageParams, 
          outputVariable = 'stdout', 
          errorVariable = 'stderr' 
      } = directive;

      let commandToExecute: string;
      let commandArgs: string[] = [];
      const execOptions = { cwd: context.executionContext?.cwd || this.fileSystemService.getCwd() };

      // --- Resolution Block --- 
      try {
          if (subtype === 'runCommand') {
            if (!isInterpolatableValueArray(commandInput)) throw new DirectiveError('Invalid command input for runCommand', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
            process.stdout.write(`DEBUG: [RunHandler runCommand] BEFORE resolveNodes. Input: ${JSON.stringify(commandInput)}, StateID: ${resolutionContext?.state?.getStateId() ?? 'N/A'}, Strict: ${resolutionContext?.strict}\n`);
            commandToExecute = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
            process.stdout.write(`DEBUG: [RunHandler runCommand] AFTER resolveNodes. Result: '${commandToExecute}'\n`);
          } else if (subtype === 'runDefined') {
             const definedCommand = commandInput as { name: string; args?: InterpolatableValue };
             if (typeof definedCommand !== 'object' || !definedCommand.name) throw new DirectiveError('Invalid command input structure for runDefined', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
             const cmdVar = state.getVariable(definedCommand.name, VariableType.COMMAND);
             if (!cmdVar?.value || !isBasicCommand(cmdVar.value)) {
                 const errorMsg = cmdVar ? `Cannot run non-basic command '${definedCommand.name}'` : `Command definition '${definedCommand.name}' not found`;
                 throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.VARIABLE_NOT_FOUND, baseErrorDetails);
             }
             commandToExecute = cmdVar.value.commandTemplate;
             if (definedCommand.args) {
                 const resolvedArgsPromises = definedCommand.args.map(arg => this.resolutionService.resolveInContext(arg, resolutionContext));
                 commandArgs = await Promise.all(resolvedArgsPromises);
                 // Apply args to commandTemplate here if needed
             }
          } else if (subtype === 'runCode' || subtype === 'runCodeParams') {
            if (!isInterpolatableValueArray(commandInput)) throw new DirectiveError('Invalid command input for runCode/runCodeParams', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
            process.stdout.write(`DEBUG: [RunHandler runCode] BEFORE resolveNodes. Input: ${JSON.stringify(commandInput)}, StateID: ${resolutionContext?.state?.getStateId() ?? 'N/A'}, Strict: ${resolutionContext?.strict}\n`);
            const scriptContent = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
            process.stdout.write(`DEBUG: [RunHandler runCode] AFTER resolveNodes. Result: '${scriptContent}'\n`);
              if (language) {
              // <<< Assign to outer tempFilePath >>>
              tempFilePath = await this.createTempScriptFile(scriptContent, language);
              commandToExecute = `${language} ${this.escapePath(tempFilePath)}`;
              } else {
              commandToExecute = scriptContent;
            }
            if (subtype === 'runCodeParams' && languageParams) {
              // Inner try for parameter resolution
              try { 
                  const resolvedParamsPromises = languageParams.map(param => this.resolutionService.resolveInContext(param, resolutionContext));
                  commandArgs = (await Promise.all(resolvedParamsPromises)).map(p => this.escapeArgument(p));
              } catch (paramError) {
                   const errorMsg = `Failed to resolve parameter variable${paramError instanceof Error ? ': ' + paramError.message : ''}`;
                   logger.error(errorMsg, { error: paramError });
                   const cause = paramError instanceof Error ? paramError : undefined;
                   // Ensure RESOLUTION_FAILED is thrown here
                   throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...baseErrorDetails, cause }); 
              }
            }
            // Combine command and args for script execution if needed
             if (commandArgs.length > 0 && (subtype === 'runCodeParams')) {
                  commandToExecute += ` ${commandArgs.join(' ')}`;
             }
          } else {
            throw new DirectiveError(`Unsupported run subtype '${subtype}'`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
          }
          // Combine args for non-script types
          if (commandArgs.length > 0 && !(subtype === 'runCodeParams')) {
              commandToExecute += ` ${commandArgs.join(' ')}`;
          }
      } catch (resolutionError) {
          // Catch errors from resolveNodes/resolveInContext during command/script resolution
          if (resolutionError instanceof DirectiveError) throw resolutionError; 
          const errorMsg = `Failed to resolve command string or parameters`;
          logger.error(errorMsg, { error: resolutionError });
          const cause = resolutionError instanceof Error ? resolutionError : undefined;
          // Throw RESOLUTION_FAILED
          throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...baseErrorDetails, cause }); 
      }
      // --- End Resolution Block ---

      // --- Execution Block --- 
      let stdout: string, stderr: string;
      try {
          process.stdout.write(`DEBUG: [RunHandler] Attempting to execute: '${commandToExecute}' (Subtype: ${subtype}, Lang: ${language ?? 'N/A'}, CWD: ${execOptions.cwd})\n`);
          
          // Check if command is empty AFTER resolution
          if (!commandToExecute || commandToExecute.trim() === '') {
            // Use a more specific error code if desired, or keep VALIDATION_FAILED
            throw new DirectiveError('Run directive command resolved to an empty string', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
          }

          const result = await this.fileSystemService.executeCommand(commandToExecute, execOptions);
          stdout = result.stdout;
          stderr = result.stderr;
      } catch (executionError) {
           const cause = executionError instanceof Error ? executionError : new Error(String(executionError));
           const details = { ...baseErrorDetails, cause };
           logger.error(`Failed to execute command: ${cause.message}`, { command: commandToExecute, details });
          throw new DirectiveError(
               `Failed to execute command: ${cause.message}`,
              this.kind,
               DirectiveErrorCode.EXECUTION_FAILED, // Correctly throws EXECUTION_FAILED
               details
           );
      }
      // --- End Execution Block ---

      // <<< REMOVE Logging for stdout/stderr >>>
      // process.stdout.write(`>>> RunDirectiveHandler: Raw stdout: [${stdout}]\n`);
      // process.stdout.write(`>>> RunDirectiveHandler: Raw stderr: [${stderr}]\n`);
      // <<< END Logging >>>

      // Store results using correct variable names extracted from the directive data
      const directiveSourceLocation: SourceLocation | undefined = node.location ? {
         filePath: currentFilePath ?? 'unknown',
         line: node.location.start.line,
         column: node.location.start.column
      } : undefined;
      const outputMetadata: VariableMetadata = { definedAt: directiveSourceLocation, origin: VariableOrigin.COMMAND_OUTPUT, createdAt: Date.now(), modifiedAt: Date.now() };
      const errorMetadata: VariableMetadata = { definedAt: directiveSourceLocation, origin: VariableOrigin.COMMAND_ERROR, createdAt: Date.now(), modifiedAt: Date.now() };
      
      const stateChanges: StateChanges = { variables: {} };
      stateChanges.variables[outputVariable] = {
          type: VariableType.TEXT,
          value: stdout || '',
          metadata: outputMetadata
      };
      stateChanges.variables[errorVariable] = {
          type: VariableType.TEXT,
          value: stderr || '',
          metadata: errorMetadata
      };

      // Handle transformation mode
      let replacementNode: TextNode | undefined = undefined;
      if (state.isTransformationEnabled(this.kind)) {
        replacementNode = {
            type: 'Text',
            // Combine stdout and stderr, separated by newline, filtering empty strings
            content: [stdout, stderr].filter(s => s).join('\n'), 
            location: node.location,
            nodeId: crypto.randomUUID() // Ensure nodeId is added
        };
        // <<< REMOVE Logging for replacement node >>>
        // try {
        //    process.stdout.write(`>>> RunDirectiveHandler: Created replacementNode: ${JSON.stringify(replacementNode)}\n`);
        // } catch (e) {
        //    process.stdout.write(`>>> RunDirectiveHandler: Error stringifying replacementNode: ${e}\n`);
        //    process.stdout.write(`>>> RunDirectiveHandler: Replacement node content: ${replacementNode.content}\n`);
        // }
        // <<< END Logging >>>
      }

      // Return NEW DirectiveResult shape
      return { 
         stateChanges: stateChanges, 
         replacement: replacementNode ? [replacementNode] : undefined // Ensure replacement is array or undefined
      };
    } catch (error) {
      // Handle any remaining errors (like validation errors caught earlier)
      if (error instanceof DirectiveError) {
         if (error.directiveKind !== this.kind) {
            const originalCause = error.details?.cause instanceof Error ? error.details.cause : undefined;
            // Construct details by taking base (node) and merging original error details, then adding cause
            const newDetails = {
              ...baseErrorDetails, // node
              ...(error.details || {}), // Spread original details (might include context, location, etc.)
              cause: originalCause
            };
            throw new DirectiveError(error.message, this.kind, error.code, newDetails);
         } else {
            throw error;
         }
      }
      // Fallback for unexpected errors
      // Ensure cleanup happens even if unexpected errors occur before the main try block completes
      if (tempFilePath) { // Check again in case error happened before finally
        try {
          await this.fileSystemService.deleteFile(tempFilePath);
          logger.debug('Deleted temporary script file during error handling', { path: tempFilePath });
        } catch (cleanupError) {
          logger.warn('Failed to delete temporary script file during error handling', { path: tempFilePath, error: cleanupError });
        }
      }
      const cause = error instanceof Error ? error : new Error(String(error));
      const details = { ...baseErrorDetails, cause };
      logger.error(`Unexpected error executing run directive: ${cause.message}`, { details });
      throw new DirectiveError(
        `Unexpected error executing run directive: ${cause.message}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        details
      );
    } finally {
      // <<< ADD TEMP FILE CLEANUP HERE >>>
      if (tempFilePath) {
        try {
          // Use await because deleteFile is likely async
          await this.fileSystemService.deleteFile(tempFilePath);
          logger.debug('Deleted temporary script file in finally block', { path: tempFilePath });
        } catch (cleanupError) {
          logger.warn('Failed to delete temporary script file in finally block', { path: tempFilePath, error: cleanupError });
        }
      }
    }
  }
  
  private animationInterval: NodeJS.Timeout | null = null;
  private isTestEnvironment: boolean = process.env.NODE_ENV === 'test' || process.env.VITEST;
  private showRunningCommandFeedback(command: string): void {
    if (this.isTestEnvironment) { return; }
    this.clearCommandFeedback();
    let count = 0;
    const updateAnimation = () => {
      const ellipses = '.'.repeat(count % 4);
      process.stdout.write(`\r\x1b[K`); 
      process.stdout.write(`Running \`${command}\`${ellipses}`);
      count++;
    };
    updateAnimation();
    this.animationInterval = setInterval(updateAnimation, 500);
  }
  private clearCommandFeedback(): void {
    if (this.isTestEnvironment) { return; }
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
      process.stdout.write(`\r\x1b[K`);
    }
  }

  private getTempFilePath(language: string): string {
    const uniqueSuffix = randomBytes(8).toString('hex');
    const extension = language === 'python' ? 'py' : language === 'javascript' ? 'js' : 'tmp';
    return path.join(os.tmpdir(), `meld-script-${uniqueSuffix}.${extension}`);
  }

  private escapePath(filePath: string): string {
    // Simple escaping for common shells - might need refinement
    return filePath.replace(/ /g, '\\ ').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  }

  private escapeArgument(arg: string): string {
    // Simple escaping for command line arguments
    // This is highly dependent on the shell and context, use libraries for robust escaping if needed
    return `"${arg.replace(/"/g, '\\"').replace(/\$/g, '\$').replace(/`/g, '\`')}"`;
  }
}
