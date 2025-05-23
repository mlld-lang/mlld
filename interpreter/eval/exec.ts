import type { DirectiveNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { createCommandVariable } from '@core/types';

/**
 * Extract parameter names from the params array.
 * 
 * TODO: Remove workaround when issue #50 is fixed.
 * The grammar currently returns VariableReference nodes for params,
 * but they should be simple strings or Parameter nodes.
 */
function extractParamNames(params: any[]): string[] {
  return params.map(p => {
    // Once fixed, this should just be: return p; (if params are strings)
    // or: return p.name; (if params are Parameter nodes)
    if (typeof p === 'string') {
      return p;
    } else if (p.type === 'VariableReference') {
      // Current workaround for grammar issue #50
      return p.identifier;
    } else if (p.type === 'Parameter') {
      // Future-proofing for when grammar is fixed
      return p.name;
    }
    return '';
  }).filter(Boolean);
}

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
    
    // TODO: Remove this workaround when issue #51 is fixed
    // The grammar incorrectly splits the command template across multiple top-level nodes
    // For now, we'll just use what we have in the command field
    // This means complex commands with variables won't work properly
    console.warn('Exec command may be incomplete due to grammar bug #51');
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
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
    const paramNames = extractParamNames(params);
    
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