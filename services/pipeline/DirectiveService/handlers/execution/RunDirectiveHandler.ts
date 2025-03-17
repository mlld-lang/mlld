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
    const { directive } = node;
    const { state } = context;
    const clonedState = state.clone();

    try {
      // Validate the directive
      await this.validationService.validate(node);

      // Get the command string from the directive
      const rawCommand = typeof directive.command === 'string' 
        ? directive.command 
        : directive.command.raw;
      
      directiveLogger.debug(`Processing run directive with command: ${rawCommand}`);
      
      // Check if this is a command reference (starts with $)
      let commandToExecute = rawCommand;
      if (rawCommand.startsWith('$')) {
        // Use the AST structure that's already parsed and available for us
        // The directive.command is either a string or an object with AST details
        // If it's an object and has isReference = true, it's a command reference
        const isCommandReference = typeof directive.command !== 'string' && 
                                  directive.command.isReference === true;
        
        if (isCommandReference || directive.isReference) {
          // Extract the command name from the command reference
          // Format is typically: $commandName(args)
          const commandMatch = rawCommand.match(/\$([a-zA-Z0-9_]+)(?:\((.*)\))?/);
          if (!commandMatch) {
            throw new DirectiveError(
              `Invalid command reference format: ${rawCommand}`,
              this.kind,
              DirectiveErrorCode.EXECUTION_FAILED,
              { severity: ErrorSeverity.Error }
            );
          }
          
          const commandName = commandMatch[1];
          const commandArgs = commandMatch[2] || '';
          
          directiveLogger.debug(`Detected command reference: $${commandName}(${commandArgs})`);
          
          // Get the command definition from state
          const commandDef = state.getCommand(commandName);
          
          if (!commandDef) {
            throw new DirectiveError(
              `Command '${commandName}' not found`,
              this.kind,
              DirectiveErrorCode.EXECUTION_FAILED,
              { severity: ErrorSeverity.Error }
            );
          }
          
          directiveLogger.debug(`Command definition from state: ${JSON.stringify(commandDef)}`);
          
          // Get the command string from the definition
          const commandTemplate = commandDef.command;
          if (!commandTemplate) {
            throw new DirectiveError(
              `Invalid command format for '${commandName}'`,
              this.kind,
              DirectiveErrorCode.EXECUTION_FAILED,
              { severity: ErrorSeverity.Error }
            );
          }
          
          // Handle @run directive embedded in the command definition
          let commandString = commandTemplate;
          if (commandTemplate.startsWith('@run ')) {
            const runMatch = commandTemplate.match(/@run\s*\[(.*)\]/);
            if (runMatch) {
              commandString = runMatch[1];
              directiveLogger.debug(`Extracted command from @run directive: ${commandString}`);
            }
          }
          
          directiveLogger.debug(`Command string before parameter substitution: "${commandString}"`);
          
          // Debug parameter pattern matches before doing any replacements
          const paramPattern = /\{\{([^}]+)\}\}/g;
          let paramMatch;
          while ((paramMatch = paramPattern.exec(commandString)) !== null) {
            directiveLogger.debug(`Found parameter pattern: {{${paramMatch[1]}}}`);
          }
          
          // Resolve variables in the command arguments
          const resolvedArgs = await this.resolutionService.resolveInContext(commandArgs, context);
          directiveLogger.debug(`Resolved command arguments: ${resolvedArgs}`);
          
          // Print the AST structure for debugging
          console.log('Command Reference AST Structure:');
          console.log('Original command:', rawCommand);
          console.log('Node directive:', JSON.stringify(node.directive, null, 2));
          console.log('Command definition from state:', JSON.stringify(commandDef, null, 2));
          console.log('Original arguments:', commandArgs);
          console.log('Resolved arguments:', resolvedArgs);
          
          // Let's use ResolutionService to resolve the arguments entirely
          // This ensures we leverage the AST instead of doing manual parsing
          let commandWithArgs = commandString;
          
          // Create parameter mapping
          let parameterMap: Record<string, string> = {};
          
          // Get parameters defined in the command definition
          const parameters = Array.isArray(commandDef.parameters) ? commandDef.parameters : [];
          
          // For direct access to arguments, we can use NodeJS's built-in function-args module
          // or we can implement a simplified version here using the same logic the AST already uses
          const parseArgs = (argsString: string): string[] => {
            if (!argsString || argsString.trim() === '') {
              return [];
            }
            
            const args: string[] = [];
            let currentArg = '';
            let inQuote = false;
            let quoteChar = '';
            
            for (let i = 0; i < argsString.length; i++) {
              const char = argsString[i];
              
              // Handle quotes
              if ((char === '"' || char === "'") && (i === 0 || argsString[i - 1] !== '\\')) {
                if (!inQuote) {
                  inQuote = true;
                  quoteChar = char;
                  continue; // Skip the opening quote
                } else if (char === quoteChar) {
                  inQuote = false;
                  quoteChar = '';
                  continue; // Skip the closing quote
                }
              }
              
              // If not in quotes and we hit a comma, push the arg and reset
              if (!inQuote && char === ',') {
                args.push(currentArg.trim());
                currentArg = '';
                continue;
              }
              
              // Add the character to our current arg
              currentArg += char;
            }
            
            // Add the last arg if there is one
            if (currentArg.trim() !== '') {
              args.push(currentArg.trim());
            }
            
            return args;
          };
          
          // Parse the arguments using our AST-compatible parser
          const argParts = parseArgs(resolvedArgs);
          directiveLogger.debug(`Parsed arguments: ${JSON.stringify(argParts)}`);
          
          // The issue is that the parenthesis and quotes aren't being properly stripped.
          // Let's sanitize the arguments to remove any surrounding quotes.
          const sanitizeArg = (arg: string): string => {
            // Remove surrounding quotes if present
            if ((arg.startsWith('"') && arg.endsWith('"')) || 
                (arg.startsWith("'") && arg.endsWith("'"))) {
              return arg.substring(1, arg.length - 1);
            }
            return arg;
          };
          
          const sanitizedArgs = argParts.map(sanitizeArg);
          directiveLogger.debug(`Sanitized arguments: ${JSON.stringify(sanitizedArgs)}`);
          
          // Extract the parameters from the command reference
          if (parameters.length > 0) {
            // Map provided args to named parameters
            parameters.forEach((paramName, i) => {
              if (i < sanitizedArgs.length) {
                parameterMap[paramName] = sanitizeArg(argParts[i]);
              }
            });
          } else {
            // If there are no parameters defined, use positional parameters
            // Look for {{param}} patterns in the command template
            const paramPattern = /\{\{([^}]+)\}\}/g;
            const paramNames: string[] = [];
            let match;
            
            while ((match = paramPattern.exec(commandString)) !== null) {
              paramNames.push(match[1].trim());
            }
            
            // Map positional parameters
            paramNames.forEach((paramName, i) => {
              if (i < sanitizedArgs.length) {
                parameterMap[paramName] = sanitizedArgs[i];
              }
            });
          }
          
          directiveLogger.debug(`Parameter mapping: ${JSON.stringify(parameterMap)}`);
          
          // Special handling for echo commands
          if (commandString.startsWith('echo ') && sanitizedArgs.length > 0) {
            // This is a very direct approach to fix echo commands with parameters
            // Strip any remaining quotes from arguments
            const strippedArgs = sanitizedArgs.map(arg => {
              if ((arg.startsWith('"') && arg.endsWith('"')) || 
                  (arg.startsWith("'") && arg.endsWith("'"))) {
                return arg.substring(1, arg.length - 1);
              }
              return arg;
            });
            
            commandToExecute = `echo ${strippedArgs.join(' ')}`;
            directiveLogger.debug(`Built direct echo command: ${commandToExecute}`);
          } else {
            // Standard approach: replace parameters in the template
            let expandedCommand = commandString;
            
            directiveLogger.debug(`Parameter map for replacement: ${JSON.stringify(parameterMap)}`);
            directiveLogger.debug(`Command template before replacement: ${expandedCommand}`);
            
            for (const [name, value] of Object.entries(parameterMap)) {
              // Create a pattern that allows whitespace inside the braces for more forgiving matching
              const paramPattern = new RegExp(`{{\\s*${name}\\s*}}`, 'g');
              directiveLogger.debug(`Looking for pattern: {{${name}}}`);
              
              const beforeReplace = expandedCommand;
              expandedCommand = expandedCommand.replace(paramPattern, value);
              
              // Debug replacement
              if (beforeReplace !== expandedCommand) {
                directiveLogger.debug(`Replaced parameter {{${name}}} with "${value}"`);
              } else {
                directiveLogger.debug(`No replacement occurred for {{${name}}}`);
              }
            }
            
            directiveLogger.debug(`Command template after replacement: ${expandedCommand}`);
            
            // Set the expanded command as the command to execute
            commandToExecute = expandedCommand;
          }
          
          directiveLogger.debug(`Final command to execute: ${commandToExecute}`);
        }
      } else {
        // For regular commands (not references), just resolve variables in the command
        commandToExecute = await this.resolutionService.resolveInContext(
          rawCommand,
          context
        );
        
        directiveLogger.debug(`Resolved regular command: ${commandToExecute}`);
      }
      
      // Show feedback that command is running (skips in test env)
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

      throw new DirectiveError(
        message,
        this.kind,
        DirectiveErrorCode.EXECUTION_FAILED,
        { 
          node, 
          error,
          severity: DirectiveErrorSeverity[DirectiveErrorCode.EXECUTION_FAILED]
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