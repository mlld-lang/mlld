import type { 
  MlldNode, 
  DirectiveNode, 
  TextNode, 
  CommentNode, 
  MlldDocument, 
  MlldVariable, 
  FrontmatterNode, 
  CommandVariable,
  DataVariable,
  VariableReferenceNode,
  CodeFenceNode,
  NewlineNode,
  ErrorNode,
  LiteralNode,
  DotSeparatorNode,
  PathSeparatorNode,
  SectionMarkerNode,
  ExecInvocation
} from '@core/types';
import type { Environment } from '../env/Environment';
import { evaluateDirective } from '../eval/directive';
import { isTextVariable, isDataVariable, isPathVariable, isCommandVariable, isImportVariable, isExecInvocation } from '@core/types';
import { evaluateDataValue } from '../eval/data-value-evaluator';
import { isFullyEvaluated, collectEvaluationErrors } from '../eval/data-value-evaluator';
import { InterpolationContext, EscapingStrategyFactory } from './interpolation-context';
import { parseFrontmatter } from '../utils/frontmatter-parser';

/**
 * Type for variable values
 */
export type VariableValue = string | number | boolean | null | 
                           VariableValue[] | { [key: string]: VariableValue };

/**
 * Field access types from the AST
 */
interface FieldAccess {
  type: 'field' | 'arrayIndex' | 'numericField';
  name?: string;
  index?: number;
}

/**
 * Safe field access helper
 */
function accessField(value: unknown, field: FieldAccess): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  
  if (field.type === 'arrayIndex' || field.type === 'numericField') {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const index = field.index;
    if (index === undefined || index < 0 || index >= value.length) {
      return undefined;
    }
    return value[index];
  } else if (field.type === 'field') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const name = field.name;
    if (!name) {
      return undefined;
    }
    return (value as Record<string, unknown>)[name];
  }
  
  return undefined;
}

/**
 * Type guards for AST nodes
 */
function isDocument(node: MlldNode): node is DocumentNode {
  return node.type === 'Document';
}

function isDirective(node: MlldNode): node is DirectiveNode {
  return node.type === 'Directive';
}

function isText(node: MlldNode): node is TextNode {
  return node.type === 'Text';
}

function isNewline(node: MlldNode): node is NewlineNode {
  return node.type === 'Newline';
}

function isComment(node: MlldNode): node is CommentNode {
  return node.type === 'Comment';
}

function isFrontmatter(node: MlldNode): node is FrontmatterNode {
  return node.type === 'Frontmatter';
}

function isCodeFence(node: MlldNode): node is CodeFenceNode {
  return node.type === 'CodeFence';
}

function isVariableReference(node: MlldNode): node is VariableReferenceNode {
  return node.type === 'VariableReference';
}

function isError(node: MlldNode): node is ErrorNode {
  return node.type === 'Error';
}

function isLiteral(node: MlldNode): node is LiteralNode {
  return node.type === 'Literal';
}

function isDotSeparator(node: MlldNode): node is DotSeparatorNode {
  return node.type === 'DotSeparator';
}

function isPathSeparator(node: MlldNode): node is PathSeparatorNode {
  return node.type === 'PathSeparator';
}

function isSectionMarker(node: MlldNode): node is SectionMarkerNode {
  return node.type === 'SectionMarker';
}

/**
 * Frontmatter data type
 */
type FrontmatterData = Record<string, unknown> | null;

/**
 * Document node type (if not defined in core types)
 */
interface DocumentNode extends BaseMlldNode {
  type: 'Document';
  nodes: MlldNode[];
}

// Use DocumentNode if MlldDocument is not properly defined
type MlldDocumentType = MlldDocument extends never ? DocumentNode : MlldDocument;

/**
 * Path value type
 */
interface PathValue {
  resolvedPath: string;
}

/**
 * Type guard for path values
 */
