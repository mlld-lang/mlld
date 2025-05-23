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
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = params.map(p => {
      if (p.type === 'VariableReference') {
        return p.identifier;
      } else if (p.type === 'Text') {
        return p.content;
      }
      return '';
    }).filter(Boolean);
    
    // Store the command template (not interpolated yet)
    commandDef = {
      commandTemplate: commandNodes,
      paramNames,
      type: 'command'
    };
    
  } else if (directive.subtype === 'execCode') {
    // Handle code definition
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Exec code directive missing code');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = params.map(p => {
      if (p.type === 'VariableReference') {
        return p.identifier;
      } else if (p.type === 'Text') {
        return p.content;
      }
      return '';
    }).filter(Boolean);
    
    const language = directive.raw?.language || 'javascript';
    
    // Store the code template (not interpolated yet)
    commandDef = {
      codeTemplate: codeNodes,
      language,
      paramNames,
      type: 'code'
    };
    
  } else {
    throw new Error(`Unsupported exec subtype: ${directive.subtype}`);
  }
  
  // Create and store the command variable
  const variable = createCommandVariable(identifier, commandDef);
  env.setVariable(identifier, variable);
  
  // Return the command definition (no output for variable definitions)
  return { value: commandDef, env };
}