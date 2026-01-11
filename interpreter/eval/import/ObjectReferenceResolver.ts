import * as fs from 'fs';
import type { Variable, ExecutableVariable } from '@core/types/variable';
import { logger } from '@core/utils/logger';

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
    options?: { resolveStrings?: boolean }
  ): any {
    const resolveStrings = options?.resolveStrings !== false;
    const stringRefPattern = /^@[A-Za-z0-9_.-]+$/;
    
    if (value === null || value === undefined) {
      return value;
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.resolveObjectReferences(item, variableMap, options));
    }
    
    // Check if this is a VariableReference AST node
    if (typeof value === 'object' && value.type === 'VariableReference' && value.identifier) {
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        console.error('[ObjectReferenceResolver] Found VariableReference AST node:', {
          identifier: value.identifier,
          hasFields: !!(value as any).fields,
          fields: (value as any).fields
        });
      }
      return this.resolveVariableReference(value.identifier, variableMap, (value as any).fields);
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
      const referencedVar = variableMap.get(varName);

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
        return this.resolveExecutableReference(referencedVar);
      }

      // String looked like a variable but no binding exists; treat as literal
      return value;
    }
    
    return value;
  }

  /**
   * Resolve a single variable reference by name, optionally applying field access
   */
  private resolveVariableReference(varName: string, variableMap: Map<string, Variable>, fields?: any[]): any {
    const referencedVar = variableMap.get(varName);

    if (referencedVar) {
      let result = this.resolveExecutableReference(referencedVar);

      // Apply field access if present (e.g., @fm.id -> access 'id' field on frontmatter)
      if (fields && fields.length > 0 && result && typeof result === 'object') {
        for (const field of fields) {
          if (field.type === 'field' && typeof field.value === 'string') {
            if (result && typeof result === 'object' && field.value in result) {
              result = result[field.value];
            } else {
              // Field not found - return undefined to match normal field access behavior
              return undefined;
            }
          } else if (field.type === 'bracketAccess') {
            const key = field.value;
            if (result && typeof result === 'object' && key in result) {
              result = result[key];
            } else if (Array.isArray(result) && typeof key === 'number') {
              result = result[key];
            } else {
              return undefined;
            }
          }
        }
      }

      // If the result is an object that might contain more AST nodes, recursively resolve it
      if (result && typeof result === 'object' && !result.__executable && !Array.isArray(result) && !(result as any).__arraySnapshot) {
        return this.resolveObjectReferences(result, variableMap);
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
  private resolveExecutableReference(referencedVar: Variable): any {
    // For executables, we need to export them with the proper structure
    if (referencedVar.type === 'executable') {
      const execVar = referencedVar as ExecutableVariable;
      
      // Serialize shadow environments if present (Maps don't serialize to JSON)
      let serializedCtx = { ...execVar.mx };
      let serializedInternal = { ...execVar.internal };

      if (execVar.internal?.capturedShadowEnvs) {
        serializedInternal = {
          ...serializedInternal,
          capturedShadowEnvs: this.serializeShadowEnvs(execVar.internal.capturedShadowEnvs)
        };
      }
      // Serialize module environment if present
      if (execVar.internal?.capturedModuleEnv) {
        serializedInternal = {
          ...serializedInternal,
          capturedModuleEnv: this.serializeModuleEnv(execVar.internal.capturedModuleEnv)
        };
      }

      const result = {
        __executable: true,
        value: execVar.value,
        paramNames: execVar.paramNames,
        executableDef: execVar.internal?.executableDef,
        mx: serializedCtx,
        internal: serializedInternal
      };
      return result;
    } else {
      // For all other variable types (including arrays), return the value directly
      // This ensures object properties contain raw values, not Variable wrappers
      return referencedVar.value;
    }
  }
  
  /**
   * Serialize shadow environments for export (Maps to objects)
   * WHY: Maps don't serialize to JSON, so we convert them to plain objects
   */
  private serializeShadowEnvs(envs: any): any {
    const result: any = {};
    
    for (const [lang, shadowMap] of Object.entries(envs)) {
      if (shadowMap instanceof Map && shadowMap.size > 0) {
        // Convert Map to object
        const obj: Record<string, any> = {};
        for (const [name, func] of shadowMap) {
          obj[name] = func;
        }
        result[lang] = obj;
      }
    }
    
    return result;
  }

  /**
   * Serialize module environment for export (Map to object)
   * WHY: Maps don't serialize to JSON, so we need to convert to exportable format
   * IMPORTANT: Delegate to VariableImporter to ensure consistent serialization
   */
  private serializeModuleEnv(moduleEnv: Map<string, Variable>): any {
    // Use a simpler approach: serialize each variable individually using the same logic as resolveExecutableReference
    const result: Record<string, any> = {};
    for (const [name, variable] of moduleEnv) {
      if (variable.type === 'executable') {
        const execVar = variable as ExecutableVariable;
        let serializedCtx = { ...execVar.mx };
        let serializedInternal = { ...execVar.internal };

        if (serializedInternal.capturedShadowEnvs) {
          serializedInternal = {
            ...serializedInternal,
            capturedShadowEnvs: this.serializeShadowEnvs(serializedInternal.capturedShadowEnvs)
          };
        }
        // Skip capturedModuleEnv only for items IN the module env to avoid recursion
        delete serializedInternal.capturedModuleEnv;

        result[name] = {
          __executable: true,
          value: execVar.value,
          paramNames: execVar.paramNames,
          executableDef: execVar.internal?.executableDef,
          mx: serializedCtx,
          internal: serializedInternal
        };
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
          resolved[entry.key] = this.resolveObjectReferences(entry.value, variableMap, options);
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
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        console.error('[ObjectReferenceResolver] resolved entries object', {
          keys: Object.keys(resolved),
          hasEntries: true
        });
        try {
          fs.appendFileSync(
            '/tmp/mlld-debug.log',
            JSON.stringify({
              source: 'ObjectReferenceResolver',
              keys: Object.keys(resolved),
              hasEntries: true
            }) + '\n'
          );
        } catch {}
      }
      return resolved;
    }

    // Legacy properties format
    if (value.properties) {
      for (const [key, val] of Object.entries(value.properties)) {
        resolved[key] = this.resolveObjectReferences(val, variableMap, options);
      }
      if (process.env.MLLD_DEBUG_FIX === 'true') {
        console.error('[ObjectReferenceResolver] resolved properties object', {
          keys: Object.keys(resolved),
          hasProperties: true
        });
        try {
          fs.appendFileSync(
            '/tmp/mlld-debug.log',
            JSON.stringify({
              source: 'ObjectReferenceResolver',
              keys: Object.keys(resolved),
              hasProperties: true
            }) + '\n'
          );
        } catch {}
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
}
