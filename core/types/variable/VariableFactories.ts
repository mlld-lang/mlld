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
  Variable,
  VariableContext,
  VariableInternalMetadata
} from './VariableTypes';
import type { StructuredValue, StructuredValueType } from '@interpreter/utils/structured-value';
import { ensureStructuredValue } from '@interpreter/utils/structured-value';
import { metadataToCtx, metadataToInternal } from '@interpreter/utils/metadata-migration';
import { VariableMetadataUtils } from './VariableMetadata';
import { attachArrayHelpers } from './ArrayHelpers';
import type { TokenEstimationOptions } from '@core/utils/token-metrics';

export interface VariableFactoryInitOptions {
  ctx?: Partial<VariableContext>;
  internal?: Partial<VariableInternalMetadata>;
  metadata?: VariableMetadata;
}

interface NormalizedFactoryState {
  metadata?: VariableMetadata;
  ctx: VariableContext;
  internal: VariableInternalMetadata;
}

function finalizeVariable<T extends Variable>(variable: T): T {
  if (!variable.ctx) {
    variable.ctx = metadataToCtx((variable as any).metadata);
  }
  if (variable.ctx) {
    variable.ctx.name = variable.name;
    variable.ctx.type = variable.type;
    if (variable.definedAt) {
      variable.ctx.definedAt = variable.definedAt;
    }
  }
  if (!variable.internal) {
    variable.internal = {};
  }
  return VariableMetadataUtils.attachContext(variable);
}

function applyTextMetrics(
  metadata: VariableMetadata | undefined,
  text: string | undefined,
  options?: TokenEstimationOptions
): VariableMetadata | undefined {
  return VariableMetadataUtils.applyTextMetrics(metadata, text, options);
}

function normalizeFactoryOptions(
  metadataOrOptions: VariableMetadata | VariableFactoryInitOptions | undefined,
  text?: string,
  tokenOptions?: TokenEstimationOptions
): NormalizedFactoryState {
  const { legacyMetadata, ctxOverrides, internalOverrides } = extractFactoryInput(metadataOrOptions);
  const metadata = applyTextMetrics(legacyMetadata, text, tokenOptions);
  const ctx = Object.assign({}, metadataToCtx(metadata), ctxOverrides);
  const internal = Object.assign({}, metadataToInternal(metadata), internalOverrides);
  return { metadata, ctx, internal };
}

function enrichStructuredMetadata(
  metadataOrOptions: VariableMetadata | VariableFactoryInitOptions | undefined,
  structuredValue: StructuredValue
): VariableMetadata | VariableFactoryInitOptions | undefined {
  const structuredFields = {
    isStructuredValue: true,
    structuredValueType: structuredValue.type
  };

  if (!metadataOrOptions) {
    return { metadata: structuredFields };
  }

  if (isFactoryInitOptions(metadataOrOptions)) {
    return {
      ...metadataOrOptions,
      metadata: {
        ...(metadataOrOptions.metadata ?? {}),
        ...structuredFields
      }
    };
  }

  return {
    ...metadataOrOptions,
    ...structuredFields
  };
}

function extractFactoryInput(
  metadataOrOptions: VariableMetadata | VariableFactoryInitOptions | undefined
): {
  legacyMetadata?: VariableMetadata;
  ctxOverrides?: Partial<VariableContext>;
  internalOverrides?: Partial<VariableInternalMetadata>;
} {
  if (!metadataOrOptions) {
    return {};
  }

  if (isFactoryInitOptions(metadataOrOptions)) {
    return {
      legacyMetadata: metadataOrOptions.metadata,
      ctxOverrides: metadataOrOptions.ctx,
      internalOverrides: metadataOrOptions.internal
    };
  }

  return { legacyMetadata: metadataOrOptions };
}

function isFactoryInitOptions(value: unknown): value is VariableFactoryInitOptions {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return 'ctx' in value || 'internal' in value || 'metadata' in value;
}

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
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): SimpleTextVariable {
  return VariableFactory.createSimpleText(name, value, source, metadataOrOptions);
}

/**
 * Create an InterpolatedTextVariable
 */
export function createInterpolatedTextVariable(
  name: string,
  value: string,
  interpolationPoints: Array<{ start: number; end: number; expression: string }>,
  source: VariableSource,
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): InterpolatedTextVariable {
  return VariableFactory.createInterpolatedText(
    name,
    value,
    interpolationPoints,
    source,
    metadataOrOptions
  );
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
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): TemplateVariable {
  return VariableFactory.createTemplate(
    name,
    value,
    parameters,
    templateSyntax,
    source,
    metadataOrOptions
  );
}

/**
 * Create a FileContentVariable
 */
