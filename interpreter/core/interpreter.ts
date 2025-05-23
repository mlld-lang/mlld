import type { MeldNode, DirectiveNode, TextNode, MeldDocument } from '@core/types';
import type { Environment } from '../env/Environment';
import { evaluateDirective } from '../eval/directive';

/**
 * Core evaluation result type
 */
export interface EvalResult {
  value: any;
  env: Environment;
}

/**
 * Main recursive evaluation function.
 * This is the heart of the interpreter - it walks the AST and evaluates each node.
 */
export async function evaluate(node: MeldNode | MeldNode[], env: Environment): Promise<EvalResult> {
  // Handle array of nodes (from parser)
  if (Array.isArray(node)) {
    let lastValue: any = undefined;
    for (const n of node) {
      const result = await evaluate(n, env);
      lastValue = result.value;
      
      // Add text nodes to output if they're top-level
      if (n.type === 'Text') {
        env.addNode(n);
      }
    }
    return { value: lastValue, env };
  }
  
  // Handle single node
  switch (node.type) {
    case 'Document':
      return evaluateDocument(node as MeldDocument, env);
      
    case 'Directive':
      return evaluateDirective(node as DirectiveNode, env);
      
    case 'Text':
      return evaluateText(node as TextNode, env);
      
    case 'Newline':
      // Newlines are just whitespace, ignore them
      return { value: '', env };
      
    case 'VariableReference':
      // Variable references are handled by interpolation in context
      // If we get here, it's likely an error or a grammar bug
      const varRef = node as any;
      
      // TODO: Remove this workaround when issue #50 is fixed
      // The grammar incorrectly creates top-level VariableReference nodes
      // for parameters in exec directives. These have location offset 0,0
      // which is impossible for real variable references.
      if (varRef.location?.start?.offset === 0 && 
          varRef.location?.end?.offset === 0) {
        // Skip orphaned parameter references from grammar bug
        return { value: '', env };
      }
      
      const variable = env.getVariable(varRef.identifier);
      if (!variable) {
        throw new Error(`Variable not found: ${varRef.identifier}`);
      }
      return { value: variable.value, env };
      
    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}

/**
 * Evaluate a document node (contains multiple child nodes)
 */
async function evaluateDocument(doc: MeldDocument, env: Environment): Promise<EvalResult> {
  let lastValue: any = undefined;
  
  // Evaluate each child node in sequence
  for (const child of doc.nodes) {
    const result = await evaluate(child, env);
    lastValue = result.value;
    
    // Add text nodes to output
    if (child.type === 'Text') {
      env.addNode(child);
    }
  }
  
  return { value: lastValue, env };
}

/**
 * Evaluate a text node (just plain text, no processing needed)
 */
async function evaluateText(node: TextNode, env: Environment): Promise<EvalResult> {
  // Text nodes are simple - their content is their value
  return { value: node.content, env };
}

/**
 * String interpolation helper - resolves {{variables}} in content
 */
export async function interpolate(
  nodes: Array<{ type: string; content?: string; name?: string; identifier?: string }>,
  env: Environment
): Promise<string> {
  const parts: string[] = [];
  
  for (const node of nodes) {
    if (node.type === 'Text') {
      parts.push(node.content || '');
    } else if (node.type === 'VariableReference') {
      const varName = node.identifier || node.name;
      if (!varName) continue;
      
      const variable = env.getVariable(varName);
      if (!variable) {
        // TODO: Should we throw in strict mode?
        parts.push(`{{${varName}}}`); // Keep unresolved
        continue;
      }
      
      // Extract value based on variable type
      let value = '';
      switch (variable.type) {
        case 'text':
          value = variable.value;
          break;
        case 'data':
          value = JSON.stringify(variable.value);
          break;
        case 'path':
          value = variable.value.resolvedPath;
          break;
        case 'command':
          // Commands don't interpolate - they need to be run
          value = `[command: ${variable.name}]`;
          break;
        default:
          value = String((variable as any).value);
      }
      
      parts.push(value);
    }
  }
  
  return parts.join('');
}