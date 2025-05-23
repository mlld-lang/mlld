import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { createCommandVariable } from '@core/types';

/**
 * Evaluate @exec directives.
 * Defines executable commands/code but doesn't run them.
 * 
 * Ported from ExecDirectiveHandler.
 */
export async function evaluateExec(
  directive: DirectiveNode,
  env: Environment
): Promise<EvalResult> {
  // Extract identifier
  const identifier = directive.raw?.identifier;
  if (!identifier) {
    throw new Error('Exec directive missing identifier');
  }
  
  let commandDef;
  
  if (directive.subtype === 'execCommand') {
    // Handle command definition
    const commandNodes = directive.values?.command;
    if (!commandNodes) {
      throw new Error('Exec command directive missing command');
    }
    
    // Interpolate the command
    const command = await interpolate(commandNodes, env);
    
    // Parse command into executable and args
    const parts = command.trim().split(/\\s+/);
    const executableName = parts[0];
    const args = parts.slice(1);
    
    commandDef = {
      executableName,
      args
    };
    
  } else if (directive.subtype === 'execCode') {
    // Handle code definition
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Exec code directive missing code');
    }
    
    // Get the code (but don't execute it)
    const code = await interpolate(codeNodes, env);
    const language = directive.raw?.language || 'javascript';
    
    commandDef = {
      code,
      language
    };
    
  } else {
    throw new Error(`Unsupported exec subtype: ${directive.subtype}`);
  }
  
  // Create and store the command variable
  const variable = createCommandVariable(identifier, commandDef);
  env.setVariable(identifier, variable);
  
  // Return the command definition
  return { value: commandDef, env };
}