export function createFileContentVariable(
  name: string,
  value: string,
  filePath: string,
  source: VariableSource,
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): FileContentVariable {
  return VariableFactory.createFileContent(
    name,
    value,
    filePath,
    source,
    undefined,
    metadataOrOptions
  );
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
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): SectionContentVariable {
  return VariableFactory.createSectionContent(
    name,
    value,
    filePath,
    sectionName,
    sectionSyntax,
    source,
    metadataOrOptions
  );
}

/**
 * Create an ObjectVariable
 */
export function createObjectVariable(
  name: string,
  value: Record<string, any>,
  isComplex: boolean,
  source: VariableSource,
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): ObjectVariable {
  return VariableFactory.createObject(name, value, isComplex, source, metadataOrOptions);
}

/**
 * Create an ArrayVariable
 */
export function createArrayVariable(
  name: string,
  value: any[],
  isComplex: boolean,
  source: VariableSource,
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): ArrayVariable {
  return VariableFactory.createArray(name, value, isComplex, source, metadataOrOptions);
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
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): ComputedVariable {
  return VariableFactory.createComputed(
    name,
    value,
    language,
    sourceCode,
    source,
    metadataOrOptions
  );
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
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): CommandResultVariable {
  return VariableFactory.createCommandResult(
    name,
    value,
    command,
    source,
    exitCode,
    stderr,
    metadataOrOptions
  );
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
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): PathVariable {
  return VariableFactory.createPath(
    name,
    resolvedPath,
    originalPath,
    isURL,
    isAbsolute,
    source,
    metadataOrOptions
  );
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
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): ImportedVariable {
  return VariableFactory.createImported(
    name,
    value,
    originalType,
    importPath,
    isModule,
    variableName,
    source,
    metadataOrOptions
  );
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
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): ExecutableVariable {
  return VariableFactory.createExecutable(
    name,
    type,
    template,
    paramNames,
    language,
    source,
    metadataOrOptions
  );
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
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): StructuredValueVariable {
  return VariableFactory.createStructuredValue(name, value, source, metadataOrOptions);
}

/**
 * Create a PrimitiveVariable
 */
