/**
 * Migration configuration for var.ts to use enhanced array evaluation
 * Part of Phase 3: Making Variables flow through the system
 */

import { evaluateArrayItemEnhanced } from './var-enhanced';
import { Environment } from '@interpreter/env/Environment';
import { isEnhancedArraysEnabled } from '@interpreter/utils/enhanced-mode-config';

/**
 * Wrapper for evaluateArrayItem that conditionally uses enhanced version
 */
export async function evaluateArrayItemMigration(
  item: any, 
  env: Environment
): Promise<any> {
  if (isEnhancedArraysEnabled()) {
    return evaluateArrayItemEnhanced(item, env);
  }
  
  // Fall back to original implementation
  const originalModule = await import('./var');
  return (originalModule as any).evaluateArrayItem(item, env);
}

/**
 * Enable enhanced array evaluation
 */
export function enableEnhancedArrays(): void {
  delete process.env.MLLD_ENHANCED_ARRAYS; // Remove any 'false' setting
}

/**
 * Disable enhanced array evaluation
 */
export function disableEnhancedArrays(): void {
  process.env.MLLD_ENHANCED_ARRAYS = 'false';
}

/**
 * Check if enhanced arrays are enabled
 */
export { isEnhancedArraysEnabled } from '@interpreter/utils/enhanced-mode-config';