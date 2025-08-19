import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';

import { BaseExecutionStrategy } from './base';
import { isCommandExecutable, isCommandRefExecutable } from '@core/types/executable';
import { interpolate } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { logger } from '@core/utils/logger';

/**
 * Strategy for executing command-based executables
 * Handles shell command execution with interpolation
 */
export class CommandExecutionStrategy extends BaseExecutionStrategy {
  canHandle(executable: ExecutableDefinition): boolean {
    return isCommandExecutable(executable) || isCommandRefExecutable(executable);
  }
  
  async execute(
    executable: ExecutableDefinition,
    env: Environment,
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!isCommandExecutable(executable) && !isCommandRefExecutable(executable)) {
      throw new Error('Invalid executable type for CommandExecutionStrategy');
    }
    
    // Get the command template
    let commandTemplate: string;
    
    if (isCommandExecutable(executable)) {
      commandTemplate = executable.template || '';
    } else if (isCommandRefExecutable(executable)) {
      // For command references, build the command
      const cmdRef = executable.commandRef;
      if (!cmdRef) {
        throw new Error('CommandRef executable missing commandRef');
      }
      
      // Build command from parts
      if (typeof cmdRef === 'string') {
        commandTemplate = cmdRef;
      } else if (cmdRef.identifier) {
        commandTemplate = cmdRef.identifier;
        // Add arguments if present
        if (cmdRef.args && cmdRef.args.length > 0) {
          const argStrings = cmdRef.args.map((arg: any) => {
            if (typeof arg === 'string') return arg;
            if (typeof arg === 'number') return String(arg);
            if (arg && typeof arg === 'object' && arg.content) return arg.content;
            return JSON.stringify(arg);
          });
          commandTemplate += ' ' + argStrings.join(' ');
        }
      } else {
        throw new Error('Unable to build command from commandRef');
      }
    } else {
      throw new Error('Unexpected executable type');
    }
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Executing command', {
        template: commandTemplate.substring(0, 100),
        hasInterpolation: executable.syntaxInfo?.hasInterpolation
      });
    }
    
    // Perform interpolation if needed
    let command: string;
    if (executable.syntaxInfo?.hasInterpolation !== false) {
      const context = new InterpolationContext(env, {
        autoExecute: true,
        preserveUndefined: false
      });
      command = await interpolate(commandTemplate, context);
    } else {
      command = commandTemplate;
    }
    
    // Execute the command
    const result = await env.executeCommand(command);
    
    if (process.env.DEBUG_EXEC) {
      logger.debug('Command execution result', {
        exitCode: result.exitCode,
        stdoutLength: result.stdout?.length,
        stderrLength: result.stderr?.length
      });
    }
    
    // Return stdout as the value
    return {
      value: result.stdout || '',
      env
    };
  }
}