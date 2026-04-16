import type { Variable } from '@core/types/variable';
import { serializeModuleBoundaryValue } from '@interpreter/utils/module-boundary-serialization';

/**
 * Handles complex object variable reference resolution for imported modules.
 */
export class ObjectReferenceResolver {
  resolveObjectReferences(
    value: unknown,
    variableMap: Map<string, Variable>,
    options?: {
      resolveStrings?: boolean;
      resolveVariable?: (name: string) => Variable | undefined;
      serializingEnvs?: WeakSet<object>;
      serializedModuleEnvCache?: WeakMap<object, unknown>;
    }
  ): unknown {
    return serializeModuleBoundaryValue(value, {
      variableMap,
      resolveStrings: options?.resolveStrings,
      resolveVariable: options?.resolveVariable,
      serializingEnvs: options?.serializingEnvs,
      serializedModuleEnvCache: options?.serializedModuleEnvCache
    });
  }
}
