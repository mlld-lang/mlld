import type { 
  MlldNode, 
  DirectiveNode, 
  TextNode, 
  CommentNode, 
  MlldDocument, 
  FrontmatterNode, 
  VariableReferenceNode,
  CodeFenceNode,
  NewlineNode,
  ErrorNode,
  LiteralNode,
  DotSeparatorNode,
  PathSeparatorNode,
  SectionMarkerNode,
  ExecInvocation,
  BaseMlldNode,
  FileReferenceNode,
  FieldAccessNode,
  CondensedPipe
} from '@core/types';
import type { Variable } from '@core/types/variable';
import type { LoadContentResult } from '@core/types/load-content';
import type { Environment } from '../env/Environment';
import { evaluateDirective } from '../eval/directive';
import { isExecInvocation } from '@core/types';
import { evaluateDataValue, isFullyEvaluated, collectEvaluationErrors } from '../eval/data-value-evaluator';
import { InterpolationContext, EscapingStrategyFactory } from './interpolation-context';
import { parseFrontmatter } from '../utils/frontmatter-parser';
import { interpreterLogger as logger } from '@core/utils/logger';

/**
 * Type for variable values
 */
export type VariableValue = string | number | boolean | null | 
                           VariableValue[] | { [key: string]: VariableValue };

/**
 * Field access types from the AST
 */
interface FieldAccess {
  type: 'field' | 'arrayIndex' | 'numericField' | 'stringIndex';
  value: string | number;
}

/**
 * Safe field access helper
 */
