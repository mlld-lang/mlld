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

# Export functions for subshells
export -f mlld_is_variable
export -f mlld_get_type
export -f mlld_get_subtype
export -f mlld_get_metadata
`;
}

/**
 * Inject mlld helpers into Bash code
 */
export function injectBashHelpers(code: string, isEnhancedMode: boolean): string {
  if (!isEnhancedMode) {
    return code;
  }
  
  // Prepend helper functions
  return generateBashMlldHelpers() + '\n\n# User code:\n' + code;
}