import { VariableMetadataUtils, type Variable } from '@core/types/variable';
import type { ShadowEnvironmentCapture } from '@interpreter/env/types/ShadowEnvironmentCapture';

export type CapturedEnvVariableFactory = (
  name: string,
  value: any,
  importPath: string,
  originalName?: string,
  options?: {
    serializedMetadata?: ReturnType<typeof VariableMetadataUtils.serializeSecurityMetadata>;
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
    createVariableFromValue: CapturedEnvVariableFactory
  ): Map<string, Variable> {
    const result = new Map<string, Variable>();
    if (!moduleEnv || typeof moduleEnv !== 'object') {
      return result;
    }

    const metadataMap = this.extractMetadataMap(moduleEnv);
    const moduleEnvEntries = Object.entries(moduleEnv).filter(([name]) => name !== '__metadata__');

    for (const [name, varData] of moduleEnvEntries) {
      const variable = createVariableFromValue(name, varData, 'module-env', name, {
        serializedMetadata: metadataMap?.[name]
      });
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
