import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import type { InterpolationNode } from '@interpreter/utils/interpolation';

export type InterpolateWithSecurityRecording = (
  nodes: InterpolationNode[],
  env: Environment
) => Promise<string>;

export function wrapEvalValue(value: unknown, env: Environment): EvalResult {
  return { value, env };
}

export async function resolveCommandStringOrEmpty(
  command: string | InterpolationNode[] | undefined,
  env: Environment,
  interpolateWithSecurityRecording: InterpolateWithSecurityRecording
): Promise<string> {
  if (typeof command === 'string') {
    return command || '';
  }
  if (Array.isArray(command)) {
    const interpolated = await interpolateWithSecurityRecording(command, env);
    return interpolated || '';
  }
  return '';
}