function accessField(value: unknown, field: FieldAccess): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }
  
  if (field.type === 'arrayIndex') {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const index = Number(field.value);
    if (isNaN(index) || index < 0 || index >= value.length) {
      return undefined;
    }
    return value[index];
  } else if (field.type === 'field' || field.type === 'stringIndex' || field.type === 'numericField') {
    if (typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const name = String(field.value);
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

function isMlldRunBlock(node: MlldNode): node is MlldRunBlockNode {
  return node.type === 'MlldRunBlock';
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

/**
 * MlldRunBlock node type
 */
interface MlldRunBlockNode extends BaseMlldNode {
  type: 'MlldRunBlock';
  content: MlldNode[];
  raw: string;
  error?: string;
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
        
        // Add ALL nodes to output to preserve document structure
        // Directives that produce output (like @add) will add their own nodes
        // Everything else gets added as-is
        if (!isDirective(n)) {
          // Skip inline comments (lines starting with >> or <<)
          if (isText(n) && n.content.trimStart().match(/^(>>|<<)/)) {
            continue;
          }
          // Skip comment nodes
          if (isComment(n)) {
            logger.debug('Skipping comment node:', { content: n.content });
            continue;
          }
          env.addNode(n);
        }
      }
    } else {
      // No frontmatter, process all nodes normally
      for (const n of node) {
        const result = await evaluate(n, env);
        lastValue = result.value;
        lastResult = result;
        
        // Add ALL nodes to output to preserve document structure
        // Directives that produce output (like @add) will add their own nodes
        // Everything else gets added as-is
        if (!isDirective(n)) {
          // Skip inline comments (lines starting with >> or <<)
          if (isText(n) && n.content.trimStart().match(/^(>>|<<)/)) {
            continue;
          }
          // Skip comment nodes
          if (isComment(n)) {
            logger.debug('Skipping comment node:', { content: n.content });
            continue;
          }
          env.addNode(n);
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
    // Newline nodes are already added by the array processing logic
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
    // Code fence nodes are already added by the array processing logic
    return { value: node.content, env };
  }
  
  if (isMlldRunBlock(node)) {
    // Handle mlld-run blocks by evaluating their content
    if (node.error) {
      // If there was a parse error, output it as text
      const errorTextNode: TextNode = {
        type: 'Text',
        nodeId: `${node.nodeId}-error`,
        content: `Error in mlld-run block: ${node.error}`
      };
      env.addNode(errorTextNode);
      return { value: node.error, env };
    }
    
    // Evaluate the parsed content
    const result = await evaluate(node.content, env);
    return result;
  }
      
  if (isVariableReference(node)) {
    // Variable references are handled by interpolation in context
    // If we get here, it's likely an error or a grammar bug
    
    // TODO: Remove this workaround when issue #50 is fixed
    // The grammar incorrectly creates top-level VariableReference nodes
    // for parameters in exec directives. These have location offset 0,0
    // which is impossible for real variable references.
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
        node.valueType !== 'commandRef' &&
        node.valueType !== 'varIdentifier') {
      // Skip orphaned parameter references from grammar bug
      // Note: varIdentifier is excluded because when conditions create these
      // See issue #217 - this workaround prevents when conditions from working
      return { value: '', env };
    }
    
    // Built-in functions removed - use @exec to define custom functions instead
    
    let variable = env.getVariable(node.identifier);
    
    // Check if this is a resolver variable that needs async resolution
    if (!variable && env.hasVariable(node.identifier)) {
      // Try to get it as a resolver variable
      const resolverVar = await env.getResolverVariable(node.identifier);
      if (resolverVar) {
        variable = resolverVar;
      }
    }
    
    if (!variable) {
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
    // Use enhanced resolution to preserve Variable context for field access
    const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
    let resolvedValue = await resolveVariable(variable, env, ResolutionContext.FieldAccess);
    
    // Handle field access if present
    if (node.fields && node.fields.length > 0) {
      const { accessFieldEnhanced } = await import('../utils/field-access-enhanced');
      
      // Apply each field access in sequence
      for (const field of node.fields) {
        // Handle variableIndex type - need to resolve the variable first
        if (field.type === 'variableIndex') {
          const indexVar = env.getVariable(field.value);
          if (!indexVar) {
            throw new Error(`Variable not found for index: ${field.value}`);
          }
          // Get the actual value to use as index
          let indexValue = indexVar.value;
          if (typeof indexValue === 'object' && indexValue !== null && 'value' in indexValue) {
            indexValue = indexValue.value;
          }
          // Create a new field with the resolved value
          const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
          const fieldResult = accessFieldEnhanced(resolvedValue, resolvedField);
          resolvedValue = fieldResult.value;
        } else {
          const fieldResult = accessFieldEnhanced(resolvedValue, field);
          resolvedValue = fieldResult.value;
        }
        if (resolvedValue === undefined) break;
      }
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
    // VariableReference nodes are handled consistently through interpolate()
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
export async function resolveVariableValue(variable: Variable, env: Environment): Promise<VariableValue> {
  // Import type guards for the new Variable type system
  const {
    isTextLike,
    isStructured,
    isPath,
    isPipelineInput,
    isExecutable,
    isExecutableVariable,
    isImported,
    isComputed,
    isObject,
    isArray,
    isPrimitive
  } = await import('@core/types/variable');
  
  // Type-specific resolution using new type guards
  if (isPrimitive(variable)) {
    // Primitive variables return their raw value (number, boolean, null)
    return variable.value;
  } else if (isTextLike(variable)) {
    // All text-producing types return their string value directly
    return variable.value;
  } else if (isStructured(variable)) {
    // Object and array variables
    const complexFlag = (variable as any).isComplex;
    
    // Debug logging for object resolution
    if (process.env.DEBUG_EXEC) {
      logger.debug('resolveVariableValue for structured variable:', {
        variableName: variable.name,
        variableType: variable.type,
        isComplex: complexFlag,
        valueType: typeof variable.value,
        hasTypeProperty: variable.value && typeof variable.value === 'object' && 'type' in variable.value
      });
    }
    
    
    if (complexFlag) {
      // Complex data needs evaluation
      
      const evaluatedValue = await evaluateDataValue(variable.value, env);
      
      // Debug logging
      
      return evaluatedValue;
    }
    
    // Don't clean namespace objects here - they need to remain as objects
    // for field access to work. Cleaning should only happen during display.
    
    return variable.value;
  } else if (isPath(variable)) {
    // Path variables return the resolved path string
    return variable.value.resolvedPath;
  } else if (isPipelineInput(variable)) {
    // Pipeline inputs return the text representation by default
    return variable.value.text;
  } else if (isExecutableVariable(variable)) {
    // Auto-execute executables when interpolated
    if (process.env.DEBUG_EXEC) {
      logger.debug('Auto-executing executable during interpolation:', { name: variable.name });
    }
    const { evaluateExecInvocation } = await import('../eval/exec-invocation');
    const invocation = {
      type: 'ExecInvocation',
      commandRef: {
        identifier: variable.name,
        args: []
      }
    };
    const result = await evaluateExecInvocation(invocation as any, env);
    return result.value;
  } else if (isImported(variable)) {
    return variable.value;
  } else if (isComputed(variable)) {
    return variable.value;
  }
  
  // Fallback - should not reach here with proper typing
  return variable.value;
}

/**
 * Clean up namespace objects for display
 * Shows only frontmatter and exported variables, not internal structure
 */
export function cleanNamespaceForDisplay(namespaceObject: any): string {
  const cleaned: any = {
    frontmatter: {},
    exports: {
      variables: {},
      executables: {}
    }
  };
  
  // Add frontmatter if present
  const fm = namespaceObject.fm || namespaceObject.frontmatter || namespaceObject.__meta__;
  if (fm && Object.keys(fm).length > 0) {
    cleaned.frontmatter = fm;
  }
  
  // Separate variables and executables
  const internalFields = ['fm', 'frontmatter', '__meta__'];
  let hasExports = false;
  
  for (const [key, value] of Object.entries(namespaceObject)) {
    if (!internalFields.includes(key)) {
      hasExports = true;
      // Check if it's an executable
      if (value && typeof value === 'object' && (value as any).__executable) {
        const params = (value as any).paramNames || [];
        cleaned.exports.executables[key] = `<function(${params.join(', ')})>`;
      } else if (value && typeof value === 'object' && value.type === 'executable') {
        // Alternative executable format
        const def = value.value || value.definition;
        const params = def?.paramNames || [];
        cleaned.exports.executables[key] = `<function(${params.join(', ')})>`;
      } else {
        // Regular variable - extract just the value, not the whole AST
        if (value && typeof value === 'object' && value.value !== undefined) {
          // This is a Variable object with a value property
          cleaned.exports.variables[key] = value.value;
        } else {
          // Direct value
          cleaned.exports.variables[key] = value;
        }
      }
    }
  }
  
  // If namespace is completely empty, return {}
  const hasFrontmatter = fm && Object.keys(fm).length > 0;
  if (!hasFrontmatter && !hasExports) {
    return '{}';
  }
  
  // Remove empty frontmatter if no data
  if (!hasFrontmatter) {
    delete cleaned.frontmatter;
  }
  
  // Pretty print the JSON with 2-space indentation
  return JSON.stringify(cleaned, null, 2);
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
  commandRef?: any;
  withClause?: any;
  pipes?: any[];
}

/**
 * String interpolation helper - resolves {{variables}} in content
 */
export async function interpolate(
  nodes: InterpolationNode[],
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  logger.info('[INTERPOLATE] interpolate() called');
  
  // Handle non-array inputs
  if (!Array.isArray(nodes)) {
    if (typeof nodes === 'string') {
      return nodes;
    }
    if (nodes && typeof nodes === 'object' && 'content' in nodes) {
      return nodes.content || '';
    }
    return String(nodes || '');
  }
  
  const parts: string[] = [];
  
  for (const node of nodes) {
    
    if (node.type === 'Text') {
      // Handle Text nodes - directly use string content
      parts.push(node.content || '');
    } else if (node.type === 'PathSeparator') {
      parts.push(node.value || '/');
    } else if (node.type === 'ExecInvocation') {
      // Handle function calls in templates
      const { evaluateExecInvocation } = await import('../eval/exec-invocation');
      const result = await evaluateExecInvocation(node as any, env);
      parts.push(String(result.value));
    } else if (node.type === 'InterpolationVar') {
      // Handle {{var}} style interpolation (from triple colon templates)
      const varName = node.identifier || node.name;
      if (!varName) continue;
      
      let variable = env.getVariable(varName);
      
      // Check if this is a resolver variable that needs async resolution
      if (!variable && env.hasVariable(varName)) {
        // Try to get it as a resolver variable
        const resolverVar = await env.getResolverVariable(varName);
        if (resolverVar) {
          variable = resolverVar;
        }
      }
      
      if (!variable) {
        if (process.env.MLLD_DEBUG === 'true') {
          logger.debug('Variable not found during {{var}} interpolation:', { varName });
        }
        parts.push(`{{${varName}}}`); // Keep unresolved with {{}} syntax
        continue;
      }
      
      // Resolve the variable value
      const value = await resolveVariableValue(variable, env);
      
      // Convert final value to string
      let stringValue: string;
      if (value === null) {
        stringValue = 'null';
      } else if (value === undefined) {
        stringValue = '';
      } else if (typeof value === 'object') {
        stringValue = JSON.stringify(value);
        if (process.env.MLLD_DEBUG === 'true') {
        }
      } else {
        stringValue = String(value);
      }
      
      parts.push(stringValue);
      logger.debug('[INTERPOLATE] Pushed to parts:', { stringValue, partsLength: parts.length });
    } else if (node.type === 'VariableReference') {
      const varName = node.identifier || node.name;
      
      if (!varName) {
        continue;
      }
      
      let variable = env.getVariable(varName);
      
      if (variable) {
      }
      
      // Check if this is a resolver variable that needs async resolution
      if (!variable && env.hasVariable(varName)) {
        // Try to get it as a resolver variable
        const resolverVar = await env.getResolverVariable(varName);
        if (resolverVar) {
          variable = resolverVar;
        }
      }
      
      
      if (!variable) {
        if (process.env.MLLD_DEBUG === 'true') {
          logger.debug('Variable not found during interpolation:', { varName });
        }
        parts.push(`@${varName}`); // Keep unresolved with @ symbol
        continue;
      }
      
      // Extract value based on variable type using new type guards
      let value: unknown = '';
      
      // Import isExecutableVariable dynamically
      const { isExecutableVariable } = await import('@core/types/variable');
      
      // Special handling for executable variables with field access
      if (isExecutableVariable(variable) && node.fields && node.fields.length > 0) {
        // For executable variables with field access, we need to handle it specially
        // The test expects executables to have a 'type' property that returns 'executable'
        const field = node.fields[0];
        if (field.type === 'field' && field.value === 'type') {
          value = 'executable';
          // Skip the rest of field processing since we handled it
          node.fields = node.fields.slice(1);
        } else {
          // For other fields on executables, throw a more helpful error
          throw new Error(`Cannot access field '${field.value}' on executable ${variable.name}. Executables can only be invoked.`);
        }
      } else {
        // Use the already imported resolveVariableValue function
        try {
          if (process.env.MLLD_DEBUG === 'true') {
          }
          value = await resolveVariableValue(variable, env);
          
        } catch (error) {
          // Handle executable variables specially in interpolation
          if (error instanceof Error && error.message.includes('Cannot interpolate executable')) {
            if (context === InterpolationContext.Default) {
              logger.warn(`Referenced executable '@${variable.name}' without calling it. Did you mean to use @${variable.name}() instead?`);
            }
            value = `[executable: ${variable.name}]`;
          } else {
            throw error;
          }
        }
      }
      
      // Debug logging
      if (process.env.MLLD_DEBUG === 'true') {
      }
      
      // Special handling for lazy reserved variables like DEBUG
      if (value === null && variable.metadata?.isReserved && variable.metadata?.isLazy) {
        // Need to resolve this as a resolver variable
        const resolverVar = await env.getResolverVariable(varName);
        if (resolverVar && resolverVar.value !== null) {
          value = resolverVar.value;
        }
      }
      
      // Handle field access if present
      if (node.fields && node.fields.length > 0 && typeof value === 'object' && value !== null) {
        const { accessFieldEnhanced } = await import('../utils/field-access-enhanced');
        for (const field of node.fields) {
          // Handle variableIndex type - need to resolve the variable first
          if (field.type === 'variableIndex') {
            const indexVar = env.getVariable(field.value);
            if (!indexVar) {
              throw new Error(`Variable not found for index: ${field.value}`);
            }
            // Get the actual value to use as index
            let indexValue = indexVar.value;
            if (typeof indexValue === 'object' && indexValue !== null && 'value' in indexValue) {
              indexValue = indexValue.value;
            }
            // Create a new field with the resolved value
            const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
            const fieldResult = accessFieldEnhanced(value, resolvedField);
            value = fieldResult.value;
          } else {
            const fieldResult = accessFieldEnhanced(value, field);
            value = fieldResult.value;
          }
          
          // Handle null nodes from the grammar
          if (value && typeof value === 'object' && 'type' in value) {
            const nodeValue = value as Record<string, unknown>;
            if (nodeValue.type === 'Null') {
              value = null;
            } else if (nodeValue.type === 'runExec' || nodeValue.type === 'ExecInvocation' || 
                       nodeValue.type === 'command' || nodeValue.type === 'code' ||
                       nodeValue.type === 'VariableReference' || nodeValue.type === 'path') {
              // This is an unevaluated AST node from a complex object
              // We need to evaluate it
              value = await evaluateDataValue(value, env);
            }
          }
          
          if (value === undefined) break;
        }
      }
      
      // Apply condensed pipes if present
      if (node.pipes && node.pipes.length > 0) {
        value = await applyCondensedPipes(value, node.pipes, env);
      }
      
      // Convert final value to string
      let stringValue: string;
      
      
      if (value === null) {
        stringValue = 'null';
      } else if (typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
        // Handle wrapped strings (quotes, backticks, brackets)
        stringValue = await interpolate(value.content as InterpolationNode[], env, context);
      } else if (typeof value === 'object' && 'type' in value) {
        const nodeValue = value as Record<string, unknown>;
        if (process.env.MLLD_DEBUG === 'true') {
        }
        
        // Check if this is a complex array that needs evaluation
        if (nodeValue.type === 'array' && 'items' in nodeValue) {
          // This is an unevaluated complex array!
          if (process.env.MLLD_DEBUG === 'true') {
          }
          const evaluatedArray = await evaluateDataValue(value, env);
          if (process.env.MLLD_DEBUG === 'true') {
          }
          // Now handle it as a regular array
          if (Array.isArray(evaluatedArray)) {
            const { JSONFormatter } = await import('./json-formatter');
            stringValue = JSONFormatter.stringify(evaluatedArray);
          } else {
            stringValue = String(evaluatedArray);
          }
        } else if (nodeValue.type === 'Null') {
          // Handle null nodes from the grammar
          stringValue = 'null';
        } else {
          stringValue = JSON.stringify(value);
          if (process.env.MLLD_DEBUG === 'true') {
          }
        }
      } else if (Array.isArray(value)) {
        // Check if this is a LoadContentResultArray first
        const { isLoadContentResultArray, isRenamedContentArray } = await import('@core/types/load-content');
        
        // Debug logging
        if (process.env.MLLD_DEBUG === 'true') {
        }
        
        
        if (isLoadContentResultArray(value)) {
          // For LoadContentResultArray, use its .content getter (which concatenates all content)
          stringValue = value.content;
        } else if (isRenamedContentArray(value) && 'content' in value) {
          // For RenamedContentArray (from alligator glob with renaming), use its .content getter
          stringValue = value.content;
        } else if (context === InterpolationContext.ShellCommand) {
          // Special handling for arrays in shell command context
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
          // For other contexts, use JSON representation with custom replacer
          // Note: No indentation for template interpolation - keep it compact
          const { JSONFormatter } = await import('./json-formatter');
          stringValue = JSONFormatter.stringify(value);
        }
      } else if (typeof value === 'object') {
        // Check if this is a LoadContentResult - use its content
        const { isLoadContentResult, isLoadContentResultArray, isRenamedContentArray } = await import('@core/types/load-content');
        if (isLoadContentResult(value)) {
          stringValue = value.content;
        } else if (isLoadContentResultArray(value)) {
          // For array of LoadContentResult, concatenate content with double newlines
          stringValue = value.map(item => item.content).join('\n\n');
        } else if (variable && variable.metadata?.isNamespace && node.fields?.length === 0) {
          // Check if this is a namespace object (only if no field access)
          const { JSONFormatter } = await import('./json-formatter');
          stringValue = JSONFormatter.stringifyNamespace(value);
        } else if (value.__executable) {
          // This is a raw executable object (from field access on namespace)
          const params = value.paramNames || [];
          stringValue = `<function(${params.join(', ')})>`;
        } else {
          // For path objects, try to extract the resolved path first
          if (isPathValue(value)) {
            stringValue = value.resolvedPath;
          } else {
            // For objects, use compact JSON in templates (no indentation)
            const { JSONFormatter } = await import('./json-formatter');
            stringValue = JSONFormatter.stringify(value);
          }
        }
      } else {
        stringValue = String(value);
      }
      
      
      // Apply context-appropriate escaping
      const strategy = EscapingStrategyFactory.getStrategy(context);
      const escapedValue = strategy.escape(stringValue);
      
      if (process.env.MLLD_DEBUG === 'true' && node.identifier) {
      }
      
      parts.push(escapedValue);
    } else if (node.type === 'ExecInvocation') {
      // Handle exec invocation nodes in interpolation
      const { evaluateExecInvocation } = await import('../eval/exec-invocation');
      const result = await evaluateExecInvocation(node as ExecInvocation, env);
      const stringValue = String(result.value);
      
      // Apply context-appropriate escaping
      const strategy = EscapingStrategyFactory.getStrategy(context);
      parts.push(strategy.escape(stringValue));
    } else if (node.type === 'FileReference') {
      // Handle file reference interpolation
      const result = await interpolateFileReference(node as any, env, context);
      parts.push(result);
    }
  }
  
  const result = parts.join('');
  
  return result;
}

/**
 * Interpolate file reference nodes (<file.md>) with optional field access and pipes
 */
async function interpolateFileReference(
  node: FileReferenceNode,
  env: Environment,
  context: InterpolationContext
): Promise<string> {
  const { FileReferenceNode } = await import('@core/types');
  
  // Special handling for <> placeholder in 'as' contexts
  if (node.meta?.isPlaceholder) {
    // Get current file from iteration context
    const currentFile = env.getCurrentIterationFile?.();
    if (!currentFile) {
      throw new Error('<> can only be used in "as" template contexts');
    }
    return processFileFields(currentFile, node.fields, node.pipes, env);
  }
  
  // Process the path (may contain variables)
  let resolvedPath: string;
  if (typeof node.source === 'string') {
    resolvedPath = node.source;
  } else if (node.source.raw) {
    resolvedPath = node.source.raw;
  } else if (node.source.segments) {
    resolvedPath = await interpolate(node.source.segments, env);
  } else {
    resolvedPath = await interpolate([node.source], env);
  }
  
  // Check if file interpolation is enabled
  if (!env.isFileInterpolationEnabled()) {
    throw new Error('File interpolation disabled by security policy');
  }
  
  // Check circular reference
  if (env.isInInterpolationStack(resolvedPath)) {
    console.error(`Warning: Circular reference detected - '${resolvedPath}' references itself, skipping`);
    return '';  // Return empty string and continue
  }
  
  // Add to stack
  env.pushInterpolationStack(resolvedPath);
  
  try {
    // Use existing content loader
    const { processContentLoader } = await import('../eval/content-loader');
    const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
    
    let loadResult: any;
    try {
      // If we already have a resolved path (from variable interpolation), create a simple path source
      const sourceToUse = resolvedPath !== node.source?.raw ? 
        { type: 'path', raw: resolvedPath, segments: [{ type: 'Text', content: resolvedPath }] } : 
        node.source;
      
      loadResult = await processContentLoader({
        type: 'load-content',
        source: sourceToUse
      }, env);
    } catch (error: any) {
      // Handle file not found or access errors gracefully by returning empty string
      if (error.code === 'ENOENT') {
        console.error(`Warning: File not found - '${resolvedPath}'`);
        return '';
      } else if (error.code === 'EACCES') {
        console.error(`Warning: Permission denied - '${resolvedPath}'`);
        return '';
      } else {
        console.error(`Warning: Failed to load file '${resolvedPath}': ${error.message}`);
        return '';
      }
    }
    
    // Handle glob results (array of files)
    if (isLoadContentResultArray(loadResult)) {
      // For glob patterns, join all file contents
      const contents = await Promise.all(
        loadResult.map(file => processFileFields(file, node.fields, node.pipes, env))
      );
      return contents.join('\n\n');
    }
    
    // Process field access and pipes
    return processFileFields(loadResult, node.fields, node.pipes, env);
  } finally {
    // Remove from stack
    env.popInterpolationStack(resolvedPath);
  }
}

/**
 * Process field access and pipes on file content
 */
async function processFileFields(
  content: LoadContentResult | LoadContentResult[],
  fields?: FieldAccessNode[],
  pipes?: CondensedPipe[],
  env: Environment
): Promise<string> {
  const { isLoadContentResult } = await import('@core/types/load-content');
  let result: any = content;
  
  // Extract content from LoadContentResult
  if (isLoadContentResult(result)) {
    result = result.content;
    
    // Try to parse JSON if it looks like JSON and we have fields to access
    if (fields && fields.length > 0 && typeof result === 'string') {
      const trimmed = result.trim();
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || 
          (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try {
          result = JSON.parse(trimmed);
        } catch (e) {
          // Not valid JSON, keep as string
        }
      }
    }
  }
  
  // Process field access
  if (fields && fields.length > 0) {
    // Use enhanced field access for better error messages
    const { accessFieldEnhanced } = await import('../utils/field-access-enhanced');
    for (const field of fields) {
      try {
        const fieldResult = accessFieldEnhanced(result, field);
        result = fieldResult.value;
        if (result === undefined) {
          // Warning to stderr
          console.error(`Warning: field '${field.value}' not found`);
          return '';
        }
      } catch (error) {
        // Field not found - log warning and return empty string for backward compatibility
        console.error(`Warning: field '${field.value}' not found`);
        return '';
      }
    }
  }
  
  // Apply pipes
  if (pipes && pipes.length > 0) {
    result = await applyCondensedPipes(result, pipes, env);
    // Pipes already handle conversion to string format, so return as-is
    return String(result);
  }
  
  // Convert to string only if no pipes were applied
  return typeof result === 'string' ? result : JSON.stringify(result);
}

/**
 * Apply condensed pipe transformations
 */
export async function applyCondensedPipes(
  value: any,
  pipes: CondensedPipe[],
  env: Environment
): Promise<any> {
  let result = value;
  
  for (const pipe of pipes) {
    // Handle both 'name' and 'transform' properties for backward compatibility
    const pipeName = pipe.name || pipe.transform;
    if (!pipeName) {
      throw new Error('Pipe missing transform name');
    }
    
    // Get transform from environment
    const transform = env.getTransform?.(pipeName) || env.getVariable(pipeName);
    if (!transform) {
      throw new Error(`Unknown transform: @${pipeName}`);
    }
    
    try {
      // Apply transform
      if (typeof transform === 'function') {
        result = await transform(result, ...(pipe.args || []));
      } else if (transform && typeof transform === 'object') {
        // Check for builtin transformer
        if (transform.metadata?.isBuiltinTransformer && transform.metadata?.transformerImplementation) {
          const impl = transform.metadata.transformerImplementation;
          // Convert the value to string - handle objects properly
          const stringValue = typeof result === 'string' ? result : JSON.stringify(result);
          result = await impl(stringValue);
        } else if (transform.type === 'executable' || '__executable' in transform) {
          // Handle executable variables as transforms
          const { evaluateExecInvocation } = await import('../eval/exec-invocation');
          // Create a Text node for the pipeline input value
          const inputTextNode = {
            type: 'Text',
            content: String(result)
          };
          // Create an ExecInvocation node to execute the transform
          const execInvocationNode = {
            type: 'ExecInvocation',
            commandRef: {
              type: 'CommandReference',
              identifier: pipeName,
              args: [inputTextNode, ...(pipe.args || [])]
            }
          };
          const execResult = await evaluateExecInvocation(
            execInvocationNode as any,
            env
          );
          result = execResult.value;
        } else {
          throw new Error(`@${pipeName} is not a valid transform function`);
        }
      } else {
        throw new Error(`@${pipeName} is not a valid transform function`);
      }
    } catch (error: any) {
      throw new Error(`Error in pipe @${pipeName}: ${error.message}`);
    }
  }
  
  return result;
}
