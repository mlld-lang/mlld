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
import type { Environment } from '../env/Environment';
import { evaluateDirective } from '../eval/directive';
import type { VarAssignmentResult } from '../eval/var';
import { isExecInvocation, isLiteralNode } from '@core/types';
import { evaluateDataValue, isFullyEvaluated, collectEvaluationErrors } from '../eval/data-value-evaluator';
import { InterpolationContext, EscapingStrategyFactory } from './interpolation-context';
import { parseFrontmatter } from '../utils/frontmatter-parser';
import type { OperationContext } from '../env/ContextManager';
import { interpreterLogger as logger } from '@core/utils/logger';
import { asText, assertStructuredValue } from '@interpreter/utils/structured-value';
import type { SecurityDescriptor } from '@core/types/security';
import { classifyShellValue } from '@interpreter/utils/shell-value';
import {
  createInterpolator,
  extractInterpolationDescriptor,
  interpolateFileReference,
  processFileFields,
  type InterpolateOptions
} from '../utils/interpolation';
import * as shellQuote from 'shell-quote';
import { parseSync } from '@grammar/parser';
import { evaluateArrayNodes } from './interpreter/traversal';
import { createUnknownNodeTypeError, getDispatchTarget } from './interpreter/dispatch';
import { resolveVariableReference } from './interpreter/resolve-variable-reference';

/**
 * Type for variable values
 */
export type VariableValue = string | number | boolean | null | 
                           VariableValue[] | { [key: string]: VariableValue };

export { interpolateFileReference, processFileFields };

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

interface PipelineStageLike {
  meta?: {
    isBuiltinEffect?: boolean;
  };
}

interface BarePipelineNodeLike {
  type: string;
  withClause?: {
    pipeline?: PipelineStageLike[];
  };
}

function isBuiltinEffectStage(stage: unknown): stage is PipelineStageLike {
  if (typeof stage !== 'object' || stage === null) {
    return false;
  }
  return (stage as PipelineStageLike).meta?.isBuiltinEffect === true;
}

function isBareBuiltinEffectPipelineNode(node: unknown): node is BarePipelineNodeLike {
  if (typeof node !== 'object' || node === null) {
    return false;
  }
  const candidate = node as BarePipelineNodeLike;
  if (candidate.type !== 'VariableReferenceWithTail') {
    return false;
  }
  const pipeline = candidate.withClause?.pipeline;
  if (!Array.isArray(pipeline) || pipeline.length === 0) {
    return false;
  }
  return pipeline.every(isBuiltinEffectStage);
}

function parseBareBuiltinEffectPipelines(content: string): MlldNode[] | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.startsWith('@') || !trimmed.includes('|')) {
    return null;
  }
  try {
    const parsed = parseSync(trimmed, {
      startRule: 'ForBlockStatementList',
      mode: 'markdown'
    });
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }
    if (!parsed.every(isBareBuiltinEffectPipelineNode)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
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
  metadata?: Record<string, unknown>;
}

/**
 * Evaluation context options
 */
export interface EvaluationContext {
  /** Whether we're evaluating a condition (affects field access behavior) */
  isCondition?: boolean;
  /** Whether we're evaluating an expression (affects variable resolution) */
  isExpression?: boolean;
  /** Allow side effects even in expression context (for for-expression blocks) */
  allowEffects?: boolean;
  /** Whether label modification operations are privileged */
  privileged?: boolean;
  /** Pre-evaluated directive inputs supplied by hook extraction */
  extractedInputs?: readonly unknown[];
  /** Operation context captured for the active directive */
  operationContext?: OperationContext;
  /** Precomputed /var assignment (Phase C guard runner) */
  precomputedVarAssignment?: VarAssignmentResult;
  /** Policy checks run before guard-pre for the directive */
  policyChecked?: boolean;
  /** Guard metadata from pre-hook evaluation */
  guardMetadata?: Record<string, unknown>;
}

/**
 * Main recursive evaluation function.
 * This is the heart of the interpreter - it walks the AST and evaluates each node.
 */
