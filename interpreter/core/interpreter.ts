import type { MlldNode, DirectiveNode, TextNode, MlldDocument, MlldVariable } from '@core/types';
import type { Environment } from '../env/Environment';
import { evaluateDirective } from '../eval/directive';
import { evaluateDataValue } from '../eval/data-value-evaluator';
import { isFullyEvaluated, collectEvaluationErrors } from '../eval/data-value-evaluator';

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
export async function evaluate(node: MlldNode | MlldNode[], env: Environment): Promise<EvalResult> {
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
      return evaluateDocument(node as MlldDocument, env);
      
    case 'Directive':
      return evaluateDirective(node as DirectiveNode, env);
      
    case 'Text':
      return evaluateText(node as TextNode, env);
      
    case 'Newline':
      // Preserve newlines in output
      const newlineNode: TextNode = {
        type: 'Text',
        nodeId: `${(node as any).nodeId || 'newline'}-text`,
        content: '\n'
      };
      env.addNode(newlineNode);
      return { value: '\n', env };
      
    case 'VariableReference':
      // Variable references are handled by interpolation in context
      // If we get here, it's likely an error or a grammar bug
      const varRef = node as any;
      
      // TODO: Remove this workaround when issue #50 is fixed
      // The grammar incorrectly creates top-level VariableReference nodes
      // for parameters in exec directives. These have location offset 0,0
      // which is impossible for real variable references.
      // However, variable interpolation nodes also have offset 0,0 but
      // they have valueType: 'varInterpolation'
      if (varRef.location?.start?.offset === 0 && 
          varRef.location?.end?.offset === 0 &&
          varRef.valueType !== 'varInterpolation') {
        // Skip orphaned parameter references from grammar bug
        return { value: '', env };
      }
      
      const variable = env.getVariable(varRef.identifier);
      if (!variable) {
        // For interpolation variables, return empty if not found
        if (varRef.valueType === 'varInterpolation') {
          return { value: `{{${varRef.identifier}}}`, env };
        }
        throw new Error(`Variable not found: ${varRef.identifier}`);
      }
      
      // Handle complex data variables with lazy evaluation
      const resolvedValue = await resolveVariableValue(variable, env);
      
      // For interpolation variables, we need to add the resolved text to output
      if (varRef.valueType === 'varInterpolation') {
        env.addNode({ type: 'Text', content: String(resolvedValue) } as any);
      }
      
      return { value: resolvedValue, env };
      
    default:
      throw new Error(`Unknown node type: ${(node as any).type}`);
  }
}

/**
 * Evaluate a document node (contains multiple child nodes)
 */
async function evaluateDocument(doc: MlldDocument, env: Environment): Promise<EvalResult> {
  let lastValue: any = undefined;
  
  // Evaluate each child node in sequence
  for (const child of doc.nodes) {
    const result = await evaluate(child, env);
    lastValue = result.value;
    
    // Add text nodes to output
    if (child.type === 'Text') {
      env.addNode(child);
    }
    // VariableReference nodes with varInterpolation are now handled in evaluate()
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
 * Resolve variable value with lazy evaluation support for complex data
 */
export async function resolveVariableValue(variable: MlldVariable, env: Environment): Promise<any> {
  // Check if this is a complex data variable that needs evaluation
  if (variable.type === 'data') {
    // For data variables, check if the value needs evaluation
    const dataValue = variable.value;
    
    // If it's an AST structure (has type property), evaluate it
    if (dataValue && typeof dataValue === 'object' && 'type' in dataValue) {
      const evaluatedValue = await evaluateDataValue(dataValue, env);
      return evaluatedValue;
    }
    
    // Check legacy complex data variable format
    if ('isFullyEvaluated' in variable) {
      const complexVar = variable as any; // ComplexDataVariable
      
      if (!complexVar.isFullyEvaluated) {
        // Evaluate the complex data value
        try {
          const evaluatedValue = await evaluateDataValue(complexVar.value, env);
          
          // Update the variable with the evaluated value
          complexVar.value = evaluatedValue;
          complexVar.isFullyEvaluated = true;
          
          // Check for any evaluation errors
          const errors = collectEvaluationErrors(evaluatedValue);
          if (Object.keys(errors).length > 0) {
            complexVar.evaluationErrors = errors;
          }
          
          return evaluatedValue;
        } catch (error) {
          // Store the error but still mark as evaluated to prevent infinite loops
          complexVar.isFullyEvaluated = true;
          complexVar.evaluationErrors = { root: error as Error };
          throw error;
        }
      }
      
      return complexVar.value;
    }
  }
  
  // For non-complex variables, return the value directly
  return variable.value;
}

/**
 * String interpolation helper - resolves {{variables}} in content
 */
export async function interpolate(
  nodes: Array<{ type: string; content?: string; name?: string; identifier?: string; fields?: any[] }>,
  env: Environment
): Promise<string> {
  const parts: string[] = [];
  
  for (const node of nodes) {
    if (node.type === 'Text') {
      parts.push(node.content || '');
    } else if (node.type === 'PathSeparator') {
      parts.push(node.value || '/');
    } else if (node.type === 'VariableReference') {
      const varName = node.identifier || node.name;
      if (!varName) continue;
      
      const variable = env.getVariable(varName);
      if (!variable) {
        // Handle special path variables
        if (varName === 'PROJECTPATH' || varName === 'HOMEPATH') {
          parts.push(`$${varName}`);
          continue;
        }
        // TODO: Should we throw in strict mode?
        parts.push(`{{${varName}}}`); // Keep unresolved
        continue;
      }
      
      // Extract value based on variable type
      let value: any = '';
      switch (variable.type) {
        case 'text':
          value = variable.value;
          break;
        case 'data':
          // Handle both simple and complex data variables
          value = await resolveVariableValue(variable, env);
          break;
        case 'path':
          value = variable.value.resolvedPath;
          break;
        case 'command':
          // Commands don't interpolate - they need to be run
          value = `[command: ${variable.name}]`;
          break;
        default:
          value = (variable as any).value;
      }
      
      // Handle field access if present
      if (node.fields && node.fields.length > 0 && typeof value === 'object' && value !== null) {
        for (const field of node.fields) {
          if (field.type === 'arrayIndex') {
            const index = field.index;
            if (Array.isArray(value)) {
              value = value[index];
            } else {
              value = undefined;
              break;
            }
          } else if (field.type === 'field') {
            value = value[field.name];
            
            // Handle null nodes from the grammar
            if (value && typeof value === 'object' && value.type === 'Null') {
              value = null;
            }
            
            if (value === undefined) break;
          }
        }
      }
      
      // Convert final value to string
      if (value === null) {
        parts.push('null');
      } else if (typeof value === 'object' && value.type === 'Null') {
        // Handle null nodes from the grammar
        parts.push('null');
      } else if (typeof value === 'object') {
        parts.push(JSON.stringify(value));
      } else {
        parts.push(String(value));
      }
    }
  }
  
  return parts.join('');
}