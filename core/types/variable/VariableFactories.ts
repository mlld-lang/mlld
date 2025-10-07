/**
 * Variable Factory Functions
 * 
 * Consistent creation functions for all variable types with proper metadata handling.
 */

import {
  VariableSource,
  VariableMetadata,
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
  StructuredValueVariable,
  PrimitiveVariable,
  PipelineInput,
  Variable
} from './VariableTypes';
import type { StructuredValue, StructuredValueType } from '@interpreter/utils/structured-value';

// =========================================================================
// INDIVIDUAL FACTORY FUNCTION EXPORTS (for backward compatibility)
// =========================================================================

/**
 * Create a SimpleTextVariable
 */
export function createSimpleTextVariable(
  name: string,
  value: string,
  source: VariableSource,
  metadata?: VariableMetadata
): SimpleTextVariable {
  return VariableFactory.createSimpleText(name, value, source, metadata);
}

/**
 * Create an InterpolatedTextVariable
 */
export function createInterpolatedTextVariable(
  name: string,
  value: string,
  interpolationPoints: Array<{ start: number; end: number; expression: string }>,
  source: VariableSource,
  metadata?: VariableMetadata
): InterpolatedTextVariable {
  return VariableFactory.createInterpolatedText(name, value, interpolationPoints, source, metadata);
}

/**
 * Create a TemplateVariable
 */
export function createTemplateVariable(
  name: string,
  value: string | any[],
  parameters: string[] | undefined,
  templateSyntax: 'double-bracket' | 'backtick' | 'doubleColon' | 'tripleColon',
  source: VariableSource,
  metadata?: VariableMetadata
): TemplateVariable {
  return VariableFactory.createTemplate(name, value, parameters, templateSyntax, source, metadata);
}

/**
 * Create a FileContentVariable
 */
export function createFileContentVariable(
  name: string,
  value: string,
  filePath: string,
  source: VariableSource,
  metadata?: VariableMetadata
): FileContentVariable {
  return VariableFactory.createFileContent(name, value, filePath, source, undefined, metadata);
}

/**
 * Create a SectionContentVariable
 */
export function createSectionContentVariable(
  name: string,
  value: string,
  filePath: string,
  sectionName: string,
  sectionSyntax: 'hash' | 'bracket',
  source: VariableSource,
  metadata?: VariableMetadata
): SectionContentVariable {
  return VariableFactory.createSectionContent(name, value, filePath, sectionName, sectionSyntax, source, metadata);
}

/**
 * Create an ObjectVariable
 */
export function createObjectVariable(
  name: string,
  value: Record<string, any>,
  isComplex: boolean,
  source: VariableSource,
  metadata?: VariableMetadata
): ObjectVariable {
  return VariableFactory.createObject(name, value, isComplex, source, metadata);
}

/**
 * Create an ArrayVariable
 */
export function createArrayVariable(
  name: string,
  value: any[],
  isComplex: boolean,
  source: VariableSource,
  metadata?: VariableMetadata
): ArrayVariable {
  return VariableFactory.createArray(name, value, isComplex, source, metadata);
}

/**
 * Create a ComputedVariable
 */
export function createComputedVariable(
  name: string,
  value: any,
  language: 'js' | 'node' | 'python' | 'sh',
  sourceCode: string,
  source: VariableSource,
  metadata?: VariableMetadata
): ComputedVariable {
  return VariableFactory.createComputed(name, value, language, sourceCode, source, metadata);
}

/**
 * Create a CommandResultVariable
 */
export function createCommandResultVariable(
  name: string,
  value: string,
  command: string,
  source: VariableSource,
  exitCode?: number,
  stderr?: string,
  metadata?: VariableMetadata
): CommandResultVariable {
  return VariableFactory.createCommandResult(name, value, command, source, exitCode, stderr, metadata);
}

/**
 * Create a PathVariable
 */
export function createPathVariable(
  name: string,
  resolvedPath: string,
  originalPath: string,
  isURL: boolean,
  isAbsolute: boolean,
  source: VariableSource,
  metadata?: VariableMetadata
): PathVariable {
  return VariableFactory.createPath(name, resolvedPath, originalPath, isURL, isAbsolute, source, metadata);
}

