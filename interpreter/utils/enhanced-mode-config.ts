/**
 * Central configuration for enhanced Variable preservation mode
 * Part of Phase 3: Making Variables flow through the system
 */

/**
 * Check if enhanced arrays are enabled
 * Default: true (can be disabled with MLLD_ENHANCED_ARRAYS=false)
 */
export function isEnhancedArraysEnabled(): boolean {
  const envVar = process.env.MLLD_ENHANCED_ARRAYS;
  // Default to true unless explicitly disabled
  return envVar !== 'false';
}

/**
 * Check if enhanced resolution is enabled
 * Default: true (can be disabled with MLLD_ENHANCED_RESOLUTION=false)
 */
export function isEnhancedResolutionEnabled(): boolean {
  const envVar = process.env.MLLD_ENHANCED_RESOLUTION;
  // Default to true unless explicitly disabled
  return envVar !== 'false';
}

/**
 * Check if enhanced interpolation is enabled
 * Default: true (can be disabled with MLLD_ENHANCED_INTERPOLATION=false)
 */
export function isEnhancedInterpolationEnabled(): boolean {
  const envVar = process.env.MLLD_ENHANCED_INTERPOLATION;
  // Default to true unless explicitly disabled
  return envVar !== 'false';
}

/**
 * Check if enhanced Variable passing to shadow environments is enabled
 * Default: true (can be disabled with MLLD_ENHANCED_VARIABLE_PASSING=false)
 * Note: Bash/sh environments use a simplified approach regardless of this setting
 */
export function isEnhancedVariablePassingEnabled(): boolean {
  const envVar = process.env.MLLD_ENHANCED_VARIABLE_PASSING;
  // Default to true unless explicitly disabled
  return envVar !== 'false';
}

/**
 * Enable all enhanced features (for testing)
 */
export function enableAllEnhancedFeatures(): void {
  delete process.env.MLLD_ENHANCED_ARRAYS;
  delete process.env.MLLD_ENHANCED_RESOLUTION;
  delete process.env.MLLD_ENHANCED_INTERPOLATION;
  delete process.env.MLLD_ENHANCED_VARIABLE_PASSING;
}

/**
 * Disable all enhanced features (for compatibility)
 */
export function disableAllEnhancedFeatures(): void {
  process.env.MLLD_ENHANCED_ARRAYS = 'false';
  process.env.MLLD_ENHANCED_RESOLUTION = 'false';
  process.env.MLLD_ENHANCED_INTERPOLATION = 'false';
  process.env.MLLD_ENHANCED_VARIABLE_PASSING = 'false';
}