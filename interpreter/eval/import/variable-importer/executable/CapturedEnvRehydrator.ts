import type { Variable } from '@core/types/variable';
import type { ShadowEnvironmentCapture } from '@interpreter/env/types/ShadowEnvironmentCapture';

export type CapturedEnvVariableFactory = (
  name: string,
  value: any,
  importPath: string,
  originalName?: string
) => Variable;

export class CapturedEnvRehydrator {
  deserializeShadowEnvs(envs: any): ShadowEnvironmentCapture {
    const result: ShadowEnvironmentCapture = {};

    for (const [lang, shadowObject] of Object.entries(envs)) {
      if (!shadowObject || typeof shadowObject !== 'object') {
        continue;
      }
      const map = new Map<string, any>();
      for (const [name, func] of Object.entries(shadowObject)) {
        map.set(name, func);
      }
      result[lang as keyof ShadowEnvironmentCapture] = map;
    }

    return result;
  }

  deserializeModuleEnv(
    moduleEnv: any,
    createVariableFromValue: CapturedEnvVariableFactory
  ): Map<string, Variable> {
    const result = new Map<string, Variable>();
    if (!moduleEnv || typeof moduleEnv !== 'object') {
      return result;
    }

    for (const [name, varData] of Object.entries(moduleEnv)) {
      const variable = createVariableFromValue(name, varData, 'module-env', name);
      result.set(name, variable);
    }

    return result;
  }

  rehydrateCapturedModuleScope(moduleEnv: Map<string, Variable>): void {
    for (const [, variable] of moduleEnv) {
      if (variable.type !== 'executable') {
        continue;
      }
      const existingEnv = variable.internal?.capturedModuleEnv;
      if (!existingEnv || !(existingEnv instanceof Map)) {
        variable.internal = {
          ...(variable.internal ?? {}),
          capturedModuleEnv: moduleEnv
        };
      }
    }
  }
}