/**
 * Create an ImportedVariable
 */
export function createImportedVariable(
  name: string,
  value: any,
  originalType: VariableTypeDiscriminator,
  importPath: string,
  isModule: boolean,
  variableName: string,
  source: VariableSource,
  metadata?: VariableMetadata
): ImportedVariable {
  return VariableFactory.createImported(name, value, originalType, importPath, isModule, variableName, source, metadata);
}

/**
 * Create an ExecutableVariable
 */
export function createExecutableVariable(
  name: string,
  type: 'command' | 'code',
  template: string,
  paramNames: string[],
  language: 'js' | 'node' | 'python' | 'sh' | 'bash' | undefined,
  source: VariableSource,
  metadata?: VariableMetadata
): ExecutableVariable {
  return VariableFactory.createExecutable(name, type, template, paramNames, language, source, metadata);
}

/**
 * Create a PipelineInputVariable
 */
export function createPipelineInputVariable(
  name: string,
  value: PipelineInput,
  format: 'json' | 'csv' | 'xml' | 'text',
  rawText: string,
  source: VariableSource,
  pipelineStage?: number
): PipelineInputVariable {
  return VariableFactory.createPipelineInput(name, value, format, rawText, source, pipelineStage);
}

/**
 * Create a StructuredValueVariable
 */
export function createStructuredValueVariable(
  name: string,
  value: StructuredValue,
  source: VariableSource,
  metadata?: VariableMetadata
): StructuredValueVariable {
  return VariableFactory.createStructuredValue(name, value, source, metadata);
}

/**
 * Create a PrimitiveVariable
 */
export function createPrimitiveVariable(
  name: string,
  value: number | boolean | null,
  source: VariableSource,
  metadata?: VariableMetadata
): PrimitiveVariable {
  return VariableFactory.createPrimitive(name, value, source, metadata);
}


// =========================================================================
// FACTORY CLASS
// =========================================================================

/**
 * Factory class for creating variables with consistent patterns
 */
export class VariableFactory {
  
  // =========================================================================
  // TEXT VARIABLE FACTORIES
  // =========================================================================

