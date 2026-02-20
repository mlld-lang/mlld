import type { DirectiveNode, SourceLocation } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import {
  asText,
  extractSecurityDescriptor,
  isStructuredValue
} from '@interpreter/utils/structured-value';
import { isExeReturnControl } from '../exe-return';
import {
  enforceToolSubset,
  isPlainObject,
  normalizeToolScopeValue,
  resolveWithClauseToolsValue
} from './tool-scope';

export interface ExecutionDescriptorState {
  descriptorFromVariable: (variable?: Variable) => SecurityDescriptor | undefined;
  mergeResolvedDescriptor: (descriptor?: SecurityDescriptor) => void;
}

export interface ExecutionEvaluatorDependencies {
  context?: EvaluationContext;
  descriptorState: ExecutionDescriptorState;
  directive: DirectiveNode;
  env: Environment;
  sourceLocation?: SourceLocation;
}

export type ExecutionEvaluationResult =
  | { kind: 'resolved'; value: unknown }
  | { kind: 'for-expression'; variable: Variable }
  | { kind: 'return-control'; value: unknown };

export interface ExecutionEvaluator {
  evaluateExecutionBranch: (
    valueNode: unknown,
    assignmentIdentifier: string
  ) => Promise<ExecutionEvaluationResult | undefined>;
}

export function isExecutionValueNode(valueNode: unknown): boolean {
  if (!valueNode || typeof valueNode !== 'object' || !('type' in valueNode)) {
    return false;
  }

  const node = valueNode as { type?: string; kind?: string };
  if (node.type === 'Directive') {
    return node.kind === 'env';
  }

  return node.type === 'code'
    || node.type === 'command'
    || node.type === 'ExecInvocation'
    || node.type === 'ExeBlock'
    || node.type === 'WhenExpression'
    || node.type === 'ForExpression'
    || node.type === 'LoopExpression'
    || node.type === 'foreach'
    || node.type === 'foreach-command'
    || node.type === 'NewExpression';
}

