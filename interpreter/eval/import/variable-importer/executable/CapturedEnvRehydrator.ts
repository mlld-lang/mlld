import { VariableMetadataUtils, type Variable } from '@core/types/variable';
import type { Environment } from '@interpreter/env/Environment';
import type { ShadowEnvironmentCapture } from '@interpreter/env/types/ShadowEnvironmentCapture';
import {
  getCapturedModuleEnv,
  getCapturedModuleOwnerEnv,
  sealCapturedModuleEnv,
  stashCapturedModuleOwnerEnv
} from './CapturedModuleEnvKeychain';

export type CapturedEnvVariableFactory = (
  name: string,
  value: any,
  importPath: string,
  originalName?: string,
  options?: {
    serializedMetadata?: ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>;
    env?: Environment;
    capturedModuleOwnerEnv?: Environment;
  }
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
    createVariableFromValue: CapturedEnvVariableFactory,
    env?: Environment
  ): Map<string, Variable> {
    const result = new Map<string, Variable>();
    if (!moduleEnv || typeof moduleEnv !== 'object') {
      return result;
    }

    const capturedModuleOwnerEnv = getCapturedModuleOwnerEnv(moduleEnv) as Environment | undefined;
    const metadataMap = this.extractMetadataMap(moduleEnv);
    const moduleEnvEntries = Object.entries(moduleEnv).filter(([name]) => name !== '__metadata__');

    for (const [name, varData] of moduleEnvEntries) {
      const variable = createVariableFromValue(name, varData, 'module-env', name, {
        serializedMetadata: metadataMap?.[name],
        ...(env ? { env } : {}),
        ...(capturedModuleOwnerEnv ? { capturedModuleOwnerEnv } : {})
      });
      result.set(name, variable);
    }

    if (capturedModuleOwnerEnv) {
      stashCapturedModuleOwnerEnv(result, capturedModuleOwnerEnv);
    }

    return result;
  }

  rehydrateCapturedModuleScope(moduleEnv: Map<string, Variable>): void {
    this.rehydrateNestedCapturedModuleScope(moduleEnv, new WeakMap<object, Map<string, Variable>>());
  }

  rehydrateNestedCapturedModuleScope(
    moduleEnv: Map<string, Variable>,
    cache: WeakMap<object, Map<string, Variable>>,
    createVariableFromValue?: CapturedEnvVariableFactory,
    env?: Environment
  ): void {
    cache.set(moduleEnv, moduleEnv);

    for (const [, variable] of moduleEnv) {
      if (variable.type !== 'executable') {
        continue;
      }

      const internal = { ...(variable.internal ?? {}) };
      let existingEnv =
        getCapturedModuleEnv(internal)
        ?? getCapturedModuleEnv(variable.internal)
        ?? getCapturedModuleEnv(variable);

      if (existingEnv instanceof Map) {
        sealCapturedModuleEnv(internal, existingEnv);
        variable.internal = internal;

        if (existingEnv !== moduleEnv && !cache.has(existingEnv)) {
          this.rehydrateNestedCapturedModuleScope(existingEnv, cache, createVariableFromValue, env);
        }
        continue;
      }

      if (existingEnv && typeof existingEnv === 'object') {
        const cachedExistingEnv = cache.get(existingEnv);
        if (cachedExistingEnv) {
          sealCapturedModuleEnv(internal, cachedExistingEnv);
          variable.internal = internal;
          continue;
        }

        if (createVariableFromValue) {
          const nestedEnv = this.deserializeModuleEnv(existingEnv, createVariableFromValue, env);
          cache.set(existingEnv, nestedEnv);
          this.rehydrateNestedCapturedModuleScope(nestedEnv, cache, createVariableFromValue, env);
          sealCapturedModuleEnv(internal, nestedEnv);
          variable.internal = internal;
          continue;
        }
      }

      sealCapturedModuleEnv(internal, moduleEnv);
      variable.internal = internal;
    }
  }

  private extractMetadataMap(
    moduleEnv: Record<string, unknown>
  ): Record<
    string,
    ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata> | undefined
  > | undefined {
    const metadataContainer = moduleEnv.__metadata__;
    if (!metadataContainer || typeof metadataContainer !== 'object') {
      return undefined;
    }

    const metadataMap: Record<
      string,
      ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata> | undefined
    > = {};
    for (const [name, serializedMetadata] of Object.entries(metadataContainer)) {
      metadataMap[name] =
        serializedMetadata as ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>;
    }
    return metadataMap;
  }
}
