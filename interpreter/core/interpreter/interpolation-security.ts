import type { SecurityDescriptor } from '@core/types/security';
import type { Environment } from '@interpreter/env/Environment';
import type { InterpolationContext } from '@interpreter/core/interpolation-context';
import type { InterpolateOptions } from '@interpreter/utils/interpolation';

type InterpolateFn = (
  nodes: any,
  env: Environment,
  context?: InterpolationContext,
  options?: InterpolateOptions
) => Promise<string>;

export interface InterpolationSecurityAdapter {
  interpolateWithSecurityRecording: (
    nodes: any,
    env: Environment,
    context?: InterpolationContext
  ) => Promise<string>;
}

export async function interpolateAndRecordSecurity(options: {
  interpolate: InterpolateFn;
  nodes: any;
  env: Environment;
  context?: InterpolationContext;
}): Promise<string> {
  const { interpolate, nodes, env, context } = options;
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, context, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1
        ? descriptors[0]
        : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }
  return text;
}

export function createInterpolationSecurityAdapter(
  interpolate: InterpolateFn
): InterpolationSecurityAdapter {
  async function interpolateWithSecurityRecording(
    nodes: any,
    env: Environment,
    context?: InterpolationContext
  ): Promise<string> {
    return interpolateAndRecordSecurity({
      interpolate,
      nodes,
      env,
      context
    });
  }

  return { interpolateWithSecurityRecording };
}
