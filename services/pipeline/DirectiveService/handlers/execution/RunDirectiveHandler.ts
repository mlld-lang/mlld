import type { DirectiveNode, DirectiveContext, MeldNode, TextNode, StructuredPath, VariableReferenceNode, InterpolatableValue } from '@core/syntax/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger } from '@core/utils/logger.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { ErrorSeverity, MeldError } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { RunDirectiveData } from '@core/syntax/types.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { FieldAccessError, PathValidationError, MeldResolutionError } from '@core/errors';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import type { DirectiveProcessingContext, ResolutionContext } from '@core/types/index.js';

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
    @inject('IValidationService') private validationService: IValidationService,
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

  async execute(context: DirectiveProcessingContext): Promise<DirectiveResult> {
    const node = context.directiveNode as DirectiveNode;
    const state = context.state;
    const resolutionContext = context.resolutionContext;
    const executionContext = context.executionContext;
    const currentFilePath = state.getCurrentFilePath();
    const errorDetails = { 
      node: node, 
      context: { currentFilePath: currentFilePath ?? undefined } 
    };

    if (!node.directive || node.directive.kind !== 'run') {
        throw new DirectiveError('Invalid node type provided to RunDirectiveHandler', this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
    }
    const directive = node.directive as RunDirectiveData;

    let finalStdout: string = '';
    let finalStderr: string = '';
    let commandDescriptionForFeedback: string = '';

    try {
      directiveLogger.debug('Processing run directive', { subtype: directive.subtype, command: directive.command });

      if (directive.subtype === 'runCommand' && directive.command && isInterpolatableValueArray(directive.command)) {
          const resolvedCommand = await this.resolutionService.resolveNodes(directive.command, resolutionContext);
          directiveLogger.debug('Resolved runCommand', { resolvedCommand });
          commandDescriptionForFeedback = resolvedCommand;
          const { stdout, stderr } = await this.fileSystemService.executeCommand(
            resolvedCommand,
            { cwd: executionContext?.cwd || this.fileSystemService.getCwd() }
          );
          finalStdout = stdout;
          finalStderr = stderr;

      } else if ((directive.subtype === 'runCode' || directive.subtype === 'runCodeParams') && directive.command && isInterpolatableValueArray(directive.command)) {
          directiveLogger.debug(`Handling ${directive.subtype}`, { language: directive.language, parameters: directive.parameters });

          const scriptContent = await this.resolutionService.resolveNodes(directive.command, resolutionContext);
          directiveLogger.debug('Resolved script content', { length: scriptContent.length });

          const resolvedParams: string[] = [];
          if (directive.subtype === 'runCodeParams' && directive.parameters) {
              for (const param of directive.parameters) {
                  if (typeof param === 'string') {
                      resolvedParams.push(param);
                  } else if (param.type === 'VariableReference') {
                      try {
                          const resolvedParam = await this.resolutionService.resolveInContext(param as VariableReferenceNode, resolutionContext);
                          resolvedParams.push(resolvedParam);
                      } catch (error) {
                          const errorMsg = `Failed to resolve parameter variable '${param.identifier}' for runCodeParams`;
                          directiveLogger.error(errorMsg, { error });
                          if (resolutionContext.strict) {
                              throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...errorDetails, cause: error instanceof Error ? error : undefined });
                          }
                          resolvedParams.push('');
                      }
                  } else {
                      resolvedParams.push(String(param));
                  }
              }
              directiveLogger.debug('Resolved parameters', { resolvedParams });
          }

          const language = directive.language;
          let commandToRun: string;
          let tempFilePath: string | undefined = undefined;

          try {
              if (language) {
                  tempFilePath = this.getTempFilePath(language);
                  directiveLogger.debug('Using temporary script file', { path: tempFilePath, language });
                  await this.fileSystemService.writeFile(tempFilePath, scriptContent);
                  const paramsString = resolvedParams.map(p => `"${p.replace(/"/g, '\\"')}"`).join(' '); 
                  commandToRun = `${language} ${tempFilePath} ${paramsString}`.trim();
                  commandDescriptionForFeedback = `${language} script`;

              } else {
                  commandToRun = scriptContent;
                  commandDescriptionForFeedback = 'inline script';
              }

              directiveLogger.debug('Executing script/command', { commandToRun });
              const { stdout, stderr } = await this.fileSystemService.executeCommand(
                  commandToRun,
                  { cwd: executionContext?.cwd || this.fileSystemService.getCwd() }
              );
              finalStdout = stdout;
              finalStderr = stderr;
          } finally {
              if (tempFilePath) {
                  try {
                      await this.fileSystemService.deleteFile(tempFilePath);
                      directiveLogger.debug('Cleaned up temporary script file', { path: tempFilePath });
                  } catch (cleanupError) {
                      directiveLogger.warn('Failed to clean up temporary script file', { path: tempFilePath, error: cleanupError });
                  }
              }
          }
          
      } else if (directive.subtype === 'runDefined' && directive.command && typeof directive.command === 'object') {
          const commandRef = directive.command as { name: string, args?: any[] };
          const commandName = commandRef.name;
          const commandArgs = commandRef.args || []; 
          
          directiveLogger.debug(`Resolving defined command: ${commandName}`, { args: commandArgs });

          const commandDefVar = state.getCommandVar(commandName);
          if (!commandDefVar) {
              throw new DirectiveError(`Command definition '${commandName}' not found`, this.kind, DirectiveErrorCode.VARIABLE_NOT_FOUND, errorDetails);
          }
          const commandDef = commandDefVar.value;
          
          const resolvedArgs: string[] = [];
          for (const arg of commandArgs) {
              if (arg.type === 'variable') {
                  const varNode = arg.value as VariableReferenceNode;
                  try {
                     const resolvedArg = await this.resolutionService.resolveInContext(varNode, resolutionContext);
                     resolvedArgs.push(resolvedArg);
                  } catch (error) {
                      const errorMsg = `Failed to resolve argument variable '${varNode.identifier}' for command '${commandName}'`;
                      directiveLogger.error(errorMsg, { error }); 
                      if (resolutionContext.strict) {
                          throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { ...errorDetails, cause: error instanceof Error ? error : undefined });
                      }
                      resolvedArgs.push('');
                  }
              } else {
                  resolvedArgs.push(String(arg.value)); 
              }
          }
          directiveLogger.debug(`Resolved arguments for ${commandName}:`, { resolvedArgs });

          const commandTemplate = commandDef.commandTemplate;
          if (commandTemplate === undefined || commandTemplate === null) {
               throw new DirectiveError(`Command definition '${commandName}' is missing command template`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
          }
        
          let processedTemplate: string | InterpolatableValue;
          if (typeof commandTemplate === 'string') {
              processedTemplate = commandTemplate.replace(/\$(\d+)/g, (match, indexStr) => {
                  const index = parseInt(indexStr, 10) - 1;
                  return index >= 0 && index < resolvedArgs.length ? resolvedArgs[index] : match;
              });
              processedTemplate = processedTemplate.replace('$@', resolvedArgs.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' '));
              directiveLogger.debug(`Substituted args into string template for ${commandName}: ${processedTemplate}`);
          } else if (isInterpolatableValueArray(commandTemplate)) {
              processedTemplate = commandTemplate.flatMap(tNode => {
                  if (tNode.type === 'Text') {
                      let content = tNode.content;
                      content = content.replace(/\$(\d+)/g, (match, indexStr) => {
                          const index = parseInt(indexStr, 10) - 1;
                          return index >= 0 && index < resolvedArgs.length ? resolvedArgs[index] : match;
                      });
                      content = content.replace('$@', resolvedArgs.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' '));
                      return [{ ...tNode, content }];
                  } else {
                      return [tNode];
                  }
              });
              directiveLogger.debug(`Substituted args into InterpolatableValue template for ${commandName}`);
          } else {
              throw new DirectiveError(`Command definition '${commandName}' has unexpected template type`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, errorDetails);
          }

          let finalCommandToExecute: string;
          if (isInterpolatableValueArray(processedTemplate)) {
              finalCommandToExecute = await this.resolutionService.resolveNodes(processedTemplate, resolutionContext);
          } else {
              finalCommandToExecute = processedTemplate;
          }
          directiveLogger.debug(`Resolved final command for ${commandName}: ${finalCommandToExecute}`);
          commandDescriptionForFeedback = `defined command '${commandName}'`;
          
          const { stdout, stderr } = await this.fileSystemService.executeCommand(
              finalCommandToExecute,
              { cwd: executionContext?.cwd || this.fileSystemService.getCwd() }
          );
          finalStdout = stdout;
          finalStderr = stderr;
          
      } else {
          throw new DirectiveError(
              `Invalid or unsupported @run directive structure/subtype: ${directive.subtype}`,
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              errorDetails
          );
      }
      
      directiveLogger.debug(`Execution complete`, { stdoutLength: finalStdout?.length, stderrLength: finalStderr?.length });
      this.showRunningCommandFeedback(commandDescriptionForFeedback || 'command');
      
      try {
        if (directive.output) {
          state.setTextVar(directive.output, finalStdout);
        } else {
          state.setTextVar('stdout', finalStdout);
        }
        if (finalStderr) {
          state.setTextVar('stderr', finalStderr);
        }

        if (state.isTransformationEnabled()) {
          const content = finalStdout && finalStderr ? `${finalStdout}\n${finalStderr}` : finalStdout || finalStderr || '';
          const replacement: TextNode = {
            type: 'Text',
            content,
            location: node.location,
          };
          return { state: state, replacement };
        }

        const placeholder: TextNode = {
          type: 'Text',
          content: '[run directive output placeholder]',
          location: node.location,
        };
        return { state: state, replacement: placeholder }; 
      } finally {
          this.clearCommandFeedback();
      }
    } catch (error) {
      this.clearCommandFeedback();
      directiveLogger.error('Error executing run directive:', error);
      
      if (error instanceof DirectiveError) {
         if (!error.details?.context) {
            error.details = { ...(error.details || {}), ...errorDetails };
         }
         throw error;
      }

      const message = error instanceof Error ? 
        `Failed to execute command: ${error.message}` :
        'Failed to execute command';

      let errorCode = DirectiveErrorCode.EXECUTION_FAILED;
      if (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) {
        errorCode = DirectiveErrorCode.RESOLUTION_FAILED;
      }

      throw new DirectiveError(
        message,
        this.kind,
        errorCode,
        { 
          ...errorDetails,
          cause: error instanceof Error ? error : undefined,
        }
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
}
