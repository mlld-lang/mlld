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

      // Get the command from directive
      let rawCommand = '';
      let isAstCommandReference = false;
      
      if (typeof directive.command === 'string') {
        rawCommand = directive.command;
      } else if (directive.command && directive.command.raw) {
        rawCommand = directive.command.raw;
        // Flag to indicate this is an AST-format command reference
        isAstCommandReference = directive.command.name !== undefined;
      } else if (directive.command) {
        rawCommand = JSON.stringify(directive.command);
      }

      directiveLogger.debug(`Processing run directive with command: ${rawCommand}`);
      
      // Check if this is a command reference
      let commandToExecute = rawCommand;
      
      // Check for command reference by looking at the AST structure
      // With our improved grammar, command will be an object when it's a command reference
      if (isAstCommandReference && directive.command && typeof directive.command === 'object' && directive.command.name) {
        directiveLogger.debug(`Detected command reference from AST: $${directive.command.name}`);
        
        const commandName = directive.command.name;
        const commandArgs = directive.command.args || [];
        
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
        
        // Get parameters defined in the command definition
        const parameters = Array.isArray(commandDef.parameters) ? commandDef.parameters : [];
        
        // Process and resolve arguments from the AST
        const processedArgs: string[] = [];
        
        // Process each argument based on its type
        for (const arg of commandArgs) {
          if (arg.type === 'string') {
            // String literals are already properly represented
            processedArgs.push(arg.value);
          } else if (arg.type === 'variable') {
            // Variable references need to be resolved
            const varRef = arg.value;
            if (varRef && varRef.raw) {
              const resolved = await this.resolutionService.resolveInContext(
                varRef.raw,
                context
              );
              processedArgs.push(resolved);
            }
          } else if (arg.type === 'raw') {
            // Raw arguments just use the value directly
            processedArgs.push(arg.value);
          }
        }
        
        console.log('Processed arguments:', processedArgs);
        
        // Create the parameter map for substitution
        const parameterMap: Record<string, string> = {};
        
        // Log what we've got so far
        console.log('Command parameters from definition:', parameters);
        
        // Map provided args to parameters based on position
        if (parameters.length > 0) {
          parameters.forEach((paramName, i) => {
            if (i < processedArgs.length) {
              parameterMap[paramName] = processedArgs[i];
              console.log(`Setting parameter "${paramName}" to "${processedArgs[i]}"`);
            }
          });
        } else {
          // If no parameters are defined, try to extract them from the template
          const templateParamPattern = /\{\{([^}]+)\}\}/g;
          const paramNames: string[] = [];
          let match;
          
          console.log('Looking for parameter placeholders in template:', commandString);
          while ((match = templateParamPattern.exec(commandString)) !== null) {
            paramNames.push(match[1].trim());
            console.log(`Found parameter placeholder: {{${match[1].trim()}}}`);
          }
          
          // Map positional parameters
          paramNames.forEach((paramName, i) => {
            if (i < processedArgs.length) {
              parameterMap[paramName] = processedArgs[i];
              console.log(`Setting parameter "${paramName}" to "${processedArgs[i]}"`);
            }
          });
        }
        
        directiveLogger.debug(`Parameter map: ${JSON.stringify(parameterMap)}`);
        
        // Replace parameters in the template
        let expandedCommand = commandString;
        
        console.log('Command string before parameter substitution:', commandString);
        console.log('Parameter map for substitution:', parameterMap);
        
        // For echo commands, use a special handling approach
        if (commandString.startsWith('echo ') && processedArgs.length > 0) {
          commandToExecute = `echo ${processedArgs.join(' ')}`;
          console.log(`Special echo handling: ${commandToExecute}`);
        } else {
          // Standard parameter substitution
          for (const [name, value] of Object.entries(parameterMap)) {
            const paramPattern = new RegExp(`{{\\s*${name}\\s*}}`, 'g');
            console.log(`Looking for pattern: {{${name}}}`);
            
            const beforeReplace = expandedCommand;
            expandedCommand = expandedCommand.replace(paramPattern, value);
            
            if (beforeReplace !== expandedCommand) {
              console.log(`Replaced parameter {{${name}}} with "${value}"`);
            } else {
              console.log(`No replacement occurred for {{${name}}}`);
            }
          }
          
          commandToExecute = expandedCommand;
          console.log('Final command after substitution:', expandedCommand);
        }
      } 
      // Check for multi-line run directive
      else if (directive.isMultiLine) {
        directiveLogger.debug(`Detected multi-line run directive`);
        console.log('DETECTED MULTI-LINE RUN DIRECTIVE');
        
        const content = typeof directive.command === 'string' ? directive.command : '';
        const language = directive.language || '';
        const parameters = directive.parameters || [];
        
        console.log('Content:', content);
        console.log('Language:', language);
        console.log('Parameters:', parameters);
        
        // Determine how to execute the content based on language
        if (language === 'javascript' || language === 'js') {
          // For JavaScript content, create a temporary script to execute
          const tempScriptPath = `/tmp/meld-script-${Date.now()}.js`;
          await this.fileSystemService.writeFile(tempScriptPath, content);
          commandToExecute = `node ${tempScriptPath}`;
          console.log(`Created temporary JavaScript file: ${tempScriptPath}`);
        } else if (language === 'python' || language === 'py') {
          // For Python content, create a temporary script to execute
          const tempScriptPath = `/tmp/meld-script-${Date.now()}.py`;
          await this.fileSystemService.writeFile(tempScriptPath, content);
          commandToExecute = `python ${tempScriptPath}`;
          console.log(`Created temporary Python file: ${tempScriptPath}`);
        } else {
          // For shell scripts or unspecified languages, create a shell script
          const tempScriptPath = `/tmp/meld-script-${Date.now()}.sh`;
          await this.fileSystemService.writeFile(tempScriptPath, `#!/bin/bash\n${content}`);
          await this.fileSystemService.executeCommand(`chmod +x ${tempScriptPath}`, {
            cwd: context.workingDirectory || this.fileSystemService.getCwd()
          });
          commandToExecute = tempScriptPath;
          console.log(`Created temporary shell script: ${tempScriptPath}`);
        }
        
        // If parameters are provided, pass them as arguments to the script
        if (parameters.length > 0) {
          console.log('Passing parameters to the script execution');
          
          // Process each parameter to get its value
          const paramValues: string[] = [];
          
          for (const param of parameters) {
            if (param.type === 'VariableReference') {
              // For variable references, extract from state
              const varName = param.identifier;
              if (varName) {
                const varValue = state.getTextVar(varName) || '';
                // For bash, add proper quoting to ensure arguments with spaces work
                if (language === 'bash') {
                  // Correctly quote for bash to handle spaces in arguments
                  const escapedValue = varValue.replace(/"/g, '\\"');
                  paramValues.push(`"${escapedValue}"`);
                  console.log(`Parameter ${varName} = "${escapedValue}"`);
                } else {
                  // For other languages, wrap in quotes
                  paramValues.push(`"${varValue}"`);
                  console.log(`Parameter ${varName} = "${varValue}"`);
                }
              }
            } else if (typeof param === 'string') {
              // String literals are directly used
              paramValues.push(`"${param}"`);
              console.log(`Parameter (string): "${param}"`);
            }
          }
          
          // Append parameters to the command
          if (paramValues.length > 0) {
            commandToExecute = `${commandToExecute} ${paramValues.join(' ')}`;
            console.log(`Command with parameters: ${commandToExecute}`);
          }
        }
      }
      else if (rawCommand.startsWith('$')) {
        // Legacy support for command references (for backward compatibility)
        // Keep this until we're confident the AST-based approach is working well
        console.log('LEGACY COMMAND REFERENCE HANDLING - This should eventually be removed');
        
        // It's a command reference - extract the command name and arguments
        // Match $commandName(args) - including with quoted arguments
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
        
        console.log('Command name:', commandName);
        console.log('Command args:', commandArgs);
        
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
        
        // Get parameters defined in the command definition
        const parameters = Array.isArray(commandDef.parameters) ? commandDef.parameters : [];
        
        // Parse arguments manually (legacy approach)
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
            if ((char === '"' || char === '\'') && (i === 0 || argsString[i - 1] !== '\\')) {
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
        
        // First, resolve any variables in the args string
        const resolvedArgsString = await this.resolutionService.resolveInContext(
          commandArgs,
          context
        );
        
        directiveLogger.debug(`Raw args: ${commandArgs}`);
        directiveLogger.debug(`Resolved args string: ${resolvedArgsString}`);
        
        // Then parse the args into separate values
        const argParts = parseArgs(resolvedArgsString);
        directiveLogger.debug(`Parsed arguments: ${JSON.stringify(argParts)}`);
        
        // Create the parameter map for substitution
        const parameterMap: Record<string, string> = {};
        
        // Map provided args to parameters based on position
        if (parameters.length > 0) {
          parameters.forEach((paramName, i) => {
            if (i < argParts.length) {
              parameterMap[paramName] = argParts[i];
              console.log(`Setting parameter "${paramName}" to "${argParts[i]}"`);
            }
          });
        } else {
          // If no parameters are defined, try to extract them from the template
          const templateParamPattern = /\{\{([^}]+)\}\}/g;
          const paramNames: string[] = [];
          let match;
          
          console.log('Looking for parameter placeholders in template:', commandString);
          while ((match = templateParamPattern.exec(commandString)) !== null) {
            paramNames.push(match[1].trim());
            console.log(`Found parameter placeholder: {{${match[1].trim()}}}`);
          }
          
          // Map positional parameters
          paramNames.forEach((paramName, i) => {
            if (i < argParts.length) {
              parameterMap[paramName] = argParts[i];
              console.log(`Setting parameter "${paramName}" to "${argParts[i]}"`);
            }
          });
        }
        
        directiveLogger.debug(`Parameter map: ${JSON.stringify(parameterMap)}`);
        
        // Replace parameters in the template
        let expandedCommand = commandString;
        
        console.log('Command string before parameter substitution:', commandString);
        console.log('Parameter map for substitution:', parameterMap);
        
        // For echo commands, use a special handling approach
        if (commandString.startsWith('echo ') && argParts.length > 0) {
          commandToExecute = `echo ${argParts.join(' ')}`;
          console.log(`Special echo handling: ${commandToExecute}`);
        } else {
          // Standard parameter substitution
          for (const [name, value] of Object.entries(parameterMap)) {
            const paramPattern = new RegExp(`{{\\s*${name}\\s*}}`, 'g');
            console.log(`Looking for pattern: {{${name}}}`);
            
            const beforeReplace = expandedCommand;
            expandedCommand = expandedCommand.replace(paramPattern, value);
            
            if (beforeReplace !== expandedCommand) {
              console.log(`Replaced parameter {{${name}}} with "${value}"`);
            } else {
              console.log(`No replacement occurred for {{${name}}}`);
            }
          }
          
          commandToExecute = expandedCommand;
          console.log('Final command after substitution:', expandedCommand);
        }
      } else {
        // For regular commands (not references), resolve variables in the command
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