  /**
   * Create a SimpleTextVariable
   */
  static createSimpleText(
    name: string,
    value: string,
    source: VariableSource,
    metadata?: VariableMetadata
  ): SimpleTextVariable {
    return {
      type: 'simple-text',
      name,
      value,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  /**
   * Create an InterpolatedTextVariable
   */
  static createInterpolatedText(
    name: string,
    value: string,
    interpolationPoints: Array<{ start: number; end: number; expression: string }>,
    source: VariableSource,
    metadata?: VariableMetadata
  ): InterpolatedTextVariable {
    return {
      type: 'interpolated-text',
      name,
      value,
      interpolationPoints,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  /**
   * Create a TemplateVariable
   */
  static createTemplate(
    name: string,
    value: string | any[],
    parameters: string[] | undefined,
    templateSyntax: 'double-bracket' | 'backtick' | 'doubleColon' | 'tripleColon',
    source: VariableSource,
    metadata?: VariableMetadata
  ): TemplateVariable {
    return {
      type: 'template',
      name,
      value,
      parameters,
      templateSyntax,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  // =========================================================================
  // CONTENT VARIABLE FACTORIES
  // =========================================================================

  /**
   * Create a FileContentVariable
   */
  static createFileContent(
    name: string,
    value: string,
    filePath: string,
    source: VariableSource,
    encoding?: string,
    metadata?: VariableMetadata
  ): FileContentVariable {
    return {
      type: 'file-content',
      name,
      value,
      filePath,
      encoding,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  /**
   * Create a SectionContentVariable
   */
  static createSectionContent(
    name: string,
    value: string,
    filePath: string,
    sectionName: string,
    sectionSyntax: 'hash' | 'bracket',
    source: VariableSource,
    metadata?: VariableMetadata
  ): SectionContentVariable {
    return {
      type: 'section-content',
      name,
      value,
      filePath,
      sectionName,
      sectionSyntax,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  // =========================================================================
  // STRUCTURED DATA FACTORIES
  // =========================================================================

  /**
   * Create an ObjectVariable
   */
  static createObject(
    name: string,
    value: Record<string, any>,
    isComplex: boolean,
    source: VariableSource,
    metadata?: VariableMetadata
  ): ObjectVariable {
    return {
      type: 'object',
      name,
      value,
      isComplex,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  /**
   * Create an ArrayVariable
   */
  static createArray(
    name: string,
    value: any[],
    isComplex: boolean,
    source: VariableSource,
    metadata?: VariableMetadata
  ): ArrayVariable {
    return {
      type: 'array',
      name,
      value,
      isComplex,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  // =========================================================================
  // COMPUTED VARIABLE FACTORIES
  // =========================================================================

  /**
   * Create a ComputedVariable
   */
  static createComputed(
    name: string,
    value: any,
    language: 'js' | 'node' | 'python' | 'sh',
    sourceCode: string,
    source: VariableSource,
    metadata?: VariableMetadata
  ): ComputedVariable {
    return {
      type: 'computed',
      name,
      value,
      language,
      sourceCode,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  /**
   * Create a CommandResultVariable
   */
  static createCommandResult(
    name: string,
    value: string,
    command: string,
    source: VariableSource,
    exitCode?: number,
    stderr?: string,
    metadata?: VariableMetadata
  ): CommandResultVariable {
    return {
      type: 'command-result',
      name,
      value,
      command,
      exitCode,
      stderr,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  // =========================================================================
  // SPECIAL VARIABLE FACTORIES
  // =========================================================================

  /**
   * Create a PathVariable
   */
  static createPath(
    name: string,
    resolvedPath: string,
    originalPath: string,
    isURL: boolean,
    isAbsolute: boolean,
    source: VariableSource,
    metadata?: VariableMetadata
  ): PathVariable {
    return {
      type: 'path',
      name,
      value: {
        resolvedPath,
        originalPath,
        isURL,
        isAbsolute
      },
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  /**
   * Create an ImportedVariable
   */
  static createImported(
    name: string,
    value: any,
    originalType: VariableTypeDiscriminator,
    importPath: string,
    isModule: boolean,
    variableName: string,
    source: VariableSource,
    metadata?: VariableMetadata
  ): ImportedVariable {
    return {
      type: 'imported',
      name,
      value,
      originalType,
      importSource: {
        path: importPath,
        isModule,
        variableName
      },
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  /**
   * Create an ExecutableVariable
   */
  static createExecutable(
    name: string,
    type: 'command' | 'code',
    template: string,
    paramNames: string[],
    language: 'js' | 'node' | 'python' | 'sh' | 'bash' | undefined,
    source: VariableSource,
    metadata?: VariableMetadata
  ): ExecutableVariable {
    return {
      type: 'executable',
      name,
      value: {
        type,
        template,
        language
      },
      paramNames,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }

  /**
   * Create a PipelineInputVariable
   */
  static createPipelineInput(
    name: string,
    value: PipelineInput,
    format: 'json' | 'csv' | 'xml' | 'text',
    rawText: string,
    source: VariableSource,
    pipelineStage?: number
  ): PipelineInputVariable {
    return {
      type: 'pipeline-input',
      name,
      value,
      format,
      rawText,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata: {
        isPipelineInput: true,
        pipelineStage
      }
    };
  }

  /**
   * Create a StructuredValueVariable
   */
  static createStructuredValue(
    name: string,
    value: StructuredValue,
    source: VariableSource,
    metadata?: VariableMetadata
  ): StructuredValueVariable {
    const structuredMetadata: VariableMetadata = {
      ...metadata,
      isStructuredValue: true,
      structuredValueType: value.type
    };

    return {
      type: 'structured',
      name,
      value,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata: structuredMetadata
    };
  }

  /**
   * Create a PrimitiveVariable
   */
  static createPrimitive(
    name: string,
    value: number | boolean | null,
    source: VariableSource,
    metadata?: VariableMetadata
  ): PrimitiveVariable {
    return {
      type: 'primitive',
      name,
      value,
      primitiveType: value === null ? 'null' : typeof value as 'number' | 'boolean',
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      metadata
    };
  }


  // =========================================================================
  // CONVENIENCE FACTORY METHODS
  // =========================================================================

  /**
   * Create a variable with auto-detected type based on value
   */
  static createAutoTyped(
    name: string,
    value: any,
    source: VariableSource,
    metadata?: VariableMetadata
  ): SimpleTextVariable | ObjectVariable | ArrayVariable | PrimitiveVariable {
    // Auto-detect type based on value
    if (typeof value === 'string') {
      return this.createSimpleText(name, value, source, metadata);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      return this.createPrimitive(name, value, source, metadata);
    } else if (Array.isArray(value)) {
      return this.createArray(name, value, false, source, metadata);
    } else if (typeof value === 'object' && value !== null) {
      return this.createObject(name, value, false, source, metadata);
    } else {
      // Fallback to simple text with string conversion
      return this.createSimpleText(name, String(value), source, metadata);
    }
  }

  /**
   * Create a template variable with auto-detected syntax
   */
  static createTemplateAutoSyntax(
    name: string,
    value: string,
    parameters?: string[],
    source?: VariableSource,
    metadata?: VariableMetadata
  ): TemplateVariable {
    // Detect template syntax from content
    const templateSyntax = value.includes('{{') && value.includes('}}') 
      ? 'double-bracket' 
      : 'backtick';
    
    const finalSource = source || {
      directive: 'var' as const,
      syntax: 'template' as const,
      wrapperType: templateSyntax === 'double-bracket' ? undefined : 'backtick',
      hasInterpolation: true,
      isMultiLine: value.includes('\n')
    };

    return this.createTemplate(name, value, parameters, templateSyntax, finalSource, metadata);
  }

  /**
   * Create an object variable with complexity detection
   */
  static createObjectWithComplexityDetection(
    name: string,
    value: Record<string, any>,
    source: VariableSource,
    metadata?: VariableMetadata
  ): ObjectVariable {
    // Simple heuristic for complexity detection
    const isComplex = this.detectComplexity(value);
    return this.createObject(name, value, isComplex, source, metadata);
  }

  /**
   * Create an array variable with complexity detection
   */
  static createArrayWithComplexityDetection(
    name: string,
    value: any[],
    source: VariableSource,
    metadata?: VariableMetadata
  ): ArrayVariable {
    // Simple heuristic for complexity detection
    const isComplex = value.some(item => 
      typeof item === 'object' && item !== null && this.detectComplexity(item)
    );
    return this.createArray(name, value, isComplex, source, metadata);
  }

  // =========================================================================
  // HELPER METHODS
  // =========================================================================

  /**
   * Simple complexity detection heuristic
   */
  private static detectComplexity(value: any): boolean {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    // Check for nested objects or arrays
    for (const key in value) {
      const item = value[key];
      if (typeof item === 'object' && item !== null) {
        return true;
      }
      // Check for strings that might contain directives
      if (typeof item === 'string' && (item.includes('/') || item.includes('@'))) {
        return true;
      }
    }

    return false;
  }

  /**
   * Validate variable creation parameters
   */
  static validateCreationParams(
    name: string,
    value: any,
    source: VariableSource
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!name || typeof name !== 'string') {
      errors.push('Variable name must be a non-empty string');
    }

    if (name && !name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
      errors.push('Variable name must be a valid identifier');
    }

    if (!source || typeof source !== 'object') {
      errors.push('Variable source must be provided');
    }

    if (source && !source.directive) {
      errors.push('Variable source must have a directive');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Clone a variable with updated metadata
   */
  static cloneWithMetadata<T extends import('./VariableTypes').Variable = import('./VariableTypes').Variable>(
    variable: T,
    newMetadata: VariableMetadata
  ): T {
    return {
      ...variable,
      metadata: { ...variable.metadata, ...newMetadata },
      modifiedAt: Date.now()
    } as T;
  }

  /**
   * Update variable value while preserving type safety
   */
  static updateValue<T extends import('./VariableTypes').Variable = import('./VariableTypes').Variable>(
    variable: T,
    newValue: any
  ): T {
    return {
      ...variable,
      value: newValue,
      modifiedAt: Date.now()
    } as T;
  }
}
