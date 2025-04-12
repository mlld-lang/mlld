import type { DirectiveNode, DirectiveContext, MeldNode, TextNode, StructuredPath, VariableReferenceNode, InterpolatableValue } from '@core/syntax/types.js';
import type { IValidationService } from '@services/resolution/ValidationService/IValidationService.js';
import type { IStateService } from '@services/state/StateService/IStateService.js';
import type { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { DirectiveError, DirectiveErrorCode, DirectiveErrorSeverity } from '@services/pipeline/DirectiveService/errors/DirectiveError.js';
import { directiveLogger } from '@core/utils/logger.js';
import type { DirectiveResult } from '@services/pipeline/DirectiveService/types.js';
import type { IDirectiveHandler } from '@services/pipeline/DirectiveService/IDirectiveService.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import { inject, injectable } from 'tsyringe';
import { Service } from '@core/ServiceProvider.js';
import type { RunDirectiveNode } from '@core/syntax/types.js';
import { ResolutionContextFactory } from '@services/resolution/ResolutionService/ResolutionContextFactory.js';
import { FieldAccessError, PathValidationError, MeldResolutionError, MeldError } from '@core/errors';
import { isInterpolatableValueArray } from '@core/syntax/types/guards.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';

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
    @inject('IStateService') private stateService: IStateService,
    @inject('IFileSystemService') private fileSystemService: IFileSystemService
  ) {}

  // Helper function to generate a temporary file path
  private getTempFilePath(language?: string): string {
    const tempDir = tmpdir();
    const randomName = randomBytes(8).toString('hex');
    const extension = language ? `.${language}` : '.sh'; // Default to .sh if no language
    return join(tempDir, `meld-script-${randomName}${extension}`);
  }

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    const runDirectiveNode = node as RunDirectiveNode;
    const { directive } = runDirectiveNode;
    const { state, currentFilePath, workingDirectory } = context;
    const clonedState = state.clone();

    const resolutionContext = ResolutionContextFactory.forRunDirective(state, currentFilePath);

    // Variables to hold the execution result
    let finalStdout: string = '';
    let finalStderr: string = '';
    let commandDescriptionForFeedback: string = ''; // For the 'Running...' message

    try {
      // Validate the directive
      await this.validationService.validate(runDirectiveNode);
      
      directiveLogger.debug('Processing run directive', { subtype: directive.subtype, command: directive.command });

      // --- Handle different subtypes based on AST structure --- 
      if (directive.subtype === 'runCommand' && directive.command && isInterpolatableValueArray(directive.command)) {
          // Resolve the InterpolatableValue array for the command
          const resolvedCommand = await this.resolutionService.resolveNodes(directive.command, resolutionContext);
          directiveLogger.debug('Resolved runCommand', { resolvedCommand });
          commandDescriptionForFeedback = resolvedCommand;
          // Execute the simple command
          const { stdout, stderr } = await this.fileSystemService.executeCommand(
            resolvedCommand,
            {
              cwd: context.workingDirectory || this.fileSystemService.getCwd()
            }
          );
          finalStdout = stdout;
          finalStderr = stderr;

      } else if ((directive.subtype === 'runCode' || directive.subtype === 'runCodeParams') && directive.command && isInterpolatableValueArray(directive.command)) {
          // --- Refactored runCode / runCodeParams handling ---
          directiveLogger.debug(`Handling ${directive.subtype}`, { language: directive.language, parameters: directive.parameters });

          // 1. Resolve script content
          const scriptContent = await this.resolutionService.resolveNodes(directive.command, resolutionContext);
          directiveLogger.debug('Resolved script content', { length: scriptContent.length });

          // 2. Resolve parameters (for runCodeParams)
          const resolvedParams: string[] = [];
          if (directive.subtype === 'runCodeParams' && directive.parameters) {
              for (const param of directive.parameters) {
                  if (typeof param === 'string') {
                      resolvedParams.push(param); // Literal string parameter
                  } else if (param.type === 'VariableReference') {
                      try {
                          const resolvedParam = await this.resolutionService.resolve(param as VariableReferenceNode, resolutionContext);
                          resolvedParams.push(resolvedParam);
                      } catch (error) {
                          const errorMsg = `Failed to resolve parameter variable '${param.identifier}' for runCodeParams`;
                          directiveLogger.error(errorMsg, { error });
                          if (context.strict) {
                              throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node, context, cause: error instanceof Error ? error : undefined });
                          }
                          resolvedParams.push(''); // Use empty string in non-strict mode
                      }
                  } else {
                      // Should not happen based on grammar, but handle defensively
                      resolvedParams.push(String(param));
                  }
              }
              directiveLogger.debug('Resolved parameters', { resolvedParams });
          }

          // 3. Execute based on language
          const language = directive.language;
          let commandToRun: string;
          let tempFilePath: string | undefined = undefined;

          try {
              if (language) {
                  // Language specified: Use temporary file
                  tempFilePath = this.getTempFilePath(language);
                  directiveLogger.debug('Using temporary script file', { path: tempFilePath, language });
                  await this.fileSystemService.writeFile(tempFilePath, scriptContent);
                  
                  // Construct command: language temp_file_path param1 param2 ...
                  // Ensure params are quoted/escaped appropriately for the shell if needed - basic quoting here
                  const paramsString = resolvedParams.map(p => `"${p.replace(/"/g, '\\"')}"`).join(' '); 
                  commandToRun = `${language} ${tempFilePath} ${paramsString}`.trim();
                  commandDescriptionForFeedback = `${language} script`; // Generic feedback

              } else {
                  // No language: Treat script content as command(s)
                  commandToRun = scriptContent;
                  commandDescriptionForFeedback = 'inline script';
              }

              directiveLogger.debug('Executing script/command', { commandToRun });
              const { stdout, stderr } = await this.fileSystemService.executeCommand(
                  commandToRun,
                  {
                      cwd: context.workingDirectory || this.fileSystemService.getCwd()
                  }
              );
              finalStdout = stdout;
              finalStderr = stderr;
          } finally {
              // 4. Clean up temporary file if created
              if (tempFilePath) {
                  try {
                      await this.fileSystemService.deleteFile(tempFilePath);
                      directiveLogger.debug('Cleaned up temporary script file', { path: tempFilePath });
                  } catch (cleanupError) {
                      directiveLogger.warn('Failed to clean up temporary script file', { path: tempFilePath, error: cleanupError });
                  }
              }
          }
          // --- End of Refactored runCode / runCodeParams --- 
          
      } else if (directive.subtype === 'runDefined' && directive.command && typeof directive.command === 'object') {
          // Refactored runDefined handling
          const commandRef = directive.command;
          const commandName = commandRef.name;
          const commandArgs = commandRef.args || []; // Array of { type: 'string' | 'variable' | 'raw', value: ... }
          
          directiveLogger.debug(`Resolving defined command: ${commandName}`, { args: commandArgs });

          // Get the command definition from the *original* state
          const commandDefVar = state.getCommandVar(commandName); // <<< Use original state
          if (!commandDefVar) {
              throw new DirectiveError(`Command definition '${commandName}' not found`, this.kind, DirectiveErrorCode.VARIABLE_NOT_FOUND, { node, context });
          }
          const commandDef = commandDefVar.value; // This is ICommandDefinition
          
          // Resolve arguments
          const resolvedArgs: string[] = [];
          for (const arg of commandArgs) {
              if (arg.type === 'variable') {
                  const varNode = arg.value as VariableReferenceNode;
                  try {
                     // IMPORTANT: Use the *original* state for resolving args passed into the command
                     const argResolutionContext = ResolutionContextFactory.forRunDirective(state, currentFilePath);
                     const resolvedArg = await this.resolutionService.resolve(varNode, argResolutionContext);
                     resolvedArgs.push(resolvedArg);
                  } catch (error) {
                      const errorMsg = `Failed to resolve argument variable '${varNode.identifier}' for command '${commandName}'`;
                      directiveLogger.error(errorMsg, { error }); // Use directiveLogger
                      // Decide whether to throw or use empty string based on context?
                      // For now, let's throw if strict
                      if (context.strict) {
                          throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node, context, cause: error instanceof Error ? error : undefined });
                      }
                      resolvedArgs.push(''); // Use empty string in non-strict
                  }
              } else {
                  // String or Raw type - use value directly (already string)
                  resolvedArgs.push(String(arg.value)); 
              }
          }
          directiveLogger.debug(`Resolved arguments for ${commandName}:`, { resolvedArgs });

          // Get the command template (might be string or InterpolatableValue)
          const commandTemplate = commandDef.commandTemplate;
          if (commandTemplate === undefined || commandTemplate === null) {
               throw new DirectiveError(`Command definition '${commandName}' is missing command template`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node, context });
          }
        
          // Substitute positional arguments ($1, $2, ...)
          let processedTemplate: string | InterpolatableValue;
          if (typeof commandTemplate === 'string') {
              processedTemplate = commandTemplate.replace(/\$(\d+)/g, (match, indexStr) => {
                  const index = parseInt(indexStr, 10) - 1;
                  return index >= 0 && index < resolvedArgs.length ? resolvedArgs[index] : match;
              });
              // Also replace $@ with all args quoted (simple version)
              processedTemplate = processedTemplate.replace('$@', resolvedArgs.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')); // Better quoting
              directiveLogger.debug(`Substituted args into string template for ${commandName}: ${processedTemplate}`);
          } else if (isInterpolatableValueArray(commandTemplate)) {
              // Substitute within the InterpolatableValue array
              processedTemplate = commandTemplate.flatMap(tNode => {
                  if (tNode.type === 'Text') {
                      let content = tNode.content;
                      content = content.replace(/\$(\d+)/g, (match, indexStr) => {
                          const index = parseInt(indexStr, 10) - 1;
                          return index >= 0 && index < resolvedArgs.length ? resolvedArgs[index] : match;
                      });
                      content = content.replace('$@', resolvedArgs.map(a => `"${a.replace(/"/g, '\\"')}"`).join(' ')); // Better quoting
                      return [{ ...tNode, content }]; // Return updated TextNode in array
                  } else {
                      // Keep VariableReferenceNodes as they are for now
                      // We resolve the whole template *after* substitution
                      return [tNode]; // Return node in array
                  }
              });
              directiveLogger.debug(`Substituted args into InterpolatableValue template for ${commandName}`);
          } else {
              throw new DirectiveError(`Command definition '${commandName}' has unexpected template type`, this.kind, DirectiveErrorCode.VALIDATION_FAILED, { node, context });
          }

          // Resolve the final command string (if template was InterpolatableValue)
          let finalCommandToExecute: string;
          if (isInterpolatableValueArray(processedTemplate)) {
              // Resolve using the *cloned* state's context, as the command runs within the directive's scope
              finalCommandToExecute = await this.resolutionService.resolveNodes(processedTemplate, resolutionContext);
          } else {
              finalCommandToExecute = processedTemplate; // Already a string
          }
          directiveLogger.debug(`Resolved final command for ${commandName}: ${finalCommandToExecute}`);
          commandDescriptionForFeedback = `defined command '${commandName}'`;
          
          // Execute the final command
          const { stdout, stderr } = await this.fileSystemService.executeCommand(
              finalCommandToExecute,
              {
                  cwd: context.workingDirectory || this.fileSystemService.getCwd()
              }
          );
          finalStdout = stdout;
          finalStderr = stderr;
          
      } else {
          // Fallback or error for unexpected structure
          throw new DirectiveError(
              `Invalid or unsupported @run directive structure/subtype: ${directive.subtype}`,
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              { node: runDirectiveNode, context }
          );
      }
      
      // --- Command has been executed, now process results --- 
      directiveLogger.debug(`Execution complete`, { stdoutLength: finalStdout?.length, stderrLength: finalStderr?.length });
      // Display feedback ONLY if execution was successful to this point
      this.showRunningCommandFeedback(commandDescriptionForFeedback || 'command');
      
      try {
        // Store the output in state variables
        if (node.directive.output) {
          clonedState.setTextVar(node.directive.output, finalStdout); // Use finalStdout
        } else {
          clonedState.setTextVar('stdout', finalStdout); // Use finalStdout
        }
        if (finalStderr) { // Use finalStderr
          clonedState.setTextVar('stderr', finalStderr); // Use finalStderr
        }

        // In transformation mode, return a replacement node with the command output
        if (clonedState.isTransformationEnabled()) {
          const content = finalStdout && finalStderr ? `${finalStdout}\n${finalStderr}` : finalStdout || finalStderr || ''; // Use finalStdout/finalStderr
          
          // Create replacement node with proper formatting metadata
          const formattingMetadata = {
            isFromDirective: true,
            originalNodeType: node.type,
            preserveFormatting: true,
            isOutputLiteral: true,
            transformationMode: true
          };
          
          // If we have formatting context from the original context, incorporate it
          if (context.formattingContext) {
            Object.assign(formattingMetadata, {
              contextType: context.formattingContext.contextType,
              nodeType: context.formattingContext.nodeType || node.type,
              parentContext: context.formattingContext
            });
          }
          
          const replacement: TextNode = {
            type: 'Text',
            content,
            location: node.location,
            formattingMetadata
          };
          
          clonedState.transformNode(node, replacement); // Apply transformation on clonedState
          return { state: clonedState, replacement };
        }

        // In normal mode, return a placeholder node
        // Still include formatting metadata for consistency
        const formattingMetadata = {
          isFromDirective: true,
          originalNodeType: node.type,
          preserveFormatting: false  // Not preserving in standard mode
        };
        
        // If we have formatting context, include it
        if (context.formattingContext) {
          Object.assign(formattingMetadata, {
            contextType: context.formattingContext.contextType,
            nodeType: context.formattingContext.nodeType || node.type
          });
        }
        
        const placeholder: TextNode = {
          type: 'Text',
          content: '[run directive output placeholder]',
          location: node.location,
          formattingMetadata
        };
        // Return the cloned state which already has stdout/stderr set
        return { state: clonedState, replacement: placeholder }; 
      } finally {
          // Ensure feedback is cleared regardless of success/error in processing results
          this.clearCommandFeedback();
      }
    } catch (error) {
      // Clear any animation if there's an error during any stage
      this.clearCommandFeedback();
      
      directiveLogger.error('Error executing run directive:', error);
      
      // If it's already a DirectiveError, just rethrow it
      if (error instanceof DirectiveError) {
        throw error;
      }

      // Otherwise wrap it with more context
      const message = error instanceof Error ? 
        `Failed to execute command: ${error.message}` :
        'Failed to execute command';

      // Default code and severity
      let errorCode = DirectiveErrorCode.EXECUTION_FAILED;
      let severity = DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED];
      
      // Check if it was a resolution-related error based on its type
      if (error instanceof MeldResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) {
        errorCode = DirectiveErrorCode.RESOLUTION_FAILED;
        severity = DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED];
      }

      throw new DirectiveError(
        message,
        this.kind,
        errorCode,
        { 
          node, 
          context,
          cause: error instanceof Error ? error : undefined,
          severity: severity
        }
      );
    }
  }
  
  // Reference to the interval for the animation
  private animationInterval: NodeJS.Timeout | null = null;
  
  // Determine if we're in a test environment
  private isTestEnvironment: boolean = process.env.NODE_ENV === 'test' || process.env.VITEST;
  
  /**
   * Display animated feedback that a command is running
   */
  private showRunningCommandFeedback(command: string): void {
    // Skip animation in test environments
    if (this.isTestEnvironment) {
      return;
    }
    
    // Clear any existing animation
    this.clearCommandFeedback();
    
    // Start position for the ellipses
    let count = 0;
    
    // Function to update the animation
    const updateAnimation = () => {
      // Create the ellipses string with the appropriate number of dots
      const ellipses = '.'.repeat(count % 4);
      
      // Clear the current line and print the message with animated ellipses
      process.stdout.write(`\r\x1b[K`); // Clear the line
      process.stdout.write(`Running \`${command}\`${ellipses}`);
      
      count++;
    };
    
    // Initial display
    updateAnimation();
    
    // Update the animation every 500ms
    this.animationInterval = setInterval(updateAnimation, 500);
  }
  
  /**
   * Clear the command feedback animation
   */
  private clearCommandFeedback(): void {
    // Skip in test environments
    if (this.isTestEnvironment) {
      return;
    }
    
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
      
      // Clear the line
      process.stdout.write(`\r\x1b[K`);
    }
  }
}