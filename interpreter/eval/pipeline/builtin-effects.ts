import type { Environment } from '../../env/Environment';
import type { PipelineCommand } from '@core/types';
import { appendContentToFile } from '../append';
import type { SecurityDescriptor } from '@core/types/security';
import { materializeDisplayValue } from '../../utils/display-materialization';
import { asText } from '../../utils/structured-value';
import type { OperationContext } from '../../env/ContextManager';
import { materializeGuardInputs } from '../../utils/guard-inputs';
import {
  applyCheckpointDecisionToOperation,
  getCheckpointDecisionState,
  getGuardTransformedInputs,
  handleGuardDecision
} from '../../hooks/hook-decision-handler';
import { runUserAfterHooks, runUserBeforeHooks } from '../../hooks/user-hook-runner';
import { getOperationLabels, getOperationSources } from '@core/policy/operation-labels';
import type { EffectHookNode } from '@core/types/hooks';
import type { Variable } from '@core/types/variable';
import { extractVariableValue, isVariable } from '../../utils/variable-resolution';
import { GuardError, type GuardErrorDetails } from '@core/errors/GuardError';
import { isGuardRetrySignal } from '@core/errors/GuardRetrySignal';
import type { EvalResult } from '../../core/interpreter';
import { PolicyEnforcer } from '@interpreter/policy/PolicyEnforcer';
import { collectInputDescriptor, descriptorToInputTaint } from '@interpreter/policy/label-flow-utils';
import { logFileWriteEvent } from '../../utils/audit-log';

// Minimal builtin effects support for pipelines. These are inline effects that
// do not create stages and run after the owning stage succeeds.

const BUILTIN_EFFECTS = new Set<string>([
  'log', 'LOG',
  'output', 'OUTPUT',
  'show', 'SHOW',
  'append', 'APPEND'
]);

export function isBuiltinEffect(name: string): boolean {
  return BUILTIN_EFFECTS.has(name);
}

export function getBuiltinEffects(): string[] {
  return Array.from(new Set(Array.from(BUILTIN_EFFECTS).map(n => n.toLowerCase()))).sort();
}

function recordInterpolatedDescriptors(env: Environment, descriptors: SecurityDescriptor[]): void {
  if (descriptors.length === 0) {
    return;
  }
  const merged =
    descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
  env.recordSecurityDescriptor(merged);
}

