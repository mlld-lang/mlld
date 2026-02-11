import type { DirectiveNode, SourceLocation } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { Environment } from '@interpreter/env/Environment';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { isExeReturnControl } from '../exe-return';

export interface ExecutionDescriptorState {
  descriptorFromVariable: (variable?: Variable) => SecurityDescriptor | undefined;
  mergeResolvedDescriptor: (descriptor?: SecurityDescriptor) => void;
}

export interface ExecutionEvaluatorDependencies {
  context?: EvaluationContext;
  descriptorState: ExecutionDescriptorState;
  directive: DirectiveNode;
  env: Environment;
  interpolateWithSecurity: (
    nodes: unknown,
    interpolationContext?: InterpolationContext
  ) => Promise<string>;
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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

async function resolveWithClauseToolsValue(
  toolsValue: unknown,
  env: Environment,
  context?: EvaluationContext
): Promise<unknown> {
  if (!toolsValue || typeof toolsValue !== 'object' || !('type' in (toolsValue as any))) {
    return toolsValue;
  }

  const { evaluate } = await import('@interpreter/core/interpreter');
  const result = await evaluate(toolsValue as any, env, { ...(context ?? {}), isExpression: true });
  let value = result.value;

  const { extractVariableValue, isVariable } = await import('@interpreter/utils/variable-resolution');
  if (isVariable(value)) {
    value = await extractVariableValue(value, env);
  }
  if (isStructuredValue(value)) {
    value = asData(value);
  }

  return value;
}

type ToolScopeValue = {
  tools: string[];
  hasTools: boolean;
  isWildcard: boolean;
};

function normalizeToolScopeValue(value: unknown): ToolScopeValue {
  if (value === undefined) {
    return { tools: [], hasTools: false, isWildcard: false };
  }
  if (value === null) {
    throw new Error('tools must be an array or object.');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return { tools: [], hasTools: true, isWildcard: false };
    }
    if (trimmed === '*') {
      return { tools: [], hasTools: false, isWildcard: true };
    }
    const tools = trimmed
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    return { tools, hasTools: true, isWildcard: false };
  }
  if (Array.isArray(value)) {
    const tools: string[] = [];
    for (const entry of value) {
      if (typeof entry !== 'string') {
        throw new Error('tools entries must be strings.');
      }
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        tools.push(trimmed);
      }
    }
    return { tools, hasTools: true, isWildcard: false };
  }
  if (isPlainObject(value)) {
    return { tools: Object.keys(value), hasTools: true, isWildcard: false };
  }
  throw new Error('tools must be an array or object.');
}

function enforceToolSubset(baseTools: string[], childTools: string[]): void {
  const baseSet = new Set(baseTools);
  const invalid = childTools.filter(tool => !baseSet.has(tool));
  if (invalid.length > 0) {
    throw new Error(`Tool scope cannot add tools outside parent: ${invalid.join(', ')}`);
  }
}

export function createExecutionEvaluator(
  dependencies: ExecutionEvaluatorDependencies
): ExecutionEvaluator {
  const {
    context,
    descriptorState,
    directive,
    env,
    interpolateWithSecurity,
    sourceLocation
  } = dependencies;

  const evaluateCommand = async (valueNode: any): Promise<unknown> => {
    const withClause = (directive.values?.withClause || directive.meta?.withClause) as any | undefined;

    if (withClause) {
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
          withClause
        },
        raw: {
          command: Array.isArray(valueNode.command)
            ? (valueNode.meta?.raw || '')
            : String(valueNode.command),
          withClause
        },
        meta: {
          isDataValue: true
        }
      };
      const result = await evaluateRun(runDirective, env);
      return result.value;
    }

    let commandOutput: unknown;
    if (Array.isArray(valueNode.command)) {
      const interpolatedCommand = await interpolateWithSecurity(
        valueNode.command,
        InterpolationContext.ShellCommand
      );
      commandOutput = await env.executeCommand(interpolatedCommand);
    } else {
      commandOutput = await env.executeCommand(valueNode.command);
    }

    const { processCommandOutput } = await import('@interpreter/utils/json-auto-parser');
    return processCommandOutput(commandOutput);
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
