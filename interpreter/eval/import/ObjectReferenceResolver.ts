import type { Variable, ExecutableVariable, RecordVariable } from '@core/types/variable';
import { serializeRecordVariable } from '@core/types/record';
import { logger } from '@core/utils/logger';
import { serializeShadowEnvironmentMaps } from './ShadowEnvSerializer';
import {
  getCapturedModuleEnv,
  sealCapturedModuleEnv,
  stashCapturedModuleEnv
} from './variable-importer/executable/CapturedModuleEnvKeychain';

/**
 * Handles complex object variable reference resolution for imported modules
 */
export class ObjectReferenceResolver {
  /**
   * Recursively resolve variable references in nested objects
   * This handles cases like { ask: @claude_ask } where @claude_ask needs to be resolved
   */
  resolveObjectReferences(
    value: any,
    variableMap: Map<string, Variable>,
    options?: {
      resolveStrings?: boolean;
      resolveVariable?: (name: string) => Variable | undefined;
      serializingEnvs?: WeakSet<object>;
      serializedModuleEnvCache?: WeakMap<object, unknown>;
    }
  ): any {
    const resolveStrings = options?.resolveStrings !== false;
    const stringRefPattern = /^@[A-Za-z0-9_.-]+$/;
    const serializingEnvs = options?.serializingEnvs ?? new WeakSet<object>();
    const serializedModuleEnvCache = options?.serializedModuleEnvCache ?? new WeakMap<object, unknown>();
    
    if (value === null || value === undefined) {
      return value;
    }
    
    if (Array.isArray(value)) {
      return value.map(item =>
        this.resolveObjectReferences(item, variableMap, {
          ...options,
          serializingEnvs,
          serializedModuleEnvCache
        })
      );
    }

    if (this.isVariableLike(value)) {
      return this.resolveExecutableReference(value as Variable, serializingEnvs, serializedModuleEnvCache);
    }
    
    // Check if this is a VariableReference AST node
    if (typeof value === 'object' && value.type === 'VariableReference' && value.identifier) {
      return this.resolveVariableReference(value.identifier, variableMap, (value as any).fields, options);
    }
    
    if (typeof value === 'object') {
      // Handle AST object nodes with type and properties/entries
      if (value.type === 'object' && (value as any).properties) {
        return this.resolveASTObjectNode(value, variableMap, options);
      }
      if (value.type === 'object' && Array.isArray((value as any).entries)) {
        return this.resolveASTObjectNode(value, variableMap, options);
      }
      
      // Handle regular objects
      return this.resolveNestedStructures(value, variableMap, options);
    }
    
    // Check if this is a variable reference string (starts with @)
    if (typeof value === 'string' && resolveStrings && stringRefPattern.test(value)) {
      const varName = value.substring(1); // Remove @ prefix
      const referencedVar = variableMap.get(varName) ?? options?.resolveVariable?.(varName);

      if (process.env.DEBUG_EXEC) {
        logger.debug('resolveObjectReferences looking for variable:', {
          originalValue: value,
          varName,
          found: !!referencedVar,
          referencedVarType: referencedVar?.type,
          availableVars: Array.from(variableMap.keys())
        });
      }

      if (referencedVar) {
        return this.resolveExecutableReference(referencedVar, serializingEnvs, serializedModuleEnvCache);
      }

      // String looked like a variable but no binding exists; treat as literal
      return value;
    }
    
    return value;
  }

