/**
 * Unified Variable Type System
 * 
 * This file implements the new discriminated union variable type system
 * that will replace the current TextVariable/DataVariable dichotomy.
 * During the transition period, both systems will coexist.
 */

import { SourceLocation } from './index';

// =========================================================================
// BASE TYPES
// =========================================================================

/**
 * Common fields shared by all variable types
 */
export interface BaseVariable {
  name: string;
  createdAt: number;
  modifiedAt: number;
  definedAt?: SourceLocation;
  source: VariableSource;
}

/**
 * Metadata about how a variable was created
 */
export interface VariableSource {
  directive: 'var'; // Always 'var' in the new system
  syntax: 'quoted' | 'template' | 'array' | 'object' | 'command' | 'code' | 'path' | 'reference';
  wrapperType?: 'singleQuote' | 'doubleQuote' | 'backtick' | 'brackets';
  hasInterpolation: boolean;
  isMultiLine: boolean;
}

/**
 * Extended metadata for variables
 */
export interface VariableMetadata extends Record<string, any> {
  isImported?: boolean;
  importPath?: string;
  isComplex?: boolean;
  isPipelineInput?: boolean;
  pipelineStage?: number;
}

// =========================================================================
// VARIABLE TYPE DISCRIMINATORS
// =========================================================================

/**
 * Discriminator values for each variable type
 */
export type VariableTypeDiscriminator =
  | 'simple-text'
  | 'interpolated-text'
  | 'template'
  | 'file-content'
  | 'section-content'
  | 'object'
  | 'array'
  | 'computed'
  | 'command-result'
  | 'path'
  | 'imported'
  | 'executable'
  | 'pipeline-input'
  | 'primitive';

// =========================================================================
// TEXT VARIABLE TYPES
// =========================================================================

/**
 * Simple text without interpolation (single-quoted strings)
 */
export interface SimpleTextVariable extends BaseVariable {
  type: 'simple-text';
  value: string;
  metadata?: VariableMetadata;
}

/**
 * Text with interpolation (double-quoted or backtick strings)
 */
export interface InterpolatedTextVariable extends BaseVariable {
  type: 'interpolated-text';
  value: string;
  interpolationPoints: Array<{
    start: number;
    end: number;
    expression: string;
  }>;
  metadata?: VariableMetadata;
}

/**
 * Template strings with {{}} syntax
 */
export interface TemplateVariable extends BaseVariable {
  type: 'template';
  value: string | any[]; // Allow array for lazy-evaluated templates
  parameters?: string[];
  templateSyntax: 'double-bracket' | 'backtick';
  metadata?: VariableMetadata;
}

// =========================================================================
// CONTENT VARIABLE TYPES
// =========================================================================

/**
 * Content loaded from a file
 */
export interface FileContentVariable extends BaseVariable {
  type: 'file-content';
  value: string;
  filePath: string;
  encoding?: string;
  metadata?: VariableMetadata;
}

/**
 * Content from a specific file section
 */
export interface SectionContentVariable extends BaseVariable {
  type: 'section-content';
  value: string;
  filePath: string;
  sectionName: string;
  sectionSyntax: 'hash' | 'bracket';
  metadata?: VariableMetadata;
}

// =========================================================================
// STRUCTURED DATA TYPES
// =========================================================================

/**
 * JavaScript objects
 */
export interface ObjectVariable extends BaseVariable {
  type: 'object';
  value: Record<string, any>;
  isComplex?: boolean; // Contains embedded directives
  metadata?: VariableMetadata;
}

/**
 * JavaScript arrays
 */
export interface ArrayVariable extends BaseVariable {
  type: 'array';
  value: any[];
  isComplex?: boolean; // Contains embedded directives
  metadata?: VariableMetadata;
}

// =========================================================================
// COMPUTED VARIABLE TYPES
// =========================================================================

/**
 * Results from code execution (JS, Node, etc.)
 */
