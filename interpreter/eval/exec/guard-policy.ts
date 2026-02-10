import type { ExecInvocation } from '@core/types';
import type { ExecutableDefinition } from '@core/types/executable';
import {
  isCodeExecutable,
  isCommandExecutable,
  isNodeFunctionExecutable
} from '@core/types/executable';
import { MlldSecurityError } from '@core/errors';
import { GuardError } from '@core/errors/GuardError';
import { evaluateCapabilityAccess, evaluateCommandAccess } from '@core/policy/guards';
import { getOperationLabels, parseCommand } from '@core/policy/operation-labels';
import type { SecurityDescriptor } from '@core/types/security';
import { createSimpleTextVariable } from '@core/types/variable';
import type { Variable, VariableContext, VariableSource } from '@core/types/variable';
import { updateVarMxFromDescriptor } from '@core/types/variable/VarMxHelpers';
import type { WhenExpressionNode } from '@core/types/when';
import type { OperationContext } from '@interpreter/env/ContextManager';
import type { Environment } from '@interpreter/env/Environment';
import type { EvalResult } from '@interpreter/core/interpreter';
import { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { HookDecision } from '@interpreter/hooks/HookManager';
import { getGuardTransformedInputs, handleGuardDecision } from '@interpreter/hooks/hook-decision-handler';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
import { materializeGuardInputsWithMapping, type GuardInputMappingEntry } from '@interpreter/utils/guard-inputs';
import { asText, isStructuredValue } from '@interpreter/utils/structured-value';
import { resolveOpTypeFromLanguage } from '@interpreter/eval/exec/context';
import { formatGuardWarning, handleExecGuardDenial } from '@interpreter/eval/guard-denial-handler';
import { getVariableSecurityDescriptor } from '@interpreter/eval/exec/security-descriptor';

type ResolvedStdinInput = {
  text: string;
  descriptor?: SecurityDescriptor;
};

const DEFAULT_GUARD_INPUT_SOURCE: VariableSource = {
  directive: 'var',
  syntax: 'expression',
  hasInterpolation: false,
  isMultiLine: false
};

export type ExecGuardPolicyServices = {
  interpolateWithResultDescriptor: (
    nodes: any,
    targetEnv: Environment,
    interpolationContext?: InterpolationContext
  ) => Promise<string>;
  getResultSecurityDescriptor: () => SecurityDescriptor | undefined;
  resolveStdinInput: (
    stdinSource: unknown,
    env: Environment
  ) => Promise<ResolvedStdinInput>;
};

export type PrepareExecGuardInputsOptions = {
  env: Environment;
  evaluatedArgs: unknown[];
  evaluatedArgStrings: string[];
  guardVariableCandidates: (Variable | undefined)[];
  expressionSourceVariables: (Variable | undefined)[];
  mcpSecurityDescriptor?: SecurityDescriptor;
};

export type PreparedExecGuardInputs = {
  guardInputsWithMapping: GuardInputMappingEntry[];
  guardInputs: readonly Variable[];
};

export type CreateExecOperationPolicyContextOptions = {
  node: ExecInvocation;
  definition: ExecutableDefinition;
  commandName: string;
  operationName?: string;
  toolLabels: readonly string[];
  env: Environment;
  execEnv: Environment;
  policyEnforcer: PolicyEnforcer;
  mcpSecurityDescriptor?: SecurityDescriptor;
  execDescriptor?: SecurityDescriptor;
  services: ExecGuardPolicyServices;
};

export type ExecOperationPolicyContext = {
  operationContext: OperationContext;
  exeLabels: string[];
  mergePolicyInputDescriptor: (descriptor?: SecurityDescriptor) => SecurityDescriptor | undefined;
};

export type RunExecPreGuardsOptions = {
  env: Environment;
  node: ExecInvocation;
  operationContext: OperationContext;
  guardInputs: readonly Variable[];
  guardInputsWithMapping: readonly GuardInputMappingEntry[];
  guardVariableCandidates: (Variable | undefined)[];
  evaluatedArgs: unknown[];
  evaluatedArgStrings: string[];
};

export type ExecPreGuardResult = {
  preDecision: HookDecision;
  postHookInputs: readonly Variable[];
  transformedGuardSet: ReadonlySet<Variable> | null;
};

export type HandleExecPreGuardDecisionOptions = {
  preDecision: HookDecision;
  node: ExecInvocation;
  env: Environment;
  execEnv: Environment;
  operationContext: OperationContext;
  whenExprNode?: WhenExpressionNode | null;
};

export type EnforceExecParamLabelFlowOptions = {
  env: Environment;
  execEnv: Environment;
  node: ExecInvocation;
  whenExprNode?: WhenExpressionNode | null;
  policyEnforcer: PolicyEnforcer;
  operationContext: OperationContext;
  exeLabels: readonly string[];
  resultSecurityDescriptor?: SecurityDescriptor;
};

export type ApplyExecOutputPolicyLabelsOptions = {
  policyEnforcer: PolicyEnforcer;
  exeLabels: readonly string[];
  resultSecurityDescriptor?: SecurityDescriptor;
};

export type RunExecPostGuardsOptions = {
  env: Environment;
  execEnv: Environment;
  node: ExecInvocation;
  operationContext: OperationContext;
  postHookInputs: readonly Variable[];
  result: EvalResult;
  whenExprNode?: WhenExpressionNode | null;
};

function mergeLabelArrays(base: readonly string[], extra: readonly string[]): string[] {
  if (extra.length === 0) {
    return base.length > 0 ? base.slice() : [];
  }
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const label of base) {
    if (typeof label !== 'string' || label.length === 0 || seen.has(label)) {
      continue;
    }
    seen.add(label);
    merged.push(label);
  }
  for (const label of extra) {
    if (typeof label !== 'string' || label.length === 0 || seen.has(label)) {
      continue;
    }
    seen.add(label);
    merged.push(label);
  }
  return merged;
}

