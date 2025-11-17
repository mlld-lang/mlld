/**
 * Legacy Compatibility System
 * 
 * Conversion between old and new variable systems during the transition period.
 * This module handles bidirectional conversion while preserving semantics.
 */

import {
  Variable,
  VariableTypeDiscriminator,
  VariableSource,
  VariableMetadata
} from './VariableTypes';

// =========================================================================
// LEGACY TYPES (for compatibility)
// =========================================================================

/**
 * Legacy variable type structure
 */
interface LegacyVariable {
  type: string;
  name: string;
  value: any;
  metadata?: any;
}

// =========================================================================
// LEGACY CONVERSION CLASS
// =========================================================================

/**
 * Handles conversion between new and legacy variable systems
 */
export class LegacyVariableConverter {

  /**
   * Convert a new variable to legacy format
   * This ensures backward compatibility during transition
   */
  static toLegacyVariable(variable: Variable): LegacyVariable {
    return {
      type: this.mapToLegacyType(variable.type),
      name: variable.name,
      value: this.extractLegacyValue(variable),
      metadata: { ...variable.ctx, ...variable.internal }
    };
  }

  /**
   * Convert a legacy variable to new format
   * This allows importing old variable definitions
   */
  static fromLegacyVariable(
    legacy: LegacyVariable,
    source?: VariableSource
  ): Variable {
    const defaultSource: VariableSource = source || {
      directive: 'var',
      syntax: 'reference',
      hasInterpolation: false,
      isMultiLine: false
    };

    const newType = this.mapFromLegacyType(legacy.type);
    const baseVariable = {
      name: legacy.name,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      source: defaultSource,
      ctx: legacy.metadata || {},
      internal: legacy.metadata || {}
    };

    // Create appropriate variable type based on legacy type
    switch (newType) {
      case 'simple-text':
        return {
          type: 'simple-text',
          value: String(legacy.value),
          ...baseVariable
        };

      case 'object':
        return {
          type: 'object',
          value: legacy.value || {},
          isComplex: false,
          ...baseVariable
        };

      case 'array':
        return {
          type: 'array',
          value: Array.isArray(legacy.value) ? legacy.value : [],
          isComplex: false,
          ...baseVariable
        };

      case 'command-result':
        return {
          type: 'command-result',
          value: String(legacy.value),
          command: legacy.metadata?.command || '',
          ...baseVariable,
          ctx: { ...baseVariable.ctx }
        };

      case 'path':
        return {
          type: 'path',
          value: {
            resolvedPath: legacy.value?.resolvedPath || String(legacy.value),
            originalPath: legacy.value?.originalPath || String(legacy.value),
            isURL: legacy.value?.isURL || false,
            isAbsolute: legacy.value?.isAbsolute || false
          },
          ...baseVariable
        };

      case 'imported':
        return {
          type: 'imported',
          value: legacy.value,
          originalType: legacy.metadata?.originalType || 'simple-text',
          importSource: {
            path: legacy.metadata?.importPath || '',
            isModule: legacy.metadata?.isModule || false,
            variableName: legacy.name
          },
          ...baseVariable,
          ctx: { ...baseVariable.ctx, importPath: legacy.metadata?.importPath },
          internal: { ...baseVariable.internal, originalType: legacy.metadata?.originalType }
        };

      case 'executable':
        return {
          type: 'executable',
          value: {
            type: legacy.value?.type || 'command',
            template: legacy.value?.commandTemplate || legacy.value?.codeTemplate || '',
            language: legacy.value?.language
          },
          paramNames: legacy.value?.paramNames || [],
          ...baseVariable
        };

      default:
        // Fallback to simple text
        return {
          type: 'simple-text',
          value: String(legacy.value),
          ...baseVariable
        };
    }
  }

