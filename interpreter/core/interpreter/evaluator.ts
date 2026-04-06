import type { ExeReturnNode, MlldNode, TextNode } from '@core/types';
import { MlldDirectiveError } from '@core/errors';
import { isExecInvocation, isLiteralNode } from '@core/types';
import { parseSync } from '@grammar/parser';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { Environment } from '@interpreter/env/Environment';
import { evaluateDirective } from '@interpreter/eval/directive';
import { evaluateDataValue } from '@interpreter/eval/data-value-evaluator';
import { createExeReturnControl, resolveExeReturnValue } from '@interpreter/eval/exe-return';
import type { VarAssignmentResult } from '@interpreter/eval/var';
import { parseFrontmatter } from '@interpreter/utils/frontmatter-parser';
import type { InterpolationNode } from '@interpreter/utils/interpolation';
import { createUnknownNodeTypeError, getDispatchTarget } from './dispatch';
import { evaluateCommandNode } from './handlers/command-handler';
import { evaluateFileReferenceNode } from './handlers/load-content-file-reference-handler';
import {
  extractInterpolationNodesFromTemplateLikeNode,
  isCodeFence,
  isComment,
  isDirective,
  isDocument,
  isFrontmatter,
  isMlldRunBlock,
  isNewline,
  isText,
  isVariableReference,
  type DocumentNode
} from './node-guards';
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
  preserveBareVariableReference?: boolean;
  allowEffects?: boolean;
  privileged?: boolean;
  extractedInputs?: readonly unknown[];
  operationContext?: OperationContext;
  precomputedVarAssignment?: VarAssignmentResult;
  policyChecked?: boolean;
  guardMetadata?: Record<string, unknown>;
}

type FrontmatterData = Record<string, unknown> | null;

interface PipelineStageLike {
  meta?: {
    isBuiltinEffect?: boolean;
  };
}