export function cloneExecVariableWithNewValue(
  source: Variable,
  value: unknown,
  fallback: string
): Variable {
  const cloned: Variable = {
    ...source,
    value: value ?? fallback,
    mx: source.mx ? { ...source.mx } : undefined,
    internal: { ...(source.internal ?? {}) }
  };
  if (cloned.mx?.mxCache) {
    delete cloned.mx.mxCache;
  }
  return cloned;
}

export function stringifyExecGuardArg(value: unknown): string {
  if (isStructuredValue(value)) {
    return asText(value);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === undefined) {
    return 'undefined';
  }
  if (value === null) {
    return 'null';
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function applyGuardTransformsToExecArgs(options: {
  guardInputEntries: readonly GuardInputMappingEntry[];
  transformedInputs: readonly Variable[];
  guardVariableCandidates: (Variable | undefined)[];
  evaluatedArgs: unknown[];
  evaluatedArgStrings: string[];
}): void {
  const { guardInputEntries, transformedInputs, guardVariableCandidates, evaluatedArgs, evaluatedArgStrings } =
    options;
  const limit = Math.min(transformedInputs.length, guardInputEntries.length);
  for (let i = 0; i < limit; i++) {
    const entry = guardInputEntries[i];
    const replacement = transformedInputs[i];
    if (!entry || !replacement) {
      continue;
    }
    const argIndex = entry.index;
    if (argIndex < 0 || argIndex >= evaluatedArgs.length) {
      continue;
    }
    guardVariableCandidates[argIndex] = replacement;
    const normalizedValue = isStructuredValue(replacement.value)
      ? replacement.value.data
      : replacement.value;
    evaluatedArgs[argIndex] = normalizedValue;
    evaluatedArgStrings[argIndex] = stringifyExecGuardArg(normalizedValue);
  }
}

export function prepareExecGuardInputs(options: PrepareExecGuardInputsOptions): PreparedExecGuardInputs {
  const {
    env,
    evaluatedArgs,
    evaluatedArgStrings,
    guardVariableCandidates,
    expressionSourceVariables,
    mcpSecurityDescriptor
  } = options;

  for (let i = 0; i < guardVariableCandidates.length; i++) {
    if (!guardVariableCandidates[i] && expressionSourceVariables[i]) {
      const source = expressionSourceVariables[i]!;
      const cloned = cloneExecVariableWithNewValue(
        source,
        evaluatedArgs[i],
        evaluatedArgStrings[i]
      );
      guardVariableCandidates[i] = cloned;
    }
  }

  const guardInputsWithMapping = materializeGuardInputsWithMapping(
    Array.from({ length: guardVariableCandidates.length }, (_unused, index) =>
      guardVariableCandidates[index] ?? evaluatedArgs[index]
    ),
    {
      nameHint: '__guard_input__'
    }
  );

  if (mcpSecurityDescriptor) {
    if (guardInputsWithMapping.length === 0) {
      const syntheticInput = createSimpleTextVariable('__guard_input__', '', DEFAULT_GUARD_INPUT_SOURCE);
      if (!syntheticInput.mx) {
        syntheticInput.mx = {};
      }
      updateVarMxFromDescriptor(syntheticInput.mx as VariableContext, mcpSecurityDescriptor);
      if ((syntheticInput.mx as any).mxCache) {
        delete (syntheticInput.mx as any).mxCache;
      }
      guardInputsWithMapping.push({ index: evaluatedArgs.length, variable: syntheticInput });
    }

    for (const entry of guardInputsWithMapping) {
      const base = entry.variable;
      const baseDescriptor = getVariableSecurityDescriptor(base);
      const mergedDescriptor = baseDescriptor
        ? env.mergeSecurityDescriptors(baseDescriptor, mcpSecurityDescriptor)
        : mcpSecurityDescriptor;
      const cloned = cloneExecVariableWithNewValue(base, base.value, stringifyExecGuardArg(base.value));
      if (!cloned.mx) {
        cloned.mx = {};
      }
      updateVarMxFromDescriptor(cloned.mx as VariableContext, mergedDescriptor);
      if ((cloned.mx as any).mxCache) {
        delete (cloned.mx as any).mxCache;
      }
      entry.variable = cloned;
    }
  }

  return {
    guardInputsWithMapping,
    guardInputs: guardInputsWithMapping.map(entry => entry.variable)
  };
}

export async function createExecOperationContextAndEnforcePolicy(
  options: CreateExecOperationPolicyContextOptions
): Promise<ExecOperationPolicyContext> {
  const {
    node,
    definition,
    commandName,
    operationName,
    toolLabels,
    env,
    execEnv,
    policyEnforcer,
    mcpSecurityDescriptor,
    execDescriptor,
    services
  } = options;

  const mergePolicyInputDescriptor = (
    descriptor?: SecurityDescriptor
  ): SecurityDescriptor | undefined => {
    if (!mcpSecurityDescriptor) {
      return descriptor;
    }
    if (!descriptor) {
      return mcpSecurityDescriptor;
    }
    return env.mergeSecurityDescriptors(descriptor, mcpSecurityDescriptor);
  };

  const exeLabels = execDescriptor?.labels ? Array.from(execDescriptor.labels) : [];
  const operationLabels = mergeLabelArrays(exeLabels, toolLabels);
  const operationContext: OperationContext = {
    type: 'exe',
    name: operationName ?? commandName,
    labels: operationLabels.length > 0 ? operationLabels : undefined,
    location: node.location ?? null,
    metadata: {
      executableType: definition.type,
      command: commandName,
      sourceRetryable: true
    }
  };

  if (isCommandExecutable(definition)) {
    const commandPreview = await services.interpolateWithResultDescriptor(
      definition.commandTemplate,
      execEnv,
      InterpolationContext.ShellCommand
    );
    const parsedCommand = parseCommand(commandPreview);
    const opLabels = mergeLabelArrays(
      getOperationLabels({
        type: 'cmd',
        command: parsedCommand.command,
        subcommand: parsedCommand.subcommand
      }),
      toolLabels
    );
    if (opLabels.length > 0) {
      operationContext.opLabels = opLabels;
      operationContext.command = commandPreview;
    }
    const metadata = { ...(operationContext.metadata ?? {}) } as Record<string, unknown>;
    metadata.commandPreview = commandPreview;
    operationContext.metadata = metadata;
    const policySummary = env.getPolicySummary();
    if (policySummary) {
      const decision = evaluateCommandAccess(policySummary, commandPreview);
      if (!decision.allowed) {
        throw new MlldSecurityError(
          decision.reason ?? `Command '${decision.commandName}' denied by policy`,
          {
            code: 'POLICY_CAPABILITY_DENIED',
            sourceLocation: node.location,
            env
          }
        );
      }
    }
    const flowChannel =
      definition.withClause?.auth ||
      definition.withClause?.using ||
      node.withClause?.auth ||
      node.withClause?.using
        ? 'using'
        : 'arg';
    const inputTaint = descriptorToInputTaint(
      mergePolicyInputDescriptor(services.getResultSecurityDescriptor())
    );
    if (inputTaint.length > 0) {
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels,
          exeLabels,
          flowChannel,
          command: parsedCommand.command
        },
        { env, sourceLocation: node.location }
      );
    }
    if (definition.withClause && 'stdin' in definition.withClause) {
      const resolvedStdin = await services.resolveStdinInput(definition.withClause.stdin, execEnv);
      const stdinTaint = descriptorToInputTaint(resolvedStdin.descriptor);
      if (stdinTaint.length > 0) {
        policyEnforcer.checkLabelFlow(
          {
            inputTaint: stdinTaint,
            opLabels,
            exeLabels,
            flowChannel: 'stdin',
            command: parsedCommand.command
          },
          { env, sourceLocation: node.location }
        );
      }
    }
  } else if (isCodeExecutable(definition)) {
    const opType = resolveOpTypeFromLanguage(definition.language);
    const opLabels = mergeLabelArrays(
      opType ? getOperationLabels({ type: opType }) : [],
      toolLabels
    );
    if (opLabels.length > 0) {
      operationContext.opLabels = opLabels;
    }
    if (opType) {
      const policySummary = env.getPolicySummary();
      if (policySummary) {
        const decision = evaluateCapabilityAccess(policySummary, opType);
        if (!decision.allowed) {
          throw new MlldSecurityError(
            decision.reason ?? `Capability '${opType}' denied by policy`,
            {
              code: 'POLICY_CAPABILITY_DENIED',
              sourceLocation: node.location,
              env
            }
          );
        }
      }
    }
    const inputTaint = descriptorToInputTaint(
      mergePolicyInputDescriptor(services.getResultSecurityDescriptor())
    );
    if (opType && inputTaint.length > 0) {
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels,
          exeLabels,
          flowChannel: 'arg'
        },
        { env, sourceLocation: node.location }
      );
    }
  } else if (isNodeFunctionExecutable(definition)) {
    const opLabels = mergeLabelArrays(getOperationLabels({ type: 'node' }), toolLabels);
    if (opLabels.length > 0) {
      operationContext.opLabels = opLabels;
    }
    const policySummary = env.getPolicySummary();
    if (policySummary) {
      const decision = evaluateCapabilityAccess(policySummary, 'node');
      if (!decision.allowed) {
        throw new MlldSecurityError(
          decision.reason ?? "Capability 'node' denied by policy",
          {
            code: 'POLICY_CAPABILITY_DENIED',
            sourceLocation: node.location,
            env
          }
        );
      }
    }
    const inputTaint = descriptorToInputTaint(
      mergePolicyInputDescriptor(services.getResultSecurityDescriptor())
    );
    if (inputTaint.length > 0) {
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels,
          exeLabels,
          flowChannel: 'arg'
        },
        { env, sourceLocation: node.location }
      );
    }
  } else {
    const inputTaint = descriptorToInputTaint(
      mergePolicyInputDescriptor(services.getResultSecurityDescriptor())
    );
    if (inputTaint.length > 0) {
      policyEnforcer.checkLabelFlow(
        {
          inputTaint,
          opLabels: [],
          exeLabels,
          flowChannel: 'arg'
        },
        { env, sourceLocation: node.location }
      );
    }
  }

  return {
    operationContext,
    exeLabels,
    mergePolicyInputDescriptor
  };
}

