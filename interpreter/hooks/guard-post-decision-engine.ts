import type { GuardResult, GuardHint } from '@core/types/guard';
import type { DataLabel, SecurityDescriptor } from '@core/types/security';
import type { Variable } from '@core/types/variable';
import type { GuardInputHelper } from '@core/types/variable/ArrayHelpers';
import type { GuardDefinition } from '../guards/GuardRegistry';
import type { PerInputCandidate } from './guard-candidate-selection';
import { applyDescriptorToVariables, mergeGuardDescriptor } from './guard-post-descriptor';
import { normalizeReplacementVariables } from './guard-post-output-normalization';

interface RetryContextSnapshot {
  attempt: number;
  tries: Array<{ attempt: number; decision: string; hint?: string | null }>;
  hintHistory: Array<string | null>;
  max: number;
}

export interface GuardOperationSnapshot {
  labels: readonly DataLabel[];
  sources: readonly string[];
  variables: readonly Variable[];
}

interface GuardEvaluationInput {
  guard: GuardDefinition;
  scope: 'perInput' | 'perOperation';
  perInput?: PerInputCandidate;
  operationSnapshot?: GuardOperationSnapshot;
  operationInputSnapshot?: GuardOperationSnapshot;
  activeInput?: Variable;
  activeOutput?: Variable;
  labelsOverride?: readonly DataLabel[];
  sourcesOverride?: readonly string[];
  inputPreviewOverride?: string | null;
  outputRaw?: unknown;
  inputHelper?: GuardInputHelper;
}

export interface PostGuardDecisionEngineOptions {
  perInputCandidates: readonly PerInputCandidate[];
  operationGuards: readonly GuardDefinition[];
  outputVariables: readonly Variable[];
  activeOutputs: readonly Variable[];
  inputVariables?: readonly Variable[];
  currentDescriptor: SecurityDescriptor;
  baseOutputValue: unknown;
  retryContext: RetryContextSnapshot;
  evaluateGuard: (input: GuardEvaluationInput) => Promise<GuardResult>;
  buildInputHelper: (inputs: readonly Variable[]) => GuardInputHelper | undefined;
  buildOperationSnapshot: (inputs: readonly Variable[]) => GuardOperationSnapshot;
  resolveGuardValue: (variable: Variable | undefined, fallback: Variable) => unknown;
  buildVariablePreview: (variable: Variable) => string | null;
  logLabelModifications: (
    guard: GuardDefinition,
    labelModifications: GuardResult['labelModifications'],
    targets: readonly Variable[]
  ) => Promise<void>;
}

export interface PostGuardDecisionEngineResult {
  decision: 'allow' | 'deny' | 'retry';
  reasons: string[];
  hints: GuardHint[];
  guardTrace: GuardResult[];
  transformsApplied: boolean;
  activeOutputs: Variable[];
  currentDescriptor: SecurityDescriptor;
}

