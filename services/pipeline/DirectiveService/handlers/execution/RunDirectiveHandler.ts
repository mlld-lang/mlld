import type { DirectiveNode, DirectiveContext, MeldNode, TextNode, StructuredPath } from '@core/syntax/types.js';
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
import { FieldAccessError, PathValidationError, ResolutionError } from '@core/errors';

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

  async execute(node: DirectiveNode, context: DirectiveContext): Promise<DirectiveResult> {
    const runDirectiveNode = node as RunDirectiveNode;
    const { directive } = runDirectiveNode;
    const { state, currentFilePath, workingDirectory } = context;
    const clonedState = state.clone();

    const resolutionContext = ResolutionContextFactory.forRunDirective(state, currentFilePath);

    let commandToExecute: string;

    try {
      // Validate the directive
      await this.validationService.validate(runDirectiveNode);
      
      directiveLogger.debug('Processing run directive', { subtype: directive.subtype, command: directive.command });

      // --- Handle different subtypes based on AST structure --- 
      if (directive.subtype === 'runCommand' && directive.command && Array.isArray(directive.command)) {
          // Resolve the InterpolatableValue array for the command
          commandToExecute = await this.resolutionService.resolveNodes(directive.command, resolutionContext);
          directiveLogger.debug('Resolved runCommand', { resolvedCommand: commandToExecute });

      } else if ((directive.subtype === 'runCode' || directive.subtype === 'runCodeParams') && directive.command && Array.isArray(directive.command)) {
          // TODO: Refactor runCode / runCodeParams handling
          // Need to resolve directive.command (script content) using resolveNodes
          // Need to resolve parameters (which might contain VariableReferenceNodes)
          // Then create temp file and execute
          directiveLogger.warn('RunCode/RunCodeParams subtype not fully refactored yet.');
          // Temporary placeholder - attempt to resolve command as string
          commandToExecute = await this.resolutionService.resolveNodes(directive.command, resolutionContext);
          // NOTE: This doesn't handle parameters yet!
          
      } else if (directive.subtype === 'runDefined' && directive.command && typeof directive.command === 'object') {
          // Refactored runDefined handling
          const commandRef = directive.command;
          const commandName = commandRef.name;
          const commandArgs = commandRef.args || []; // Array of { type: 'string' | 'variable' | 'raw', value: ... }
          
          directiveLogger.debug(`Resolving defined command: ${commandName}`, { args: commandArgs });

          // Get the command definition from state
          const commandDefVar = clonedState.getCommandVar(commandName); // Use clonedState
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
                      logger.error(errorMsg, { error });
                      // Decide whether to throw or use empty string based on context?
                      // For now, let's throw if strict
                      if (context.strict) {
                          throw new DirectiveError(errorMsg, this.kind, DirectiveErrorCode.RESOLUTION_FAILED, { node, context, cause: error });
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
              processedTemplate = processedTemplate.replace('$@', resolvedArgs.map(a => `${a}`).join(' ')); // Basic quoting
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
                      content = content.replace('$@', resolvedArgs.map(a => `${a}`).join(' '));
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
          if (isInterpolatableValueArray(processedTemplate)) {
              // Resolve using the *cloned* state's context, as the command runs within the directive's scope
              commandToExecute = await this.resolutionService.resolveNodes(processedTemplate, resolutionContext);
          } else {
              commandToExecute = processedTemplate; // Already a string
          }
          directiveLogger.debug(`Resolved final command for ${commandName}: ${commandToExecute}`);
          
      } else {
          // Fallback or error for unexpected structure
          throw new DirectiveError(
              `Invalid or unsupported @run directive structure/subtype: ${directive.subtype}`,
              this.kind,
              DirectiveErrorCode.VALIDATION_FAILED,
              { node: runDirectiveNode, context }
          );
      }
      
      // --- Execute the command --- 
      directiveLogger.debug(`Executing command: ${commandToExecute}`);
      this.showRunningCommandFeedback(commandToExecute);
      
      try {
        // Execute the command
        const { stdout, stderr } = await this.fileSystemService.executeCommand(
          commandToExecute,
          {
            cwd: context.workingDirectory || this.fileSystemService.getCwd()
          }
        );
        
        // Clear the animated feedback after command completes
        this.clearCommandFeedback();

        // Store the output in state variables
        if (node.directive.output) {
          clonedState.setTextVar(node.directive.output, stdout);
        } else {
          clonedState.setTextVar('stdout', stdout);
        }
        if (stderr) {
          clonedState.setTextVar('stderr', stderr);
        }

        // In transformation mode, return a replacement node with the command output
        if (clonedState.isTransformationEnabled()) {
          const content = stdout && stderr ? `${stdout}\n${stderr}` : stdout || stderr || '';
          
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
          
          // Copy variables from cloned state to context state
          if (node.directive.output) {
            context.state.setTextVar(node.directive.output, stdout);
          } else {
            context.state.setTextVar('stdout', stdout);
          }
          if (stderr) {
            context.state.setTextVar('stderr', stderr);
          }
          
          clonedState.transformNode(node, replacement);
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
        return { state: clonedState, replacement: placeholder };
      } catch (error) {
        // Make sure to clear animation on command execution error
        this.clearCommandFeedback();
        throw error;
      }
    } catch (error) {
      // Clear any animation if there's an error
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

      // Attach code and severity based on specific error types if possible
      let errorCode = DirectiveErrorCode.EXECUTION_FAILED;
      let severity = DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED];
      if (error instanceof ResolutionError || error instanceof FieldAccessError || error instanceof PathValidationError) {
        errorCode = DirectiveErrorCode.RESOLUTION_FAILED;
        severity = DirectiveErrorSeverity[DirectiveErrorCode.RESOLUTION_FAILED];
      }

      throw new DirectiveError(
        message,
        this.kind,
        errorCode,
        { 
          node,
          context, // Pass full context
          cause: error instanceof Error ? error : undefined,
          severity: severity // Use determined severity
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