export interface ComputedVariable extends BaseVariable {
  type: 'computed';
  value: any;
  language: 'js' | 'node' | 'python' | 'sh';
  sourceCode: string;
  metadata?: VariableMetadata;
}

/**
 * Output from shell commands
 */
export interface CommandResultVariable extends BaseVariable {
  type: 'command-result';
  value: string;
  command: string;
  exitCode?: number;
  stderr?: string;
  metadata?: VariableMetadata;
}

// =========================================================================
// SPECIAL VARIABLE TYPES
// =========================================================================

/**
 * Resolved file paths with security metadata
 */
export interface PathVariable extends BaseVariable {
  type: 'path';
  value: {
    resolvedPath: string;
    originalPath: string;
    isURL: boolean;
    isAbsolute: boolean;
    security?: {
      trust?: 'high' | 'medium' | 'low';
      ttl?: number;
    };
  };
  metadata?: VariableMetadata;
}

/**
 * Variables imported from files/modules
 */
export interface ImportedVariable extends BaseVariable {
  type: 'imported';
  value: any; // The actual imported value
  originalType: VariableTypeDiscriminator; // Type in the source file
  importSource: {
    path: string;
    isModule: boolean;
    variableName: string;
  };
  metadata?: VariableMetadata;
}

/**
 * Executable command definitions from @exe directive
 */
export interface ExecutableVariable extends BaseVariable {
  type: 'executable';
  value: {
    type: 'command' | 'code';
    template: string;
    language?: 'js' | 'node' | 'python' | 'sh' | 'bash';
  };
  paramNames: string[];
  metadata?: VariableMetadata;
}

/**
 * Special wrapper for pipeline stage inputs
 */
export interface PipelineInputVariable extends BaseVariable {
  type: 'pipeline-input';
  value: PipelineInput; // The lazy-parsed wrapper object
  format: 'json' | 'csv' | 'xml' | 'text';
  rawText: string; // Original text before wrapping
  metadata: VariableMetadata & {
    isPipelineInput: true;
    pipelineStage?: number;
  };
}

/**
 * Primitive values (numbers, booleans, null)
 */
export interface PrimitiveVariable extends BaseVariable {
  type: 'primitive';
  value: number | boolean | null;
  primitiveType: 'number' | 'boolean' | 'null';
  metadata?: VariableMetadata;
}

/**
 * Pipeline input wrapper interface
 */
export interface PipelineInput {
  text: string;
  data?: any;
  csv?: any;
  xml?: any;
  json?: any;
  toString(): string;
}

// =========================================================================
// DISCRIMINATED UNION
// =========================================================================

/**
 * Unified variable type - discriminated union of all variable types
 */
export type Variable =
  | SimpleTextVariable
  | InterpolatedTextVariable
  | TemplateVariable
  | FileContentVariable
  | SectionContentVariable
  | ObjectVariable
  | ArrayVariable
  | ComputedVariable
  | CommandResultVariable
  | PathVariable
  | ImportedVariable
  | ExecutableVariable
  | PipelineInputVariable
  | PrimitiveVariable;