export async function runExecPreGuards(options: RunExecPreGuardsOptions): Promise<ExecPreGuardResult> {
  const {
    env,
    node,
    operationContext,
    guardInputs,
    guardInputsWithMapping,
    guardVariableCandidates,
    evaluatedArgs,
    evaluatedArgStrings
  } = options;
  const hookManager = env.getHookManager();
  const preDecision = await hookManager.runPre(node, guardInputs, env, operationContext);
  const transformedGuardInputs = getGuardTransformedInputs(preDecision, guardInputs);
  let postHookInputs: readonly Variable[] = guardInputs;
  let transformedGuardSet: ReadonlySet<Variable> | null = null;
  if (transformedGuardInputs && transformedGuardInputs.length > 0) {
    postHookInputs = transformedGuardInputs;
    transformedGuardSet = new Set(transformedGuardInputs as readonly Variable[]);
    applyGuardTransformsToExecArgs({
      guardInputEntries: guardInputsWithMapping,
      transformedInputs: transformedGuardInputs,
      guardVariableCandidates,
      evaluatedArgs,
      evaluatedArgStrings
    });
  }
  return {
    preDecision,
    postHookInputs,
    transformedGuardSet
  };
}

export async function handleExecPreGuardDecision(
  options: HandleExecPreGuardDecisionOptions
): Promise<EvalResult | null> {
  const { preDecision, node, env, execEnv, operationContext, whenExprNode } = options;
  const guardInputVariable =
    preDecision && preDecision.metadata && (preDecision.metadata as Record<string, unknown>).guardInput;
  try {
    await handleGuardDecision(preDecision, node, env, operationContext);
  } catch (error) {
    if (guardInputVariable) {
      const existingInput = execEnv.getVariable('input');
      if (!existingInput) {
        const clonedInput: Variable = {
          ...(guardInputVariable as Variable),
          name: 'input',
          mx: { ...(guardInputVariable as Variable).mx },
          internal: {
            ...((guardInputVariable as Variable).internal ?? {}),
            isSystem: true,
            isParameter: true
          }
        };
        execEnv.setParameterVariable('input', clonedInput);
      }
    }
    if (whenExprNode) {
      const handled = await handleExecGuardDenial(error, {
        execEnv,
        env,
        whenExprNode
      });
      if (handled) {
        return handled;
      }
    }
    throw error;
  }
  return null;
}