export async function evaluate(node: MlldNode | MlldNode[], env: Environment, context?: EvaluationContext): Promise<EvalResult> {
  // Handle array of nodes (from parser)
  if (Array.isArray(node)) {
    return evaluateArrayNodes({
      nodes: node,
      env,
      context,
      evaluateNode: evaluate,
      parseBareBuiltinEffectPipelines
    });
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
      const interpolated = await interpolateWithSecurityRecording(contentToInterpolate, env);
      return { value: interpolated, env };
    }
  }

  const dispatchTarget = getDispatchTarget(node as MlldNode);
  
  if (dispatchTarget === 'document' && isDocument(node)) {
    return evaluateDocument(node, env);
  }
  
  if (dispatchTarget === 'directive' && isDirective(node)) {
    return evaluateDirective(node, env, context);
  }
  
  if (dispatchTarget === 'text' && isText(node)) {
    return evaluateText(node, env);
  }
  
  if (dispatchTarget === 'newline' && isNewline(node)) {
    // Newline nodes are already added by the array processing logic
    return { value: '\n', env };
  }
  
  if (dispatchTarget === 'comment' && isComment(node)) {
    // Comments are NOT included in output
    // Skip comments - don't add any nodes to output
    return { value: node.content, env };
  }
  
  if (dispatchTarget === 'frontmatter' && isFrontmatter(node)) {
    // Process frontmatter node
    const frontmatterData: FrontmatterData = parseFrontmatter(node.content);
    env.setFrontmatter(frontmatterData);
    return { value: frontmatterData, env };
  }
  
  if (dispatchTarget === 'codeFence' && isCodeFence(node)) {
    // Skip CodeFence emission when evaluating as expression (e.g., module imports)
    if (!context?.isExpression) {
      env.emitIntent({
        type: 'content',
        value: node.content,
        source: 'text',
        visibility: 'always',
        collapsible: false
      });
    }
    return { value: node.content, env };
  }
  
  if (dispatchTarget === 'mlldRunBlock' && isMlldRunBlock(node)) {
    // Handle mlld-run blocks by evaluating their content
    if (node.error) {
      // If there was a parse error, output it as text
      // Emit error as error intent
      env.emitIntent({
        type: 'error',
        value: `Error in mlld-run block: ${node.error}`,
        source: 'directive',
        visibility: 'always',
        collapsible: false
      });
      return { value: node.error, env };
    }
    
    // Evaluate the parsed content
    const result = await evaluate(node.content, env, context);
    return result;
  }
      
  if (dispatchTarget === 'variableReference' && isVariableReference(node)) {
    return resolveVariableReference({
      node,
      env,
      context,
      interpolateWithSecurityRecording
    });
  }
  
  if (dispatchTarget === 'execInvocation' && isExecInvocation(node)) {
    // Import the exec invocation evaluator
    const { evaluateExecInvocation } = await import('../eval/exec-invocation');
    return evaluateExecInvocation(node, env);
  }

  // Handle VariableReferenceWithTail (variable with pipeline from when-expression actions)
  if (dispatchTarget === 'variableReferenceWithTail' && node.type === 'VariableReferenceWithTail') {
    const { VariableReferenceEvaluator } = await import('../eval/data-values/VariableReferenceEvaluator');
    const evaluator = new VariableReferenceEvaluator();
    const result = await evaluator.evaluate(node, env);
    return { value: result, env };
  }

  if (dispatchTarget === 'newExpression' && node.type === 'NewExpression') {
    const { evaluateNewExpression } = await import('../eval/new-expression');
    const value = await evaluateNewExpression(node as any, env);
    return { value, env };
  }

  if (dispatchTarget === 'labelModification' && node.type === 'LabelModification') {
    const { evaluateLabelModification } = await import('../eval/label-modification');
    return evaluateLabelModification(node as any, env, context);
  }

  // Handle expression nodes
  if (dispatchTarget === 'unifiedExpression' && (node.type === 'BinaryExpression' || node.type === 'TernaryExpression' || node.type === 'UnaryExpression')) {
    const { evaluateUnifiedExpression } = await import('../eval/expressions');
    const result = await evaluateUnifiedExpression(node, env);
    return { value: result.value, env };
  }
  
  // Handle literal nodes
  if (dispatchTarget === 'literal' && isLiteralNode(node)) {
    // Check for retry literal
    if (node.valueType === 'retry') {
      // Check if we're in pipeline context
      const pipelineCtx = env.getPipelineContext();
      if (!pipelineCtx) {
        throw new Error('retry keyword used outside pipeline context');
      }
      return { value: 'retry', env };
    }

    if (node.valueType === 'done' || node.valueType === 'continue') {
      return { value: node, env };
    }
    
    return { value: node.value, env };
  }
  
  // Handle when expressions
  if (dispatchTarget === 'whenExpression' && node.type === 'WhenExpression') {
    const { evaluateWhenExpression } = await import('../eval/when-expression');
    return evaluateWhenExpression(node as any, env, context);
  }

  if (dispatchTarget === 'exeBlock' && node.type === 'ExeBlock') {
    const { evaluateExeBlock } = await import('../eval/exe');
    return evaluateExeBlock(node as any, env, {}, { scope: 'block' });
  }
  
  // Handle foreach expressions as first-class expressions
  if (dispatchTarget === 'foreach' && (node.type === 'foreach' || node.type === 'foreach-command')) {
    const { evaluateForeachCommand } = await import('../eval/foreach');
    const result = await evaluateForeachCommand(node as any, env);
    return { value: result, env };
  }
  
  // Note: WhenRHSAction nodes have been replaced with regular Directive nodes
  // that get evaluated through the normal directive evaluation path below
  
  // Handle for expressions
  if (dispatchTarget === 'forExpression' && node.type === 'ForExpression') {
    const { evaluateForExpression } = await import('../eval/for');
    const result = await evaluateForExpression(node as any, env);
    return { value: result, env };
  }

  if (dispatchTarget === 'loopExpression' && node.type === 'LoopExpression') {
    const { evaluateLoopExpression } = await import('../eval/loop');
    const result = await evaluateLoopExpression(node as any, env);
    return { value: result, env };
  }
  
  // Handle data value nodes from the grammar (arrays and objects)
  if (dispatchTarget === 'dataValue' && (node.type === 'array' || node.type === 'object')) {
    // These are data value nodes that need to be evaluated
    const result = await evaluateDataValue(node, env);
    return { value: result, env };
  }

  // Handle load-content nodes (alligator syntax: <file>)
  if (dispatchTarget === 'loadContent' && node.type === 'load-content') {
    const result = await evaluateDataValue(node, env);
    return { value: result, env };
  }

  // Handle FileReference nodes (<file> with field access or pipes)
  if (dispatchTarget === 'fileReference' && node.type === 'FileReference') {
    const fileRefNode = node as FileReferenceNode;
    const { processContentLoader } = await import('../eval/content-loader');
    const { accessField } = await import('../utils/field-access');
    const { wrapLoadContentValue } = await import('../utils/load-content-structured');
    const { isStructuredValue } = await import('../utils/structured-value');

    // Convert FileReference to load-content structure
    const loadContentNode = {
      type: 'load-content' as const,
      source: fileRefNode.source
    };

    // Load the content
    const rawLoadResult = await processContentLoader(loadContentNode, env);
    let loadResult = isStructuredValue(rawLoadResult)
      ? rawLoadResult
      : wrapLoadContentValue(rawLoadResult);

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

  // Handle code nodes (from js {...}, sh {...}, python {...}, etc. in expressions)
  if (dispatchTarget === 'code' && node.type === 'code') {
    const { evaluateCodeExecution } = await import('../eval/code-execution');
    const result = await evaluateCodeExecution(node, env);
    return { value: result.value, env };
  }

  // Handle command nodes (from cmd {...} or run {...} in expressions)
  if (dispatchTarget === 'command' && node.type === 'command') {
    let commandStr: string;
    if (typeof node.command === 'string') {
      commandStr = node.command || '';
    } else if (Array.isArray(node.command)) {
      // Interpolate the command array
      const interpolatedCommand = await interpolateWithSecurityRecording(node.command, env);
      commandStr = interpolatedCommand || '';
    } else {
      commandStr = '';
    }

    // Always execute commands - hasRunKeyword is not relevant for execution
    // (it only indicates whether the 'run' keyword was used in syntax)
    const result = await env.executeCommand(commandStr);
    return { value: result, env };
  }
  
  // If we get here, it's an unknown node type
  throw createUnknownNodeTypeError(node as MlldNode);
}

const interpolate = createInterpolator(() => ({ evaluate }));
export { interpolate };

async function interpolateWithSecurityRecording(
  nodes: any,
  env: Environment,
  context?: InterpolationContext
): Promise<string> {
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, context, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1
        ? descriptors[0]
        : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }
  return text;
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
    
    // Emit text nodes as content intents (skip during imports)
    if (isText(child) && !context?.isExpression) {
      env.emitIntent({
        type: 'content',
        value: child.content,
        source: 'text',
        visibility: 'always',
        collapsible: false
      });
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
