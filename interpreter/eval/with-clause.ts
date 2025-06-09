import type { WithClause, PipelineCommand, TrustLevel } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { MlldInterpreterError } from '@core/errors';

/**
 * Apply withClause transformations to a result
 * This handles pipeline commands, trust validation, and dependency checks
 */
export async function applyWithClause(
  input: string,
  withClause: WithClause,
  env: Environment
): Promise<EvalResult> {
  let result = input;
  
  // Apply pipeline transformations
  if (withClause.pipeline && withClause.pipeline.length > 0) {
    for (const pipelineCmd of withClause.pipeline) {
      // Create a child environment with @input set
      const pipelineEnv = env.createChild();
      pipelineEnv.setVariable('input', {
        type: 'text',
        name: 'input',
        value: result
      });
      
      // Execute the pipeline command
      result = await executePipelineCommand(pipelineCmd, pipelineEnv);
    }
  }
  
  // Apply trust validation
  if (withClause.trust) {
    validateTrust(result, withClause.trust);
  }
  
  // Check dependencies if specified
  if (withClause.needs) {
    await checkDependencies(withClause.needs, env);
  }
  
  return {
    value: result,
    env,
    stdout: result,
    stderr: '',
    exitCode: 0
  };
}

/**
 * Execute a pipeline command
 */
async function executePipelineCommand(
  command: PipelineCommand,
  env: Environment
): Promise<string> {
  // Get the command identifier
  const cmdName = command.rawIdentifier;
  if (!cmdName) {
    throw new MlldInterpreterError('Pipeline command has no identifier');
  }
  
  // Look up the command
  const cmd = env.getVariable(cmdName);
  if (!cmd) {
    throw new MlldInterpreterError(`Pipeline command not found: ${cmdName}`);
  }
  
  // Execute based on command type
  if (cmd.type === 'command') {
    const definition = cmd.value as any;
    
    // Create environment for command execution
    const cmdEnv = env.createChild();
    
    // Bind arguments if any
    const args = command.rawArgs || [];
    const params = definition.parameters || [];
    
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = args[i];
      
      if (argValue !== undefined) {
        cmdEnv.setVariable(paramName, {
          type: 'text',
          name: paramName,
          value: String(argValue)
        });
      }
    }
    
    // Execute the command
    if (definition.type === 'command') {
      const { interpolate } = await import('../core/interpreter');
      const cmdTemplate = definition.commandTemplate || definition.command;
      const interpolatedCmd = await interpolate(cmdTemplate, cmdEnv);
      return await cmdEnv.executeCommand(interpolatedCmd);
    } else if (definition.type === 'code') {
      const { interpolate } = await import('../core/interpreter');
      const codeTemplate = definition.codeTemplate || definition.code;
      const interpolatedCode = await interpolate(codeTemplate, cmdEnv);
      return await cmdEnv.executeCode(interpolatedCode, definition.language || 'javascript');
    }
  }
  
  throw new MlldInterpreterError(`Unsupported pipeline command type: ${cmd.type}`);
}

/**
 * Validate trust level
 */
function validateTrust(result: string, trustLevel: TrustLevel): void {
  // TODO: Implement trust validation
  // For now, just log a warning
  if (trustLevel === 'never') {
    throw new MlldInterpreterError('Trust level "never" not yet implemented');
  }
  
  // 'always' means no validation needed
  // 'verify' would prompt user for confirmation (not implemented)
}

/**
 * Check dependencies
 */
async function checkDependencies(
  needs: Record<string, any>,
  env: Environment
): Promise<void> {
  // TODO: Implement dependency checking
  // For now, just validate that files exist if specified
  if (needs.file) {
    const exists = await env.fileSystem.exists(needs.file);
    if (!exists) {
      throw new MlldInterpreterError(`Required file not found: ${needs.file}`);
    }
  }
}