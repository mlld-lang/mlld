import type { MlldNode, DirectiveNode, TextNode, CommentNode, MlldDocument, MlldVariable, FrontmatterNode, CommandVariable } from '@core/types';
import type { Environment } from '../env/Environment';
import { evaluateDirective } from '../eval/directive';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable, isImportVariable } from '@core/types';
import { evaluateDataValue } from '../eval/data-value-evaluator';
import { isFullyEvaluated, collectEvaluationErrors } from '../eval/data-value-evaluator';
import { InterpolationContext, EscapingStrategyFactory } from './interpolation-context';
import { parseFrontmatter } from '../utils/frontmatter-parser';

/**
 * Core evaluation result type
 */
export interface EvalResult {
  value: any;
  env: Environment;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

/**
 * Main recursive evaluation function.
 * This is the heart of the interpreter - it walks the AST and evaluates each node.
 */
export async function evaluate(node: MlldNode | MlldNode[], env: Environment): Promise<EvalResult> {
  // Handle array of nodes (from parser)
  if (Array.isArray(node)) {
    let lastValue: any = undefined;
    let lastResult: EvalResult | null = null;
    
    // First, check if the first node is frontmatter and process it
    if (node.length > 0 && node[0].type === 'Frontmatter') {
      const frontmatterNode = node[0] as FrontmatterNode;
      const frontmatterData = parseFrontmatter(frontmatterNode.content);
      env.setFrontmatter(frontmatterData);
      
      // Process remaining nodes
      for (let i = 1; i < node.length; i++) {
        const n = node[i];
        const result = await evaluate(n, env);
        lastValue = result.value;
        lastResult = result;
        
        // Add text nodes to output if they're top-level and not inline comments
        if (n.type === 'Text') {
          const textNode = n as TextNode;
          // Skip inline comments (lines starting with >> or <<)
          if (!textNode.content.trimStart().match(/^(>>|<<)/)) {
            env.addNode(n);
          }
        }
      }
    } else {
      // No frontmatter, process all nodes normally
      for (const n of node) {
        const result = await evaluate(n, env);
        lastValue = result.value;
        lastResult = result;
        
        // Add text nodes to output if they're top-level and not inline comments
        if (n.type === 'Text') {
          const textNode = n as TextNode;
          // Skip inline comments (lines starting with >> or <<)
          if (!textNode.content.trimStart().match(/^(>>|<<)/)) {
            env.addNode(n);
          }
        }
      }
    }
    
    // Return the last result with all its properties (including stdout, stderr, exitCode)
    if (lastResult && (lastResult.stdout !== undefined || lastResult.stderr !== undefined || lastResult.exitCode !== undefined)) {
      return lastResult;
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
      
    case 'Comment':
      // Comments are NOT included in output
      const commentNode = node as CommentNode;
      // Skip comments - don't add any nodes to output
      return { value: commentNode.content, env };
      
    case 'Frontmatter':
      // Process frontmatter node
      const frontmatterNode = node as FrontmatterNode;
      const frontmatterData = parseFrontmatter(frontmatterNode.content);
      env.setFrontmatter(frontmatterData);
      return { value: frontmatterData, env };
      
    case 'CodeFence':
      // Handle markdown code fences as text content
      const codeFenceNode = node as any;
      const codeTextNode: TextNode = {
        type: 'Text',
        nodeId: `${codeFenceNode.nodeId || 'codefence'}-text`,
        content: codeFenceNode.content
      };
      env.addNode(codeTextNode);
      return { value: codeFenceNode.content, env };
      
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
          varRef.valueType !== 'varInterpolation' &&
          varRef.valueType !== 'commandRef') {
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
      
      // Handle command references (e.g., @is_true() in conditions)
      if (varRef.valueType === 'commandRef' && isCommandVariable(variable)) {
        // Execute the command
        const cmdVar = variable as CommandVariable;
        const args = varRef.args || [];
        
        // Check the structure - new vs old command variable format
        const definition = cmdVar.definition || cmdVar.value;
        
        if (!definition) {
          throw new Error(`Command variable ${varRef.identifier} has no definition`);
        }
        
        if (definition.type === 'command') {
          // Execute command with interpolated template
          const commandTemplate = (definition as any).commandTemplate || (definition as any).command;
          if (!commandTemplate) {
            throw new Error(`Command ${varRef.identifier} has no command template`);
          }
          
          // Interpolate the command template
          const command = await interpolate(commandTemplate, env);
          
          if (args.length > 0) {
            // TODO: Implement proper argument interpolation
            // For now, just use the command as-is
          }
          
          const stdout = await env.executeCommand(command);
          return {
            value: stdout,
            env,
            stdout: stdout,
            stderr: '',
            exitCode: 0  // executeCommand only returns on success
          };
        } else if (definition.type === 'code') {
          // Execute code with interpolated template
          const codeTemplate = (definition as any).codeTemplate || (definition as any).code;
          if (!codeTemplate) {
            throw new Error(`Code command ${varRef.identifier} has no code template`);
          }
          
          // Interpolate the code template
          const code = await interpolate(codeTemplate, env);
          
          const result = await env.executeCode(
            code,
            (definition as any).language || 'javascript'
          );
          return {
            value: result.stdout || '',
            env,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.exitCode
          };
        }
      }
      
      // Handle complex data variables with lazy evaluation
      const resolvedValue = await resolveVariableValue(variable, env);
      
      // For interpolation variables, we need to add the resolved text to output
      if (varRef.valueType === 'varInterpolation') {
        let stringValue = String(resolvedValue);
        // Handle path objects specially
        if (typeof resolvedValue === 'object' && resolvedValue?.resolvedPath) {
          stringValue = resolvedValue.resolvedPath;
        }
        env.addNode({ type: 'Text', content: stringValue } as any);
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
  nodes: Array<{ type: string; content?: string; name?: string; identifier?: string; fields?: any[]; value?: string }>,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
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
        if (varName === 'PROJECTPATH') {
          parts.push(`@${varName}`);
          continue;
        }
        // TODO: Should we throw in strict mode?
        parts.push(`{{${varName}}}`); // Keep unresolved
        continue;
      }
      
      // Extract value based on variable type using type-safe approach
      let value: any = '';
      if (isTextVariable(variable)) {
        // Text variables contain string content - use directly
        value = variable.value;
      } else if (isDataVariable(variable)) {
        // Handle both simple and complex data variables
        value = await resolveVariableValue(variable, env);
      } else if (isPathVariable(variable)) {
        // For path variables in interpolation, use the resolved path string
        value = variable.value.resolvedPath;
      } else if (isCommandVariable(variable)) {
        // Commands don't interpolate - they need to be run
        value = `[command: ${variable.name}]`;
      } else if (isImportVariable(variable)) {
        // Import variables contain imported data - use their value
        value = variable.value;
      } else {
        // This should never happen with proper typing
        throw new Error(`Unknown variable type for interpolation: ${(variable as any).type}`);
      }
      
      // Handle field access if present
      if (node.fields && node.fields.length > 0 && typeof value === 'object' && value !== null) {
        for (const field of node.fields) {
          if (field.type === 'arrayIndex' || field.type === 'numericField') {
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
      let stringValue: string;
      
      if (value === null) {
        stringValue = 'null';
      } else if (typeof value === 'object' && value.type === 'Null') {
        // Handle null nodes from the grammar
        stringValue = 'null';
      } else if (Array.isArray(value)) {
        // Special handling for arrays in shell command context
        if (context === InterpolationContext.ShellCommand) {
          // For shell commands, expand arrays into space-separated arguments
          // Each element is escaped individually
          const strategy = EscapingStrategyFactory.getStrategy(context);
          const escapedElements = value.map(elem => {
            const elemStr = typeof elem === 'string' ? elem : String(elem);
            return strategy.escape(elemStr);
          });
          stringValue = escapedElements.join(' ');
          // Don't escape again since we already escaped each element
          parts.push(stringValue);
          continue;
        } else {
          // For other contexts, use JSON representation
          stringValue = JSON.stringify(value);
        }
      } else if (typeof value === 'object') {
        // For path objects, try to extract the resolved path first
        if (value.resolvedPath && typeof value.resolvedPath === 'string') {
          stringValue = value.resolvedPath;
        } else {
          stringValue = JSON.stringify(value);
        }
      } else {
        stringValue = String(value);
      }
      
      // Apply context-appropriate escaping
      const strategy = EscapingStrategyFactory.getStrategy(context);
      parts.push(strategy.escape(stringValue));
    }
  }
  
  return parts.join('');
}