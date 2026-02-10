import type {
  BaseMlldNode,
  CodeFenceNode,
  CommentNode,
  DirectiveNode,
  ErrorNode,
  FrontmatterNode,
  LiteralNode,
  MlldDocument,
  MlldNode,
  NewlineNode,
  TextNode,
  VariableReferenceNode
} from '@core/types';
import { isExecInvocation, isLiteralNode } from '@core/types';
import { parseSync } from '@grammar/parser';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { evaluateDataValue } from '@interpreter/eval/data-value-evaluator';
import type { VarAssignmentResult } from '@interpreter/eval/var';
import { parseFrontmatter } from '@interpreter/utils/frontmatter-parser';
import type { InterpolationNode } from '@interpreter/utils/interpolation';
import { createUnknownNodeTypeError, getDispatchTarget } from './dispatch';
import { evaluateCodeNode } from './handlers/code-handler';
import { evaluateCommandNode } from './handlers/command-handler';
import {
  evaluateExeBlockNode,
  evaluateForExpressionNode,
  evaluateForeachNode,
  evaluateLoopExpressionNode,
  evaluateWhenExpressionNode
} from './handlers/control-flow-handlers';
import { evaluateExecInvocationNode } from './handlers/exec-invocation-handler';
import { evaluateLabelModificationNode } from './handlers/label-modification-handler';
import {
  evaluateFileReferenceNode,
  evaluateLoadContentNode
} from './handlers/load-content-file-reference-handler';
import { evaluateNewExpressionNode } from './handlers/new-expression-handler';
import { evaluateUnifiedExpressionNode } from './handlers/unified-expression-handler';
import { evaluateVariableReferenceWithTailNode } from './handlers/variable-reference-with-tail-handler';
import { resolveVariableReference } from './resolve-variable-reference';
import { evaluateArrayNodes } from './traversal';

/**
 * Core evaluation result type.
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
 * Evaluation context options.
 */
export interface EvaluationContext {
  isCondition?: boolean;
  isExpression?: boolean;
  allowEffects?: boolean;
  privileged?: boolean;
  extractedInputs?: readonly unknown[];
  operationContext?: OperationContext;
  precomputedVarAssignment?: VarAssignmentResult;
  policyChecked?: boolean;
  guardMetadata?: Record<string, unknown>;
}

type FrontmatterData = Record<string, unknown> | null;

interface DocumentNode extends BaseMlldNode {
  type: 'Document';
  nodes: MlldNode[];
}

interface MlldRunBlockNode extends BaseMlldNode {
  type: 'MlldRunBlock';
  content: MlldNode[];
  raw: string;
  error?: string;
}

type MlldDocumentType = MlldDocument extends never ? DocumentNode : MlldDocument;

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

type InterpolateWithSecurityRecording = (
  nodes: InterpolationNode[],
  env: Environment
) => Promise<string>;

export interface EvaluateCoreOptions {
  node: MlldNode | MlldNode[];
  env: Environment;
  context?: EvaluationContext;
  evaluateNode: (
    node: MlldNode | MlldNode[],
    env: Environment,
    context?: EvaluationContext
  ) => Promise<EvalResult>;
  interpolateWithSecurityRecording: InterpolateWithSecurityRecording;
}

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

async function evaluateDocument(
  doc: DocumentNode,
  env: Environment,
  context: EvaluationContext | undefined,
  evaluateNode: (
    node: MlldNode | MlldNode[],
    env: Environment,
    context?: EvaluationContext
  ) => Promise<EvalResult>
): Promise<EvalResult> {
  let lastValue: unknown = undefined;

  for (const child of doc.nodes) {
    const result = await evaluateNode(child, env, context);
    lastValue = result.value;

    if (isText(child) && !context?.isExpression) {
      env.emitIntent({
        type: 'content',
        value: child.content,
        source: 'text',
        visibility: 'always',
        collapsible: false
      });
    }
  }

  return { value: lastValue, env };
}

async function evaluateText(node: TextNode, env: Environment): Promise<EvalResult> {
  return { value: node.content, env };
}

/**
 * Evaluate one AST node or a node array through the core dispatch pipeline.
 */