  /**
   * Resolve a single variable reference by name, optionally applying field access
   */
  private resolveVariableReference(
    varName: string,
    variableMap: Map<string, Variable>,
    fields?: any[],
    options?: {
      resolveStrings?: boolean;
      resolveVariable?: (name: string) => Variable | undefined;
      serializingEnvs?: WeakSet<object>;
      serializedModuleEnvCache?: WeakMap<object, unknown>;
    }
  ): any {
    const referencedVar = variableMap.get(varName) ?? options?.resolveVariable?.(varName);
    const serializingEnvs = options?.serializingEnvs ?? new WeakSet<object>();
    const serializedModuleEnvCache = options?.serializedModuleEnvCache ?? new WeakMap<object, unknown>();

    if (referencedVar) {
      let result = this.resolveExecutableReference(referencedVar, serializingEnvs, serializedModuleEnvCache);

      // Apply field access if present (e.g., @fm.id -> access 'id' field on frontmatter)
      if (fields && fields.length > 0 && result && typeof result === 'object') {
        for (const field of fields) {
          if (field.type === 'field' && typeof field.value === 'string') {
            if (result && typeof result === 'object' && field.value in result) {
              result = result[field.value];
            } else {
              // Field not found - return null to match normal field access behavior
              return null;
            }
          } else if (field.type === 'bracketAccess') {
            const key = field.value;
            if (result && typeof result === 'object' && key in result) {
              result = result[key];
            } else if (Array.isArray(result) && typeof key === 'number') {
              result = result[key];
            } else {
              return null;
            }
          }
        }
      }

      // If the result is an object that might contain more AST nodes, recursively resolve it
      if (
        result &&
        typeof result === 'object' &&
        !result.__executable &&
        !result.__recordVariable &&
        !result.__record &&
        !Array.isArray(result) &&
        !(result as any).__arraySnapshot
      ) {
        return this.resolveObjectReferences(result, variableMap, options);
      }

      return result;
    } else {
      if (process.env.DEBUG_EXEC) {
        logger.debug('VariableReference AST node not found during import resolution:', varName);
      }
      throw new Error(`Variable reference @${varName} not found during import`);
    }
  }

  /**
   * Handle executable variable references with special serialization format
   */
  private resolveExecutableReference(
    referencedVar: Variable,
    serializingEnvs: WeakSet<object> = new WeakSet<object>(),
    serializedModuleEnvCache: WeakMap<object, unknown> = new WeakMap<object, unknown>()
  ): any {
    // For executables, we need to export them with the proper structure
    if (referencedVar.type === 'executable') {
      const execVar = referencedVar as ExecutableVariable;
      
      // Serialize shadow environments if present (Maps don't serialize to JSON)
      let serializedCtx = { ...execVar.mx };
      let serializedInternal = { ...execVar.internal };
      const capturedModuleEnv =
        getCapturedModuleEnv(execVar.internal)
        ?? getCapturedModuleEnv(execVar);

      if (execVar.internal?.capturedShadowEnvs) {
        serializedInternal = {
          ...serializedInternal,
          capturedShadowEnvs: serializeShadowEnvironmentMaps(execVar.internal.capturedShadowEnvs)
        };
      }
      // Serialize module environment if present
      if (capturedModuleEnv instanceof Map) {
        sealCapturedModuleEnv(
          serializedInternal,
          this.serializeCapturedModuleEnv(
            capturedModuleEnv,
            serializingEnvs,
            serializedModuleEnvCache
          )
        );
      } else if (capturedModuleEnv !== undefined) {
        sealCapturedModuleEnv(serializedInternal, capturedModuleEnv);
      }

      const result = {
        __executable: true,
        name: execVar.name,
        value: execVar.value,
        paramNames: execVar.paramNames,
        paramTypes: execVar.paramTypes,
        description: execVar.description,
        executableDef: execVar.internal?.executableDef,
        mx: serializedCtx,
        internal: serializedInternal
      };
      stashCapturedModuleEnv(result, getCapturedModuleEnv(serializedInternal));
      return result;
    } else if (referencedVar.type === 'record') {
      return serializeRecordVariable(referencedVar as RecordVariable);
    } else {
      // For all other variable types (including arrays), return the value directly
      // This ensures object properties contain raw values, not Variable wrappers
      return referencedVar.value;
    }
  }
  
  /**
   * Serialize module environment for export (Map to object)
   * WHY: Maps don't serialize to JSON, so we need to convert to exportable format
   * IMPORTANT: Delegate to VariableImporter to ensure consistent serialization
   */
  private serializeCapturedModuleEnv(
    moduleEnv: Map<string, Variable>,
    serializingEnvs: WeakSet<object>,
    serializedModuleEnvCache: WeakMap<object, unknown>
  ): unknown {
    if (serializedModuleEnvCache.has(moduleEnv)) {
      return serializedModuleEnvCache.get(moduleEnv);
    }

    if (serializingEnvs.has(moduleEnv)) {
      return undefined;
    }

    serializingEnvs.add(moduleEnv);
    try {
      const serialized = this.serializeModuleEnv(
        moduleEnv,
        serializingEnvs,
        serializedModuleEnvCache
      );
      serializedModuleEnvCache.set(moduleEnv, serialized);
      return serialized;
    } finally {
      serializingEnvs.delete(moduleEnv);
    }
  }