// Evaluate a single effect argument into a string using the stage environment
async function evaluateEffectArg(arg: any, env: Environment): Promise<string> {
  // UnifiedArgumentList items can be Text nodes, VariableReference, nested exec, objects, arrays, etc.
  // We reuse interpolate for a best-effort string evaluation.
  const { interpolate } = await import('../../core/interpreter');
  if (Array.isArray(arg)) {
    const descriptors: SecurityDescriptor[] = [];
    const value = await interpolate(arg, env, undefined, {
      collectSecurityDescriptor: descriptor => {
        if (descriptor) {
          descriptors.push(descriptor);
        }
      }
    });
    recordInterpolatedDescriptors(env, descriptors);
    return String(value);
  }
  const descriptors: SecurityDescriptor[] = [];
  const value = await interpolate([arg], env, undefined, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  recordInterpolatedDescriptors(env, descriptors);
  return String(value);
}

function buildEffectOperationContext(effect: PipelineCommand): OperationContext {
  const type = typeof effect.rawIdentifier === 'string' ? effect.rawIdentifier.toLowerCase() : 'effect';
  const hasExplicitSource = Boolean(effect.meta?.hasExplicitSource);
  const labels = Array.isArray((effect.meta as any)?.securityLabels)
    ? ((effect.meta as any).securityLabels as string[])
    : undefined;
  const opLabels = getOperationLabels({
    type: type as 'show' | 'output' | 'log' | 'append'
  });
  const sources = getOperationSources({
    type: type as 'show' | 'output' | 'log' | 'append'
  });

  return {
    type,
    subtype: 'effect',
    name: effect.rawIdentifier,
    labels,
    opLabels,
    sources,
    location: (effect as any)?.location ?? (effect.meta as any)?.location ?? null,
    metadata: {
      trace: `effect:${effect.rawIdentifier ?? type}`,
      isEffect: true,
      hasExplicitSource
    }
  };
}

function createEffectHookNode(effect: PipelineCommand): EffectHookNode {
  return {
    ...effect,
    type: 'Effect',
    location: (effect as any)?.location ?? (effect.meta as any)?.location ?? null
  };
}

async function resolveEffectPayload(
  effect: PipelineCommand,
  stageOutput: unknown,
  env: Environment
): Promise<unknown> {
  const name = typeof effect.rawIdentifier === 'string' ? effect.rawIdentifier.toLowerCase() : '';
  const args = effect.args ?? [];
  const hasExplicitSource = Boolean(effect.meta?.hasExplicitSource);
  const usesExplicitSource = args.length >= 2;
  const stageValue = stageOutput ?? '';
  const stageText = typeof stageValue === 'string' ? stageValue : asText(stageValue);

  switch (name) {
    case 'log':
    case 'show': {
      if (args.length > 0) {
        const parts: string[] = [];
        for (const a of args) {
          parts.push(await evaluateEffectArg(a, env));
        }
        return parts.join(' ');
      }
      return stageValue ?? stageText;
    }
    case 'output': {
      if (usesExplicitSource && args.length >= 1) {
        try {
          return await evaluateEffectArg(args[0], env);
        } catch {
          return stageValue ?? stageText;
        }
      }
      return stageValue ?? stageText;
    }
    case 'append': {
      if (hasExplicitSource && args.length > 0) {
        return await evaluateEffectArg(args[0], env);
      }
      return stageValue ?? stageText;
    }
    default:
      return stageValue ?? stageText;
  }
}

function collectEffectArgVariables(
  effect: PipelineCommand,
  env: Environment
): Variable[] {
  const args = effect.args ?? [];
  const variables: Variable[] = [];
  for (const arg of args) {
    const nodes = Array.isArray(arg) ? arg : [arg];
    for (const node of nodes) {
      if (
        node && typeof node === 'object' &&
        node.type === 'VariableReference' &&
        typeof node.identifier === 'string' &&
        !node.fields?.length
      ) {
        const variable = env.getVariable(node.identifier);
        if (variable) {
          variables.push(variable);
        }
      }
    }
  }
  return variables;
}

async function extractEffectGuardInputs(
  effect: PipelineCommand,
  stageOutput: unknown,
  env: Environment
): Promise<{ guardInputs: Variable[]; payload: unknown }> {
  const payload = await resolveEffectPayload(effect, stageOutput, env);
  const argVariables = collectEffectArgVariables(effect, env);
  const candidates = argVariables.length > 0 ? argVariables : [payload];
  const guardInputs = materializeGuardInputs(candidates, { nameHint: '__effect_input__' });
  return { guardInputs, payload };
}

function convertEffectRetryToDeny(
  error: GuardError,
  operationContext: OperationContext,
  env: Environment
): GuardError {
  const details = (error as GuardError).details as GuardErrorDetails | undefined;
  const retryHint =
    (details?.retryHint ?? null) ?? ((error as any).retryHint === undefined ? null : (error as any).retryHint);
  const reason =
    retryHint && typeof retryHint === 'string'
      ? `Guard retry not supported for effects: ${retryHint}`
      : 'Guard retry not supported for effects';

  return new GuardError({
    decision: 'deny',
    guardName: details?.guardName ?? null,
    guardFilter: details?.guardFilter,
    scope: details?.scope,
    operation: details?.operation ?? operationContext,
    inputPreview: details?.inputPreview,
    retryHint,
    reason,
    guardContext: details?.guardContext,
    guardInput: (details as any)?.guardInput ?? null,
    reasons: details?.reasons,
    guardResults: details?.guardResults,
    hints: details?.hints,
    timing: (details as any)?.timing,
    sourceLocation: error.sourceLocation ?? operationContext.location ?? undefined,
    env
  });
}

// Execute a builtin effect. Returns void; throws on error to abort the pipeline.
export async function runBuiltinEffect(
  effect: PipelineCommand,
  stageOutput: unknown,
  env: Environment
): Promise<void> {
  const hookManager = env.getHookManager();
  const policyEnforcer = new PolicyEnforcer(env.getPolicySummary());
  const operationContext = buildEffectOperationContext(effect);
  const hookNode = createEffectHookNode(effect);

  const { guardInputs, payload } = await extractEffectGuardInputs(effect, stageOutput, env);
  const inputs =
    guardInputs.length > 0
      ? guardInputs
      : materializeGuardInputs([stageOutput ?? ''], { nameHint: '__effect_input__' });

  const inputDescriptor = collectInputDescriptor(
    guardInputs.length > 0 ? guardInputs : [payload]
  );
  const inputTaint = descriptorToInputTaint(inputDescriptor);
  if (inputTaint.length > 0) {
    policyEnforcer.checkLabelFlow(
      {
        inputTaint,
        opLabels: operationContext.opLabels ?? [],
        exeLabels: Array.from(env.getEnclosingExeLabels()),
        flowChannel: 'arg'
      },
      { env, sourceLocation: operationContext.location ?? undefined }
    );
  }

  await env.withOpContext(operationContext, async () => {
    const userHookInputs = await runUserBeforeHooks(hookNode, inputs, env, operationContext);
    const preHookInputs =
      userHookInputs === inputs
        ? inputs
        : materializeGuardInputs(userHookInputs, { nameHint: '__effect_input__' });
    const preDecision = await hookManager.runPre(hookNode, preHookInputs, env, operationContext);
    const checkpointDecision = getCheckpointDecisionState(preDecision);
    applyCheckpointDecisionToOperation(operationContext, checkpointDecision);
    const transformedInputs = getGuardTransformedInputs(preDecision, preHookInputs);
    const resolvedInputs = transformedInputs ?? preHookInputs;

    if (checkpointDecision?.hit && checkpointDecision.hasCachedResult) {
      let cachedResult: EvalResult = {
        value: checkpointDecision.cachedResult,
        env
      };
      try {
        cachedResult = await hookManager.runPost(hookNode, cachedResult, resolvedInputs, env, operationContext);
        await runUserAfterHooks(hookNode, cachedResult, resolvedInputs, env, operationContext);
        return;
      } catch (error) {
        if (isGuardRetrySignal(error)) {
          throw convertEffectRetryToDeny(error as GuardError, operationContext, env);
        }
        throw error;
      }
    }

    try {
      await handleGuardDecision(preDecision, hookNode, env, operationContext);
    } catch (error) {
      if (isGuardRetrySignal(error)) {
        throw convertEffectRetryToDeny(error as GuardError, operationContext, env);
      }
      throw error;
    }

    const primaryInput = resolvedInputs[0] ?? preHookInputs[0];
    const payloadVariable = isVariable(primaryInput) ? primaryInput : undefined;
    const payloadValue =
      payloadVariable !== undefined ? await extractVariableValue(payloadVariable, env) : payload;

    const effectResult = await executeEffect(effect, payloadValue, payloadVariable, env);

    try {
      const guardedResult = await hookManager.runPost(hookNode, effectResult, resolvedInputs, env, operationContext);
      await runUserAfterHooks(hookNode, guardedResult, resolvedInputs, env, operationContext);
    } catch (error) {
      if (isGuardRetrySignal(error)) {
        throw convertEffectRetryToDeny(error as GuardError, operationContext, env);
      }
      throw error;
    }
  });
}

async function executeEffect(
  effect: PipelineCommand,
  payloadValue: unknown,
  payloadVariable: Variable | undefined,
  env: Environment
): Promise<EvalResult> {
  const name = effect.rawIdentifier;
  const normalizedPayload = payloadValue ?? '';
  const payloadText = typeof normalizedPayload === 'string' ? normalizedPayload : asText(normalizedPayload);
  const descriptorSource = payloadVariable ?? normalizedPayload;

  switch (name) {
    case 'log':
    case 'LOG': {
      const materialized = materializeDisplayValue(
        descriptorSource ?? payloadText,
        undefined,
        descriptorSource ?? payloadText,
        payloadText
      );
      let output = materialized.text;
      if (!output.endsWith('\n')) output += '\n';
      if (materialized.descriptor) {
        env.recordSecurityDescriptor(materialized.descriptor);
      }
      env.emitEffect('stderr', output);
      return { value: payloadVariable ?? normalizedPayload, env };
    }

    case 'show':
    case 'SHOW': {
      const materialized = materializeDisplayValue(
        descriptorSource ?? payloadText,
        undefined,
        descriptorSource ?? payloadText,
        payloadText
      );
      let output = materialized.text;
      if (!output.endsWith('\n')) output += '\n';
      if (materialized.descriptor) {
        env.recordSecurityDescriptor(materialized.descriptor);
      }
      env.emitEffect('both', output);
      return { value: payloadVariable ?? normalizedPayload, env };
    }

    case 'output':
    case 'OUTPUT': {
      const args = effect.args ?? [];
      let content = payloadText;
      let target: any = null;
      if (args.length > 1) {
        target = args[1];
      } else if (args.length === 1) {
        target = args[0];
      }
      if (!target || typeof target !== 'object' || !target.type) {
        throw new Error('output requires a valid target (file|stream|env|resolver)');
      }

      const materializedContent = materializeDisplayValue(
        descriptorSource ?? content,
        undefined,
        descriptorSource ?? content,
        content
      );
      content = materializedContent.text;
      if (materializedContent.descriptor) {
        env.recordSecurityDescriptor(materializedContent.descriptor);
      }

      switch (String(target.type)) {
        case 'file': {
          const { interpolate } = await import('../../core/interpreter');
          const path = await import('path');
          let resolvedPath = '';
          if (Array.isArray(target.path)) {
            const descriptors: SecurityDescriptor[] = [];
            resolvedPath = await interpolate(target.path, env, undefined, {
              collectSecurityDescriptor: descriptor => {
                if (descriptor) {
                  descriptors.push(descriptor);
                }
              }
            });
            recordInterpolatedDescriptors(env, descriptors);
          } else if (typeof target.path === 'string') {
            resolvedPath = target.path;
          } else if (target.values) {
            const descriptors: SecurityDescriptor[] = [];
            resolvedPath = await interpolate(target.values, env, undefined, {
              collectSecurityDescriptor: descriptor => {
                if (descriptor) {
                  descriptors.push(descriptor);
                }
              }
            });
            recordInterpolatedDescriptors(env, descriptors);
          }
          if (!resolvedPath) {
            throw new Error('output file target requires a non-empty path');
          }

          if (resolvedPath.startsWith('@base/') || resolvedPath.startsWith('@root/')) {
            const projectRoot = (env as any).getProjectRoot ? (env as any).getProjectRoot() : '/';
            const prefixLen = resolvedPath.startsWith('@base/') ? 6 : 6;
            resolvedPath = path.join(projectRoot, resolvedPath.substring(prefixLen));
          }

          // Resolve relative paths from the script file directory
          if (!path.isAbsolute(resolvedPath)) {
            const fileDir = (env as any).getFileDirectory ? (env as any).getFileDirectory() : '/';
            resolvedPath = path.resolve(fileDir, resolvedPath);
          }

          if (process.env.MLLD_DEBUG === 'true') {
            // eslint-disable-next-line no-console
            console.error('[builtin-effects] output:file →', resolvedPath);
          }
          const fileSystem = (env as any).fileSystem;
          if (!fileSystem || typeof fileSystem.writeFile !== 'function') {
            throw new Error('File system not available for pipeline output');
          }
          const dir = path.dirname(resolvedPath);
          try {
            await fileSystem.mkdir(dir, { recursive: true });
          } catch {
            // Directory may already exist; ignore
          }
          await fileSystem.writeFile(resolvedPath, content);
          await logFileWriteEvent(env, resolvedPath, materializedContent.descriptor);

          env.emitEffect('file', content, { path: resolvedPath });
          return { value: payloadVariable ?? materializedContent.text, env };
        }
        case 'stream': {
          const stream = target.stream === 'stderr' ? 'stderr' : 'stdout';
          const payload = content.endsWith('\n') ? content : content + '\n';
          env.emitEffect(stream, payload);
          return { value: payloadVariable ?? materializedContent.text, env };
        }
        case 'env': {
          let varName = 'MLLD_OUTPUT';
          if (target.varname) {
            varName = target.varname;
          } else {
            const src = effect.args && effect.args.length > 0 ? effect.args[0] : null;
            const id = (src && typeof src === 'object' && Array.isArray((src as any).identifier) && (src as any).identifier[0]?.identifier)
              ? (src as any).identifier[0].identifier
              : undefined;
            if (id) varName = `MLLD_${String(id).toUpperCase()}`;
          }
          process.env[varName] = content;
          return { value: payloadVariable ?? materializedContent.text, env };
        }
        case 'resolver': {
          throw new Error('resolver targets not supported yet in pipeline output');
        }
        default:
          throw new Error(`Unknown output target type: ${String(target.type)}`);
      }
    }

    case 'append':
    case 'APPEND': {
      const args = effect.args ?? [];
      const hasExplicitSource = Boolean(effect.meta?.hasExplicitSource);
      const targetArgIndex = hasExplicitSource ? 1 : 0;
      const target = args[targetArgIndex];

      if (!target || typeof target !== 'object' || target.type !== 'file') {
        throw new Error('append requires a file target');
      }

      const materializedPayload = materializeDisplayValue(
        descriptorSource ?? payloadText,
        undefined,
        descriptorSource ?? payloadText,
        payloadText
      );
      const finalPayload = materializedPayload.text;
      if (materializedPayload.descriptor) {
        env.recordSecurityDescriptor(materializedPayload.descriptor);
      }

      await appendContentToFile(target, finalPayload, env, {
        directiveKind: 'append',
        descriptor: materializedPayload.descriptor
      });
      return { value: payloadVariable ?? finalPayload, env };
    }

    default:
      throw new Error(`Unsupported builtin effect in pipeline: @${name}`);
  }
}
