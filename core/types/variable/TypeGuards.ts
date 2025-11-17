/**
 * Variable Type Guards
 * 
 * Runtime type checking and TypeScript type narrowing functions for all variable types.
 */

import {
  Variable,
  VariableTypeDiscriminator,
  SimpleTextVariable,
  InterpolatedTextVariable,
  TemplateVariable,
  FileContentVariable,
  SectionContentVariable,
  ObjectVariable,
  ArrayVariable,
  ComputedVariable,
  CommandResultVariable,
  PathVariable,
  ImportedVariable,
  ExecutableVariable,
  PipelineInputVariable,
  PrimitiveVariable,
  TextLikeVariable,
  StructuredVariable,
  ExternalVariable,
  StructuredValueVariable
} from './VariableTypes';

// =========================================================================
// INDIVIDUAL TYPE GUARDS
// =========================================================================

/**
 * Type guard for SimpleTextVariable
 */
export function isSimpleText(variable: Variable): variable is SimpleTextVariable {
  return variable.type === 'simple-text';
}

/**
 * Type guard for InterpolatedTextVariable
 */
export function isInterpolatedText(variable: Variable): variable is InterpolatedTextVariable {
  return variable.type === 'interpolated-text';
}

/**
 * Type guard for TemplateVariable
 */
export function isTemplate(variable: Variable): variable is TemplateVariable {
  return variable.type === 'template';
}

/**
 * Type guard for FileContentVariable
 */
export function isFileContent(variable: Variable): variable is FileContentVariable {
  return variable.type === 'file-content';
}

/**
 * Type guard for SectionContentVariable
 */
export function isSectionContent(variable: Variable): variable is SectionContentVariable {
  return variable.type === 'section-content';
}

/**
 * Type guard for ObjectVariable
 */
export function isObject(variable: Variable): variable is ObjectVariable {
  return variable.type === 'object';
}

/**
 * Type guard for ArrayVariable
 */
export function isArray(variable: Variable): variable is ArrayVariable {
  return variable.type === 'array';
}

/**
 * Type guard for ComputedVariable
 */
export function isComputed(variable: Variable): variable is ComputedVariable {
  return variable.type === 'computed';
}

/**
 * Type guard for CommandResultVariable
 */
export function isCommandResult(variable: Variable): variable is CommandResultVariable {
  return variable.type === 'command-result';
}

/**
 * Type guard for PathVariable
 */
export function isPath(variable: Variable): variable is PathVariable {
  return variable.type === 'path';
}

/**
 * Type guard for ImportedVariable
 */
export function isImported(variable: Variable): variable is ImportedVariable {
  return variable.type === 'imported';
}

/**
 * Type guard for ExecutableVariable
 */
export function isExecutable(variable: Variable): variable is ExecutableVariable {
  return variable.type === 'executable';
}

/**
 * Type guard for PipelineInputVariable
 */
export function isPipelineInput(variable: Variable): variable is PipelineInputVariable {
  return variable.type === 'pipeline-input';
}

/**
 * Type guard for StructuredValueVariable
 */
export function isStructuredValueVariable(variable: Variable): variable is StructuredValueVariable {
  return variable.type === 'structured';
}

/**
 * Type guard for PrimitiveVariable
 */
export function isPrimitive(variable: Variable): variable is PrimitiveVariable {
  return variable.type === 'primitive';
}


// =========================================================================
// COMPOSITE TYPE GUARDS
// =========================================================================

/**
 * Check if variable contains text-like content
 */
export function isTextLike(variable: Variable): variable is TextLikeVariable {
  return isSimpleText(variable) || 
         isInterpolatedText(variable) || 
         isTemplate(variable) || 
         isFileContent(variable) || 
         isSectionContent(variable) ||
         isCommandResult(variable);
}

/**
 * Check if variable contains structured data
 */
export function isStructured(variable: Variable): variable is StructuredVariable {
  return isObject(variable) || isArray(variable) || isStructuredValueVariable(variable);
}

/**
 * Check if variable was created from external content
 */
export function isExternal(variable: Variable): variable is ExternalVariable {
  return isFileContent(variable) || 
         isSectionContent(variable) || 
         isImported(variable) || 
         isCommandResult(variable) ||
         isComputed(variable);
}

// =========================================================================
// UTILITY TYPE GUARDS
// =========================================================================

