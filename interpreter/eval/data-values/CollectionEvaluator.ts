import type { Environment } from '../../env/Environment';
import type { DataValue, DataObjectValue, DataArrayValue } from '@core/types/var';
import { interpolate } from '../../core/interpreter';
import { isStructuredValue } from '@interpreter/utils/structured-value';
import type { SecurityDescriptor } from '@core/types/security';
import { InterpolationContext } from '../../core/interpolation-context';

async function interpolateAndRecord(
  nodes: any,
  env: Environment,
  context: InterpolationContext = InterpolationContext.Default
): Promise<string> {
  const descriptors: SecurityDescriptor[] = [];
  const text = await interpolate(nodes, env, context, {
    collectSecurityDescriptor: descriptor => {
      if (descriptor) {
        descriptors.push(descriptor);
      }
    }
  });
  if (descriptors.length > 0) {
    const merged =
      descriptors.length === 1 ? descriptors[0] : env.mergeSecurityDescriptors(...descriptors);
    env.recordSecurityDescriptor(merged);
  }
  return text;
}

/**
 * Handles evaluation of collection data values (objects and arrays).
 * 
 * This evaluator processes:
 * - Object values with recursive property evaluation
 * - Array values with recursive element evaluation  
 * - Template content arrays requiring interpolation
 * - Error isolation for individual properties/elements
 */
export class CollectionEvaluator {
  constructor(private evaluateDataValue: (value: DataValue, env: Environment) => Promise<any>) {}

  /**
   * Checks if this evaluator can handle the given data value
   */
  canHandle(value: DataValue): boolean {
    if (isStructuredValue(value)) {
      return true;
    }

    // Handle objects
    if (value?.type === 'object') {
      return true;
    }
    
    // Handle arrays
    if (value?.type === 'array') {
      return true;
    }
    
    // Handle regular arrays
    if (Array.isArray(value)) {
      // Check if the array contains a single foreach command object
      if (value.length === 1 && value[0] && typeof value[0] === 'object' && value[0].type === 'foreach-command') {
        return true;
      }
      
      // Handle array template content
      const isTemplateContent = value.every(item => 
        item?.type === 'Text' || item?.type === 'VariableReference'
      );
      
      // Also handle already processed arrays (foreach-section results)
      return isTemplateContent || value.every(item => typeof item === 'string');
    }
    
    // Handle plain objects (from parsed data) without type field
    if (typeof value === 'object' && value !== null && !value.type && !Array.isArray(value)) {
      return true;
    }
    
    return false;
  }

  /**
   * Evaluates collection data values with recursive evaluation
   */
  async evaluate(value: DataValue, env: Environment): Promise<any> {
    if (isStructuredValue(value)) {
      return (value as any).data;
    }

    // Handle objects - recursively evaluate all properties
    if (value?.type === 'object') {
      return await this.evaluateObject(value as DataObjectValue, env);
    }
    
    // Handle arrays - evaluate all elements
    if (value?.type === 'array') {
      return await this.evaluateArray(value as DataArrayValue, env);
    }
    
    // Handle array template content
    if (Array.isArray(value)) {
      // Check if the array contains a single foreach command object
      if (value.length === 1 && value[0] && typeof value[0] === 'object' && value[0].type === 'foreach-command') {
        // Delegate to the main evaluator for foreach handling
        return await this.evaluateDataValue(value[0], env);
      }
      
      const isTemplateContent = value.every(item => 
        item?.type === 'Text' || item?.type === 'VariableReference'
      );
      
      if (isTemplateContent) {
        // This is template content that needs interpolation
        return await interpolateAndRecord(value, env);
      }
      
      // Otherwise it's a regular array that's already been processed
      // This can happen when foreach-section returns an array of strings
      return value;
    }
    
    // Handle plain objects (from parsed data) without type field
    if (typeof value === 'object' && value !== null && !value.type && !Array.isArray(value)) {
      return await this.evaluatePlainObject(value, env);
    }
    
    throw new Error(`CollectionEvaluator cannot handle value type: ${typeof value}`);
  }

