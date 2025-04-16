import type { IStateService } from '@services/state/StateService/IStateService.js';
import { ResolutionContext } from '@core/types/resolution.js';
import { VariableType } from '@core/types/variables.js';
import { MeldResolutionError } from '@core/errors/MeldResolutionError.js';
import { ErrorSeverity } from '@core/errors/MeldError.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import { VariableResolutionError } from '@core/errors/VariableResolutionError.js';
import { isBasicCommand } from '@core/types/index.js';
import type { IBasicCommandDefinition, ICommandDefinition, ICommandParameterMetadata } from '@core/types/define.js';
import type { IFileSystemService } from '@services/fs/FileSystemService/IFileSystemService.js';
import { logger } from '@core/utils/logger.js';

/**
 * Handles resolution and execution of command variables.
 */
export class CommandResolver {
  constructor(
    private stateService: IStateService,
    // Make fileSystemService optional to align with potential DI/fallback issues
    private fileSystemService?: IFileSystemService, 
    private parserService?: IParserService
  ) {}

  /**
   * Executes a basic command definition with provided arguments.
   *
   * @param definition - The IBasicCommandDefinition.
   * @param args - Array of resolved argument strings provided at invocation time.
   * @param context - The resolution context.
   * @returns The stdout of the executed command.
   */
  async executeBasicCommand(definition: IBasicCommandDefinition, args: string[], context: ResolutionContext): Promise<string> {
    // Add check for optional fileSystemService at the beginning
    if (!this.fileSystemService) {
      throw new MeldResolutionError('FileSystemService is not available for command execution', {
        code: 'E_SERVICE_UNAVAILABLE',
        details: { serviceName: 'FileSystemService', commandName: definition.name }
      });
    }
    // Assign to local constant for guaranteed non-null access below
    const fileSystemService = this.fileSystemService;

    logger.debug(`Executing basic command: ${definition.name}`, { argsCount: args.length, template: definition.commandTemplate });

    // 1. Validate arguments against definition parameters
    const validationError = this.validateArguments(definition.parameters, args);
    if (validationError) {
      logger.error(`Argument validation failed for command ${definition.name}`, { error: validationError });
      if (context.strict) {
        throw validationError;
      }
      return ''; // Return empty string in non-strict mode for param mismatch
    }

    // 2. Substitute parameters into the template
    let commandString = definition.commandTemplate; 
    const paramMap = this.createParamMap(definition.parameters, args);

    // Fix: Implement simple shell-style argument substitution for now
    // Replace "$@" with all arguments joined by space
    if (commandString.includes('"$@"')) {
      // Quote arguments that contain spaces
      const quotedArgs = args.map(arg => arg.includes(' ') ? `"${arg}"` : arg);
      commandString = commandString.replace('"$@"', quotedArgs.join(' '));
    }
    // TODO: Implement positional parameter substitution ($1, $2, etc.) if needed
    for (const param of definition.parameters) {
      const value = paramMap.get(param.name) ?? param.defaultValue ?? ''; // Use provided arg, then default, then empty
      const placeholder = `{{${param.name}}}`; 
      // Use regex for global replacement
      commandString = commandString.replace(new RegExp(placeholder.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g'), value);
    }

    // 3. Check for leftover placeholders (optional, but good practice)
    // Note: This check might need adjustment if we support complex shell syntax
    const leftoverMatch = commandString.match(/{{(.*?)}}/);
    if (leftoverMatch) {
       const errorMsg = `Command ${definition.name}: Unresolved parameter placeholder found after substitution: ${leftoverMatch[0]}`;
       logger.error(errorMsg, { finalCommandString: commandString });
       if (context.strict) {
           throw new MeldResolutionError(errorMsg, {
               code: 'E_RESOLVE_PARAM_SUBSTITUTION',
               details: { commandName: definition.name, template: definition.commandTemplate, args }
           });
       }
       // Decide if execution should proceed or return empty in non-strict
       return ''; // Safer to return empty if substitution failed
    }

    // 4. Handle variable resolution within the command string (if mode requires)
    // TODO: Implement variable resolution based on definition.variableResolutionMode
    // This might involve calling back to ResolutionService.resolveText(commandString, context)
    // For now, we execute the command string as-is after parameter substitution.
    if (definition.variableResolutionMode && definition.variableResolutionMode !== 'none') {
        logger.warn(`Command ${definition.name}: Variable resolution mode '${definition.variableResolutionMode}' not yet implemented. Executing command without further variable resolution.`);
        // Placeholder: In future, call resolution service here if mode is 'immediate'
        // if (definition.variableResolutionMode === 'immediate') {
        //   commandString = await resolutionService.resolveText(commandString, context); // Need resolutionService access
        // }
    }


    // 5. Execute the command
    logger.debug(`Executing command string for ${definition.name}: ${commandString}`);
    try {
      // Removed check: if (!this.fileSystemService) { ... }

      // Determine working directory (handling null path)
      let cwd: string;
      // Assuming context.state is always defined based on ResolutionContext type.
      const currentFilePath = context.state.getCurrentFilePath(); 
      // Check if path is a valid string before using dirname
      if (typeof currentFilePath === 'string') {
          // Path is valid, use its directory - Use local non-null fs service
          cwd = fileSystemService.dirname(currentFilePath);
      } else {
          // Path is null, use the default CWD - Use local non-null fs service
          cwd = fileSystemService.getCwd();
      }
      // Use local non-null fs service
      const result = await fileSystemService.executeCommand(commandString, { cwd });
      logger.debug(`Command ${definition.name} execution successful`, { stdoutLength: result.stdout.length, stderrLength: result.stderr.length });

      // Handle stderr? Throw if non-empty? Depends on desired behavior.
      if (result.stderr && context.strict) {
           // Optional: throw an error if stderr is produced in strict mode
           // throw new MeldResolutionError(`Command ${definition.name} produced stderr: ${result.stderr}`, { code: 'E_COMMAND_STDERR' });
           logger.warn(`Command ${definition.name} produced stderr`, { stderr: result.stderr });
      }

      return result.stdout;
    } catch (error) {
      logger.error(`Command execution failed for ${definition.name}`, { error, commandString });
      if (context.strict) {
        throw new MeldResolutionError(`Command execution failed: ${definition.name}`, {
          code: 'E_COMMAND_EXEC_FAILED',
          cause: error,
          details: { commandName: definition.name, executedCommand: commandString }
        });
      }
      return ''; // Return empty on execution failure in non-strict
    }
  }

  /** Helper to validate provided arguments against parameter definitions */
  private validateArguments(parameters: ICommandParameterMetadata[], args: string[]): MeldResolutionError | null {
      const requiredParams = parameters.filter(p => p.required !== false); // required is true by default
      const maxParams = parameters.length;

      if (args.length < requiredParams.length) {
          return new MeldResolutionError(
              `Expected at least ${requiredParams.length} arguments, but got ${args.length}`, {
              code: 'E_RESOLVE_PARAM_MISMATCH_COUNT',
              details: { expectedMin: requiredParams.length, actual: args.length }
          });
      }
      if (args.length > maxParams) {
           return new MeldResolutionError(
               `Expected at most ${maxParams} arguments, but got ${args.length}`, {
               code: 'E_RESOLVE_PARAM_MISMATCH_COUNT',
               details: { expectedMax: maxParams, actual: args.length }
           });
      }
      return null; // Arguments are valid
  }

   /** Helper to map parameter names to provided argument values by position */
   private createParamMap(parameters: ICommandParameterMetadata[], args: string[]): Map<string, string> {
       const map = new Map<string, string>();
       // Sort parameters by position to ensure correct mapping
       const sortedParams = [...parameters].sort((a, b) => a.position - b.position);
       for (let i = 0; i < sortedParams.length; i++) {
           if (i < args.length) {
               map.set(sortedParams[i].name, args[i]);
           } else {
               // Use default value if argument not provided, fallback to empty string
               map.set(sortedParams[i].name, sortedParams[i].defaultValue ?? '');
           }
       }
       return map;
   }
}