interface PipelineCarrierNodeLike {
  type: string;
  withClause?: {
    pipeline?: PipelineStageLike[];
  };
  values?: {
    withClause?: {
      pipeline?: PipelineStageLike[];
    };
  };
  kind?: string;
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

function isBuiltinEffectStage(stage: unknown): stage is PipelineStageLike {
  if (typeof stage !== 'object' || stage === null) {
    return false;
  }
  return (stage as PipelineStageLike).meta?.isBuiltinEffect === true;
}

function readPipelineFromNode(node: PipelineCarrierNodeLike): PipelineStageLike[] | undefined {
  const directPipeline = node.withClause?.pipeline;
  if (Array.isArray(directPipeline) && directPipeline.length > 0) {
    return directPipeline;
  }

  const directivePipeline = node.values?.withClause?.pipeline;
  if (Array.isArray(directivePipeline) && directivePipeline.length > 0) {
    return directivePipeline;
  }

  return undefined;
}

function isBareBuiltinEffectPipelineNode(node: unknown): node is PipelineCarrierNodeLike {
  if (typeof node !== 'object' || node === null) {
    return false;
  }
  const candidate = node as PipelineCarrierNodeLike;
  const pipeline = readPipelineFromNode(candidate);
  if (!pipeline) {
    return false;
  }
  return pipeline.every(isBuiltinEffectStage);
}

function parseBareBuiltinEffectPipelines(content: string): MlldNode[] | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }
  if (!trimmed.includes('|') && !/\bwith\s*\{/.test(trimmed)) {
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
      throw new Error('Parsed nodes are not bare builtin-effect pipelines');
    }
    return parsed;
  } catch {
    // Literal pipelines like `"x" | append "out.txt"` are not accepted by
    // ForBlockStatementList. Reparse each line as a synthetic var assignment
    // so we can execute builtin-effect tails without rendering prose text.
    const lines = trimmed
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length > 0);
    if (lines.length === 0) {
      return null;
    }

    const parsedLines: MlldNode[] = [];
    for (let index = 0; index < lines.length; index += 1) {
      const wrapped = `/var @__mlld_inline_effect_${index} = ${lines[index]}`;
      let wrappedAst: unknown;
      try {
        wrappedAst = parseSync(wrapped, {
          startRule: 'Start',
          mode: 'markdown'
        });
      } catch {
        return null;
      }

      if (!Array.isArray(wrappedAst) || wrappedAst.length !== 1) {
        return null;
      }

      const [single] = wrappedAst as MlldNode[];
      if (!isDirective(single) || single.kind !== 'var') {
        return null;
      }
      if (!isBareBuiltinEffectPipelineNode(single)) {
        return null;
      }
      parsedLines.push(single);
    }

    return parsedLines;
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
    const contentToInterpolate = extractInterpolationNodesFromTemplateLikeNode(node);
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
    const { evaluateExecInvocation } = await import('@interpreter/eval/exec-invocation');
    return evaluateExecInvocation(node, env);
  }

  if (dispatchTarget === 'variableReferenceWithTail' && node.type === 'VariableReferenceWithTail') {
    const { VariableReferenceEvaluator } = await import('@interpreter/eval/data-values/VariableReferenceEvaluator');
    const evaluator = new VariableReferenceEvaluator();
    const result = await evaluator.evaluate(node as any, env);
    return { value: result, env };
  }

  if (dispatchTarget === 'newExpression' && node.type === 'NewExpression') {
    const { evaluateNewExpression } = await import('@interpreter/eval/new-expression');
    const value = await evaluateNewExpression(node as any, env);
    return { value, env };
  }

  if (dispatchTarget === 'labelModification' && node.type === 'LabelModification') {
    const { evaluateLabelModification } = await import('@interpreter/eval/label-modification');
    return evaluateLabelModification(node as any, env, context);
  }

  if (
    dispatchTarget === 'unifiedExpression' &&
    (node.type === 'BinaryExpression' ||
      node.type === 'TernaryExpression' ||
      node.type === 'UnaryExpression')
  ) {
    const { evaluateUnifiedExpression } = await import('@interpreter/eval/expressions');
    const result = await evaluateUnifiedExpression(node as any, env);
    return { value: result.value, env };
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
      if (Array.isArray(node.value)) {
        const target = node.value.length === 1 ? node.value[0] : node.value;
        if (target && typeof target === 'object' && 'type' in (target as Record<string, unknown>)) {
          const evaluated = await evaluateNode(target as any, env, { isExpression: true });
          return { value: { ...node, value: evaluated.value, _resolved: true }, env };
        }
      }
      return { value: node, env };
    }

    return { value: node.value, env };
  }

  if (dispatchTarget === 'whenExpression' && node.type === 'WhenExpression') {
    const { evaluateWhenExpression } = await import('@interpreter/eval/when-expression');
    return evaluateWhenExpression(node as any, env, context);
  }

  if (dispatchTarget === 'exeBlock' && node.type === 'ExeBlock') {
    const { evaluateExeBlock } = await import('@interpreter/eval/exe');
    return evaluateExeBlock(node as any, env, {}, { scope: 'block' });
  }

  if (dispatchTarget === 'exeReturn' && node.type === 'ExeReturn') {
    const exeContext = env.getExecutionContext<{ allowReturn?: boolean }>('exe');
    if (!exeContext?.allowReturn) {
      throw new MlldDirectiveError(
        'Return statements are only allowed inside exe blocks.',
        'return',
        { location: node.location }
      );
    }
    const returnResult = await resolveExeReturnValue(node as ExeReturnNode, env);
    return {
      value: createExeReturnControl(returnResult.value),
      env: returnResult.env || env
    };
  }

  if (dispatchTarget === 'foreach' && (node.type === 'foreach' || node.type === 'foreach-command')) {
    const { evaluateForeachCommand } = await import('@interpreter/eval/foreach');
    const result = await evaluateForeachCommand(node as any, env);
    return { value: result, env };
  }

  if (dispatchTarget === 'forExpression' && node.type === 'ForExpression') {
    const { evaluateForExpression } = await import('@interpreter/eval/for');
    const result = await evaluateForExpression(node as any, env);
    return { value: result, env };
  }

  if (dispatchTarget === 'loopExpression' && node.type === 'LoopExpression') {
    const { evaluateLoopExpression } = await import('@interpreter/eval/loop');
    const result = await evaluateLoopExpression(node as any, env);
    return { value: result, env };
  }

  if (dispatchTarget === 'dataValue' && (node.type === 'array' || node.type === 'object')) {
    const result = await evaluateDataValue(node, env);
    return { value: result, env };
  }

  if (dispatchTarget === 'loadContent' && node.type === 'load-content') {
    const result = await evaluateDataValue(node as any, env);
    return { value: result, env };
  }

  if (dispatchTarget === 'fileReference' && node.type === 'FileReference') {
    return evaluateFileReferenceNode(node as any, env);
  }

  if (dispatchTarget === 'code' && node.type === 'code') {
    const { evaluateCodeExecution } = await import('@interpreter/eval/code-execution');
    const result = await evaluateCodeExecution(node as any, env);
    return { value: result.value, env };
  }

  if (dispatchTarget === 'command' && node.type === 'command') {
    return evaluateCommandNode(node as any, env, interpolateWithSecurityRecording);
  }

  throw createUnknownNodeTypeError(node as MlldNode);
}
