/**
 * Bash Variable Helpers for Shadow Environments
 * Part of Phase 4: System-wide Variable Flow
 * 
 * Provides Variable metadata through environment variables in Bash
 */


/**
 * Convert parameter values to environment variables for bash execution
 * 
 * In enhanced mode, we receive raw values (not Variables or proxies)
 * and convert them to strings suitable for environment variables.
 * Metadata is passed separately and injected via injectBashHelpers.
 */
export function prepareVariablesForBash(
  params: Record<string, any>
): Record<string, string> {
  const envVars: Record<string, string> = {};
  
  if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
    console.log('prepareVariablesForBash called with:', Object.keys(params));
  }
  
  for (const [key, value] of Object.entries(params)) {
    if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
      console.log(`Processing param ${key}:`, {
        valueType: typeof value,
        valueKeys: value && typeof value === 'object' ? Object.keys(value).slice(0, 5) : 'not-object'
      });
    }
    
    // In enhanced mode, we receive raw values, not Variables or proxies
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
 * @param isEnhancedMode - Whether enhanced mode is enabled
 * @param metadata - Optional metadata for primitives
 */
export function injectBashHelpers(code: string, isEnhancedMode: boolean, metadata?: Record<string, any>): string {
  // Disable enhanced mode for bash/sh - they use environment variables, not JavaScript objects
  // This avoids issues with JavaScript trying to evaluate bash code
  return code;
  
  // Original code kept for reference but disabled:
  /*
  if (!isEnhancedMode) {
    return code;
  }
  
  if (process.env.MLLD_DEBUG === 'true' || process.env.DEBUG_EXEC === 'true') {
    console.log('injectBashHelpers called:', {
      isEnhancedMode,
      codeLength: code.length,
      hasMetadata: !!metadata
    });
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
  */
}