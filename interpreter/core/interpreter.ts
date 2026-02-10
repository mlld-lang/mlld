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
import { astLocationToSourceLocation } from '@core/types';
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
import { materializeDisplayValue } from '../utils/display-materialization';
import type { SecurityDescriptor } from '@core/types/security';
import { classifyShellValue } from '@interpreter/utils/shell-value';
import {
  createInterpolator,
  extractInterpolationDescriptor,
  interpolateFileReference,
  processFileFields,
  type InterpolateOptions,
  type InterpolationNode
} from '../utils/interpolation';
import * as shellQuote from 'shell-quote';
import { parseSync } from '@grammar/parser';

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

        const barePipelineStatements = !context?.isExpression && isText(n)
          ? parseBareBuiltinEffectPipelines(n.content)
          : null;
        if (barePipelineStatements) {
          let inlinePipelineResult: EvalResult | null = null;
          for (const statement of barePipelineStatements) {
            inlinePipelineResult = await evaluate(statement, env, context);
            env.addNode(statement);
          }
          if (inlinePipelineResult) {
            lastValue = inlinePipelineResult.value;
            lastResult = inlinePipelineResult;
          }
          continue;
        }

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
          // Emit intents for non-directive nodes (preserves document structure with break collapsing)
          // Skip text/newline emission when evaluating as expression (e.g., module imports)
          if (isText(n)) {
            if (!context?.isExpression) {
              // If Text node contains only newlines, emit as collapsible breaks
              if (/^\n+$/.test(n.content)) {
                for (let i = 0; i < n.content.length; i++) {
                  env.emitIntent({
                    type: 'break',
                    value: '\n',
                    source: 'newline',
                    visibility: 'always',
                    collapsible: true
                  });
                }
              } else {
                const materialized = materializeDisplayValue(n.content, undefined, n.content);
                env.emitIntent({
                  type: 'content',
                  value: materialized.text,
                  source: 'text',
                  visibility: 'always',
                  collapsible: false
                });
                if (materialized.descriptor) {
                  env.recordSecurityDescriptor(materialized.descriptor);
                }
              }
            }
          } else if (isNewline(n)) {
            if (!context?.isExpression) {
              env.emitIntent({
                type: 'break',
                value: '\n',
                source: 'newline',
                visibility: 'always',
                collapsible: true
              });
            }
          } else if (isCodeFence(n)) {
            // Skip CodeFence emission when evaluating as expression (e.g., module imports)
            if (!context?.isExpression) {
              const materialized = materializeDisplayValue(n.content, undefined, n.content);
              env.emitIntent({
                type: 'content',
                value: materialized.text,
                source: 'text',
                visibility: 'always',
                collapsible: false
              });
              if (materialized.descriptor) {
                env.recordSecurityDescriptor(materialized.descriptor);
              }
            }
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
        const barePipelineStatements = !context?.isExpression && isText(n)
          ? parseBareBuiltinEffectPipelines(n.content)
          : null;
        if (barePipelineStatements) {
          let inlinePipelineResult: EvalResult | null = null;
          for (const statement of barePipelineStatements) {
            inlinePipelineResult = await evaluate(statement, env, context);
            env.addNode(statement);
          }
          if (inlinePipelineResult) {
            lastValue = inlinePipelineResult.value;
            lastResult = inlinePipelineResult;
          }
          continue;
        }

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
          // Emit intents for non-directive nodes (preserves document structure with break collapsing)
          // Skip text/newline emission when evaluating as expression (e.g., module imports)
          if (isText(n)) {
            if (!context?.isExpression) {
              // If Text node contains only newlines, emit as collapsible breaks
              if (/^\n+$/.test(n.content)) {
                for (let i = 0; i < n.content.length; i++) {
                  env.emitIntent({
                    type: 'break',
                    value: '\n',
                    source: 'newline',
                    visibility: 'always',
                    collapsible: true
                  });
                }
              } else {
                const materialized = materializeDisplayValue(n.content, undefined, n.content);
                env.emitIntent({
                  type: 'content',
                  value: materialized.text,
                  source: 'text',
                  visibility: 'always',
                  collapsible: false
                });
                if (materialized.descriptor) {
                  env.recordSecurityDescriptor(materialized.descriptor);
                }
              }
            }
          } else if (isNewline(n)) {
            if (!context?.isExpression) {
              env.emitIntent({
                type: 'break',
                value: '\n',
                source: 'newline',
                visibility: 'always',
                collapsible: true
              });
            }
          } else if (isCodeFence(n)) {
            // Skip CodeFence emission when evaluating as expression (e.g., module imports)
            if (!context?.isExpression) {
              const materialized = materializeDisplayValue(n.content, undefined, n.content);
              env.emitIntent({
                type: 'content',
                value: materialized.text,
                source: 'text',
                visibility: 'always',
                collapsible: false
              });
              if (materialized.descriptor) {
                env.recordSecurityDescriptor(materialized.descriptor);
              }
            }
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
      const interpolated = await interpolateWithSecurityRecording(contentToInterpolate, env);
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
  
  if (isMlldRunBlock(node)) {
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
        // Allow ambient @mx to resolve even if parser produced zero offsets
        node.identifier !== 'mx') {
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
          const command = await interpolateWithSecurityRecording(commandTemplate as InterpolationNode[], env);
          
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
          const code = await interpolateWithSecurityRecording(codeTemplate as InterpolationNode[], env);
          
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
    const hasFieldAccess = Array.isArray(node.fields) && node.fields.length > 0;
    const resolutionContext =
      hasFieldAccess ? ResolutionContext.FieldAccess
      : isInExpression ? ResolutionContext.Equality
      : ResolutionContext.FieldAccess;
    
    let resolvedValue = await resolveVariable(variable, env, resolutionContext);
    
    // Handle field access if present
    if (node.fields && node.fields.length > 0) {
      const { accessField } = await import('../utils/field-access');
      const fieldAccessLocation = astLocationToSourceLocation(node.location, env.getCurrentFilePath());
      
      // accessField handles Variable extraction internally when needed
      // No need to manually extract here
      
      // Apply each field access in sequence
      for (const field of node.fields) {
        const fieldResult = await accessField(resolvedValue, field, { 
          preserveContext: true,
          returnUndefinedForMissing: context?.isCondition,
          env,
          sourceLocation: fieldAccessLocation
        });
        resolvedValue = (fieldResult as any).value;
        if (resolvedValue === undefined || resolvedValue === null) break;
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

  // Handle VariableReferenceWithTail (variable with pipeline from when-expression actions)
  if (node.type === 'VariableReferenceWithTail') {
    const { VariableReferenceEvaluator } = await import('../eval/data-values/VariableReferenceEvaluator');
    const evaluator = new VariableReferenceEvaluator();
    const result = await evaluator.evaluate(node, env);
    return { value: result, env };
  }

  if (node.type === 'NewExpression') {
    const { evaluateNewExpression } = await import('../eval/new-expression');
    const value = await evaluateNewExpression(node as any, env);
    return { value, env };
  }

  if (node.type === 'LabelModification') {
    const { evaluateLabelModification } = await import('../eval/label-modification');
    return evaluateLabelModification(node as any, env, context);
  }

  // Handle expression nodes
  if (node.type === 'BinaryExpression' || node.type === 'TernaryExpression' || node.type === 'UnaryExpression') {
    const { evaluateUnifiedExpression } = await import('../eval/expressions');
    const result = await evaluateUnifiedExpression(node, env);
    return { value: result.value, env };
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

    if (node.valueType === 'done' || node.valueType === 'continue') {
      return { value: node, env };
    }
    
    return { value: node.value, env };
  }
  
  // Handle when expressions
  if (node.type === 'WhenExpression') {
    const { evaluateWhenExpression } = await import('../eval/when-expression');
    return evaluateWhenExpression(node as any, env, context);
  }

  if (node.type === 'ExeBlock') {
    const { evaluateExeBlock } = await import('../eval/exe');
    return evaluateExeBlock(node as any, env, {}, { scope: 'block' });
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

  if (node.type === 'LoopExpression') {
    const { evaluateLoopExpression } = await import('../eval/loop');
    const result = await evaluateLoopExpression(node as any, env);
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
  if (node.type === 'code') {
    const { evaluateCodeExecution } = await import('../eval/code-execution');
    const result = await evaluateCodeExecution(node, env);
    return { value: result.value, env };
  }

  // Handle command nodes (from cmd {...} or run {...} in expressions)
  if (node.type === 'command') {
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
  throw new Error(`Unknown node type: ${node.type}`);
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
