/**
 * Variable System Module
 * 
 * Unified export of the refactored variable system components.
 * This module provides the complete variable system API while maintaining
 * backward compatibility with the previous monolithic structure.
 */

// =========================================================================
// TYPE DEFINITIONS
// =========================================================================

export * from './variable/VariableTypes';

// =========================================================================
// METADATA SYSTEM
// =========================================================================

export * from './variable/VariableMetadata';

// =========================================================================
// TYPE GUARDS
// =========================================================================

export * from './variable/TypeGuards';

// =========================================================================
// FACTORY FUNCTIONS
// =========================================================================

export * from './variable/VariableFactories';

// =========================================================================
// ADVANCED TYPE DETECTION
// =========================================================================

export * from './variable/AdvancedTypeDetection';

// =========================================================================
// LEGACY COMPATIBILITY
// =========================================================================

export * from './variable/LegacyCompatibility';

// =========================================================================
// CONVENIENT RE-EXPORTS
// =========================================================================

// Re-export the main Variable type for easy access
export type { Variable } from './variable/VariableTypes';

// Re-export the discriminator type
export type { VariableTypeDiscriminator } from './variable/VariableTypes';

// Re-export commonly used factory methods
export { VariableFactory } from './variable/VariableFactories';

// Re-export commonly used type guards
export { VariableTypeGuards } from './variable/TypeGuards';

// Re-export advanced detection
export { AdvancedTypeDetection } from './variable/AdvancedTypeDetection';

// Re-export legacy converter
export { LegacyVariableConverter } from './variable/LegacyCompatibility';

// Re-export metadata utilities
export { VariableMetadataUtils, VariableSourceHelpers } from './variable/VariableMetadata';

// =========================================================================
// BACKWARD COMPATIBILITY FUNCTIONS
// =========================================================================

import { Variable } from './variable/VariableTypes';
import { LegacyVariableConverter } from './variable/LegacyCompatibility';
import { AdvancedTypeDetection } from './variable/AdvancedTypeDetection';

/**
 * Convert a new variable to legacy format (backward compatibility)
 */
export function toLegacyVariable(variable: Variable): any {
  return LegacyVariableConverter.toLegacyVariable(variable);
}

/**
 * Check for legacy variable types in imported variables (backward compatibility)
 */
export function hasLegacyType(variable: Variable): boolean {
  return LegacyVariableConverter.hasLegacyType(variable);
}

/**
 * Check if variable is an executable, including imported executables (backward compatibility)
 */
export function isExecutableVariable(variable: Variable): boolean {
  return AdvancedTypeDetection.isExecutableVariable(variable);
}

/**
 * Get the effective type of a variable, considering imported variables (backward compatibility)
 */
export function getEffectiveType(variable: Variable) {
  return AdvancedTypeDetection.getEffectiveType(variable);
}