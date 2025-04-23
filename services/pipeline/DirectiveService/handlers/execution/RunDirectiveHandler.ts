import type { 
  DirectiveNode, 
  MeldNode, 
  TextNode, 
  VariableReferenceNode,
  IDirectiveData,
  DirectiveData
} from '@core/syntax/types';
import type { InterpolatableValue } from '@core/syntax/types/nodes';
import { NodeType } from '@core/syntax/types/nodes';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService';
import type { IStateService } from '@services/state/StateService/IStateService';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError';
import { directiveLogger as logger } from '@core/utils/logger';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService';
import { ErrorSeverity, MeldError, MeldResolutionError, FieldAccessError } from '@core/errors';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory';
import { PathValidationError } from '@core/errors';
import { isInterpolatableValueArray } from '@core/syntax/types/guards';
import * as os from 'os';
import * as fs from 'fs-extra';
import * as path from 'path';
import { randomBytes } from 'crypto';
import type { DirectiveProcessingContext, ResolutionContext } from '@core/types';
import type { ICommandDefinition, IBasicCommandDefinition } from '@core/types/define';
import { isBasicCommand } from '@core/types/define';
import type { SourceLocation } from '@core/types/common';
import { 
  type VariableMetadata, 
  VariableOrigin, 
  VariableType,
  type VariableDefinition,
  createTextVariable,
  type CommandVariable,
  type TextVariable
} from '@core/types/variables';
import type { DirectiveResult } from '@core/directives/DirectiveHandler';
import type { JsonValue } from '@core/types/common';

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

  private async createTempScriptFile(content: string, language: string): Promise<string> {
    const filePath = this.getTempFilePath(language);
    try {
      await this.fileSystemService.writeFile(filePath as any, content);
      logger.debug('Created temporary script file', { path: filePath, language });
      return filePath;
    } catch (error) {
      logger.error('Failed to create temporary script file', { path: filePath, error });
      throw new DirectiveError(
        `Failed to create temporary script file: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
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
      node,
      context
    }; 
    
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
            if (!isInterpolatableValueArray(commandInput)) {
              throw new DirectiveError('Invalid command input for runCommand', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
            }
            commandToExecute = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
          } else if (subtype === 'runDefined') {
             const definedCommand = commandInput as { name: string; args?: InterpolatableValue };
             if (typeof definedCommand !== 'object' || !definedCommand.name) {
               throw new DirectiveError('Invalid command input structure for runDefined', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
             }
             const cmdVar = state.getVariable(definedCommand.name, VariableType.COMMAND) as CommandVariable | undefined;
             if (!cmdVar?.value || !isBasicCommand(cmdVar.value)) {
                 const errorMsg = cmdVar ? `Cannot run non-basic command '${definedCommand.name}'` : `Command definition '${definedCommand.name}' not found`;
                 throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.VARIABLE_NOT_FOUND, baseErrorDetails);
             }
             commandToExecute = cmdVar.value.commandTemplate;
             if (definedCommand.args) {
                 const resolvedArgsPromises = definedCommand.args.map(node => this.resolutionService.resolveInContext([node], resolutionContext));
                 commandArgs = await Promise.all(resolvedArgsPromises);
             }
          } else if (subtype === 'runCode' || subtype === 'runCodeParams') {
            if (!isInterpolatableValueArray(commandInput)) {
              throw new DirectiveError('Invalid command input for runCode/runCodeParams', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
            }
            const scriptContent = await this.resolutionService.resolveNodes(commandInput, resolutionContext);
            if (language) {
              tempFilePath = await this.createTempScriptFile(scriptContent, language);
              commandToExecute = `${language} ${this.escapePath(tempFilePath)}`;
            } else {
              commandToExecute = scriptContent;
            }
            if (subtype === 'runCodeParams' && languageParams) {
              try { 
                  const resolvedParamsPromises = languageParams.map((param: InterpolatableValue) => this.resolutionService.resolveInContext(param, resolutionContext));
                  const resolvedParams = await Promise.all(resolvedParamsPromises);
                  commandArgs = resolvedParams.map(p => this.escapeArgument(p, language));
              } catch (paramError) {
                   const cause = paramError instanceof Error ? paramError : undefined;
                   throw new DirectiveError(
                     `Failed to resolve parameter variable${paramError instanceof Error ? ': ' + paramError.message : ''}`,
                     this.kind,
                     DirectiveErrorCode.RESOLUTION_FAILED,
                     { ...baseErrorDetails, cause }
                   );
              }
            }
            if (commandArgs.length > 0 && (subtype === 'runCodeParams')) {
              commandToExecute = `${commandToExecute} ${commandArgs.join(' ')}`;
            }
          } else {
            throw new DirectiveError(`Unsupported run subtype '${subtype}'`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
          }
          
          if (commandArgs.length > 0 && !(subtype === 'runCodeParams')) {
            commandToExecute += ` ${commandArgs.join(' ')}`;
          }
      } catch (resolutionError) {
          if (resolutionError instanceof DirectiveError) throw resolutionError;
          const cause = resolutionError instanceof Error ? resolutionError : undefined;
          throw new DirectiveError(
            `Failed to resolve command string or parameters`,
            this.kind,
            DirectiveErrorCode.RESOLUTION_FAILED,
            { ...baseErrorDetails, cause }
          );
      }

      // --- Execution Block --- 
      let stdout: string, stderr: string;
      try {
          if (!commandToExecute || commandToExecute.trim() === '') {
            throw new DirectiveError('Run directive command resolved to an empty string', this.kind, DirectiveErrorCode.VALIDATION_FAILED, baseErrorDetails);
          }

          const result = await this.fileSystemService.executeCommand(commandToExecute, execOptions);
          stdout = result.stdout;
          stderr = result.stderr;
      } catch (executionError) {
           const cause = executionError instanceof Error ? executionError : new Error(String(executionError));
           throw new DirectiveError(
             `Failed to execute command: ${cause.message}`,
             this.kind,
             DirectiveErrorCode.EXECUTION_FAILED,
             { ...baseErrorDetails, cause }
           );
      }

      // Create variable definitions for stdout and stderr
      const sourceLocation: SourceLocation | undefined = node.location ? {
        filePath: currentFilePath ?? 'unknown',
        line: node.location.start.line,
        column: node.location.start.column
      } : undefined;

      const variables: Record<string, VariableDefinition> = {};

      // Add stdout variable if we have output
      if (stdout !== undefined) {
        const metadata: VariableMetadata = {
          origin: VariableOrigin.DIRECT_DEFINITION,
          definedAt: sourceLocation,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          context: {
            command: commandToExecute,
            subtype,
            language
          }
        };

        variables[outputVariable] = createTextVariable(outputVariable, stdout, metadata);
      }

      // Add stderr variable if we have error output
      if (stderr !== undefined) {
        const metadata: VariableMetadata = {
          origin: VariableOrigin.DIRECT_DEFINITION,
          definedAt: sourceLocation,
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          context: {
            command: commandToExecute,
            subtype,
            language
          }
        };

        variables[errorVariable] = createTextVariable(errorVariable, stderr, metadata);
      }

      // Handle transformation mode
      const replacement: MeldNode[] = [];
      if (context.formattingContext?.isOutputLiteral || state.isTransformationEnabled()) {
        const content = stderr ? (stdout ? `${stdout}\n${stderr}` : stderr) : stdout;
        if (content !== undefined) {
          replacement.push({
            type: 'Text',
            content: content,
            nodeId: randomBytes(16).toString('hex')
          } as TextNode);
        }
      }

      return {
        stateChanges: { variables },
        replacement
      };

    } catch (error) {
      let errorToThrow: DirectiveError;

      if (error instanceof DirectiveError) {
        errorToThrow = error;
      } else if (error instanceof Error) {
        let code = DirectiveErrorCode.EXECUTION_FAILED;
        if (error instanceof MeldResolutionError) {
          code = DirectiveErrorCode.RESOLUTION_FAILED;
        }

        errorToThrow = new DirectiveError(
          `Run directive error: ${error.message}`,
          this.kind,
          code,
          { ...baseErrorDetails, cause: error }
        );
      } else {
        errorToThrow = new DirectiveError(
          `Run directive error: ${String(error)}`,
          this.kind,
          DirectiveErrorCode.EXECUTION_FAILED,
          { ...baseErrorDetails, cause: new Error(String(error)) }
        );
      }

      throw errorToThrow;
    } finally {
      // Clean up temp file if one was created
      if (tempFilePath) {
        try {
          await this.fileSystemService.deleteFile(tempFilePath);
        } catch (error) {
          logger.warn('Failed to clean up temporary script file', { path: tempFilePath, error });
        }
      }
    }
  }

  private getTempFilePath(language: string): string {
    const ext = language === 'python' ? '.py' : 
                language === 'node' ? '.js' :
                language === 'bash' ? '.sh' : '.tmp';
    return path.join(os.tmpdir(), `meld-script-${randomBytes(8).toString('hex')}${ext}`);
  }

  private escapePath(filePath: string): string {
    return filePath.includes(' ') ? `"${filePath}"` : filePath;
  }

  private escapeArgument(arg: JsonValue, language?: string): string {
    const str = String(arg);
    // Always quote Python script parameters to ensure proper argument passing
    if (language === 'python' || str.includes(' ') || str.includes('"')) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  }
}
