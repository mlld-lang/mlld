import type { ExecInvocation, WithClause } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import type { ExecutableDefinition } from '@core/types/executable';
import { isCommandExecutable, isCodeExecutable, isTemplateExecutable, isCommandRefExecutable } from '@core/types/executable';
import { interpolate } from '../core/interpreter';
import { applyWithClause } from './with-clause';
import { MlldInterpreterError } from '@core/errors';

/**
 * Evaluate an ExecInvocation node
 * This executes a previously defined exec command with arguments and optional tail modifiers
 */
export async function evaluateExecInvocation(
  node: ExecInvocation,
  env: Environment
): Promise<EvalResult> {
  // Get the command name from the command reference
  let commandName: string;
  
  // Handle different command reference structures
  if (typeof node.commandRef.identifier === 'string') {
    commandName = node.commandRef.identifier;
  } else if (Array.isArray(node.commandRef.identifier) && node.commandRef.identifier.length > 0) {
    // Extract from array of nodes
    const identifierNode = node.commandRef.identifier[0];
    if (identifierNode.type === 'Text' && identifierNode.content) {
      commandName = identifierNode.content;
    } else {
      commandName = node.commandRef.name || '';
    }
  } else {
    commandName = node.commandRef.name || '';
  }
  
  if (!commandName) {
    throw new MlldInterpreterError('ExecInvocation has no command identifier');
  }
  
  // Look up the command in the environment
  const variable = env.getVariable(commandName);
  if (!variable) {
    throw new MlldInterpreterError(`Command not found: ${commandName}`);
  }
  
  // Ensure it's an executable variable
  if (variable.type !== 'executable') {
    throw new MlldInterpreterError(`Variable ${commandName} is not executable (type: ${variable.type})`);
  }
  
  const definition = variable.value as ExecutableDefinition;
  
  // Create a child environment for parameter substitution
  const execEnv = env.createChild();
  
  // Handle command arguments
  const args = node.commandRef.args || [];
  const params = definition.paramNames || [];
  
  // Evaluate arguments to get their actual values
  const evaluatedArgs: string[] = [];
  for (const arg of args) {
    if (typeof arg === 'string') {
      evaluatedArgs.push(arg);
    } else if (arg && typeof arg === 'object') {
      const evaluated = await interpolate([arg], env);
      evaluatedArgs.push(evaluated);
    } else {
      evaluatedArgs.push(String(arg));
    }
  }
  
  // Bind evaluated arguments to parameters
  for (let i = 0; i < params.length; i++) {
    const paramName = params[i];
    const argValue = evaluatedArgs[i];
    
    if (argValue !== undefined) {
      execEnv.setVariable(paramName, {
        type: 'text',
        name: paramName,
        value: argValue
      });
    }
  }
  
  let result: string;
  
  // Handle template executables
  if (isTemplateExecutable(definition)) {
    // Interpolate the template with the bound parameters
    result = await interpolate(definition.templateContent, execEnv);
  }
  // Handle command executables
  else if (isCommandExecutable(definition)) {
    // Interpolate the command template with parameters
    const command = await interpolate(definition.commandTemplate, execEnv);
    
    // Build environment variables from parameters for shell execution
    const envVars: Record<string, string> = {};
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = evaluatedArgs[i];
      if (argValue !== undefined) {
        envVars[paramName] = String(argValue);
      }
    }
    
    // Execute the command with environment variables
    result = await execEnv.executeCommand(command, { env: envVars });
  }
  // Handle code executables
  else if (isCodeExecutable(definition)) {
    // Interpolate the code template with parameters
    const code = await interpolate(definition.codeTemplate, execEnv);
    
    // Build params object for code execution
    const codeParams: Record<string, any> = {};
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = evaluatedArgs[i];
      if (argValue !== undefined) {
        codeParams[paramName] = argValue;
      }
    }
    
    // Execute the code with parameters
    result = await execEnv.executeCode(
      code,
      definition.language || 'javascript',
      codeParams
    );
  }
  // Handle command reference executables
  else if (isCommandRefExecutable(definition)) {
    const refName = definition.commandRef;
    if (!refName) {
      throw new MlldInterpreterError(`Command reference ${commandName} has no target command`);
    }
    
    // Look up the referenced command
    const refCommand = env.getVariable(refName);
    if (!refCommand) {
      throw new MlldInterpreterError(`Referenced command not found: ${refName}`);
    }
    
    // Create a new invocation node for the referenced command
    const refInvocation: ExecInvocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: refName,
        args: evaluatedArgs.map(arg => ({
          type: 'Text',
          content: arg
        }))
      }
    };
    
    // Recursively evaluate the referenced command
    const refResult = await evaluateExecInvocation(refInvocation, env);
    result = refResult.value as string;
  } else {
    throw new MlldInterpreterError(`Unknown executable type: ${(definition as any).type}`);
  }
  
  // Apply withClause transformations if present
  if (node.withClause) {
    return applyWithClause(result, node.withClause, env);
  }
  
  return {
    value: result,
    env,
    stdout: result,
    stderr: '',
    exitCode: 0
  };
}