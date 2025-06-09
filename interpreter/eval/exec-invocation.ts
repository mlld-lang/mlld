import type { ExecInvocation, WithClause } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
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
  const command = env.getVariable(commandName);
  if (!command) {
    throw new MlldInterpreterError(`Command not found: ${commandName}`);
  }
  
  // Ensure it's an exec command
  if (command.type !== 'command') {
    throw new MlldInterpreterError(`Variable ${commandName} is not a command (type: ${command.type})`);
  }
  
  // Get the command definition
  const definition = command.value;
  if (!definition || typeof definition !== 'object') {
    throw new MlldInterpreterError(`Command ${commandName} has invalid definition`);
  }
  
  // Type guard for command definition
  const typedDef = definition as { 
    type: string; 
    commandTemplate?: any[]; 
    codeTemplate?: any[]; 
    language?: string; 
    command?: any[]; 
    code?: any[];
    parameters?: string[];
  };
  
  // Create a child environment for parameter substitution
  const execEnv = env.createChild();
  
  // Handle command arguments
  const args = node.commandRef.args || [];
  const params = typedDef.parameters || [];
  
  // Bind arguments to parameters
  for (let i = 0; i < params.length; i++) {
    const paramName = params[i];
    const argValue = args[i];
    
    if (argValue) {
      // Set parameter value in the child environment
      execEnv.setVariable(paramName, {
        type: 'text',
        name: paramName,
        value: String(argValue)
      });
    }
  }
  
  let result: string;
  
  if (typedDef.type === 'command') {
    // Execute command with interpolated template
    const commandTemplate = typedDef.commandTemplate || typedDef.command;
    if (!commandTemplate) {
      throw new MlldInterpreterError(`Command ${commandName} has no command template`);
    }
    
    // Interpolate the command template with parameters
    const command = await interpolate(commandTemplate, execEnv);
    
    // Execute the command
    result = await execEnv.executeCommand(command);
  } else if (typedDef.type === 'code') {
    // Execute code with interpolated template
    const codeTemplate = typedDef.codeTemplate || typedDef.code;
    if (!codeTemplate) {
      throw new MlldInterpreterError(`Code command ${commandName} has no code template`);
    }
    
    // Interpolate the code template with parameters
    const code = await interpolate(codeTemplate, execEnv);
    
    // Execute the code
    result = await execEnv.executeCode(
      code,
      typedDef.language || 'javascript'
    );
  } else {
    throw new MlldInterpreterError(`Unknown command type: ${typedDef.type}`);
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