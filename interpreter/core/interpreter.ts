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
import type { VarAssignmentResult } from '../eval/var';
import { isExecInvocation, isLiteralNode } from '@core/types';
import { evaluateDataValue, isFullyEvaluated, collectEvaluationErrors } from '../eval/data-value-evaluator';
import { InterpolationContext, EscapingStrategyFactory } from './interpolation-context';
import { parseFrontmatter } from '../utils/frontmatter-parser';
import type { OperationContext } from '../env/ContextManager';
import { interpreterLogger as logger } from '@core/utils/logger';
import { asText, assertStructuredValue, isStructuredValue } from '@interpreter/utils/structured-value';
import { normalizeSecurityDescriptor, type SecurityDescriptor } from '@core/types/security';
import { classifyShellValue } from '@interpreter/utils/shell-value';
import * as shellQuote from 'shell-quote';

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
 * Evaluation context options
 */
export interface EvaluationContext {
  /** Whether we're evaluating a condition (affects field access behavior) */
  isCondition?: boolean;
  /** Whether we're evaluating an expression (affects variable resolution) */
  isExpression?: boolean;
  /** Pre-evaluated directive inputs supplied by hook extraction */
  extractedInputs?: readonly unknown[];
  /** Operation context captured for the active directive */
  operationContext?: OperationContext;
  /** Precomputed /var assignment (Phase C guard runner) */
  precomputedVarAssignment?: VarAssignmentResult;
}

/**
 * Main recursive evaluation function.
 * This is the heart of the interpreter - it walks the AST and evaluates each node.
 */