  /**
   * Evaluates an object with recursive property evaluation and error isolation
   * Supports both pair entries and spread entries for object composition
   */
  private async evaluateObject(value: DataObjectValue, env: Environment): Promise<Record<string, any>> {
    const evaluatedObj: Record<string, any> = {};

    // Process each entry in order (pairs and spreads)
    for (const entry of value.entries) {
      if (entry.type === 'pair') {
        // Regular key-value pair
        try {
          let evaluated = await this.evaluateDataValue(entry.value, env);
          if (isStructuredValue(evaluated)) {
            evaluated = unwrapStructuredPrimitive(evaluated);
          }
          evaluatedObj[entry.key] = evaluated;
        } catch (error) {
          // Store error information but continue evaluating other properties
          evaluatedObj[entry.key] = this.createPropertyError(entry.key, error);
        }
      } else if (entry.type === 'spread') {
        // Spread entry: evaluate the variable and merge its properties
        try {
          // Interpolate the variable reference to get the variable name
          const varName = await interpolateAndRecord(entry.value, env);

          // Get the variable value from environment
          const spreadVariable = await env.getVariable(varName);
          if (!spreadVariable) {
            throw new Error(`Cannot spread undefined variable: ${varName}`);
          }

          // Extract the actual value (handles Variable wrapper)
          const spreadValue = spreadVariable.value !== undefined ? spreadVariable.value : spreadVariable;

          // Validate it's an object
          if (typeof spreadValue !== 'object' || spreadValue === null || Array.isArray(spreadValue)) {
            throw new Error(
              `Cannot spread non-object value from ${varName} (got ${Array.isArray(spreadValue) ? 'array' : typeof spreadValue})`
            );
          }

          // Merge spread properties (later entries override earlier ones)
          Object.assign(evaluatedObj, spreadValue);
        } catch (error) {
          // For spread errors, we can't assign to a specific key
          // Re-throw since this affects the whole object
          throw error;
        }
      }
    }

    return evaluatedObj;
  }

  /**
   * Evaluates an array with recursive element evaluation and error isolation
   */
  private async evaluateArray(value: DataArrayValue, env: Environment): Promise<any[]> {
    const evaluatedElements: any[] = [];
    
    
    for (let i = 0; i < value.items.length; i++) {
      try {
        let evaluatedItem = await this.evaluateDataValue(value.items[i], env);
        if (isStructuredValue(evaluatedItem)) {
          evaluatedItem = unwrapStructuredPrimitive(evaluatedItem);
        }
        evaluatedElements.push(evaluatedItem);
      } catch (error) {
        // Store error information but continue evaluating other elements
        evaluatedElements.push(this.createElementError(i, error));
      }
    }
    
    return evaluatedElements;
  }

  /**
   * Creates error object for a failed property evaluation
   */
  private createPropertyError(key: string, error: unknown): object {
    return {
      __error: true,
      __message: error instanceof Error ? error.message : String(error),
      __property: key
    };
  }

  /**
   * Creates error object for a failed element evaluation
   */
  private createElementError(index: number, error: unknown): object {
    return {
      __error: true,
      __message: error instanceof Error ? error.message : String(error),
      __index: index
    };
  }

  /**
   * Evaluates a plain object (without type field) recursively
   */
  private async evaluatePlainObject(value: Record<string, any>, env: Environment): Promise<Record<string, any>> {
    const evaluatedObject: Record<string, any> = {};
    
    for (const [key, propValue] of Object.entries(value)) {
      // Skip internal properties that shouldn't be in the result
      if (key === 'wrapperType' || key === 'nodeId' || key === 'location') {
        continue;
      }
      
      try {
        let evaluated = await this.evaluateDataValue(propValue, env);
        if (isStructuredValue(evaluated)) {
          evaluated = unwrapStructuredPrimitive(evaluated);
        }
        evaluatedObject[key] = evaluated;
      } catch (error) {
        // Include the error in the result but don't stop evaluation
        evaluatedObject[key] = this.createPropertyError(key, error);
      }
    }
    
    return evaluatedObject;
  }
}

function unwrapStructuredPrimitive(value: any): any {
  if (!isStructuredValue(value)) {
    return value;
  }

  const data = value.data;
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'object') {
    return value;
  }

  return data;
}
