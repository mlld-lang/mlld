import type { EvalResult } from '@interpreter/core/interpreter';
import type { Environment } from '@interpreter/env/Environment';
import type { SourceLocation } from '@core/types';
import type { InterpolationNode } from '@interpreter/utils/interpolation';
import { resolveWorkingDirectory } from '@interpreter/utils/working-directory';
import {
  resolveCommandStringOrEmpty,
  type InterpolateWithSecurityRecording,
  wrapEvalValue
} from './shared-utils';

interface CommandNodeLike {
  type: 'command';
  command?: string | InterpolationNode[];
  workingDir?: InterpolationNode[] | string;
  location?: SourceLocation;
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
  const workingDirectory = await resolveWorkingDirectory(
    node.workingDir,
    env,
    { sourceLocation: node.location, directiveType: 'var' }
  );
  const result = await env.executeCommand(
    commandStr,
    workingDirectory ? { workingDirectory } : undefined
  );
  return wrapEvalValue(result, env);
}
