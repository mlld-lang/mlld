import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import type { IEvaluator } from '@core/universal-context';
import type { ExecInvocation } from '@core/ast';

import { BaseExecutionStrategy } from './base';
import { isCommandExecutable, isCommandRefExecutable } from '@core/types/executable';
import { interpolate } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import { logger } from '@core/utils/logger';
import { MlldInterpreterError } from '@core/errors';

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
    env: Environment,  // This is execEnv with parameters already bound
    evaluator?: IEvaluator
  ): Promise<EvalResult> {
    if (!isCommandExecutable(executable) && !isCommandRefExecutable(executable)) {
      throw new Error('Invalid executable type for CommandExecutionStrategy');
    }
    
    // Handle regular command executables
    if (isCommandExecutable(executable)) {
      const commandTemplate = executable.template || '';
      
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
      
      return {
        value: result.stdout || '',
        env
      };
    }
    
    // Handle command reference executables - these need recursive evaluation
    if (isCommandRefExecutable(executable)) {
      const refName = executable.commandRef;
      if (!refName) {
        throw new MlldInterpreterError('Command reference has no target command');
      }
      
      // Look up the referenced command - use parent environment to avoid parameter shadowing
      const refCommand = env.parent?.getVariable(refName) || env.getVariable(refName);
      if (!refCommand) {
        throw new MlldInterpreterError(`Referenced command not found: ${refName}`);
      }
      
      // Build the arguments for the recursive invocation
      let refArgs: any[] = [];
      
      if (executable.commandArgs && executable.commandArgs.length > 0) {
        // Evaluate each commandArg with the current environment (has bound parameters)
        const { evaluate } = await import('@interpreter/core/interpreter');
        
        for (const argNode of executable.commandArgs) {
          const argResult = await evaluate(argNode, env, { isExpression: true });
          if (argResult && argResult.value !== undefined) {
            refArgs.push(argResult.value);
          }
        }
      } else {
        // No commandArgs means pass through the current invocation's args
        const originalArgs = env.getVariable('__exec_args__');
        if (originalArgs && Array.isArray(originalArgs)) {
          refArgs = originalArgs;
        }
      }
      
      // Create a new ExecInvocation node for recursive evaluation
      const refInvocation: ExecInvocation = {
        type: 'ExecInvocation',
        commandRef: {
          identifier: refName,
          args: refArgs.map(arg => ({
            type: 'Text',
            content: typeof arg === 'string' ? arg : JSON.stringify(arg)
          }))
        },
        // Pass along the pipeline if present
        ...(executable.withClause ? { withClause: executable.withClause } : {})
      };
      
      // Recursively evaluate the referenced command with parent environment
      // to avoid parameter pollution
      const { evaluateExecInvocation } = await import('../index');
      const refResult = await evaluateExecInvocation(
        refInvocation,
        env.parent || env
      );
      
      return {
        value: refResult.value as string,
        env
      };
    }
    
    throw new Error('Unexpected executable type');
  }
}