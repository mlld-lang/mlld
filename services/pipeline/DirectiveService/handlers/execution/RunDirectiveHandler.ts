import type { DirectiveNode, DirectiveContext, MeldNode, TextNode, StructuredPath, VariableReferenceNode, InterpolatableValue } from '@core/syntax/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger as logger } from '@core/utils/logger.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
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
import type { VariableMetadata, VariableOrigin } from '@core/types/variables.js';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';

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

  // Helper function to generate a temporary file path
  private getTempFilePath(language?: string): string {
    const tempDir = tmpdir();
    const randomName = randomBytes(8).toString('hex');
    const extension = language ? `.${language}` : '.sh'; // Default to .sh if no language
    return join(tempDir, `meld-script-${randomName}${extension}`);
  }

  async execute(context: DirectiveProcessingContext): Promise<IStateService | DirectiveResult> {
    const state: IStateService = context.state;
    const node = context.directiveNode as DirectiveNode;
    const resolutionContext = context.resolutionContext;
    const currentFilePath = state.getCurrentFilePath();
    const baseErrorDetails = { 
      node: node, 
      context: { currentFilePath: currentFilePath ?? undefined } 
    };

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
      let tempFilePath: string | undefined;
      const execOptions = { cwd: context.executionContext?.cwd || this.fileSystemService.getCwd() };

      // --- Resolution Block --- 
      try {
          if (subtype === 'runCommand') {
            if (!isInterpolatableValueArray(commandInput)) throw new DirectiveError('Invalid command input for runCommand', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
            commandToExecute = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
          } else if (subtype === 'runDefined') {
             const definedCommand = commandInput as { name: string; args?: InterpolatableValue };
             if (typeof definedCommand !== 'object' || !definedCommand.name) throw new DirectiveError('Invalid command input structure for runDefined', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
             const cmdVar = state.getCommandVar(definedCommand.name);
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
            const scriptContent = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
            if (language) {
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
          logger.debug(`Executing command: ${commandToExecute}`, { cwd: execOptions.cwd, args: commandArgs });
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

      // Cleanup temp file
      if (tempFilePath) {
        try {
          await this.fileSystemService.deleteFile(tempFilePath);
        } catch (cleanupError) {
          logger.warn('Failed to delete temporary script file', { path: tempFilePath, error: cleanupError });
        }
      }

      // Store results using correct variable names
      await state.setTextVar(outputVariable, stdout || '');
      await state.setTextVar(errorVariable, stderr || '');

      // Handle transformation mode
      if (state.isTransformationEnabled(this.kind)) {
        const replacementNode: TextNode = {
            type: 'Text',
            content: stdout || '',
            location: node.location
        };
        return { state, replacement: replacementNode };
      }

      return state;
    } catch (error) {
      // Handle any remaining errors (like validation errors caught earlier)
      if (error instanceof DirectiveError) {
         if (error.directiveKind !== this.kind) {
            const originalCause = error.details?.cause instanceof Error ? error.details.cause : undefined;
            const newDetails = { ...baseErrorDetails, ...(error.details || {}), cause: originalCause };
            throw new DirectiveError(error.message, this.kind, error.code, newDetails);
         } else {
            throw error;
         }
      }
      // Fallback for unexpected errors
      const cause = error instanceof Error ? error : new Error(String(error));
      const details = { ...baseErrorDetails, cause };
      logger.error(`Unexpected error executing run directive: ${cause.message}`, { details });
      throw new DirectiveError(
        `Unexpected error executing run directive: ${cause.message}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        details
      );
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