export async function evaluate(node: MlldNode | MlldNode[], env: Environment, context?: EvaluationContext): Promise<EvalResult> {
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
        const result = await evaluate(n, env, context);
        lastValue = result.value;
        lastResult = result;
        
        // Emit effects for non-directive nodes to preserve document structure
        // Skip effect emission when evaluating expressions (they're not document content)
        if (!isDirective(n) && !context?.isExpression) {
          // Skip inline comments (lines starting with >> or <<)
          if (isText(n) && n.content.trimStart().match(/^(>>|<<)/)) {
            continue;
          }
          // Skip comment nodes
          if (isComment(n)) {
            logger.debug('Skipping comment node:', { content: n.content });
            continue;
          }
          // Emit a 'doc' effect for non-directive nodes (only goes to document, not stdout)
          if (isText(n)) {
            env.emitEffect('doc', n.content);
          } else if (isNewline(n)) {
            env.emitEffect('doc', '\n');
          } else if (isCodeFence(n)) {
            env.emitEffect('doc', n.content);
          } else if (isMlldRunBlock(n) && !n.error) {
            // MlldRunBlock content is evaluated, not emitted directly
            // The evaluation will emit its own effects
          } else if ('wrapperType' in n && 'content' in n) {
            // Template structures are intermediate nodes, not document content
            // They get evaluated but shouldn't be emitted as effects
          } else {
            // For other node types, emit their content as 'doc' effect
            // Skip other node types - they're AST nodes, not document content
            // This includes ExecInvocation, VariableReference, Literal, etc.
            // These are intermediate representations that get evaluated but not emitted
            logger.debug('Skipping non-document node type:', { type: (n as any).type });
          }
        }
        
        // Add all nodes to environment for document reconstruction
        // This enables /output directive to recreate the complete document
        if (!context?.isExpression) {
          env.addNode(n);
        }
      }
    } else {
      // No frontmatter, process all nodes normally
      for (const n of node) {
        const result = await evaluate(n, env, context);
        lastValue = result.value;
        lastResult = result;
        
        // Add all nodes to environment for document reconstruction
        // This enables /output directive to recreate the complete document
        if (!context?.isExpression) {
          env.addNode(n);
        }
        
        // Emit effects for non-directive nodes to preserve document structure
        // Skip effect emission when evaluating expressions (they're not document content)
        if (!isDirective(n) && !context?.isExpression) {
          // Skip inline comments (lines starting with >> or <<)
          if (isText(n) && n.content.trimStart().match(/^(>>|<<)/)) {
            continue;
          }
          // Skip comment nodes
          if (isComment(n)) {
            logger.debug('Skipping comment node:', { content: n.content });
            continue;
          }
          // Emit a 'doc' effect for non-directive nodes (only goes to document, not stdout)
          if (isText(n)) {
            env.emitEffect('doc', n.content);
          } else if (isNewline(n)) {
            env.emitEffect('doc', '\n');
          } else if (isCodeFence(n)) {
            env.emitEffect('doc', n.content);
          } else if (isMlldRunBlock(n) && !n.error) {
            // MlldRunBlock content is evaluated, not emitted directly
            // The evaluation will emit its own effects
          } else if ('wrapperType' in n && 'content' in n) {
            // Template structures are intermediate nodes, not document content
            // They get evaluated but shouldn't be emitted as effects
          } else {
            // For other node types, emit their content as 'doc' effect
            // Skip other node types - they're AST nodes, not document content
            // This includes ExecInvocation, VariableReference, Literal, etc.
            // These are intermediate representations that get evaluated but not emitted
            logger.debug('Skipping non-document node type:', { type: (n as any).type });
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
  
  // Handle all template/quote structures from unified patterns
  // These have either content or values.content arrays that need interpolation
  if (!Array.isArray(node) && node && typeof node === 'object') {
    // Check for template structures with content to interpolate
    let contentToInterpolate = null;
    
    // Pattern 1: Direct content with wrapperType (from UnifiedQuoteOrTemplate)
    if ('content' in node && Array.isArray(node.content) && 'wrapperType' in node && !node.type) {
      contentToInterpolate = node.content;
    }
    // Pattern 2: Template nodes with type field (from TemplateCore and directives)
    else if (node.type === 'template' && node.values?.content && Array.isArray(node.values.content)) {
      contentToInterpolate = node.values.content;
    }
    // Pattern 3: Template nodes with direct content field
    else if (node.type === 'template' && node.content && Array.isArray(node.content)) {
      contentToInterpolate = node.content;
    }
    
    if (contentToInterpolate) {
      const interpolated = await interpolate(contentToInterpolate, env);
      return { value: interpolated, env };
    }
  }
  
  if (isDocument(node)) {
    return evaluateDocument(node, env);
  }
  
  if (isDirective(node)) {
    return evaluateDirective(node, env, context);
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
    // Emit code fence content as 'doc' effect
    env.emitEffect('doc', node.content);
    return { value: node.content, env };
  }
  
  if (isMlldRunBlock(node)) {
    // Handle mlld-run blocks by evaluating their content
    if (node.error) {
      // If there was a parse error, output it as text
      // Emit error as a 'doc' effect
      env.emitEffect('doc', `Error in mlld-run block: ${node.error}`);
      return { value: node.error, env };
    }
    
    // Evaluate the parsed content
    const result = await evaluate(node.content, env, context);
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
        node.valueType !== 'varIdentifier' &&
        // Allow ambient @ctx to resolve even if parser produced zero offsets
        node.identifier !== 'ctx') {
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
      // In expression context, return undefined for missing variables
      if (context?.isExpression) {
        return { value: undefined, env };
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
    
    /**
     * Preserve Variable wrapper for field access operations
     * WHY: Field access needs Variable metadata to properly resolve complex data
     *      structures and maintain access path information
     */
    const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
    
    // Check if we're in an expression context that needs raw values
    const isInExpression = context && context.isExpression;
    const resolutionContext = isInExpression ? ResolutionContext.Equality : ResolutionContext.FieldAccess;
    
    let resolvedValue = await resolveVariable(variable, env, resolutionContext);
    
    // Handle field access if present
    if (node.fields && node.fields.length > 0) {
      const { accessField } = await import('../utils/field-access');
      
      // accessField handles Variable extraction internally when needed
      // No need to manually extract here
      
      // Apply each field access in sequence
      for (const field of node.fields) {
        // Handle variableIndex type - need to resolve the variable first
        if (field.type === 'variableIndex') {
          const indexVar = env.getVariable(field.value);
          if (!indexVar) {
            throw new Error(`Variable not found for index: ${field.value}`);
          }
          // Extract Variable value for index access
          const { resolveValue, ResolutionContext } = await import('../utils/variable-resolution');
          const indexValue = await resolveValue(indexVar, env, ResolutionContext.StringInterpolation);
          // Create a new field with the resolved value
          const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
          const fieldResult = await accessField(resolvedValue, resolvedField, { 
            preserveContext: true,
            returnUndefinedForMissing: context?.isCondition,
            env,
            sourceLocation: node.location
          });
          resolvedValue = (fieldResult as any).value;
        } else {
          const fieldResult = await accessField(resolvedValue, field, { 
            preserveContext: true,
            returnUndefinedForMissing: context?.isCondition,
            env,
            sourceLocation: node.location
          });
          resolvedValue = (fieldResult as any).value;
        }
        if (resolvedValue === undefined) break;
      }
    }
    
    // Apply condensed pipes if present (same as in interpolate)
    if (node.pipes && node.pipes.length > 0) {
      const { processPipeline } = await import('../eval/pipeline/unified-processor');
      resolvedValue = await processPipeline({
        value: resolvedValue,
        env,
        node,
        identifier: node.identifier
      });
    }
    
    return { value: resolvedValue, env };
  }
  
  if (isExecInvocation(node)) {
    // Import the exec invocation evaluator
    const { evaluateExecInvocation } = await import('../eval/exec-invocation');
    return evaluateExecInvocation(node, env);
  }
  
  // Handle expression nodes
  if (node.type === 'BinaryExpression' || node.type === 'TernaryExpression' || node.type === 'UnaryExpression') {
    const { evaluateExpression } = await import('../eval/expression');
    return evaluateExpression(node, env);
  }
  
  // Handle literal nodes
  if (isLiteralNode(node)) {
    // Check for retry literal
    if (node.valueType === 'retry') {
      // Check if we're in pipeline context
      const pipelineCtx = env.getPipelineContext();
      if (!pipelineCtx) {
        throw new Error('retry keyword used outside pipeline context');
      }
      return { value: 'retry', env };
    }
    
    return { value: node.value, env };
  }
  
  // Handle when expressions
  if (node.type === 'WhenExpression') {
    const { evaluateWhenExpression } = await import('../eval/when-expression');
    return evaluateWhenExpression(node as any, env, context);
  }
  
  // Handle foreach expressions as first-class expressions
  if (node.type === 'foreach' || node.type === 'foreach-command') {
    const { evaluateForeachCommand } = await import('../eval/foreach');
    const result = await evaluateForeachCommand(node as any, env);
    return { value: result, env };
  }
  
  // Note: WhenRHSAction nodes have been replaced with regular Directive nodes
  // that get evaluated through the normal directive evaluation path below
  
  // Handle for expressions
  if (node.type === 'ForExpression') {
    const { evaluateForExpression } = await import('../eval/for');
    const result = await evaluateForExpression(node as any, env);
    return { value: result, env };
  }
  
  // Handle data value nodes from the grammar (arrays and objects)
  if (node.type === 'array' || node.type === 'object') {
    // These are data value nodes that need to be evaluated
    const result = await evaluateDataValue(node, env);
    return { value: result, env };
  }

  // Handle load-content nodes (alligator syntax: <file>)
  if (node.type === 'load-content') {
    const result = await evaluateDataValue(node, env);
    return { value: result, env };
  }

  // Handle FileReference nodes (<file> with field access or pipes)
  if (node.type === 'FileReference') {
    const fileRefNode = node as FileReferenceNode;
    const { processContentLoader } = await import('../eval/content-loader');
    const { isLoadContentResult, isLoadContentResultArray } = await import('@core/types/load-content');
    const { accessField } = await import('../utils/field-access');
    const { isStructuredValue, asData } = await import('../utils/structured-value');

    // Convert FileReference to load-content structure
    const loadContentNode = {
      type: 'load-content' as const,
      source: fileRefNode.source
    };

    // Load the content
    let loadResult = await processContentLoader(loadContentNode, env);

    // Extract data from StructuredValue if wrapped
    if (isStructuredValue(loadResult)) {
      loadResult = asData(loadResult);
    }

    // Process field access if present
    if (fileRefNode.fields && fileRefNode.fields.length > 0) {
      let result: any = loadResult;
      for (const field of fileRefNode.fields) {
        result = await accessField(result, field, { env });
      }
      return { value: result, env };
    }

    return { value: loadResult, env };
  }

  // Handle command nodes (from run {command} in expressions)
  if (node.type === 'command') {
    // Reuse the same logic as in lazy-eval.ts
    let commandStr: string;
    if (typeof node.command === 'string') {
      commandStr = node.command || '';
    } else if (Array.isArray(node.command)) {
      // Interpolate the command array
      commandStr = await interpolate(node.command, env) || '';
    } else {
      commandStr = '';
    }
    
    // Execute command if it has the run keyword
    if (node.hasRunKeyword) {
      const result = await env.executeCommand(commandStr);
      return { value: result, env };
    }
    
    // Command without run keyword - return as-is (shouldn't happen in practice)
    return { value: commandStr, env };
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
    const result = await evaluate(child, env, context);
    lastValue = result.value;
    
    // Emit text nodes as 'doc' effects
    if (isText(child)) {
      env.emitEffect('doc', child.content);
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
async function resolveVariableValue(variable: Variable, env: Environment): Promise<VariableValue> {
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
    assertStructuredValue(variable.value, 'interpolate:pipeline-input');
    return asText(variable.value);
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

interface InterpolateOptions {
  collectSecurityDescriptor?: (descriptor: SecurityDescriptor) => void;
}

function extractInterpolationDescriptor(value: unknown): SecurityDescriptor | undefined {
  if (!value) {
    return undefined;
  }
  if (isStructuredValue(value)) {
    return normalizeSecurityDescriptor(value.metadata?.security as SecurityDescriptor | undefined);
  }
  if (typeof value === 'object') {
    const metadata = (value as { metadata?: { security?: SecurityDescriptor } }).metadata;
    return normalizeSecurityDescriptor(metadata?.security as SecurityDescriptor | undefined);
  }
  return undefined;
}

/**
 * String interpolation helper - resolves {{variables}} in content
 */
export async function interpolate(
  nodes: InterpolationNode[],
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default,
  options?: InterpolateOptions
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
  let withinDoubleQuotes = false;
  let withinSingleQuotes = false;

  const updateQuoteState = (fragment: string): void => {
    if (!fragment) return;
    let backslashCount = 0;
    for (let i = 0; i < fragment.length; i++) {
      const char = fragment[i];
      if (char === '\\') {
        backslashCount++;
        continue;
      }
      if (char === '"' || char === '\'') {
        const isEscaped = backslashCount % 2 === 1;
        if (char === '"' && !withinSingleQuotes && !isEscaped) {
          withinDoubleQuotes = !withinDoubleQuotes;
        } else if (char === '\'' && !withinDoubleQuotes && !isEscaped) {
          withinSingleQuotes = !withinSingleQuotes;
        }
      }
      backslashCount = 0;
    }
  };

  const pushPart = (fragment: string): void => {
    const value = fragment ?? '';
    parts.push(value);
    if (context === InterpolationContext.ShellCommand) {
      updateQuoteState(value);
    }
  };
  const collectDescriptor = (descriptor?: SecurityDescriptor): void => {
    if (!descriptor) {
      return;
    }
    options?.collectSecurityDescriptor?.(descriptor);
  };
  
  for (const node of nodes) {
    
    if (node.type === 'Text') {
      // Handle Text nodes - directly use string content
      pushPart(node.content || '');
    } else if (node.type === 'PathSeparator') {
      pushPart(node.value || '/');
    } else if (node.type === 'ExecInvocation') {
      // Handle function calls in templates
      const { evaluateExecInvocation } = await import('../eval/exec-invocation');
      const result = await evaluateExecInvocation(node as any, env);
      collectDescriptor(extractInterpolationDescriptor(result.value));
      pushPart(asText(result.value));
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
        pushPart(`{{${varName}}}`); // Keep unresolved with {{}} syntax
        continue;
      }
      collectDescriptor(variable.metadata?.security as SecurityDescriptor | undefined);
      
      /**
       * Extract Variable value for string interpolation
       * WHY: String interpolation needs raw values because template engines
       *      work with primitive types, not Variable wrapper objects
       */
      const { resolveVariable, ResolutionContext } = await import('../utils/variable-resolution');
      const value = await resolveVariable(variable, env, ResolutionContext.StringInterpolation);
      collectDescriptor(extractInterpolationDescriptor(value));
      
      // Convert final value to string
      let stringValue: string;
      if (value === null) {
        stringValue = 'null';
      } else if (value === undefined) {
        stringValue = '';
      } else if (isStructuredValue(value)) {
        stringValue = asText(value);
      } else if (typeof value === 'object') {
        stringValue = JSON.stringify(value);
        if (process.env.MLLD_DEBUG === 'true') {
        }
      } else {
        stringValue = String(value);
      }
      
      pushPart(stringValue);
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
          logger.debug('Variable not found during interpolation:', { varName, valueType: node.valueType });
        }
        // WHY: Preserve original syntax when variable is undefined for better error messages
        if (node.valueType === 'varInterpolation') {
          pushPart(`{{${varName}}}`);  // {{var}} syntax
        } else {
          pushPart(`@${varName}`);      // @var syntax
        }
        continue;
      }

      collectDescriptor(variable.metadata?.security as SecurityDescriptor | undefined);

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
          /**
           * Extract Variable value for string interpolation
           * WHY: String interpolation needs raw values because template engines
           *      work with primitive types, not Variable wrapper objects
           */
          const { resolveVariable, ResolutionContext: ResCtx } = await import('../utils/variable-resolution');
          value = await resolveVariable(variable, env, ResCtx.StringInterpolation);
          collectDescriptor(extractInterpolationDescriptor(value));
          
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
        const { accessField } = await import('../utils/field-access');
        for (const field of node.fields) {
          // Handle variableIndex type - need to resolve the variable first
          if (field.type === 'variableIndex') {
            const indexVar = env.getVariable(field.value);
            if (!indexVar) {
              throw new Error(`Variable not found for index: ${field.value}`);
            }
            // Extract Variable value for index access - WHY: Index values must be raw strings/numbers
            const { resolveValue: resolveVal, ResolutionContext: ResCtx2 } = await import('../utils/variable-resolution');
            const indexValue = await resolveVal(indexVar, env, ResCtx2.StringInterpolation);
            // Create a new field with the resolved value
            const resolvedField = { type: 'bracketAccess' as const, value: indexValue };
            const fieldResult = await accessField(value, resolvedField, { 
              preserveContext: true,
              env 
            });
            value = (fieldResult as any).value;
          } else {
            const fieldResult = await accessField(value, field, { 
              preserveContext: true,
              env 
            });
            value = (fieldResult as any).value;
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

      // Special-case: Normalize @ctx.hint to a string for interpolation when it carries wrapper/variable forms
      try {
        if (node.identifier === 'ctx' && Array.isArray(node.fields) && node.fields.length > 0) {
          const lastField = node.fields[node.fields.length - 1];
          const fieldName = (lastField && 'value' in lastField) ? String((lastField as any).value) : undefined;
          if (fieldName === 'hint') {
            if (typeof value === 'object' && value !== null) {
              if ('wrapperType' in (value as any) && Array.isArray((value as any).content)) {
                value = await interpolate((value as any).content as any[], env, context, options);
              } else if ('type' in (value as any)) {
                const { extractVariableValue } = await import('../utils/variable-resolution');
                value = await extractVariableValue(value as any, env);
              }
            }
          }
        }
      } catch {
        // Non-fatal normalization failure; proceed with generic conversion
      }
      
      // Apply condensed pipes if present
      if (node.pipes && node.pipes.length > 0) {
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[INTERPOLATE] Before applyCondensedPipes:', { 
            valueType: typeof value,
          isObject: typeof value === 'object',
          valueKeys: typeof value === 'object' && value !== null ? Object.keys(value) : 'N/A',
          valueStr: typeof value === 'object' ? JSON.stringify(value).substring(0, 100) : String(value).substring(0, 100),
          pipes: node.pipes.map((p: any) => p.name || p.transform)
          });
        }
        try {
          // Use the unified pipeline processor instead of applyCondensedPipes
          const { processPipeline } = await import('../eval/pipeline/unified-processor');
          value = await processPipeline({
            value,
            env,
            node,
            identifier: node.identifier
          });
          if (process.env.MLLD_DEBUG === 'true') {
            console.error('[INTERPOLATE] After pipes:', { 
              valueType: typeof value,
              valueStr: typeof value === 'object' ? JSON.stringify(value) : value
            });
          }
        } catch (error) {
          if (process.env.MLLD_DEBUG === 'true') {
            console.error('[INTERPOLATE] Error in pipes:', error);
          }
          throw error;
        }
        // If pipes have already converted to string, use it directly
        if (typeof value === 'string') {
          const strategy = EscapingStrategyFactory.getStrategy(context);
          pushPart(strategy.escape(value));
          continue;
        }
      }
      
      // Convert final value to string
      let stringValue: string;
      
      /**
       * Extract Variable value for string interpolation
       * WHY: String interpolation needs raw values because template engines
       *      work with primitive types, not Variable wrapper objects
       */
      const { isVariable, resolveValue, ResolutionContext: ResContext } = await import('../utils/variable-resolution');
      value = await resolveValue(value, env, ResContext.StringInterpolation);
      
      if (context === InterpolationContext.ShellCommand) {
        const classification = classifyShellValue(value);
        const strategy = EscapingStrategyFactory.getStrategy(context);

        const escapeForSingleQuotes = (text: string): string => {
          if (text === "'") {
            return "'";
          }
          if (!text.includes("'")) {
            return text;
          }
          const segments = text.split("'");
          return segments
            .map((segment, index) => {
              if (index === segments.length - 1) {
                return segment;
              }
              return `${segment}'\\''`;
            })
            .join('');
        };
        const escapeForDoubleQuotes = (text: string): string => strategy.escape(text);

        if (classification.kind === 'simple') {
          if (withinSingleQuotes) {
            pushPart(escapeForSingleQuotes(classification.text));
          } else {
            pushPart(escapeForDoubleQuotes(classification.text));
          }
        } else if (classification.kind === 'array-simple') {
          if (withinSingleQuotes) {
            const escapedElements = classification.elements.map(elem => escapeForSingleQuotes(elem));
            pushPart(escapedElements.join(' '));
          } else {
            const escapedElements = classification.elements.map(elem => escapeForDoubleQuotes(elem));
            pushPart(escapedElements.join(' '));
          }
        } else {
          if (withinDoubleQuotes) {
            pushPart(escapeForDoubleQuotes(classification.text));
          } else if (withinSingleQuotes) {
            pushPart(escapeForSingleQuotes(classification.text));
          } else {
            pushPart(shellQuote.quote([classification.text]));
          }
        }
        continue;
      }

      if (value === null) {
        stringValue = 'null';
      } else if (value === undefined) {
        stringValue = '';
      } else if (isStructuredValue(value)) {
        stringValue = asText(value);
      } else if (typeof value === 'object' && 'wrapperType' in value && 'content' in value && Array.isArray(value.content)) {
        // Handle wrapped strings (quotes, backticks, brackets)
        stringValue = await interpolate(value.content as InterpolationNode[], env, context, options);
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
          // Check if this is a PipelineInput object - WHY: PipelineInput has toString()
          // method that should be used for string interpolation instead of JSON.stringify
          const { isPipelineInput } = await import('../utils/pipeline-input');
          if (isPipelineInput(value)) {
            stringValue = asText(value);
          } else {
            stringValue = JSON.stringify(value);
            if (process.env.MLLD_DEBUG === 'true') {
            }
          }
        }
      } else if (Array.isArray(value)) {
        // Check if this is a LoadContentResultArray first
        const { isLoadContentResultArray, isRenamedContentArray } = await import('@core/types/load-content');
        
        // Debug logging
        if (process.env.MLLD_DEBUG === 'true') {
          console.error('[INTERPOLATE] Array value check:', {
            isArray: Array.isArray(value),
            length: value.length,
            hasVariable: '__variable' in value,
            variableMetadata: (value as any).__variable?.metadata,
            isRenamedContentArray: isRenamedContentArray(value),
            isLoadContentResultArray: isLoadContentResultArray(value),
            hasContent: 'content' in value,
            contentType: typeof (value as any).content
          });
        }
        
        
        if (isLoadContentResultArray(value)) {
          // For LoadContentResultArray, use its .content getter (which concatenates all content)
          stringValue = value.content;
        } else if (isRenamedContentArray(value)) {
          /**
           * Handle RenamedContentArray string interpolation
           * WHY: RenamedContentArray has a custom content getter that formats the array
           *      elements according to the rename pattern from alligator syntax
           * GOTCHA: The content getter might be defined but not enumerable, so we check
           *         multiple methods to find the proper string representation
           * CONTEXT: Used when arrays created with <*.md> as "pattern" are interpolated
           */
          if ('content' in value) {
            stringValue = value.content;
          } else if (value.toString !== Array.prototype.toString) {
            // Use custom toString if available
            stringValue = value.toString();
          } else {
            // Fallback to manual join
            stringValue = value.join('\n\n');
          }
        } else {
          // For other contexts, use JSON representation with custom replacer
          // Note: No indentation for template interpolation - keep it compact
          const { JSONFormatter } = await import('./json-formatter');
          const printableArray = value.map(item => {
            if (isStructuredValue(item)) {
              if (item.type === 'object' || item.type === 'array' || item.type === 'json') {
                return item.data;
              }
              return asText(item);
            }
            return item;
          });
          stringValue = JSONFormatter.stringify(printableArray);
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
        // Generic fallback
        if (typeof value === 'object' && value !== null) {
          const { JSONFormatter } = await import('./json-formatter');
          stringValue = JSONFormatter.stringify(value);
        } else {
          stringValue = String(value);
        }
      }
      
      
      // Apply context-appropriate escaping
      const strategy = EscapingStrategyFactory.getStrategy(context);
      const escapedValue = strategy.escape(stringValue);
      
      if (process.env.MLLD_DEBUG === 'true' && node.identifier) {
      }
      
      pushPart(escapedValue);
      
      // Handle boundary marker after variable if present
      // @var\ produces just the variable, @var\\ produces variable + literal backslash
      if (node.boundary) {
        if (node.boundary.type === 'literal') {
          // Double backslash: add literal backslash after variable
          pushPart(node.boundary.value);
        }
        // Single backslash (type: 'consumed'): don't add anything, it's just a boundary
      }
    } else if (node.type === 'ExecInvocation') {
      // Handle exec invocation nodes in interpolation
      const { evaluateExecInvocation } = await import('../eval/exec-invocation');
      const result = await evaluateExecInvocation(node as ExecInvocation, env);
      collectDescriptor(extractInterpolationDescriptor(result.value));
      const stringValue = asText(result.value);
      
      // Apply context-appropriate escaping
      const strategy = EscapingStrategyFactory.getStrategy(context);
      pushPart(strategy.escape(stringValue));
    } else if (node.type === 'FileReference') {
      // Handle file reference interpolation
      const result = await interpolateFileReference(node as any, env, context);
      pushPart(result);
    } else if (node.type === 'TemplateForBlock') {
      // Inline template for-loop expansion
      // Evaluate the source collection in expression context
      const sourceEval = await evaluate(node.source, env, { isExpression: true });
      const { toIterable } = await import('../eval/for-utils');
      const iterable = toIterable(sourceEval.value);
      if (!iterable) {
        // Non-iterable: skip silently in template context
        continue;
      }
      // Variable importer for proper Variable wrapping
      const { VariableImporter } = await import('../eval/import/VariableImporter');
      const importer = new VariableImporter();
      for (const [key, value] of iterable as Iterable<[string | null, unknown]>) {
        const childEnv = env.createChildEnvironment();
        const varName = (node as any).variable?.identifier || (node as any).variable?.name || 'item';
        const iterationVar = importer.createVariableFromValue(varName, value, 'template-for', undefined, { env });
        childEnv.setVariable(varName, iterationVar);
        if (key !== null && key !== undefined) {
          const keyVar = importer.createVariableFromValue(`${varName}_key`, key, 'template-for', undefined, { env });
          childEnv.setVariable(`${varName}_key`, keyVar);
        }
        const bodyStr = await interpolate((node as any).body as any[], childEnv, InterpolationContext.Template, options);
        pushPart(bodyStr);
      }
    } else if (node.type === 'TemplateInlineShow') {
      // Build a synthetic show directive and evaluate in capture mode
      const directive: any = {
        type: 'Directive',
        kind: 'show',
        subtype: undefined,
        values: {},
        raw: {},
        meta: { applyTailPipeline: !!(node as any).tail },
        location: (node as any).location
      };
      const n: any = node as any;
      switch (n.showKind) {
        case 'command':
          directive.subtype = 'showCommand';
          directive.values.command = n.content?.values?.command || n.content?.values || n.content;
          directive.meta = { ...(directive.meta || {}), ...(n.content?.meta || {}) };
          if (n.tail) directive.values.withClause = n.tail;
          break;
        case 'code':
          directive.subtype = 'showCode';
          directive.values.lang = n.lang || [];
          directive.values.code = n.code || [];
          directive.meta = { ...(directive.meta || {}), ...(n.meta || {}) };
          if (n.tail) directive.values.withClause = n.tail;
          break;
        case 'template':
          directive.subtype = 'showTemplate';
          directive.values.content = n.template?.values?.content ? [{ content: n.template.values.content }] : (n.template?.values ? [n.template.values] : []);
          directive.meta = { ...(directive.meta || {}), ...(n.template?.meta || {}), isTemplateContent: true };
          if (n.tail) directive.values.withClause = n.tail;
          break;
        case 'load':
          directive.subtype = 'showLoadContent';
          directive.values.loadContent = n.loadContent;
          if (n.tail) directive.values.withClause = n.tail;
          break;
        case 'reference':
          // Distinguish variable vs exec invocation by node type
          if (n.reference?.type === 'VariableReference' || n.reference?.type === 'VariableReferenceWithTail' || n.reference?.type === 'TemplateVariable') {
            directive.subtype = 'showVariable';
            directive.values.variable = n.reference;
          } else {
            directive.subtype = 'showExecInvocation';
            directive.values.execInvocation = n.reference;
          }
          break;
        default:
          break;
      }
      const { evaluateShow } = await import('../eval/show');
      const res = await evaluateShow(directive, env, { isExpression: true });
      pushPart(asText(res.value ?? ''));
    } else if (node.type === 'Literal') {
      // Handle literal nodes from expressions
      const { LiteralNode } = await import('@core/types');
      const literalNode = node as LiteralNode;
      const value = literalNode.value;
      let stringValue: string;
      if (value === null) {
        stringValue = 'null';
      } else if (value === undefined) {
        stringValue = '';
      } else {
        stringValue = String(value);
      }
      const strategy = EscapingStrategyFactory.getStrategy(context);
      pushPart(strategy.escape(stringValue));
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
        // Check if the path looks like it might be relative
        if (!resolvedPath.startsWith('/') && !resolvedPath.startsWith('@')) {
          console.error(`Hint: Paths are relative to mlld files. You can make them relative to your project root with the \`@base/\` prefix`);
        }
        return '';
      } else if (error.code === 'EACCES') {
        console.error(`Warning: Permission denied - '${resolvedPath}'`);
        return '';
      } else {
        console.error(`Warning: Failed to load file '${resolvedPath}': ${error.message}`);
        // Check if the path looks like it might be relative
        if (!resolvedPath.startsWith('/') && !resolvedPath.startsWith('@')) {
          console.error(`Hint: Paths are relative to mlld files. You can make them relative to your project root with the \`@base/\` prefix`);
        }
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
  
  // Keep LoadContentResult intact for field access, only extract content if no fields to access
  if (isLoadContentResult(result)) {
    if (!fields || fields.length === 0) {
      // No field access needed, extract content
      result = result.content;
    }
    // If we have fields to access, keep the full LoadContentResult object so we can access .fm, .json, etc.
  }
  
  // Process field access
  if (fields && fields.length > 0) {
    // Use enhanced field access for better error messages
    const { accessField } = await import('../utils/field-access');
    for (const field of fields) {
      try {
        const fieldResult = await accessField(result, field, { 
          preserveContext: true,
          env 
        });
        result = (fieldResult as any).value;
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
    // Use unified pipeline processor instead of applyCondensedPipes
    const { processPipeline } = await import('../eval/pipeline/unified-processor');
    // Create a node object with the pipes for the processor
    const nodeWithPipes = { pipes };
    result = await processPipeline({
      value: result,
      env,
      node: nodeWithPipes
    });
    // Pipes already handle conversion to string format, so return as-is
    return asText(result);
  }
  
  // Convert to string only if no pipes were applied
  if (isStructuredValue(result)) {
    return asText(result);
  }
  return typeof result === 'string' ? result : JSON.stringify(result);
}
