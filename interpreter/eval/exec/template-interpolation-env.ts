import type { ExecutableDefinition } from '@core/types/executable';
import type { Environment } from '@interpreter/env/Environment';

/**
 * Template files run in their own file directory so relative alligator paths
 * resolve from the template location instead of the caller.
 */
export function createTemplateInterpolationEnv(
  baseEnv: Environment,
  definition: ExecutableDefinition
): Environment {
  if (definition.type !== 'template') {
    return baseEnv;
  }

  const templateFileDirectory = definition.templateFileDirectory;
  if (typeof templateFileDirectory !== 'string' || templateFileDirectory.trim().length === 0) {
    return baseEnv;
  }

  return baseEnv.createChild(templateFileDirectory);
}
