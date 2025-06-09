import type { DirectiveNode, TextNode } from '@core/types';
import type { Environment } from '../env/Environment';
import type { EvalResult } from '../core/interpreter';
import { interpolate } from '../core/interpreter';
import { createCommandVariable, astLocationToSourceLocation } from '@core/types';

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
  // Extract identifier - this is a command name, not content to interpolate
  const identifierNodes = directive.values?.identifier;
  if (!identifierNodes || !Array.isArray(identifierNodes) || identifierNodes.length === 0) {
    throw new Error('Exec directive missing identifier');
  }
  
  // For exec directives, extract the command name
  const identifierNode = identifierNodes[0];
  let identifier: string;
  
  if (identifierNode.type === 'Text' && 'content' in identifierNode) {
    // eslint-disable-next-line mlld/no-ast-string-manipulation
    identifier = (identifierNode as TextNode).content;
  } else if (identifierNode.type === 'VariableReference' && 'identifier' in identifierNode) {
    identifier = (identifierNode as any).identifier;
  } else {
    throw new Error('Exec directive identifier must be a simple command name');
  }
  
  let commandDef;
  
  if (directive.subtype === 'execCommand') {
    // Check if this is a command reference
    const commandRef = directive.values?.commandRef;
    if (commandRef) {
      // This is a reference to another exec command
      const refName = await interpolate(commandRef, env);
      const args = directive.values?.args || [];
      
      // Get parameter names if any
      const params = directive.values?.params || [];
      const paramNames = extractParamNames(params);
      
      // Store the reference definition
      commandDef = {
        commandRef: refName,
        commandArgs: args,
        paramNames,
        type: 'commandRef'
      };
    } else {
      // Handle regular command definition
      const commandNodes = directive.values?.command;
      if (!commandNodes) {
        throw new Error('Exec command directive missing command');
      }
      
      // Command template is properly parsed with variable interpolation
      
      // Get parameter names if any
      const params = directive.values?.params || [];
      const paramNames = extractParamNames(params);
      
      // Store the command template (not interpolated yet)
      commandDef = {
        commandTemplate: commandNodes,
        paramNames,
        type: 'command'
      };
    }
    
  } else if (directive.subtype === 'execCode') {
    // Handle code definition
    const codeNodes = directive.values?.code;
    if (!codeNodes) {
      throw new Error('Exec code directive missing code');
    }
    
    // Get parameter names if any
    const params = directive.values?.params || [];
    const paramNames = extractParamNames(params);
    
    // Language is stored in meta, not raw
    const language = directive.meta?.language || 'javascript';
    
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
  const variable = createCommandVariable(identifier, commandDef, {
    definedAt: astLocationToSourceLocation(directive.location, env.getCurrentFilePath())
  });
  
  // Convert to Environment's MlldVariable format with TTL/trust metadata
  const mlldVar: any = {
    type: 'command',
    value: variable.value,
    nodeId: directive.nodeId || '',
    location: directive.location || { line: 0, column: 0 },
    metadata: {
      ...variable.metadata,
      // Add TTL/trust from directive meta if present
      ...(directive.meta?.ttl && { ttl: directive.meta.ttl }),
      ...(directive.meta?.trust && { trust: directive.meta.trust }),
      // Store the configured by info
      configuredBy: identifier
    }
  };
  
  env.setVariable(identifier, mlldVar);
  
  // Return the command definition (no output for variable definitions)
  return { value: commandDef, env };
}