// =========================================================================
// TYPE GUARDS
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
export function isTextLike(variable: Variable): variable is SimpleTextVariable | InterpolatedTextVariable | TemplateVariable | FileContentVariable | SectionContentVariable | CommandResultVariable {
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
export function isStructured(variable: Variable): variable is ObjectVariable | ArrayVariable {
  return isObject(variable) || isArray(variable);
}

/**
 * Check if variable was created from external content
 */
export function isExternal(variable: Variable): variable is FileContentVariable | SectionContentVariable | ImportedVariable | CommandResultVariable | ComputedVariable {
  return isFileContent(variable) || 
         isSectionContent(variable) || 
         isImported(variable) || 
         isCommandResult(variable) ||
         isComputed(variable);
}

// =========================================================================
// FACTORY FUNCTIONS
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
export function createInterpolatedTextVariable(
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
export function createTemplateVariable(
  name: string,
  value: string,
  parameters: string[] | undefined,
  templateSyntax: 'double-bracket' | 'backtick',
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
export function createArrayVariable(
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
  security?: { trust?: 'high' | 'medium' | 'low'; ttl?: number },
  metadata?: VariableMetadata
): PathVariable {
  return {
    type: 'path',
    name,
    value: {
      resolvedPath,
      originalPath,
      isURL,
      isAbsolute,
      security
    },
    source,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata
  };
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
 * Create a FileContentVariable
 */
export function createFileContentVariable(
  name: string,
  value: string,
  filePath: string,
  source: VariableSource,
  metadata?: VariableMetadata
): FileContentVariable {
  return {
    type: 'file-content',
    name,
    value,
    filePath,
    source,
    createdAt: Date.now(),
    modifiedAt: Date.now(),
    metadata
  };
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
export function createCommandResultVariable(
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
export function createExecutableVariable(
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
 * Create a PrimitiveVariable
 */
export function createPrimitiveVariable(
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
// CONVERSION HELPERS
// =========================================================================

/**
 * Helper to convert between old and new variable systems
 * This is temporary for compatibility during the transition
 */
export function toLegacyVariable(variable: Variable): any {
  // Implementation will be added in later phases
  // For now, just return a placeholder structure
  return {
    type: mapToLegacyType(variable.type),
    name: variable.name,
    value: extractLegacyValue(variable),
    metadata: variable.metadata
  };
}

/**
 * Map new variable types to legacy types
 */
function mapToLegacyType(type: VariableTypeDiscriminator): string {
  switch (type) {
    case 'simple-text':
    case 'interpolated-text':
    case 'template':
    case 'file-content':
    case 'section-content':
      return 'text';
    
    case 'object':
    case 'array':
    case 'computed':
    case 'pipeline-input':
    case 'primitive':
      return 'data';
    
    case 'path':
      return 'path';
    
    case 'command-result':
      return 'command';
    
    case 'imported':
      return 'import';
    
    case 'executable':
      return 'executable';
    
    default:
      return 'data'; // Fallback
  }
}

/**
 * Extract value in legacy format
 */
function extractLegacyValue(variable: Variable): any {
  switch (variable.type) {
    case 'simple-text':
    case 'interpolated-text':
    case 'template':
    case 'file-content':
    case 'section-content':
    case 'command-result':
      return variable.value;
    
    case 'object':
    case 'array':
    case 'computed':
      return variable.value;
    
    case 'path':
      return variable.value;
    
    case 'imported':
      return variable.value;
    
    case 'executable':
      return {
        type: variable.value.type,
        paramNames: variable.paramNames,
        ...(variable.value.type === 'command' 
          ? { commandTemplate: variable.value.template }
          : { codeTemplate: variable.value.template, language: variable.value.language })
      };
    
    case 'pipeline-input':
      return variable.value;
    
    default:
      return variable.value;
  }
}

// =========================================================================
// PHASE 2 HELPERS - Executable type recognition
// =========================================================================

/**
 * Check if variable is an executable, including imported executables
 */
export function isExecutableVariable(variable: Variable): boolean {
  if (isExecutable(variable)) return true;
  if (isImported(variable)) {
    const imported = variable as ImportedVariable;
    return imported.originalType === 'executable' || 
           imported.metadata?.originalType === 'executable';
  }
  return false;
}

/**
 * Get the effective type of a variable, considering imported variables
 */
export function getEffectiveType(variable: Variable): VariableTypeDiscriminator {
  if (isImported(variable)) {
    return (variable as ImportedVariable).originalType;
  }
  return variable.type;
}

/**
 * Check for legacy variable types in imported variables
 */
export function hasLegacyType(variable: Variable): boolean {
  return 'type' in variable && typeof variable.type === 'string' && 
         ['text', 'data', 'path', 'command', 'import'].includes(variable.type);
}