import type { MlldNode } from '@core/types';
import type { Environment } from '@interpreter/env/Environment';
import {
  createInterpolator,
  interpolateFileReference,
  processFileFields
} from '@interpreter/utils/interpolation';
import { createInterpolationSecurityAdapter } from './interpreter/interpolation-security';
import {
  evaluateCore,
  type EvalResult,
  type EvaluationContext
} from './interpreter/evaluator';
import { cleanNamespaceForDisplay } from './interpreter/namespace-display';

export type { EvalResult, EvaluationContext } from './interpreter/evaluator';
export type { VariableValue } from './interpreter/value-resolution';

export { interpolateFileReference, processFileFields };
export { cleanNamespaceForDisplay };

export async function evaluate(
  node: MlldNode | MlldNode[],
  env: Environment,
  context?: EvaluationContext
): Promise<EvalResult> {
  return evaluateCore({
    node,
    env,
    context,
    evaluateNode: evaluate,
    interpolateWithSecurityRecording
  });
}

const interpolate = createInterpolator(() => ({ evaluate }));
export { interpolate };

const { interpolateWithSecurityRecording } = createInterpolationSecurityAdapter(interpolate);
