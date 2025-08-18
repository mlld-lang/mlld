/**
 * Feature flags for gradual migration to new architectures
 * This allows us to safely migrate without breaking existing functionality
 */

/**
 * Enable Universal Context Architecture
 * When true, uses the new context system where context is always available
 * When false, uses the existing pipeline-specific context system
 */
export const USE_UNIVERSAL_CONTEXT = process.env.MLLD_UNIVERSAL_CONTEXT === 'true';

/**
 * Debug flag for logging context transitions
 */
export const DEBUG_UNIVERSAL_CONTEXT = process.env.DEBUG_UNIVERSAL_CONTEXT === 'true';

/**
 * Helper to log feature flag status (useful for debugging)
 */
export function logFeatureFlags(): void {
  if (DEBUG_UNIVERSAL_CONTEXT) {
    console.log('[Feature Flags]', {
      USE_UNIVERSAL_CONTEXT,
      DEBUG_UNIVERSAL_CONTEXT
    });
  }
}