export async function evaluateCore({
  node,
  env,
  context,
  evaluateNode,
  interpolateWithSecurityRecording
}: EvaluateCoreOptions): Promise<EvalResult> {
  if (Array.isArray(node)) {
    return evaluateArrayNodes({
      nodes: node,
      env,
      context,
      evaluateNode,
      parseBareBuiltinEffectPipelines
    });
  }

  if (!Array.isArray(node) && node && typeof node === 'object') {
    let contentToInterpolate: InterpolationNode[] | null = null;
    const candidate = node as any;

    if ('content' in candidate && Array.isArray(candidate.content) && 'wrapperType' in candidate && !candidate.type) {
      contentToInterpolate = candidate.content;
    } else if (
      candidate.type === 'template' &&
      candidate.values?.content &&
      Array.isArray(candidate.values.content)
    ) {
      contentToInterpolate = candidate.values.content;
    } else if (candidate.type === 'template' && candidate.content && Array.isArray(candidate.content)) {
      contentToInterpolate = candidate.content;
    }

    if (contentToInterpolate) {
      const interpolated = await interpolateWithSecurityRecording(contentToInterpolate, env);
      return { value: interpolated, env };
    }
  }

  const dispatchTarget = getDispatchTarget(node as MlldNode);

  if (dispatchTarget === 'document' && isDocument(node)) {
    return evaluateDocument(node, env, context, evaluateNode);
  }

  if (dispatchTarget === 'directive' && isDirective(node)) {
    return evaluateDirective(node, env, context);
  }

  if (dispatchTarget === 'text' && isText(node)) {
    return evaluateText(node, env);
  }

  if (dispatchTarget === 'newline' && isNewline(node)) {
    return { value: '\n', env };
  }

  if (dispatchTarget === 'comment' && isComment(node)) {
    return { value: node.content, env };
  }

  if (dispatchTarget === 'frontmatter' && isFrontmatter(node)) {
    const frontmatterData: FrontmatterData = parseFrontmatter(node.content);
    env.setFrontmatter(frontmatterData);
    return { value: frontmatterData, env };
  }

  if (dispatchTarget === 'codeFence' && isCodeFence(node)) {
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
    if (node.error) {
      env.emitIntent({
        type: 'error',
        value: `Error in mlld-run block: ${node.error}`,
        source: 'directive',
        visibility: 'always',
        collapsible: false
      });
      return { value: node.error, env };
    }

    return evaluateNode(node.content, env, context);
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
    return evaluateExecInvocationNode(node, env);
  }

  if (dispatchTarget === 'variableReferenceWithTail' && node.type === 'VariableReferenceWithTail') {
    return evaluateVariableReferenceWithTailNode(node as any, env);
  }

  if (dispatchTarget === 'newExpression' && node.type === 'NewExpression') {
    return evaluateNewExpressionNode(node as any, env);
  }

  if (dispatchTarget === 'labelModification' && node.type === 'LabelModification') {
    return evaluateLabelModificationNode(node as any, env, context);
  }

  if (
    dispatchTarget === 'unifiedExpression' &&
    (node.type === 'BinaryExpression' ||
      node.type === 'TernaryExpression' ||
      node.type === 'UnaryExpression')
  ) {
    return evaluateUnifiedExpressionNode(node as any, env);
  }

  if (dispatchTarget === 'literal' && isLiteralNode(node)) {
    if (node.valueType === 'retry') {
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

  if (dispatchTarget === 'whenExpression' && node.type === 'WhenExpression') {
    return evaluateWhenExpressionNode(node as any, env, context);
  }

  if (dispatchTarget === 'exeBlock' && node.type === 'ExeBlock') {
    return evaluateExeBlockNode(node as any, env);
  }

  if (dispatchTarget === 'foreach' && (node.type === 'foreach' || node.type === 'foreach-command')) {
    return evaluateForeachNode(node as any, env);
  }

  if (dispatchTarget === 'forExpression' && node.type === 'ForExpression') {
    return evaluateForExpressionNode(node as any, env);
  }

  if (dispatchTarget === 'loopExpression' && node.type === 'LoopExpression') {
    return evaluateLoopExpressionNode(node as any, env);
  }

  if (dispatchTarget === 'dataValue' && (node.type === 'array' || node.type === 'object')) {
    const result = await evaluateDataValue(node, env);
    return { value: result, env };
  }

  if (dispatchTarget === 'loadContent' && node.type === 'load-content') {
    return evaluateLoadContentNode(node as any, env);
  }

  if (dispatchTarget === 'fileReference' && node.type === 'FileReference') {
    return evaluateFileReferenceNode(node as any, env);
  }

  if (dispatchTarget === 'code' && node.type === 'code') {
    return evaluateCodeNode(node as any, env);
  }

  if (dispatchTarget === 'command' && node.type === 'command') {
    return evaluateCommandNode(node as any, env, interpolateWithSecurityRecording);
  }

  throw createUnknownNodeTypeError(node as MlldNode);
}