/**
 * Type guard class for organized access to all type checking functions
 */
export class VariableTypeGuards {
  // Individual type guards
  static isSimpleText = isSimpleText;
  static isInterpolatedText = isInterpolatedText;
  static isTemplate = isTemplate;
  static isFileContent = isFileContent;
  static isSectionContent = isSectionContent;
  static isObject = isObject;
  static isArray = isArray;
  static isComputed = isComputed;
  static isCommandResult = isCommandResult;
  static isPath = isPath;
  static isImported = isImported;
  static isExecutable = isExecutable;
  static isPipelineInput = isPipelineInput;
  static isStructuredValue = isStructuredValueVariable;
  static isPrimitive = isPrimitive;

  // Composite type guards
  static isTextLike = isTextLike;
  static isStructured = isStructured;
  static isExternal = isExternal;

  /**
   * Check if variable has a specific type discriminator
   */
  static hasType(variable: Variable, type: VariableTypeDiscriminator): boolean {
    return variable.type === type;
  }

  /**
   * Get all type discriminators that match the variable
   */
  static getMatchingTypes(variable: Variable): VariableTypeDiscriminator[] {
    const types: VariableTypeDiscriminator[] = [variable.type];
    
    // Add composite type categories
    if (this.isTextLike(variable)) {
      types.push('simple-text'); // Representing text-like category
    }
    
    if (this.isStructured(variable)) {
      types.push('object'); // Representing structured category
    }
    
    if (this.isExternal(variable)) {
      types.push('imported'); // Representing external category
    }
    
    return types;
  }

  /**
   * Validate that a variable matches expected type
   */
  static validateType(
    variable: Variable, 
    expectedType: VariableTypeDiscriminator
  ): boolean {
    return variable.type === expectedType;
  }

  /**
   * Check if variable is of any of the specified types
   */
  static isAnyType(
    variable: Variable, 
    types: VariableTypeDiscriminator[]
  ): boolean {
    return types.includes(variable.type);
  }

  /**
   * Filter variables by type
   */
  static filterByType<T extends Variable>(
    variables: Variable[],
    guard: (variable: Variable) => variable is T
  ): T[] {
    return variables.filter(guard);
  }

  /**
   * Find first variable of specified type
   */
  static findByType<T extends Variable>(
    variables: Variable[],
    guard: (variable: Variable) => variable is T
  ): T | undefined {
    return variables.find(guard);
  }

  /**
   * Count variables by type
   */
  static countByType(
    variables: Variable[],
    type: VariableTypeDiscriminator
  ): number {
    return variables.filter(v => v.type === type).length;
  }

  /**
   * Group variables by their types
   */
  static groupByType(variables: Variable[]): Map<VariableTypeDiscriminator, Variable[]> {
    const groups = new Map<VariableTypeDiscriminator, Variable[]>();
    
    for (const variable of variables) {
      const existing = groups.get(variable.type) || [];
      existing.push(variable);
      groups.set(variable.type, existing);
    }
    
    return groups;
  }
}

// =========================================================================
// PERFORMANCE OPTIMIZED TYPE CHECKING
// =========================================================================

/**
 * Fast type checking utilities for performance-critical paths
 */
export class FastTypeGuards {
  /**
   * Fast check for text types (most common)
   */
  static isAnyTextType(variable: Variable): boolean {
    const type = variable.type;
    return type === 'simple-text' || 
           type === 'interpolated-text' || 
           type === 'template' ||
           type === 'file-content' ||
           type === 'section-content' ||
           type === 'command-result';
  }

  /**
   * Fast check for data types
   */
  static isAnyDataType(variable: Variable): boolean {
    const type = variable.type;
    return type === 'object' || 
           type === 'array' || 
           type === 'computed' || 
           type === 'primitive';
  }

  /**
   * Fast check for complex types that might need special handling
   */
  static isComplexType(variable: Variable): boolean {
    const type = variable.type;
    return type === 'imported' || 
           type === 'executable' || 
           type === 'pipeline-input' ||
           type === 'path';
  }

  /**
   * Check if variable type requires lazy evaluation
   */
  static requiresLazyEvaluation(variable: Variable): boolean {
    return isTemplate(variable) ||
           isPipelineInput(variable) ||
           (isImported(variable) && variable.internal?.isComplex);
  }
}
