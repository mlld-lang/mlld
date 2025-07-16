/**
 * Bash Variable Helpers for Shadow Environments
 * Part of Phase 4: System-wide Variable Flow
 * 
 * Provides Variable metadata through environment variables in Bash
 */


/**
 * Convert parameter values to environment variables for bash execution
 * 
 * We receive raw values (not Variables or proxies) for bash compatibility
 * and convert them to strings suitable for environment variables.
 * Metadata is passed separately and injected via injectBashHelpers.
 */
export function prepareVariablesForBash(
  params: Record<string, any>
): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  for (const [key, value] of Object.entries(params)) {
    // We receive raw values, not Variables or proxies
    // Just convert to string for environment variable
    if (typeof value === 'object' && value !== null) {
      envVars[key] = JSON.stringify(value);
    } else {
      envVars[key] = String(value);
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
 * @param metadata - Optional metadata for primitives
 */
export function injectBashHelpers(code: string, metadata?: Record<string, any>): string {
  // Bash/sh use environment variables, not JavaScript objects
  // This avoids issues with JavaScript trying to evaluate bash code
  return code;
}