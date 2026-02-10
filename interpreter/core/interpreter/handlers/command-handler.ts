import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import type { InterpolationNode } from '@interpreter/utils/interpolation';

interface CommandNodeLike {
  type: 'command';
  command?: string | InterpolationNode[];
}

type InterpolateWithSecurityRecording = (
  nodes: InterpolationNode[],
  env: Environment
) => Promise<string>;

export async function evaluateCommandNode(
  node: CommandNodeLike,
  env: Environment,
  interpolateWithSecurityRecording: InterpolateWithSecurityRecording
): Promise<EvalResult> {
  let commandStr: string;
  if (typeof node.command === 'string') {
    commandStr = node.command || '';
  } else if (Array.isArray(node.command)) {
    const interpolatedCommand = await interpolateWithSecurityRecording(node.command, env);
    commandStr = interpolatedCommand || '';
  } else {
    commandStr = '';
  }

  const result = await env.executeCommand(commandStr);
  return { value: result, env };
}