export async function runPostGuardDecisionEngine(
  options: PostGuardDecisionEngineOptions
): Promise<PostGuardDecisionEngineResult> {
  const guardTrace: GuardResult[] = [];
  const reasons: string[] = [];
  const hints: GuardHint[] = [];
  let currentDecision: 'allow' | 'deny' | 'retry' = 'allow';
  let transformsApplied = false;
  let activeOutputs = options.activeOutputs.slice();
  let currentDescriptor = options.currentDescriptor;

  for (const candidate of options.perInputCandidates) {
    const candidateIsOutput = options.outputVariables.includes(candidate.variable);
    let currentInput =
      candidateIsOutput
        ? (activeOutputs[0] ?? candidate.variable)
        : candidate.variable;

    for (const guard of candidate.guards) {
      const resultEntry = await options.evaluateGuard({
        guard,
        scope: 'perInput',
        perInput: candidate,
        inputHelper: options.buildInputHelper(activeOutputs.length > 0 ? activeOutputs : options.outputVariables),
        activeInput: currentInput,
        activeOutput: currentInput,
        labelsOverride: currentDescriptor.labels,
        sourcesOverride: currentDescriptor.sources,
        inputPreviewOverride: options.buildVariablePreview(currentInput),
        outputRaw: options.resolveGuardValue(currentInput, currentInput)
      });

      guardTrace.push(resultEntry);
      if (resultEntry.hint) {
        hints.push(resultEntry.hint);
      }

      if (resultEntry.decision === 'allow' && currentDecision === 'allow') {
        if (resultEntry.replacement) {
          const replacements = normalizeReplacementVariables(resultEntry.replacement);
          if (replacements.length > 0) {
            const mergedDescriptor = mergeGuardDescriptor(
              currentDescriptor,
              replacements,
              guard,
              resultEntry.labelModifications
            );
            await options.logLabelModifications(guard, resultEntry.labelModifications, replacements);
            applyDescriptorToVariables(mergedDescriptor, replacements);
            currentDescriptor = mergedDescriptor;
            activeOutputs = replacements;
            currentInput = replacements[0]!;
            transformsApplied = true;
          }
        } else if (resultEntry.labelModifications) {
          const mergedDescriptor = mergeGuardDescriptor(
            currentDescriptor,
            [],
            guard,
            resultEntry.labelModifications
          );
          currentDescriptor = mergedDescriptor;
          const targetVars = activeOutputs.length > 0 ? activeOutputs : [currentInput];
          if (targetVars.length > 0) {
            await options.logLabelModifications(guard, resultEntry.labelModifications, targetVars);
            applyDescriptorToVariables(mergedDescriptor, targetVars);
          }
          transformsApplied = true;
        }
      } else if (resultEntry.decision === 'deny') {
        currentDecision = 'deny';
        if (resultEntry.reason) {
          reasons.push(resultEntry.reason);
        }
      } else if (resultEntry.decision === 'retry' && currentDecision !== 'deny') {
        currentDecision = 'retry';
        if (resultEntry.reason) {
          reasons.push(resultEntry.reason);
        }
      }
    }
  }

  if (options.operationGuards.length > 0) {
    if (activeOutputs.length === 0 && options.outputVariables.length > 0) {
      activeOutputs = options.outputVariables.slice();
    }
    const operationInputVariables =
      options.inputVariables && options.inputVariables.length > 0
        ? options.inputVariables
        : (activeOutputs.length > 0 ? activeOutputs : options.outputVariables);
    const operationInputSnapshot = options.buildOperationSnapshot(operationInputVariables);
    const operationInputHelper = options.buildInputHelper(operationInputVariables);
    let opSnapshot = options.buildOperationSnapshot(
      activeOutputs.length > 0 ? activeOutputs : options.outputVariables
    );

    for (const guard of options.operationGuards) {
      const currentOutputValue =
        activeOutputs[0] ? options.resolveGuardValue(activeOutputs[0], activeOutputs[0]) : options.baseOutputValue;

      const resultEntry = await options.evaluateGuard({
        guard,
        scope: 'perOperation',
        operationSnapshot: opSnapshot,
        operationInputSnapshot,
        inputHelper: operationInputHelper,
        activeOutput: activeOutputs[0] ?? options.outputVariables[0],
        labelsOverride: opSnapshot.labels,
        sourcesOverride: opSnapshot.sources,
        inputPreviewOverride: `Array(len=${operationInputSnapshot.variables.length})`,
        outputRaw: currentOutputValue
      });

      guardTrace.push(resultEntry);
      if (resultEntry.hint) {
        hints.push(resultEntry.hint);
      }

      if (resultEntry.decision === 'allow' && currentDecision === 'allow') {
        if (resultEntry.replacement) {
          const replacements = normalizeReplacementVariables(resultEntry.replacement);
          if (replacements.length > 0) {
            const mergedDescriptor = mergeGuardDescriptor(
              currentDescriptor,
              replacements,
              guard,
              resultEntry.labelModifications
            );
            await options.logLabelModifications(guard, resultEntry.labelModifications, replacements);
            applyDescriptorToVariables(mergedDescriptor, replacements);
            currentDescriptor = mergedDescriptor;
            activeOutputs = replacements;
            transformsApplied = true;
            opSnapshot = options.buildOperationSnapshot(activeOutputs);
          }
        } else if (resultEntry.labelModifications) {
          const mergedDescriptor = mergeGuardDescriptor(
            currentDescriptor,
            [],
            guard,
            resultEntry.labelModifications
          );
          currentDescriptor = mergedDescriptor;
          const targetVars = activeOutputs.length > 0 ? activeOutputs : options.outputVariables;
          if (targetVars.length > 0) {
            await options.logLabelModifications(guard, resultEntry.labelModifications, targetVars);
            applyDescriptorToVariables(mergedDescriptor, targetVars);
          }
          transformsApplied = true;
        }
      } else if (resultEntry.decision === 'deny') {
        currentDecision = 'deny';
        if (resultEntry.reason) {
          reasons.push(resultEntry.reason);
        }
      } else if (resultEntry.decision === 'retry' && currentDecision !== 'deny') {
        currentDecision = 'retry';
        if (resultEntry.reason) {
          reasons.push(resultEntry.reason);
        }
      }
    }
  }

  return {
    decision: currentDecision,
    reasons,
    hints,
    guardTrace,
    transformsApplied,
    activeOutputs,
    currentDescriptor
  };
}
