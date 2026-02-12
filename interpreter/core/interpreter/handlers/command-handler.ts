import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import type { InterpolationNode } from '@interpreter/utils/interpolation';
import {
  resolveCommandStringOrEmpty,
  type InterpolateWithSecurityRecording,
  wrapEvalValue
} from './shared-utils';

interface CommandNodeLike {
  type: 'command';
  command?: string | InterpolationNode[];
}

export async function evaluateCommandNode(
  node: CommandNodeLike,
  env: Environment,
  interpolateWithSecurityRecording: InterpolateWithSecurityRecording
): Promise<EvalResult> {
  const commandStr = await resolveCommandStringOrEmpty(
    node.command,
    env,
    interpolateWithSecurityRecording
  );
  const result = await env.executeCommand(commandStr);
  return wrapEvalValue(result, env);
}