export function createPrimitiveVariable(
  name: string,
  value: number | boolean | null,
  source: VariableSource,
  metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
): PrimitiveVariable {
  return VariableFactory.createPrimitive(name, value, source, metadataOrOptions);
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): SimpleTextVariable {
    const init = normalizeFactoryOptions(metadataOrOptions, value);
    return finalizeVariable({
      type: 'simple-text',
      name,
      value,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
  }

  /**
   * Create an InterpolatedTextVariable
   */
  static createInterpolatedText(
    name: string,
    value: string,
    interpolationPoints: Array<{ start: number; end: number; expression: string }>,
    source: VariableSource,
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): InterpolatedTextVariable {
    const init = normalizeFactoryOptions(metadataOrOptions, value);
    return finalizeVariable({
      type: 'interpolated-text',
      name,
      value,
      interpolationPoints,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): TemplateVariable {
    const textValue = typeof value === 'string' ? value : undefined;
    const init = normalizeFactoryOptions(metadataOrOptions, textValue);
    return finalizeVariable({
      type: 'template',
      name,
      value,
      parameters,
      templateSyntax,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): FileContentVariable {
    const extensionMatch = filePath.match(/\.([a-zA-Z0-9]+)$/);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : undefined;
    const init = normalizeFactoryOptions(metadataOrOptions, value, { extension });
    return finalizeVariable({
      type: 'file-content',
      name,
      value,
      filePath,
      encoding,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): SectionContentVariable {
    const extensionMatch = filePath.match(/\.([a-zA-Z0-9]+)$/);
    const extension = extensionMatch ? extensionMatch[1].toLowerCase() : undefined;
    const init = normalizeFactoryOptions(metadataOrOptions, value, { extension });
    return finalizeVariable({
      type: 'section-content',
      name,
      value,
      filePath,
      sectionName,
      sectionSyntax,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): ObjectVariable {
    const init = normalizeFactoryOptions(metadataOrOptions);
    return finalizeVariable({
      type: 'object',
      name,
      value,
      isComplex,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
  }

  /**
   * Create an ArrayVariable
   */
  static createArray(
    name: string,
    value: any[],
    isComplex: boolean,
    source: VariableSource,
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): ArrayVariable {
    const init = normalizeFactoryOptions(metadataOrOptions);
    const arrayVariable = finalizeVariable({
      type: 'array',
      name,
      value,
      isComplex,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    }) as ArrayVariable;
    attachArrayHelpers(arrayVariable);
    return arrayVariable;
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): ComputedVariable {
    const textValue = typeof value === 'string' ? value : undefined;
    const init = normalizeFactoryOptions(metadataOrOptions, textValue);
    return finalizeVariable({
      type: 'computed',
      name,
      value,
      language,
      sourceCode,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): CommandResultVariable {
    const init = normalizeFactoryOptions(metadataOrOptions, value);
    return finalizeVariable({
      type: 'command-result',
      name,
      value,
      command,
      exitCode,
      stderr,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): PathVariable {
    const init = normalizeFactoryOptions(metadataOrOptions);
    return finalizeVariable({
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
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): ImportedVariable {
    const init = normalizeFactoryOptions(metadataOrOptions);
    return finalizeVariable({
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
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): ExecutableVariable {
    const init = normalizeFactoryOptions(metadataOrOptions);
    const executableDefinition = {
      type,
      template,
      language
    };
    const variable = finalizeVariable({
      type: 'executable',
      name,
      value: executableDefinition,
      paramNames,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
    if (init.internal?.executableDef === undefined) {
      variable.internal = {
        ...(variable.internal ?? {}),
        executableDef: executableDefinition
      };
    }
    if (variable.internal?.executableDef && (!(variable as any).metadata || !((variable as any).metadata as any).executableDef)) {
      (variable as any).metadata = {
        ...((variable as any).metadata ?? {}),
        executableDef: variable.internal.executableDef
      };
    }
    return variable;
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
    const baseMetadata: VariableMetadata = {
      isPipelineInput: true,
      pipelineStage
    };
    const init = normalizeFactoryOptions({ metadata: baseMetadata }, rawText, { format });
    return finalizeVariable({
      type: 'pipeline-input',
      name,
      value,
      format,
      rawText,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata ?? baseMetadata
    });
  }

  /**
   * Create a StructuredValueVariable
   */
  static createStructuredValue(
    name: string,
    value: StructuredValue,
    source: VariableSource,
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): StructuredValueVariable {
    const structuredValue = ensureStructuredValue(value);
    const enrichedInput = enrichStructuredMetadata(metadataOrOptions, structuredValue);
    const baseMetadata = isFactoryInitOptions(enrichedInput)
      ? enrichedInput.metadata
      : enrichedInput;
    const securityAwareMetadata = VariableMetadataUtils.applySecurityMetadata(baseMetadata, {
      existingDescriptor: structuredValue.metadata?.security
    });
    const init = normalizeFactoryOptions(
      isFactoryInitOptions(enrichedInput)
        ? { ...enrichedInput, metadata: securityAwareMetadata }
        : securityAwareMetadata,
      structuredValue.text
    );

    return finalizeVariable({
      type: 'structured',
      name,
      value: structuredValue,
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata ?? securityAwareMetadata
    });
  }

  /**
   * Create a PrimitiveVariable
   */
  static createPrimitive(
    name: string,
    value: number | boolean | null,
    source: VariableSource,
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): PrimitiveVariable {
    const init = normalizeFactoryOptions(metadataOrOptions, typeof value === 'string' ? value : undefined);
    return finalizeVariable({
      type: 'primitive',
      name,
      value,
      primitiveType: value === null ? 'null' : typeof value as 'number' | 'boolean',
      source,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      ctx: init.ctx,
      internal: init.internal,
      metadata: init.metadata
    });
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): SimpleTextVariable | ObjectVariable | ArrayVariable | PrimitiveVariable {
    // Auto-detect type based on value
    if (typeof value === 'string') {
      return this.createSimpleText(name, value, source, metadataOrOptions);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      return this.createPrimitive(name, value, source, metadataOrOptions);
    } else if (Array.isArray(value)) {
      return this.createArray(name, value, false, source, metadataOrOptions);
    } else if (typeof value === 'object' && value !== null) {
      return this.createObject(name, value, false, source, metadataOrOptions);
    } else {
      // Fallback to simple text with string conversion
      return this.createSimpleText(name, String(value), source, metadataOrOptions);
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
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
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

    return this.createTemplate(name, value, parameters, templateSyntax, finalSource, metadataOrOptions);
  }

  /**
   * Create an object variable with complexity detection
   */
  static createObjectWithComplexityDetection(
    name: string,
    value: Record<string, any>,
    source: VariableSource,
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): ObjectVariable {
    // Simple heuristic for complexity detection
    const isComplex = this.detectComplexity(value);
    return this.createObject(name, value, isComplex, source, metadataOrOptions);
  }

  /**
   * Create an array variable with complexity detection
   */
  static createArrayWithComplexityDetection(
    name: string,
    value: any[],
    source: VariableSource,
    metadataOrOptions?: VariableMetadata | VariableFactoryInitOptions
  ): ArrayVariable {
    // Simple heuristic for complexity detection
    const isComplex = value.some(item => 
      typeof item === 'object' && item !== null && this.detectComplexity(item)
    );
    return this.createArray(name, value, isComplex, source, metadataOrOptions);
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
      metadata: { ...(variable as any).metadata, ...newMetadata },
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