export async function enforceExecParamLabelFlow(
  options: EnforceExecParamLabelFlowOptions
): Promise<EvalResult | null> {
  const {
    env,
    execEnv,
    node,
    whenExprNode,
    policyEnforcer,
    operationContext,
    exeLabels,
    resultSecurityDescriptor
  } = options;
  const paramInputTaint = descriptorToInputTaint(resultSecurityDescriptor);
  if (paramInputTaint.length === 0) {
    return null;
  }
  try {
    policyEnforcer.checkLabelFlow(
      {
        inputTaint: paramInputTaint,
        opLabels: operationContext.opLabels ?? [],
        exeLabels,
        flowChannel: 'arg'
      },
      { env, sourceLocation: node.location }
    );
  } catch (policyError) {
    if (whenExprNode) {
      const handled = await handleExecGuardDenial(policyError, {
        execEnv,
        env,
        whenExprNode
      });
      if (handled) {
        return handled;
      }
    }
    throw policyError;
  }
  return null;
}

export function applyExecOutputPolicyLabels(
  options: ApplyExecOutputPolicyLabelsOptions
): SecurityDescriptor | undefined {
  const { policyEnforcer, exeLabels, resultSecurityDescriptor } = options;
  const outputDescriptor = policyEnforcer.applyOutputPolicyLabels(
    resultSecurityDescriptor,
    {
      inputTaint: descriptorToInputTaint(resultSecurityDescriptor),
      exeLabels
    }
  );
  return outputDescriptor ?? resultSecurityDescriptor;
}

export async function runExecPostGuards(options: RunExecPostGuardsOptions): Promise<EvalResult> {
  const {
    env,
    execEnv,
    node,
    operationContext,
    postHookInputs,
    result,
    whenExprNode
  } = options;
  const hookManager = env.getHookManager();
  try {
    return await hookManager.runPost(node, result, postHookInputs, env, operationContext);
  } catch (error) {
    if (whenExprNode) {
      const handled = await handleExecGuardDenial(error, {
        execEnv,
        env,
        whenExprNode
      });
      if (handled) {
        return handled;
      }
    }
    if (
      !whenExprNode &&
      error instanceof GuardError &&
      error.decision === 'deny' &&
      error.details?.timing === 'after'
    ) {
      const guardDetails = error.details as Record<string, unknown> | undefined;
      const warning = formatGuardWarning(
        error.reason ?? (guardDetails?.reason as string | undefined),
        guardDetails?.guardFilter as string | undefined,
        guardDetails?.guardName as string | null | undefined
      );
      env.emitEffect('stderr', `${warning}\n`);
    }
    throw error;
  }
}
