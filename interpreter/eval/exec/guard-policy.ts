import type { ExecInvocation } from '@core/types';
import type { ExecutableDefinition } from '@core/types/executable';
import {
  isCodeExecutable,
  isCommandExecutable,
  isNodeFunctionExecutable
} from '@core/types/executable';
import { MlldSecurityError } from '@core/errors';
import { GuardError } from '@core/errors/GuardError';
import {
  evaluateCapabilityAccess,
  evaluateCommandAccess,
  shouldEnforceCommandAllowListForOperation,
  shouldApplySurfaceScopedPolicyToOperation
} from '@core/policy/guards';
import { hasManagedPolicyLabelFlow } from '@core/policy/label-flow';
import {
  getOperationLabels,
  normalizeNamedOperationRef,
  resolveCanonicalOperationRef,
  parseCommand
} from '@core/policy/operation-labels';
import type { FactSourceHandle } from '@core/types/handle';
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
import {
  applyCheckpointDecisionToOperation,
  getCheckpointDecisionState,
  getGuardTransformedInputs,
  handleGuardDecision
} from '@interpreter/hooks/hook-decision-handler';
import { runUserAfterHooksOnGuardDenial } from '@interpreter/hooks/guard-denial-after-hooks';
import { runUserAfterHooks, runUserBeforeHooks } from '@interpreter/hooks/user-hook-runner';
import type { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
import {
  materializeGuardInputs,
  materializeGuardInputsWithMapping,
  type GuardInputMappingEntry
} from '@interpreter/utils/guard-inputs';
import {
  mergeGuardArgNamesIntoMetadata,
  type GuardArgName
} from '@interpreter/utils/guard-args';
import { asText, extractSecurityDescriptor, isStructuredValue } from '@interpreter/utils/structured-value';
import { isVariable } from '@interpreter/utils/variable-resolution';
import { resolveOpTypeFromLanguage } from '@interpreter/eval/exec/context';
import { formatGuardWarning, handleExecGuardDenial } from '@interpreter/eval/guard-denial-handler';
import { getVariableSecurityDescriptor } from '@interpreter/eval/exec/security-descriptor';
import {
  hasRuntimeAuthorizationSurface,
  isRuntimeAuthorizationSurfaceOperation,
  resolveAuthorizationSurfaceOperation
} from '@interpreter/eval/exec/tool-metadata';

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
  stringifyArg?: (value: unknown) => string;
  guardVariableCandidates: (Variable | undefined)[];
  expressionSourceVariables: (Variable | undefined)[];
  inputSecurityDescriptor?: SecurityDescriptor;
  argSecurityDescriptors?: readonly (SecurityDescriptor | undefined)[];
  argFactSourceDescriptors?: readonly (readonly FactSourceHandle[] | undefined)[];
  mcpSecurityDescriptor?: SecurityDescriptor;
  argNames?: readonly GuardArgName[];
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
  authorizationControlArgs?: readonly string[];
  authorizationSourceArgs?: readonly string[];
  commandAccessSubstrate?: boolean;
  correlateControlArgs?: boolean;
  operationTaintFacts?: boolean;
  env: Environment;
  execEnv: Environment;
  policyEnforcer: PolicyEnforcer;
  mcpSecurityDescriptor?: SecurityDescriptor;
  execDescriptor?: SecurityDescriptor;
  services: ExecGuardPolicyServices;
  guardArgNames?: readonly GuardArgName[];
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
  stringifyArg?: (value: unknown) => string;
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
  postHookInputs: readonly Variable[];
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
  inputDescriptor?: SecurityDescriptor;
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

function mergeOperationLabelsWithCanonicalName(
  operationName: string | undefined,
  labels: readonly string[]
): string[] {
  const canonical = normalizeNamedOperationRef(operationName);
  if (!canonical) {
    return labels.length > 0 ? labels.slice() : [];
  }
  return mergeLabelArrays([canonical], labels);
}

export function cloneExecVariableWithNewValue(
  source: Variable,
  value: unknown,
  fallback: string
): Variable {
  const resolvedValue = value !== undefined ? value : fallback;
  const cloned: Variable = {
    ...source,
    value: resolvedValue,
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

export function previewExecGuardArg(value: unknown): string {
  if (isStructuredValue(value)) {
    if (value.data === null || typeof value.data !== 'object') {
      return asText(value);
    }
    const textDescriptor = Object.getOwnPropertyDescriptor(value, 'text');
    if (textDescriptor && 'value' in textDescriptor && typeof textDescriptor.value === 'string') {
      return textDescriptor.value;
    }
    if (Array.isArray(value.data)) {
      return `[${value.type}:${value.data.length}]`;
    }
    return `[${value.type}]`;
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
  if (Array.isArray(value)) {
    return `[array:${value.length}]`;
  }
  if (typeof value === 'object') {
    return '[object]';
  }
  return String(value);
}

function hasStructuredRuntimeSignals(value: unknown, seen = new Set<unknown>()): boolean {
  if (isVariable(value)) {
    return hasStructuredRuntimeSignals(value.value, seen);
  }
  if (isStructuredValue(value)) {
    return true;
  }
  if (!value || typeof value !== 'object') {
    return false;
  }
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);

  const carrier = value as {
    mx?: { factsources?: readonly unknown[] };
    metadata?: { factsources?: readonly unknown[] };
  };
  if (
    (Array.isArray(carrier.mx?.factsources) && carrier.mx.factsources.length > 0)
    || (Array.isArray(carrier.metadata?.factsources) && carrier.metadata.factsources.length > 0)
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(entry => hasStructuredRuntimeSignals(entry, seen));
  }
  return Object.values(value as Record<string, unknown>).some(entry =>
    hasStructuredRuntimeSignals(entry, seen)
  );
}

function shouldPreserveOriginalStructuredArg(originalValue: unknown, replacementValue: unknown): boolean {
  return (
    hasStructuredRuntimeSignals(originalValue)
    && !hasStructuredRuntimeSignals(replacementValue)
    && stringifyExecGuardArg(originalValue) === stringifyExecGuardArg(replacementValue)
  );
}

function applyGuardTransformsToExecArgs(options: {
  guardInputEntries: readonly GuardInputMappingEntry[];
  transformedInputs: readonly Variable[];
  guardVariableCandidates: (Variable | undefined)[];
  evaluatedArgs: unknown[];
  evaluatedArgStrings: string[];
  stringifyArg: (value: unknown) => string;
}): void {
  const {
    guardInputEntries,
    transformedInputs,
    guardVariableCandidates,
    evaluatedArgs,
    evaluatedArgStrings,
    stringifyArg
  } =
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
    // Guard inputs may carry proof-bearing structured values. Preserve the
    // wrapper so downstream executables still receive factsources/labels.
    const originalValue = evaluatedArgs[argIndex];
    const normalizedValue = shouldPreserveOriginalStructuredArg(originalValue, replacement.value)
      ? originalValue
      : replacement.value;
    evaluatedArgs[argIndex] = normalizedValue;
    evaluatedArgStrings[argIndex] = stringifyArg(normalizedValue);
  }
}

export function prepareExecGuardInputs(options: PrepareExecGuardInputsOptions): PreparedExecGuardInputs {
  const {
    env,
    evaluatedArgs,
    evaluatedArgStrings,
    stringifyArg = previewExecGuardArg,
    guardVariableCandidates,
    expressionSourceVariables,
    inputSecurityDescriptor,
    argSecurityDescriptors,
    argFactSourceDescriptors,
    mcpSecurityDescriptor,
    argNames
  } = options;

  for (let i = 0; i < guardVariableCandidates.length; i++) {
    if (
      !guardVariableCandidates[i] &&
      isStructuredValue(evaluatedArgs[i]) &&
      (
        Boolean(extractSecurityDescriptor(evaluatedArgs[i], { recursive: true, mergeArrayElements: true }))
        || Array.isArray(evaluatedArgs[i].mx?.factsources)
      )
    ) {
      const materialized = materializeGuardInputs([evaluatedArgs[i]], {
        nameHint: '__guard_input__',
        preserveStructuredScalars: true
      })[0];
      if (materialized) {
        guardVariableCandidates[i] = materialized;
        continue;
      }
    }
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
      nameHint: '__guard_input__',
      argNames,
      preserveStructuredScalars: true
    }
  );

  const hasPerArgOverrides = Array.isArray(argSecurityDescriptors) && argSecurityDescriptors.some(Boolean);
  const hasPerArgFactsourceOverrides =
    Array.isArray(argFactSourceDescriptors)
    && argFactSourceDescriptors.some(entry => Array.isArray(entry) && entry.length > 0);
  const hasAnyOverride =
    hasPerArgOverrides
    || hasPerArgFactsourceOverrides
    || Boolean(inputSecurityDescriptor)
    || Boolean(mcpSecurityDescriptor);

  if (hasAnyOverride) {
    if (guardInputsWithMapping.length === 0) {
      const syntheticOverrides = [inputSecurityDescriptor, mcpSecurityDescriptor].filter(
        (descriptor): descriptor is SecurityDescriptor => Boolean(descriptor)
      );
      const syntheticDescriptor =
        syntheticOverrides.length === 0
          ? undefined
          : syntheticOverrides.length === 1
            ? syntheticOverrides[0]
            : env.mergeSecurityDescriptors(...syntheticOverrides);
      const syntheticInput = createSimpleTextVariable('__guard_input__', '', DEFAULT_GUARD_INPUT_SOURCE);
      if (!syntheticInput.mx) {
        syntheticInput.mx = {};
      }
      if (syntheticDescriptor) {
        updateVarMxFromDescriptor(syntheticInput.mx as VariableContext, syntheticDescriptor);
        if ((syntheticInput.mx as any).mxCache) {
          delete (syntheticInput.mx as any).mxCache;
        }
      }
      guardInputsWithMapping.push({ index: evaluatedArgs.length, variable: syntheticInput });
    }

    for (const entry of guardInputsWithMapping) {
      const base = entry.variable;
      const baseDescriptor = getVariableSecurityDescriptor(base);
      const descriptorOverrides = [
        entry.index >= 0 && Array.isArray(argSecurityDescriptors)
          ? argSecurityDescriptors[entry.index]
          : undefined,
        !hasPerArgOverrides ? inputSecurityDescriptor : undefined,
        mcpSecurityDescriptor
      ].filter((descriptor): descriptor is SecurityDescriptor => Boolean(descriptor));
      const mergedOverrideDescriptor =
        descriptorOverrides.length === 0
          ? undefined
          : descriptorOverrides.length === 1
            ? descriptorOverrides[0]
            : env.mergeSecurityDescriptors(...descriptorOverrides);
      const factsourceOverride =
        entry.index >= 0 && Array.isArray(argFactSourceDescriptors)
          ? argFactSourceDescriptors[entry.index]
          : undefined;
      if (!mergedOverrideDescriptor && !baseDescriptor && (!factsourceOverride || factsourceOverride.length === 0)) {
        continue;
      }
      const mergedDescriptor = baseDescriptor && mergedOverrideDescriptor
        ? env.mergeSecurityDescriptors(baseDescriptor, mergedOverrideDescriptor)
        : baseDescriptor ?? mergedOverrideDescriptor;
      if (!mergedDescriptor && (!factsourceOverride || factsourceOverride.length === 0)) {
        continue;
      }
      const fallback =
        entry.index >= 0 && entry.index < evaluatedArgStrings.length
          ? evaluatedArgStrings[entry.index] ?? stringifyArg(base.value)
          : stringifyArg(base.value);
      const cloned = cloneExecVariableWithNewValue(base, base.value, fallback);
      if (!cloned.mx) {
        cloned.mx = {};
      }
      if (mergedDescriptor) {
        updateVarMxFromDescriptor(cloned.mx as VariableContext, mergedDescriptor);
      }
      if (Array.isArray(factsourceOverride) && factsourceOverride.length > 0) {
        cloned.mx.factsources = [...factsourceOverride];
      }
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
    services,
    guardArgNames
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
  const policySummary = env.getPolicySummary();
  const deferManagedLabelFlow = hasManagedPolicyLabelFlow(policySummary);
  const operationLabels = mergeLabelArrays(exeLabels, toolLabels);
  const inheritedAuthorizationSurfaceOperation =
    env.getContextManager().peekOperation()?.metadata?.authorizationSurfaceOperation;
  const authorizationSurfaceOperation = resolveAuthorizationSurfaceOperation({
    env: execEnv,
    operationName: operationName ?? commandName,
    executableLabels: operationLabels,
    inheritedAuthorizationSurfaceOperation
  });
  const operationContext: OperationContext = {
    type: 'exe',
    named: resolveCanonicalOperationRef({
      type: 'exe',
      name: operationName ?? commandName
    }),
    name: operationName ?? commandName,
    labels: operationLabels.length > 0 ? operationLabels : undefined,
    location: node.location ?? null,
    metadata: {
      executableType: definition.type,
      executableLanguage: (definition as { language?: unknown }).language,
      command: commandName,
      sourceRetryable: true,
      authorizationSurfaceOperation,
      ...(options.commandAccessSubstrate === true ? { commandAccessSubstrate: true } : {}),
      ...(Array.isArray(options.authorizationControlArgs)
        ? { authorizationControlArgs: [...options.authorizationControlArgs] }
        : {}),
      ...(Array.isArray(options.authorizationSourceArgs)
        ? { authorizationSourceArgs: [...options.authorizationSourceArgs] }
        : {}),
      ...(options.correlateControlArgs === true ? { correlateControlArgs: true } : {}),
      ...(options.operationTaintFacts === true ? { taintFacts: true } : {})
    }
  };
  operationContext.metadata = mergeGuardArgNamesIntoMetadata(operationContext.metadata, guardArgNames);
  const shouldApplySurfaceScopedPolicy = shouldApplySurfaceScopedPolicyToOperation(operationContext);

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
      operationContext.opLabels = mergeOperationLabelsWithCanonicalName(
        operationContext.name,
        opLabels
      );
      operationContext.command = commandPreview;
    }
    const metadata = { ...(operationContext.metadata ?? {}) } as Record<string, unknown>;
    metadata.commandPreview = commandPreview;
    operationContext.metadata = metadata;
    if (policySummary) {
      const decision = evaluateCommandAccess(policySummary, commandPreview, {
        enforceAllowList: shouldEnforceCommandAllowListForOperation(operationContext)
      });
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
      const metadata = { ...(operationContext.metadata ?? {}) } as Record<string, unknown>;
      metadata.policyInputTaint = inputTaint;
      operationContext.metadata = metadata;
    }
    if (inputTaint.length > 0 && !deferManagedLabelFlow && shouldApplySurfaceScopedPolicy) {
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
      if (stdinTaint.length > 0 && !deferManagedLabelFlow && shouldApplySurfaceScopedPolicy) {
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
      operationContext.opLabels = mergeOperationLabelsWithCanonicalName(
        operationContext.name,
        opLabels
      );
    }
    if (opType) {
      if (policySummary) {
        const decision = evaluateCapabilityAccess(policySummary, opType, {
          enforceAllowList: authorizationSurfaceOperation
        });
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
    if (opType && inputTaint.length > 0 && !deferManagedLabelFlow && shouldApplySurfaceScopedPolicy) {
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
      operationContext.opLabels = mergeOperationLabelsWithCanonicalName(
        operationContext.name,
        opLabels
      );
    }
    if (policySummary) {
      const decision = evaluateCapabilityAccess(policySummary, 'node', {
        enforceAllowList: authorizationSurfaceOperation
      });
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
    if (inputTaint.length > 0 && !deferManagedLabelFlow && shouldApplySurfaceScopedPolicy) {
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
    if (inputTaint.length > 0 && !deferManagedLabelFlow && shouldApplySurfaceScopedPolicy) {
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
    evaluatedArgStrings,
    stringifyArg = previewExecGuardArg
  } = options;
  if (operationContext.metadata?.internalSessionMethod === true) {
    return {
      preDecision: { action: 'continue' },
      postHookInputs: guardInputs,
      transformedGuardSet: null
    };
  }

  const hookManager = env.getHookManager();
  const userHookInputs = await runUserBeforeHooks(node, guardInputs, env, operationContext);
  const preHookInputs =
    userHookInputs === guardInputs
      ? guardInputs
      : materializeGuardInputs(userHookInputs, {
          nameHint: '__guard_input__',
          preserveStructuredScalars: true
        });
  let transformedGuardSet: Set<Variable> | null = null;
  if (preHookInputs !== guardInputs) {
    transformedGuardSet = new Set(preHookInputs);
    applyGuardTransformsToExecArgs({
      guardInputEntries: guardInputsWithMapping,
      transformedInputs: preHookInputs,
      guardVariableCandidates,
      evaluatedArgs,
      evaluatedArgStrings,
      stringifyArg
    });
  }

  const preDecision = await hookManager.runPre(node, preHookInputs, env, operationContext);
  const transformedGuardInputs = getGuardTransformedInputs(preDecision, preHookInputs);
  let postHookInputs: readonly Variable[] = preHookInputs;
  if (transformedGuardInputs && transformedGuardInputs.length > 0) {
    postHookInputs = transformedGuardInputs;
    if (!transformedGuardSet) {
      transformedGuardSet = new Set<Variable>();
    }
    for (const transformedInput of transformedGuardInputs) {
      transformedGuardSet.add(transformedInput);
    }
    applyGuardTransformsToExecArgs({
      guardInputEntries: guardInputsWithMapping,
      transformedInputs: transformedGuardInputs,
      guardVariableCandidates,
      evaluatedArgs,
      evaluatedArgStrings,
      stringifyArg
    });
  }
  return {
    preDecision,
    postHookInputs,
    transformedGuardSet: transformedGuardSet && transformedGuardSet.size > 0 ? transformedGuardSet : null
  };
}

export async function handleExecPreGuardDecision(
  options: HandleExecPreGuardDecisionOptions
): Promise<EvalResult | null> {
  const { preDecision, node, env, execEnv, operationContext, postHookInputs, whenExprNode } = options;
  const checkpointDecision = getCheckpointDecisionState(preDecision);
  applyCheckpointDecisionToOperation(operationContext, checkpointDecision);
  if (checkpointDecision?.hit && checkpointDecision.hasCachedResult) {
    return {
      value: checkpointDecision.cachedResult,
      env: execEnv
    };
  }

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
    await runUserAfterHooksOnGuardDenial({
      node,
      env,
      operationContext,
      inputs: postHookInputs,
      error
    });
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
  if (hasManagedPolicyLabelFlow(env.getPolicySummary())) {
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
  const { policyEnforcer, exeLabels, resultSecurityDescriptor, inputDescriptor } = options;
  // Rule preconditions look at INPUT data labels. resultSecurityDescriptor at this
  // point already has the exe's own labels (e.g. 'llm') and source-language taint
  // (e.g. 'src:js') merged in, which would make hasUserLabels() return true and
  // suppress the unlabeled-default promotion (m-c713). Prefer the input-only
  // descriptor when supplied.
  const inputTaintSource = inputDescriptor ?? resultSecurityDescriptor;
  const outputDescriptor = policyEnforcer.applyOutputPolicyLabels(
    resultSecurityDescriptor,
    {
      inputTaint: descriptorToInputTaint(inputTaintSource),
      exeLabels,
      inputDescriptor
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
    const guardedResult = await hookManager.runPost(node, result, postHookInputs, env, operationContext);
    return await runUserAfterHooks(node, guardedResult, postHookInputs, env, operationContext);
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