  /**
   * Map new variable types to legacy types
   * This preserves the old type hierarchy during transition
   */
  private static mapToLegacyType(type: VariableTypeDiscriminator): string {
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
   * Map legacy types to new variable types
   */
  private static mapFromLegacyType(legacyType: string): VariableTypeDiscriminator {
    switch (legacyType.toLowerCase()) {
      case 'text':
        return 'simple-text';
      case 'data':
        return 'object'; // Default data type
      case 'path':
        return 'path';
      case 'command':
        return 'command-result';
      case 'import':
        return 'imported';
      case 'executable':
        return 'executable';
      default:
        return 'simple-text'; // Fallback
    }
  }

  /**
   * Extract value in legacy format
   * This ensures the value structure matches legacy expectations
   */
  private static extractLegacyValue(variable: Variable): any {
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
      case 'primitive':
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

  /**
   * Check if a variable has legacy type information
   */
  static hasLegacyType(variable: any): boolean {
    return 'type' in variable && 
           typeof variable.type === 'string' && 
           ['text', 'data', 'path', 'command', 'import', 'executable'].includes(variable.type);
  }

  /**
   * Migrate a collection of legacy variables
   */
  static migrateLegacyVariables(
    legacyVariables: LegacyVariable[],
    defaultSource?: VariableSource
  ): Variable[] {
    return legacyVariables.map(legacy => 
      this.fromLegacyVariable(legacy, defaultSource)
    );
  }

  /**
   * Convert a collection of new variables to legacy format
   */
  static convertToLegacyFormat(variables: Variable[]): LegacyVariable[] {
    return variables.map(variable => this.toLegacyVariable(variable));
  }

  /**
   * Validate that conversion is lossless
   */
  static validateConversion(
    original: Variable, 
    converted: LegacyVariable, 
    reconverted: Variable
  ): { valid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check name preservation
    if (original.name !== reconverted.name) {
      issues.push(`Name mismatch: ${original.name} -> ${reconverted.name}`);
    }

    // Check value preservation (basic check)
    const originalValue = this.extractLegacyValue(original);
    const reconvertedValue = this.extractLegacyValue(reconverted);
    
    if (JSON.stringify(originalValue) !== JSON.stringify(reconvertedValue)) {
      issues.push('Value structure changed during conversion');
    }

    // Check type mapping
    const expectedLegacyType = this.mapToLegacyType(original.type);
    if (converted.type !== expectedLegacyType) {
      issues.push(`Type mapping error: ${original.type} -> ${converted.type} (expected ${expectedLegacyType})`);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Create a migration report for a set of variables
   */
  static createMigrationReport(
    legacyVariables: LegacyVariable[]
  ): {
    total: number;
    byType: Record<string, number>;
    complexVariables: string[];
    warnings: string[];
  } {
    const report = {
      total: legacyVariables.length,
      byType: {} as Record<string, number>,
      complexVariables: [] as string[],
      warnings: [] as string[]
    };

    legacyVariables.forEach(variable => {
      // Count by type
      report.byType[variable.type] = (report.byType[variable.type] || 0) + 1;

      // Check for complex cases
      if (variable.metadata?.isComplex || variable.metadata?.isNamespace) {
        report.complexVariables.push(variable.name);
      }

      // Check for potential issues
      if (!this.mapFromLegacyType(variable.type)) {
        report.warnings.push(`Unknown legacy type: ${variable.type} for variable ${variable.name}`);
      }

      if (variable.value && typeof variable.value === 'object' && 'originalType' in variable.value) {
        report.warnings.push(`Variable ${variable.name} may have nested type information`);
      }
    });

    return report;
  }

  /**
   * Attempt automatic type refinement during conversion
   */
  static refineTypeFromValue(
    legacyVariable: LegacyVariable
  ): VariableTypeDiscriminator {
    const value = legacyVariable.value;
    
    // If legacy type is 'data', try to be more specific
    if (legacyVariable.type === 'data') {
      if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return 'primitive';
      } else if (Array.isArray(value)) {
        return 'array';
      } else if (typeof value === 'object' && value !== null) {
        return 'object';
      }
    }

    // If legacy type is 'text', check for special cases
    if (legacyVariable.type === 'text') {
      if (typeof value === 'string') {
        if (value.includes('{{') && value.includes('}}')) {
          return 'template';
        } else if (legacyVariable.metadata?.hasInterpolation) {
          return 'interpolated-text';
        } else if (legacyVariable.metadata?.filename || legacyVariable.metadata?.filePath) {
          return legacyVariable.metadata.sectionName ? 'section-content' : 'file-content';
        }
      }
    }

    // Fall back to standard mapping
    return this.mapFromLegacyType(legacyVariable.type);
  }
}