export function createExecutionEvaluator(
  dependencies: ExecutionEvaluatorDependencies
): ExecutionEvaluator {
  const {
    context,
    descriptorState,
    directive,
    env,
    sourceLocation
  } = dependencies;

  const evaluateCommand = async (valueNode: any): Promise<unknown> => {
    const withClause = (directive.values?.withClause || directive.meta?.withClause) as any | undefined;
    const runWithClause =
      valueNode.using || withClause
        ? { ...(valueNode.using || {}), ...(withClause || {}) }
        : undefined;
    const { evaluateRun } = await import('../run');
    const runDirective: any = {
      type: 'Directive',
      nodeId: (directive as any).nodeId ? `${(directive as any).nodeId}-run` : undefined,
      location: directive.location,
      kind: 'run',
      subtype: 'runCommand',
      source: 'command',
      values: {
        command: valueNode.command,
        ...(valueNode.workingDir ? { workingDir: valueNode.workingDir } : {}),
        ...(runWithClause ? { withClause: runWithClause } : {})
      },
      raw: {
        command: Array.isArray(valueNode.command)
          ? (valueNode.meta?.raw || '')
          : String(valueNode.command),
        ...(runWithClause ? { withClause: runWithClause } : {})
      },
      meta: {
        isDataValue: true
      }
    };
    const result = await evaluateRun(runDirective, env);
    const commandResultDescriptor = extractSecurityDescriptor(result.value, {
      recursive: true,
      mergeArrayElements: true
    });
    if (commandResultDescriptor) {
      descriptorState.mergeResolvedDescriptor(commandResultDescriptor);
    }
    const textOutput = isStructuredValue(result.value)
      ? asText(result.value)
      : typeof result.value === 'string'
        ? result.value
        : String(result.value ?? '');
    const commandPreview = Array.isArray(valueNode.command)
      ? (valueNode.meta?.raw || textOutput)
      : String(valueNode.command ?? '');
    const { processCommandOutput } = await import('@interpreter/utils/json-auto-parser');
    return processCommandOutput(textOutput, undefined, {
      source: 'cmd',
      command: commandPreview
    });
  };

  const evaluateExecutionBranch = async (
    valueNode: unknown,
    assignmentIdentifier: string
  ): Promise<ExecutionEvaluationResult | undefined> => {
    if (!isExecutionValueNode(valueNode)) {
      return undefined;
    }

    const node = valueNode as any;

    if (node.type === 'code') {
      const { evaluateCodeExecution } = await import('../code-execution');
      const result = await evaluateCodeExecution(node, env, sourceLocation ?? undefined);
      return { kind: 'resolved', value: result.value };
    }

    if (node.type === 'command') {
      const value = await evaluateCommand(node);
      return { kind: 'resolved', value };
    }

    if (node.type === 'foreach' || node.type === 'foreach-command') {
      const { evaluateForeachCommand } = await import('../foreach');
      const value = await evaluateForeachCommand(node, env);
      return { kind: 'resolved', value };
    }

    if (node.type === 'WhenExpression') {
      const { evaluateWhenExpression } = await import('../when-expression');
      const whenResult = await evaluateWhenExpression(node, env, context);
      return { kind: 'resolved', value: whenResult.value };
    }

    if (node.type === 'ExeBlock') {
      const { evaluateExeBlock } = await import('../exe');
      const blockEnv = env.createChild();
      const blockResult = await evaluateExeBlock(node, blockEnv, {}, { scope: 'block' });
      if (isExeReturnControl(blockResult.value)) {
        return { kind: 'return-control', value: blockResult.value };
      }
      return { kind: 'resolved', value: blockResult.value };
    }

    if (node.type === 'ExecInvocation') {
      if (process.env.MLLD_DEBUG === 'true') {
        console.error('[var.ts] Processing ExecInvocation:', {
          hasWithClause: !!node.withClause,
          hasPipeline: !!(node.withClause?.pipeline)
        });
      }
      const { evaluateExecInvocation } = await import('../exec-invocation');
      const result = await evaluateExecInvocation(node, env);
      return { kind: 'resolved', value: result.value };
    }

    if (node.type === 'NewExpression') {
      const { evaluateNewExpression } = await import('../new-expression');
      const baseValue = await evaluateNewExpression(node, env);
      const withClause = (directive.values?.withClause || directive.meta?.withClause) as any | undefined;
      if (withClause && Object.prototype.hasOwnProperty.call(withClause, 'tools')) {
        if (!isPlainObject(baseValue)) {
          throw new Error('new env derivation requires an object base config');
        }

        const resolvedTools = await resolveWithClauseToolsValue(withClause.tools, env, context);
        const baseScope = normalizeToolScopeValue((baseValue as Record<string, unknown>).tools);
        const childScope = normalizeToolScopeValue(resolvedTools);

        if (baseScope.hasTools) {
          if (childScope.isWildcard) {
            throw new Error('Tool scope cannot widen beyond parent environment');
          }
          if (childScope.hasTools) {
            enforceToolSubset(baseScope.tools, childScope.tools);
          }
        }

        if (resolvedTools === undefined) {
          return { kind: 'resolved', value: baseValue };
        }

        return {
          kind: 'resolved',
          value: {
            ...(baseValue as Record<string, unknown>),
            tools: resolvedTools
          }
        };
      }

      return { kind: 'resolved', value: baseValue };
    }

    if (node.type === 'ForExpression') {
      const { evaluateForExpression } = await import('../for');
      const forResult = await evaluateForExpression(node, env);
      if (forResult.mx) {
        const forDescriptor = descriptorState.descriptorFromVariable(forResult);
        descriptorState.mergeResolvedDescriptor(forDescriptor);
      }
      return {
        kind: 'for-expression',
        variable: forResult
      };
    }

    if (node.type === 'LoopExpression') {
      const { evaluateLoopExpression } = await import('../loop');
      const value = await evaluateLoopExpression(node, env);
      return { kind: 'resolved', value };
    }

    if (node.type === 'Directive' && node.kind === 'env') {
      const { evaluateEnv } = await import('../env');
      const envResult = await evaluateEnv(node, env, context);
      return { kind: 'resolved', value: envResult.value };
    }

    throw new Error(`Unsupported execution branch for @${assignmentIdentifier}: ${node.type}`);
  };

  return {
    evaluateExecutionBranch
  };
}