function isPathValue(value: unknown): value is PathValue {
  return typeof value === 'object' && 
         value !== null && 
         'resolvedPath' in value &&
         typeof (value as PathValue).resolvedPath === 'string';
}


/**
 * Core evaluation result type
 */
export interface EvalResult {
  value: unknown;
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
    let lastValue: unknown = undefined;
    let lastResult: EvalResult | null = null;
    
    // First, check if the first node is frontmatter and process it
    if (node.length > 0 && isFrontmatter(node[0])) {
      const frontmatterNode = node[0];
      const frontmatterData: FrontmatterData = parseFrontmatter(frontmatterNode.content);
      env.setFrontmatter(frontmatterData);
      
      // Process remaining nodes
      for (let i = 1; i < node.length; i++) {
        const n = node[i];
        const result = await evaluate(n, env);
        lastValue = result.value;
        lastResult = result;
        
        // Add text nodes to output if they're top-level and not inline comments
        if (isText(n)) {
          // Skip inline comments (lines starting with >> or <<)
          if (!n.content.trimStart().match(/^(>>|<<)/)) {
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
        if (isText(n)) {
          // Skip inline comments (lines starting with >> or <<)
          if (!n.content.trimStart().match(/^(>>|<<)/)) {
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
  if (isDocument(node)) {
    return evaluateDocument(node, env);
  }
  
  if (isDirective(node)) {
    return evaluateDirective(node, env);
  }
  
  if (isText(node)) {
    return evaluateText(node, env);
  }
  
  if (isNewline(node)) {
    // Preserve newlines in output
    const newlineTextNode: TextNode = {
      type: 'Text',
      nodeId: `${node.nodeId || 'newline'}-text`,
      content: '\n'
    };
    env.addNode(newlineTextNode);
    return { value: '\n', env };
  }
  
  if (isComment(node)) {
    // Comments are NOT included in output
    // Skip comments - don't add any nodes to output
    return { value: node.content, env };
  }
  
  if (isFrontmatter(node)) {
    // Process frontmatter node
    const frontmatterData: FrontmatterData = parseFrontmatter(node.content);
    env.setFrontmatter(frontmatterData);
    return { value: frontmatterData, env };
  }
  
  if (isCodeFence(node)) {
    // Handle markdown code fences as text content
    const content = node.content;
    const codeTextNode: TextNode = {
      type: 'Text',
      nodeId: `${node.nodeId}-text`,
      content: content
    };
    env.addNode(codeTextNode);
    return { value: content, env };
  }
      
  if (isVariableReference(node)) {
    // Variable references are handled by interpolation in context
    // If we get here, it's likely an error or a grammar bug
    
    // TODO: Remove this workaround when issue #50 is fixed
    // The grammar incorrectly creates top-level VariableReference nodes
    // for parameters in exec directives. These have location offset 0,0
    // which is impossible for real variable references.
    // However, variable interpolation nodes also have offset 0,0 but
    // they have valueType: 'varInterpolation'
    interface LocationWithOffset {
      start?: { offset?: number };
      end?: { offset?: number };
    }
    
    function hasValidLocation(loc: unknown): loc is LocationWithOffset {
      return typeof loc === 'object' && loc !== null && 'start' in loc && 'end' in loc;
    }
    
    const location: unknown = node.location;
    const hasZeroOffset = hasValidLocation(location) &&
                         location.start?.offset === 0 && 
                         location.end?.offset === 0;
    if (hasZeroOffset &&
        node.valueType !== 'varInterpolation' &&
        node.valueType !== 'commandRef') {
      // Skip orphaned parameter references from grammar bug
      return { value: '', env };
    }
    
    // Check if this is a built-in function
    if (node.valueType === 'commandRef') {
      const { isBuiltinFunction, executeBuiltinFunction } = await import('../eval/builtin-functions');
      if (isBuiltinFunction(node.identifier)) {
        // Handle args property safely - it may not exist in the type definition
        const nodeWithArgs = node as { args?: unknown[] };
        const args: unknown[] = nodeWithArgs.args || [];
        const result: unknown = executeBuiltinFunction(node.identifier, args, env);
        return { value: result, env };
      }
    }
    
    const variable = env.getVariable(node.identifier);
    if (!variable) {
      // For interpolation variables, return empty if not found
      if (node.valueType === 'varInterpolation') {
        return { value: `{{${node.identifier}}}`, env };
      }
      throw new Error(`Variable not found: ${node.identifier}`);
    }
    
    // Handle command references (e.g., @is_true() in conditions)
    if (node.valueType === 'commandRef' && isCommandVariable(variable)) {
      // Execute the command
      const args: unknown[] = (node as { args?: unknown[] }).args || [];
      
      // Check the structure - new vs old command variable format
      const definition = (variable as { definition?: unknown }).definition || variable.value;
      
      if (!definition) {
        throw new Error(`Command variable ${node.identifier} has no definition`);
      }
      
      // Type guard for command definition
      if (typeof definition === 'object' && definition !== null && 'type' in definition) {
        const typedDef = definition as { type: string; commandTemplate?: MlldNode[]; codeTemplate?: MlldNode[]; language?: string; command?: MlldNode[]; code?: MlldNode[] };
        
        if (typedDef.type === 'command') {
          // Execute command with interpolated template
          const commandTemplate = typedDef.commandTemplate || typedDef.command;
          if (!commandTemplate) {
            throw new Error(`Command ${node.identifier} has no command template`);
          }
          
          // Interpolate the command template
          const command = await interpolate(commandTemplate as InterpolationNode[], env);
          
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
        } else if (typedDef.type === 'code') {
          // Execute code with interpolated template
          const codeTemplate = typedDef.codeTemplate || typedDef.code;
          if (!codeTemplate) {
            throw new Error(`Code command ${node.identifier} has no code template`);
          }
          
          // Interpolate the code template
          const code = await interpolate(codeTemplate as InterpolationNode[], env);
          
          const result = await env.executeCode(
            code,
            typedDef.language || 'javascript'
          );
          return {
            value: result,
            env,
            stdout: result,
            stderr: '',
            exitCode: 0
          };
        }
      }
    }
    
    // Handle complex data variables with lazy evaluation
    const resolvedValue = await resolveVariableValue(variable, env);
    
    // For interpolation variables, we need to add the resolved text to output
    if (node.valueType === 'varInterpolation') {
      let stringValue = String(resolvedValue);
      // Handle path objects specially
      if (isPathValue(resolvedValue)) {
        stringValue = resolvedValue.resolvedPath;
      }
      const textNode: TextNode = { 
        type: 'Text', 
        nodeId: node.nodeId || 'var-interpolation',
        content: stringValue 
      };
      env.addNode(textNode);
    }
    
    return { value: resolvedValue, env };
  }
  
  if (isExecInvocation(node)) {
    // Import the exec invocation evaluator
    const { evaluateExecInvocation } = await import('../eval/exec-invocation');
    return evaluateExecInvocation(node, env);
  }
  
  // If we get here, it's an unknown node type
  throw new Error(`Unknown node type: ${node.type}`);
}

/**
 * Evaluate a document node (contains multiple child nodes)
 */
async function evaluateDocument(doc: DocumentNode, env: Environment): Promise<EvalResult> {
  let lastValue: unknown = undefined;
  
  // Evaluate each child node in sequence
  for (const child of doc.nodes) {
    const result = await evaluate(child, env);
    lastValue = result.value;
    
    // Add text nodes to output
    if (isText(child)) {
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
export async function resolveVariableValue(variable: MlldVariable, env: Environment): Promise<VariableValue> {
  // Check if this is a complex data variable that needs evaluation
  if (isDataVariable(variable)) {
    // For data variables, check if the value needs evaluation
    const dataValue = variable.value;
    
    // If it's an AST structure (has type property), evaluate it
    if (dataValue && typeof dataValue === 'object' && 'type' in dataValue) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const evaluatedValue = await evaluateDataValue(dataValue as MlldNode, env);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return evaluatedValue;
    }
    
    // Check legacy complex data variable format
    if (typeof variable === 'object' && 'isFullyEvaluated' in variable) {
      interface ComplexDataVariable extends DataVariable {
        isFullyEvaluated?: boolean;
        evaluationErrors?: Record<string, Error>;
      }
      
      const complexVar = variable as ComplexDataVariable;
      
      if (!complexVar.isFullyEvaluated && complexVar.value) {
        // Evaluate the complex data value
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const evaluatedValue = await evaluateDataValue(complexVar.value as MlldNode, env);
          
          // Update the variable with the evaluated value
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          complexVar.value = evaluatedValue;
          complexVar.isFullyEvaluated = true;
          
          // Check for any evaluation errors
          const errors = collectEvaluationErrors(evaluatedValue);
          if (Object.keys(errors).length > 0) {
            complexVar.evaluationErrors = errors;
          }
          
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return evaluatedValue;
        } catch (error) {
          // Store the error but still mark as evaluated to prevent infinite loops
          complexVar.isFullyEvaluated = true;
          complexVar.evaluationErrors = { root: error as Error };
          throw error;
        }
      }
      
      return complexVar.value as VariableValue;
    }
    
    return dataValue as VariableValue;
  }
  
  // Handle other variable types
  if (isTextVariable(variable)) {
    return variable.value;
  }
  
  if (isPathVariable(variable)) {
    return variable.value;
  }
  
  if (isCommandVariable(variable)) {
    return variable.value;
  }
  
  if (isImportVariable(variable)) {
    return variable.value;
  }
  
  // This should never happen with proper typing
  const varType = (variable as Record<string, unknown>).type || 'unknown';
  throw new Error(`Unknown variable type: ${String(varType)}`);
}

/**
 * Type for interpolation nodes
 */
interface InterpolationNode {
  type: string;
  content?: string;
  name?: string;
  identifier?: string;
  fields?: FieldAccess[];
  value?: string;
}

/**
 * String interpolation helper - resolves {{variables}} in content
 */
export async function interpolate(
  nodes: InterpolationNode[],
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
      let value: unknown = '';
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
        const varType = (variable as MlldVariable).type;
        throw new Error(`Unknown variable type for interpolation: ${varType}`);
      }
      
      // Handle field access if present
      if (node.fields && node.fields.length > 0 && typeof value === 'object' && value !== null) {
        for (const field of node.fields) {
          value = accessField(value, field);
          
          // Handle null nodes from the grammar
          if (value && typeof value === 'object' && 'type' in value) {
            const nodeValue = value as Record<string, unknown>;
            if (nodeValue.type === 'Null') {
              value = null;
            }
          }
          
          if (value === undefined) break;
        }
      }
      
      // Convert final value to string
      let stringValue: string;
      
      if (value === null) {
        stringValue = 'null';
      } else if (typeof value === 'object' && 'type' in value) {
        const nodeValue = value as Record<string, unknown>;
        if (nodeValue.type === 'Null') {
          // Handle null nodes from the grammar
          stringValue = 'null';
        } else {
          stringValue = JSON.stringify(value);
        }
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
        if (isPathValue(value)) {
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
    } else if (node.type === 'ExecInvocation') {
      // Handle exec invocation nodes in interpolation
      const { evaluateExecInvocation } = await import('../eval/exec-invocation');
      const result = await evaluateExecInvocation(node as ExecInvocation, env);
      const stringValue = String(result.value);
      
      // Apply context-appropriate escaping
      const strategy = EscapingStrategyFactory.getStrategy(context);
      parts.push(strategy.escape(stringValue));
    }
  }
  
  return parts.join('');
}