  private serializeModuleEnv(
    moduleEnv: Map<string, Variable>,
    serializingEnvs: WeakSet<object> = new WeakSet<object>(),
    serializedModuleEnvCache: WeakMap<object, unknown> = new WeakMap<object, unknown>()
  ): any {
    const result: Record<string, any> = {};
    for (const [name, variable] of moduleEnv) {
      if (variable.type === 'executable' || variable.type === 'record') {
        result[name] = this.resolveExecutableReference(
          variable,
          serializingEnvs,
          serializedModuleEnvCache
        );
      } else {
        // For other variables, export the value directly
        result[name] = variable.value;
      }
    }
    return result;
  }

  /**
   * Handle AST object nodes with type and properties
   */
  private resolveASTObjectNode(value: any, variableMap: Map<string, Variable>, options?: { resolveStrings?: boolean }): any {
    const resolved: Record<string, any> = {};

    // New entries format (supports spreads)
    if (Array.isArray(value.entries) && value.entries.length > 0) {
      for (const entry of value.entries) {
        if (entry.type === 'pair') {
          resolved[this.resolveObjectKey(entry.key, variableMap, options)] =
            this.resolveObjectReferences(entry.value, variableMap, options);
        } else if (entry.type === 'spread') {
          for (const spreadNode of entry.value || []) {
            const spreadValue = this.resolveObjectReferences(spreadNode, variableMap, options);
            if (spreadValue && typeof spreadValue === 'object' && !Array.isArray(spreadValue)) {
              Object.assign(resolved, spreadValue);
            } else {
              throw new Error('Cannot spread non-object value during import resolution');
            }
          }
        }
      }
      return resolved;
    }

    // Legacy properties format
    if (value.properties) {
      for (const [key, val] of Object.entries(value.properties)) {
        resolved[key] = this.resolveObjectReferences(val, variableMap, options);
      }
      return resolved;
    }

    // Fallback - treat as plain object
    return this.resolveNestedStructures(value, variableMap);
  }

  /**
   * Recursively resolve references in nested objects and arrays
   */
  private resolveNestedStructures(value: any, variableMap: Map<string, Variable>, options?: { resolveStrings?: boolean }): any {
    const resolved: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      resolved[key] = this.resolveObjectReferences(val, variableMap, options);
    }
    return resolved;
  }

  private resolveObjectKey(
    key: unknown,
    variableMap: Map<string, Variable>,
    options?: { resolveStrings?: boolean }
  ): string {
    if (typeof key === 'string' || typeof key === 'number' || typeof key === 'boolean') {
      return String(key);
    }

    if (
      key &&
      typeof key === 'object' &&
      'needsInterpolation' in (key as Record<string, unknown>) &&
      Array.isArray((key as { parts?: unknown[] }).parts)
    ) {
      return ((key as { parts: unknown[] }).parts ?? [])
        .map(part => {
          const resolved = this.resolveObjectReferences(part, variableMap, { ...options, resolveStrings: true });
          if (typeof resolved === 'string' || typeof resolved === 'number' || typeof resolved === 'boolean') {
            return String(resolved);
          }
          if (resolved && typeof resolved === 'object' && 'content' in (resolved as Record<string, unknown>)) {
            return String((resolved as Record<string, unknown>).content ?? '');
          }
          return '';
        })
        .join('');
    }

    if (
      key &&
      typeof key === 'object' &&
      'type' in (key as Record<string, unknown>) &&
      (key as { type?: unknown }).type === 'Literal'
    ) {
      return String((key as { value?: unknown }).value ?? '');
    }

    if (
      key &&
      typeof key === 'object' &&
      'type' in (key as Record<string, unknown>) &&
      (key as { type?: unknown }).type === 'Text'
    ) {
      return String((key as { content?: unknown }).content ?? '');
    }

    return String(this.resolveObjectReferences(key, variableMap, { ...options, resolveStrings: true }) ?? '');
  }

  private isVariableLike(value: unknown): value is Variable {
    return Boolean(
      value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>).type === 'string' &&
      'name' in (value as Record<string, unknown>) &&
      'value' in (value as Record<string, unknown>) &&
      'source' in (value as Record<string, unknown>) &&
      'createdAt' in (value as Record<string, unknown>) &&
      'modifiedAt' in (value as Record<string, unknown>)
    );
  }
}
