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

import type { IStateService } from './IStateService';
import type { MeldNode } from '@core/ast/types/index';
import type { TransformationOptions } from './IStateService';

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
  // Make sure transformation is enabled initially
  state.setTransformationEnabled(true);
  // Optionally set default transformation options if desired
  // state.setTransformationOptions({ /* default options */ });
  
  return new Proxy(state, {
    get(target, prop, receiver) {
      // Override isTransformationEnabled to always return true
      if (prop === 'isTransformationEnabled') {
        return () => true;
      }
      
      // Override setTransformationEnabled to ignore input and always set true
      if (prop === 'setTransformationEnabled') {
        return (enabled: boolean) => {
          // Call the original method, but always with true
          target.setTransformationEnabled(true);
        };
      }
      
      // Override shouldTransform to always return true for all types
      if (prop === 'shouldTransform') {
        return () => true;
      }
      
      // Forward other methods like getTransformationOptions, setTransformationOptions, etc.
      return Reflect.get(target, prop, receiver);
    }
  });
}