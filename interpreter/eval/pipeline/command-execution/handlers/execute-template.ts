import type { Environment } from '@interpreter/env/Environment';

export interface ExecuteTemplateHandlerOptions {
  execEnv: Environment;
  execDef: any;
}

export async function executeTemplateHandler(
  options: ExecuteTemplateHandlerOptions
): Promise<unknown> {
  const { execEnv, execDef } = options;
  const { interpolate } = await import('@interpreter/core/interpreter');
  const { InterpolationContext } = await import('@interpreter/core/interpolation-context');
  return interpolate(execDef.template, execEnv, InterpolationContext.Default);
}
