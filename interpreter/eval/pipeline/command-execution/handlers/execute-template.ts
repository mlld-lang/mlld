import type { Environment } from '@interpreter/env/Environment';
import type { ExecutableDefinition } from '@core/types/executable';
import { createTemplateInterpolationEnv } from '@interpreter/eval/exec/template-interpolation-env';

export interface ExecuteTemplateHandlerOptions {
  execEnv: Environment;
  execDef: any;
}

export async function executeTemplateHandler(
  options: ExecuteTemplateHandlerOptions
): Promise<unknown> {
  const { execEnv, execDef } = options;
  const templateExecDef = execDef as ExecutableDefinition;
  const templateInterpolationEnv = createTemplateInterpolationEnv(execEnv, templateExecDef);
  const { interpolate } = await import('@interpreter/core/interpreter');
  const { InterpolationContext } = await import('@interpreter/core/interpolation-context');
  return interpolate(execDef.template, templateInterpolationEnv, InterpolationContext.Default);
}
