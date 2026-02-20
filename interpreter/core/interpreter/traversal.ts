import type {
  BaseMlldNode,
  CodeFenceNode,
  CommentNode,
  DirectiveNode,
  FrontmatterNode,
  MlldNode,
  NewlineNode,
  TextNode
} from '@core/types';
import { interpreterLogger as logger } from '@core/utils/logger';
import type { Environment } from '@interpreter/env/Environment';
import { isExeReturnControl } from '@interpreter/eval/exe-return';
import { materializeDisplayValue } from '@interpreter/utils/display-materialization';
import { parseFrontmatter } from '@interpreter/utils/frontmatter-parser';

type FrontmatterData = Record<string, unknown> | null;

export interface TraversalEvaluationContext {
  isExpression?: boolean;
}

export interface TraversalEvalResult {
  value: unknown;
  env: Environment;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  metadata?: Record<string, unknown>;
}

interface EvaluateArrayNodesOptions {
  nodes: MlldNode[];
  env: Environment;
  context?: TraversalEvaluationContext;
  evaluateNode: (
    node: MlldNode,
    env: Environment,
    context?: TraversalEvaluationContext
  ) => Promise<TraversalEvalResult>;
  parseBareBuiltinEffectPipelines: (content: string) => MlldNode[] | null;
}

interface MlldRunBlockNode extends BaseMlldNode {
  type: 'MlldRunBlock';
  content: MlldNode[];
  raw: string;
  error?: string;
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

function isTemplateWrapperNode(node: MlldNode): boolean {
  return typeof node === 'object' &&
    node !== null &&
    'wrapperType' in node &&
    'content' in node;
}

function emitNonDirectiveIntents(
  node: MlldNode,
  env: Environment,
  context?: TraversalEvaluationContext
): void {
  if (isDirective(node) || context?.isExpression) {
    return;
  }

  if (isText(node) && node.content.trimStart().match(/^(>>|<<)/)) {
    return;
  }

  if (isComment(node)) {
    logger.debug('Skipping comment node:', { content: node.content });
    return;
  }

  if (isText(node)) {
    if (/^\n+$/.test(node.content)) {
      for (let i = 0; i < node.content.length; i++) {
        env.emitIntent({
          type: 'break',
          value: '\n',
          source: 'newline',
          visibility: 'always',
          collapsible: true
        });
      }
    } else {
      const materialized = materializeDisplayValue(node.content, undefined, node.content);
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
    return;
  }

  if (isNewline(node)) {
    env.emitIntent({
      type: 'break',
      value: '\n',
      source: 'newline',
      visibility: 'always',
      collapsible: true
    });
    return;
  }

  if (isCodeFence(node)) {
    const materialized = materializeDisplayValue(node.content, undefined, node.content);
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
    return;
  }

  if (isMlldRunBlock(node) && !node.error) {
    return;
  }

  if (isTemplateWrapperNode(node)) {
    return;
  }

  logger.debug('Skipping non-document node type:', { type: node.type });
}

function shouldReturnProcessResult(lastResult: TraversalEvalResult | null): lastResult is TraversalEvalResult {
  return Boolean(
    lastResult &&
    (lastResult.stdout !== undefined ||
      lastResult.stderr !== undefined ||
      lastResult.exitCode !== undefined)
  );
}

export async function evaluateArrayNodes({
  nodes,
  env,
  context,
  evaluateNode,
  parseBareBuiltinEffectPipelines
}: EvaluateArrayNodesOptions): Promise<TraversalEvalResult> {
  let lastValue: unknown = undefined;
  let lastResult: TraversalEvalResult | null = null;

  const hasLeadingFrontmatter = nodes.length > 0 && isFrontmatter(nodes[0]);
  let startIndex = 0;

  if (hasLeadingFrontmatter) {
    const frontmatterNode = nodes[0] as FrontmatterNode;
    const frontmatterData: FrontmatterData = parseFrontmatter(frontmatterNode.content);
    env.setFrontmatter(frontmatterData);
    startIndex = 1;
  }

  for (let i = startIndex; i < nodes.length; i++) {
    const currentNode = nodes[i];

    const barePipelineStatements = !context?.isExpression && isText(currentNode)
      ? parseBareBuiltinEffectPipelines(currentNode.content)
      : null;
    if (barePipelineStatements) {
      let inlinePipelineResult: TraversalEvalResult | null = null;
      for (const statement of barePipelineStatements) {
        inlinePipelineResult = await evaluateNode(statement, env, context);
        env.addNode(statement);
      }
      if (inlinePipelineResult) {
        lastValue = inlinePipelineResult.value;
        lastResult = inlinePipelineResult;
        const scriptExeContext = env.getExecutionContext<{ scope?: string }>('exe');
        if (scriptExeContext?.scope === 'script' && isExeReturnControl(inlinePipelineResult.value)) {
          return { value: inlinePipelineResult.value, env };
        }
      }
      continue;
    }

    const result = await evaluateNode(currentNode, env, context);
    lastValue = result.value;
    lastResult = result;

    const scriptExeContext = env.getExecutionContext<{ scope?: string }>('exe');
    if (scriptExeContext?.scope === 'script' && isExeReturnControl(result.value)) {
      return { value: result.value, env };
    }

    if (hasLeadingFrontmatter) {
      emitNonDirectiveIntents(currentNode, env, context);
      if (!context?.isExpression) {
        env.addNode(currentNode);
      }
    } else {
      if (!context?.isExpression) {
        env.addNode(currentNode);
      }
      emitNonDirectiveIntents(currentNode, env, context);
    }
  }

  if (shouldReturnProcessResult(lastResult)) {
    return lastResult;
  }

  return { value: lastValue, env };
}
