import type { Variable } from '@core/types/variable';
import { 
  createSimpleTextVariable,
  createObjectVariable,
  createArrayVariable,
  createPrimitiveVariable,
  createExecutableVariable
} from '@core/types/variable/VariableFactories';
import { isLoadContentResult, isLoadContentResultArray } from '@core/types/load-content';

/**
 * Factory for creating and preserving Variable types
 * Consolidates 5 Variable creation patterns with type preservation
 * Critical for maintaining metadata through parameter binding
 */
export class VariableFactory {
  /**
   * Create a parameter variable, preserving type information if available
   */
  static createParameter(
    name: string,
    value: any,
    originalType?: Variable
  ): Variable {
    // If we have original type information, preserve it
    if (originalType) {
      return this.preserveType(originalType, value, name);
    }
    
    // Otherwise, infer the type from the value
    return this.inferType(name, value);
  }
  
  /**
   * Preserve the original variable type while updating the value
   */
  private static preserveType(
    originalVar: Variable,
    newValue: any,
    newName?: string
  ): Variable {
    const name = newName || originalVar.name;
    
    // Preserve ALL the original metadata, including custom properties
    const metadata = { ...originalVar.metadata } || {};
    
    switch (originalVar.type) {
      case 'simple-text':
        const textVar = createSimpleTextVariable(name, newValue, {
          isInterpolated: (originalVar as any).subtype === 'interpolated-text'
        });
        // Preserve metadata including custom toString
        textVar.metadata = metadata;
        // Preserve custom toString if it exists
        if (typeof (originalVar as any).toString === 'function') {
          (textVar as any).toString = (originalVar as any).toString;
        }
        return textVar;
      
      case 'object':
        return createObjectVariable(name, newValue, false, undefined, metadata);
      
      case 'array':
        const arrayVar = createArrayVariable(name, newValue, false, undefined, metadata);
        // Preserve custom toString if it exists (e.g., for path arrays)
        if (typeof (originalVar as any).toString === 'function') {
          (arrayVar as any).toString = (originalVar as any).toString;
        }
        return arrayVar;
      
      case 'primitive':
        const primitiveType = (originalVar as any).primitiveType || typeof newValue;
        return createPrimitiveVariable(name, newValue, primitiveType);
      
      case 'executable':
        // For executables, preserve all metadata
        const execVar = originalVar as any;
        return createExecutableVariable(
          name,
          execVar.executableType,
          execVar.template || '',
          execVar.paramNames || [],
          execVar.language,
          execVar.syntaxInfo,
          execVar.metadata
        );
      
      default:
        // Fallback to inferring type
        return this.inferType(name, newValue);
    }
  }
  
  /**
   * Infer the variable type from a value
   */
  private static inferType(name: string, value: any): Variable {
    // Create a default source for parameters
    const source = {
      directive: 'var' as const,
      syntax: 'reference' as const
    };
    
    // Handle LoadContentResult
    if (isLoadContentResult(value) || isLoadContentResultArray(value)) {
      // Preserve as array with metadata
      return createArrayVariable(name, value, false, source);
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return createArrayVariable(name, value, false, source);
    }
    
    // Handle objects
    if (value && typeof value === 'object' && value.constructor === Object) {
      return createObjectVariable(name, value, false, source);
    }
    
    // Handle primitives
    if (typeof value === 'boolean' || typeof value === 'number') {
      return createPrimitiveVariable(name, value, source);
    }
    
    // Default to simple text
    return createSimpleTextVariable(name, String(value), source);
  }
  
  /**
   * Create a variable for a return value
   */
  static createReturnValue(value: any): Variable {
    return this.inferType('__return', value);
  }
  
  /**
   * Create variables for pipeline parameters
   */
  static createPipelineParams(
    value: any,
    pipelineParam?: string
  ): Variable[] {
    const params: Variable[] = [];
    
    // Add pipeline parameter if specified
    if (pipelineParam) {
      params.push(this.inferType(pipelineParam, value));
    }
    
    // Always add @input
    params.push(this.inferType('input', value));
    
    // Add @value for compatibility
    params.push(this.inferType('value', value));
    
    return params;
  }
}