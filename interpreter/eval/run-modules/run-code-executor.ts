import type { DirectiveNode } from '@core/types';
import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import type { EvaluationContext } from '@interpreter/core/interpreter';
import { resolveWorkingDirectory } from '@interpreter/utils/working-directory';
import { AutoUnwrapManager } from '@interpreter/eval/auto-unwrap-manager';
import { varMxToSecurityDescriptor } from '@core/types/variable/VarMxHelpers';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import {
  applyRunOperationContext,
  buildRunCapabilityOperationUpdate,
  checkRunInputLabelFlow,
  enforceRunCapabilityPolicy
} from './run-policy-context';
import {
  dedentCommonIndent,
  extractRawTextContent,
  resolveRunCodeOpType
} from './run-pure-helpers';

export type RunCodeExecutionParams = {
  directive: DirectiveNode;
  env: Environment;
  context?: EvaluationContext;
  executionContext: Record<string, unknown>;
  streamingEnabled: boolean;
  pipelineId: string;
  policyEnforcer: PolicyEnforcer;
  policyChecksEnabled: boolean;
};

export type RunCodeExecutionResult = {
  value: unknown;
};

async function extractRunCodeArgs(params: {
  args: any[];
  env: Environment;
}): Promise<{ argValues: Record<string, any>; argDescriptors: SecurityDescriptor[] }> {
  const { args, env } = params;
  const argDescriptors: SecurityDescriptor[] = [];
  if (args.length === 0) {
    return { argValues: {}, argDescriptors };
  }

  const argValues = await AutoUnwrapManager.executeWithPreservation(async () => {
    const extracted: Record<string, any> = {};
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      if (arg && typeof arg === 'object' && arg.type === 'VariableReference') {
        const varName = arg.identifier;
        const variable = env.getVariable(varName);
        if (!variable) {
          throw new Error(`Variable not found: ${varName}`);
        }
        if (variable.mx) {
          argDescriptors.push(varMxToSecurityDescriptor(variable.mx));
        }

        const { extractVariableValue } = await import('@interpreter/utils/variable-resolution');
        const value = await extractVariableValue(variable, env);
        extracted[varName] = AutoUnwrapManager.unwrap(value);
        continue;
      }

      if (typeof arg === 'string') {
        extracted[`arg${i}`] = arg;
      }
    }
    return extracted;
  });

  return { argValues, argDescriptors };
}

export async function executeRunCode(
  params: RunCodeExecutionParams
): Promise<RunCodeExecutionResult> {
  const {
    directive,
    env,
    context,
    executionContext,
    streamingEnabled,
    pipelineId,
    policyEnforcer,
    policyChecksEnabled
  } = params;

  const codeNodes = directive.values?.code;
  if (!codeNodes) {
    throw new Error('Run code directive missing code');
  }

  const code = dedentCommonIndent(extractRawTextContent(codeNodes));
  const workingDirectory = await resolveWorkingDirectory(
    (directive.values as any)?.workingDir,
    env,
    { sourceLocation: directive.location, directiveType: 'run' }
  );

  const args = directive.values?.args || [];
  const { argValues, argDescriptors } = await extractRunCodeArgs({ args, env });

  const language = (directive.meta?.language as string) || 'javascript';
  const opType = resolveRunCodeOpType(language);
  let opLabels: string[] = [];
  if (opType) {
    const opUpdate = buildRunCapabilityOperationUpdate(opType, {
      includeSubtype: true,
      includeSources: true
    });
    applyRunOperationContext(env, context, opUpdate);
    opLabels = (opUpdate.opLabels ?? []) as string[];
  }

  if (opType) {
    enforceRunCapabilityPolicy(
      env.getPolicySummary(),
      opType,
      env,
      directive.location ?? undefined
    );
  }

  const inputDescriptor =
    argDescriptors.length > 0 ? env.mergeSecurityDescriptors(...argDescriptors) : undefined;
  checkRunInputLabelFlow({
    descriptor: inputDescriptor,
    policyEnforcer,
    policyChecksEnabled: policyChecksEnabled && Boolean(opType),
    opLabels,
    exeLabels: Array.from(env.getEnclosingExeLabels()),
    flowChannel: 'arg',
    env,
    sourceLocation: directive.location ?? undefined
  });

  const value = await AutoUnwrapManager.executeWithPreservation(async () => {
    return env.executeCode(
      code,
      language,
      argValues,
      undefined,
      workingDirectory ? { workingDirectory } : undefined,
      {
        ...executionContext,
        streamingEnabled,
        pipelineId,
        workingDirectory
      }
    );
  });

  return { value };
}
