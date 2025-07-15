/**
 * Migration wrapper for interpolate function to gradually adopt Variable preservation
 * Part of Phase 3: Making Variables flow through the system
 */

import type { Environment } from '@interpreter/env/Environment';
import { ResolutionContext } from '@interpreter/utils/variable-resolution';
import { interpolate as interpolateOriginal } from './interpreter';
import { interpolateWithContext } from './interpreter-enhanced';

/**
 * Enhanced interpolate that can preserve Variables based on feature flag
 * and detected context
 */
export async function interpolateEnhanced(
  nodes: any[],
  env: Environment,
  contextHint?: 'array' | 'object' | 'string' | 'command'
): Promise<any> {
  // If enhanced resolution is not enabled, use original
  if (!isEnhancedInterpolationEnabled()) {
    return interpolateOriginal(nodes, env);
  }
  
  // Determine resolution context from hint
  let context: ResolutionContext;
  switch (contextHint) {
    case 'array':
      context = ResolutionContext.ArrayElement;
      break;
    case 'object':
      context = ResolutionContext.ObjectProperty;
      break;
    case 'command':
      context = ResolutionContext.CommandExecution;
      break;
    case 'string':
    default:
      context = ResolutionContext.StringInterpolation;
      break;
  }
  
  return interpolateWithContext(nodes, env, context);
}

/**
 * Helper to check if enhanced interpolation is enabled
 */
export function isEnhancedInterpolationEnabled(): boolean {
  return process.env.MLLD_ENHANCED_INTERPOLATION === 'true';
}

/**
 * Enable enhanced interpolation
 */
export function enableEnhancedInterpolation(): void {
  process.env.MLLD_ENHANCED_INTERPOLATION = 'true';
}

/**
 * Disable enhanced interpolation
 */
export function disableEnhancedInterpolation(): void {
  delete process.env.MLLD_ENHANCED_INTERPOLATION;
}