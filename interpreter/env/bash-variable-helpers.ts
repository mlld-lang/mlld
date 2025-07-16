/**
 * Bash Variable Helpers for Shadow Environments
 * Part of Phase 4: System-wide Variable Flow
 * 
 * Provides Variable metadata through environment variables in Bash
 */

import type { Variable } from '@core/types/variable/VariableTypes';
import { isVariable } from '@interpreter/utils/variable-resolution';

/**
 * Convert Variables to environment variables with metadata
 * 
 * For each Variable, we create:
 * - varname: The actual value
 * - MLLD_TYPE_varname: The Variable type
 * - MLLD_SUBTYPE_varname: The Variable subtype (if any)
 * - MLLD_METADATA_varname: JSON-encoded metadata
 */
export function prepareVariablesForBash(
  params: Record<string, any>
): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(params)) {
    if (isVariable(value)) {
      const variable = value as Variable;
      
      // Set the main value
      if (typeof variable.value === 'object' && variable.value !== null) {
        envVars[key] = JSON.stringify(variable.value);
      } else {
        envVars[key] = String(variable.value);
      }
      
      // Set type metadata
      envVars[`MLLD_TYPE_${key}`] = variable.type;
      
      if (variable.subtype) {
        envVars[`MLLD_SUBTYPE_${key}`] = variable.subtype;
      }
      
      if (variable.metadata && Object.keys(variable.metadata).length > 0) {
        envVars[`MLLD_METADATA_${key}`] = JSON.stringify(variable.metadata);
      }
      
      // Mark as Variable
      envVars[`MLLD_IS_VARIABLE_${key}`] = 'true';
    } else {
      // Regular value
      if (typeof value === 'object' && value !== null) {
        envVars[key] = JSON.stringify(value);
      } else {
        envVars[key] = String(value);
      }
    }
  }
  
  return envVars;
}

/**
 * Generate Bash helper functions for Variable introspection
 */
export function generateBashMlldHelpers(): string {
  return `
# mlld helper functions for Bash
mlld_is_variable() {
  local varname="$1"
  local env_var="MLLD_IS_VARIABLE_${varname}"
  [ "${!env_var}" = "true" ]
}

mlld_get_type() {
  local varname="$1"
  local env_var="MLLD_TYPE_${varname}"
  echo "${!env_var}"
}

mlld_get_subtype() {
  local varname="$1"
  local env_var="MLLD_SUBTYPE_${varname}"
  echo "${!env_var}"
}

mlld_get_metadata() {
  local varname="$1"
  local env_var="MLLD_METADATA_${varname}"
  echo "${!env_var}"
}

# Export functions for subshells (if supported by the shell)
if command -v export >/dev/null 2>&1 && export -f 2>&1 | grep -q "illegal option"; then
  # export -f not supported, skip
  :
else
  export -f mlld_is_variable 2>/dev/null || true
  export -f mlld_get_type 2>/dev/null || true
  export -f mlld_get_subtype 2>/dev/null || true
  export -f mlld_get_metadata 2>/dev/null || true
fi
`;
}

/**
 * Inject mlld helpers into Bash code
 * @param code - The user's bash code
 * @param isEnhancedMode - Whether enhanced mode is enabled
 * @param metadata - Optional metadata for primitives
 */
export function injectBashHelpers(code: string, isEnhancedMode: boolean, metadata?: Record<string, any>): string {
  if (!isEnhancedMode) {
    return code;
  }
  
  let helpers = generateBashMlldHelpers();
  
  // If we have metadata, also inject it as environment variables
  if (metadata) {
    helpers += '\n# Primitive metadata\n';
    for (const [key, meta] of Object.entries(metadata)) {
      if (meta.isVariable) {
        helpers += `export MLLD_IS_VARIABLE_${key}="true"\n`;
        helpers += `export MLLD_TYPE_${key}="${meta.type || ''}"\n`;
        if (meta.subtype) {
          helpers += `export MLLD_SUBTYPE_${key}="${meta.subtype}"\n`;
        }
        if (meta.metadata) {
          helpers += `export MLLD_METADATA_${key}='${JSON.stringify(meta.metadata)}'\n`;
        }
      }
    }
  }
  
  // Prepend helper functions
  return helpers + '\n\n# User code:\n' + code;
}