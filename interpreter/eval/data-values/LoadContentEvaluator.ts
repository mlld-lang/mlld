import type { Environment } from '../../env/Environment';
import type { DataValue } from '@core/types/var';
import { processContentLoader } from '../content-loader';

/**
 * Handles evaluation of load-content data values (<file.md> syntax).
 * 
 * This evaluator processes:
 * - File content loading expressions
 * - URL content loading expressions  
 * - Section extraction from content
 */
export class LoadContentEvaluator {
  /**
   * Checks if this evaluator can handle the given data value
   */
  canHandle(value: DataValue): boolean {
    return value && typeof value === 'object' && value.type === 'load-content';
  }

  /**
   * Evaluates load-content expressions to load file or URL content
   */
  async evaluate(value: DataValue, env: Environment): Promise<any> {
    if (!this.canHandle(value)) {
      throw new Error(`LoadContentEvaluator cannot handle value type: ${value?.type || typeof value}`);
    }
    
    // Use the existing content loader
    const result = await processContentLoader(value, env);
    
    // Import type guards
    const { isLoadContentResult } = await import('@core/types/load-content');
    
    // For consistency with the smart object approach,
    // return just the content string when used in data contexts
    if (isLoadContentResult(result)) {
      return result.content;
    }
    
    // For arrays or other types, return as-is
    return result;
  }
}