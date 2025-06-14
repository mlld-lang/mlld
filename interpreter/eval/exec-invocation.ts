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
  
  // Ensure it's an exec command or text template
  if (command.type !== 'command' && command.type !== 'textTemplate') {
    throw new MlldInterpreterError(`Variable ${commandName} is not a command or template (type: ${command.type})`);
  }
  
  // Handle text templates differently
  if (command.type === 'textTemplate') {
    // Text template handling
    const templateContent = command.content || [];
    const templateParams = command.params || [];
    
    // Create a child environment for parameter substitution
    const execEnv = env.createChild();
    
    // Bind arguments to parameters
    const args = node.commandRef.args || [];
    const evaluatedArgs: string[] = [];
    
    // Evaluate arguments
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
    for (let i = 0; i < templateParams.length; i++) {
      const paramName = templateParams[i];
      const argValue = evaluatedArgs[i];
      
      if (argValue !== undefined) {
        execEnv.setVariable(paramName, {
          type: 'text',
          name: paramName,
          value: argValue
        });
      }
    }
    
    // Interpolate the template with the bound parameters
    const result = await interpolate(templateContent, execEnv);
    
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
  
  // Get the command definition for regular commands
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
  const params = typedDef.parameters || typedDef.paramNames || [];
  
  // Evaluate arguments to get their actual values
  const evaluatedArgs: string[] = [];
  for (const arg of args) {
    // Arguments are typically strings, but we need to handle them properly
    if (typeof arg === 'string') {
      evaluatedArgs.push(arg);
    } else if (arg && typeof arg === 'object') {
      // If it's an object, it might be an AST node - evaluate it
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
      // Set parameter value in the child environment
      execEnv.setVariable(paramName, {
        type: 'text',
        name: paramName,
        value: argValue
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
  } else if (typedDef.type === 'code') {
    // Execute code with interpolated template
    const codeTemplate = typedDef.codeTemplate || typedDef.code;
    if (!codeTemplate) {
      throw new MlldInterpreterError(`Code command ${commandName} has no code template`);
    }
    
    // Interpolate the code template with parameters
    const code = await interpolate(codeTemplate, execEnv);
    
    // Build params object for code execution
    const codeParams: Record<string, any> = {};
    for (let i = 0; i < params.length; i++) {
      const paramName = params[i];
      const argValue = evaluatedArgs[i];
      if (argValue !== undefined) {
        codeParams[paramName] = argValue;
      }
    }
    
    // Debug: log params for Node.js execution
    if (process.env.DEBUG_NODE_EXEC && (typedDef.language === 'node' || typedDef.language === 'nodejs')) {
      console.log('Exec invocation params:', params);
      console.log('Exec invocation evaluatedArgs:', evaluatedArgs);
      console.log('Exec invocation codeParams:', codeParams);
    }
    
    // Execute the code with parameters
    result = await execEnv.executeCode(
      code,
      typedDef.language || 'javascript',
      codeParams
    );
  } else if (typedDef.type === 'commandRef') {
    // Handle command reference - recursively invoke the referenced command
    const refName = typedDef.commandRef;
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