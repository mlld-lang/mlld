/**
 * Wrapper around IStateService that ensures transformation is always enabled.
 * 
 * This implementation enforces the standardized behavior where:
 * - Transformation is always enabled (isTransformationEnabled always returns true)
 * - All transformation types are enabled (shouldTransform always returns true)
 * - Any attempt to disable transformation is ignored
 * 
 * This is part of the simplification to standardize on transformation mode only,
 * eliminating the previous dual-mode (transformation vs. normalized) complexity.
 */

import type { IStateService } from './IStateService.js';
import type { MeldNode } from '@core/syntax/types/index.js';
import type { TransformationOptions } from './IStateService.js';

/**
 * Creates a proxy around an IStateService implementation that ensures transformation is always enabled.
 * This standardizes behavior to always use transformation mode throughout the codebase.
 * 
 * It enforces consistent behavior by:
 * - Always returning true for isTransformationEnabled()
 * - Ensuring enableTransformation() always enables all transformations
 * - Always returning true for shouldTransform() for any transformation type
 * 
 * @param state - The state service to wrap
 * @returns A proxy that ensures transformation is always enabled
 */
export function createAlwaysTransformedState(state: IStateService): IStateService {
  // Make sure transformation is enabled
  state.enableTransformation(true);
  
  // Return a proxy that overrides the transformation-related methods
  return new Proxy(state, {
    get(target, prop, receiver) {
      // Override isTransformationEnabled to always return true
      if (prop === 'isTransformationEnabled') {
        return () => true;
      }
      
      // Override enableTransformation to ensure it's always enabled
      if (prop === 'enableTransformation') {
        return (options?: TransformationOptions | boolean) => {
          // Call the original method with true to ensure it's enabled
          target.enableTransformation(true);
        };
      }
      
      // Override shouldTransform to always return true for all types
      if (prop === 'shouldTransform') {
        return () => true;
      }
      
      // All other properties work as normal
      return Reflect.get(target, prop, receiver);
    }
  });
}