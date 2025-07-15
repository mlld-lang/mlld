/**
 * Migration wrapper to gradually introduce enhanced Variable resolution
 * This allows us to test the new resolution strategy incrementally
 */

import type { Variable, VariableValue } from '@core/types/variable/VariableTypes';
import type { Environment } from '@interpreter/env/Environment';
import { ResolutionContext } from '@interpreter/utils/variable-resolution';
import { resolveVariableValue as resolveVariableValueOriginal } from './interpreter';
import { resolveVariableValue as resolveVariableValueEnhanced } from './interpreter-enhanced';
import { isEnhancedResolutionEnabled } from '@interpreter/utils/enhanced-mode-config';

/**
 * Wrapper function that delegates to either original or enhanced resolution
 * based on feature flag
 */
export async function resolveVariableValue(
  variable: Variable,
  env: Environment,
  context?: ResolutionContext
): Promise<Variable | VariableValue> {
  
  if (isEnhancedResolutionEnabled() && context) {
    // Use enhanced resolution when context is provided
    return resolveVariableValueEnhanced(variable, env, context);
  }
  
  // Fall back to original resolution
  return resolveVariableValueOriginal(variable, env);
}

/**
 * Helper to determine if enhanced resolution is enabled
 */
export { isEnhancedResolutionEnabled } from '@interpreter/utils/enhanced-mode-config';

/**
 * Enable enhanced resolution for testing
 */
export function enableEnhancedResolution(): void {
  delete process.env.MLLD_ENHANCED_RESOLUTION; // Remove any 'false' setting
}

/**
 * Disable enhanced resolution
 */
export function disableEnhancedResolution(): void {
  process.env.MLLD_ENHANCED_RESOLUTION = 'false';
}