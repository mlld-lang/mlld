/**
 * Advanced Type Detection
 * 
 * Specialized type detection logic for complex scenarios including imported variables,
 * executable detection, and effective type resolution.
 */

import {
  Variable,
  VariableTypeDiscriminator,
  ImportedVariable
} from './VariableTypes';
import { isImported, isExecutable } from './TypeGuards';

// =========================================================================
// ADVANCED TYPE DETECTION CLASS
// =========================================================================

/**
 * Advanced type detection utilities for complex variable scenarios
 */
export class AdvancedTypeDetection {
  
  /**
   * Get the effective type of a variable, considering imported variables
   * This resolves the "real" type by looking through import wrappers
   */
  static getEffectiveType(variable: Variable): VariableTypeDiscriminator {
    if (isImported(variable)) {
      return (variable as ImportedVariable).originalType;
    }
    return variable.type;
  }

  /**
   * Check if variable is an executable, including imported executables
   * This handles the complex case where an executable might be imported
   */
  static isExecutableVariable(variable: Variable): boolean {
    if (isExecutable(variable)) return true;
    if (isImported(variable)) {
      const imported = variable as ImportedVariable;
      return imported.originalType === 'executable' ||
             imported.internal?.originalType === 'executable';
    }
    return false;
  }

  /**
   * Detect if variable contains nested directive complexity
   * This is used to determine if a variable needs special handling
   */
  static detectComplexVariable(variable: Variable): boolean {
    // Check internal first
    if (variable.internal?.isComplex) {
      return true;
    }

    // Type-specific complexity detection
    switch (variable.type) {
      case 'object':
      case 'array':
        return (variable as any).isComplex || false;
      
      case 'template':
        return Array.isArray(variable.value); // Lazy-evaluated templates are complex
      
      case 'imported':
        return this.detectComplexVariable(this.resolveImportedVariable(variable));
      
      case 'pipeline-input':
        return true; // Pipeline inputs are inherently complex
      
      default:
        return false;
    }
  }

  /**
   * Follow import chains to resolve the original variable
   * This handles nested imports and circular references
   */
  static resolveImportChain(variable: Variable, maxDepth: number = 10): Variable {
    let current = variable;
    let depth = 0;
    const seen = new Set<string>();

    while (isImported(current) && depth < maxDepth) {
      const imported = current as ImportedVariable;
      const key = `${imported.importSource.path}:${imported.importSource.variableName}`;
      
      // Prevent circular references
      if (seen.has(key)) {
        break;
      }
      seen.add(key);

      // In a real implementation, this would resolve the import
      // For now, we'll break the chain
      break;
    }

    return current;
  }

  /**
   * Resolve an imported variable to its underlying type
   */
  static resolveImportedVariable(variable: Variable): Variable {
    if (!isImported(variable)) {
      return variable;
    }

    const imported = variable as ImportedVariable;

    // Create a synthetic variable representing the imported content
    return {
      type: imported.originalType,
      name: imported.name,
      value: imported.value,
      source: imported.source,
      createdAt: imported.createdAt,
      modifiedAt: imported.modifiedAt,
      mx: { ...imported.mx },
      internal: { ...imported.internal }
    } as Variable;
  }

  /**
   * Detect if variable type matches a pattern
   */
  static matchesTypePattern(
    variable: Variable, 
    pattern: VariableTypeDiscriminator | VariableTypeDiscriminator[] | RegExp
  ): boolean {
    const effectiveType = this.getEffectiveType(variable);

    if (pattern instanceof RegExp) {
      return pattern.test(effectiveType);
    }

    if (Array.isArray(pattern)) {
      return pattern.includes(effectiveType);
    }

    return effectiveType === pattern;
  }

  /**
   * Check if variable requires special evaluation handling
   */
  static requiresSpecialEvaluation(variable: Variable): boolean {
    const effectiveType = this.getEffectiveType(variable);
    
    return (
      effectiveType === 'template' ||
      effectiveType === 'executable' ||
      effectiveType === 'pipeline-input' ||
      effectiveType === 'computed' ||
      this.detectComplexVariable(variable)
    );
  }

  /**
   * Determine evaluation priority for variable resolution
   * Lower numbers = higher priority
   */
  static getEvaluationPriority(variable: Variable): number {
    const effectiveType = this.getEffectiveType(variable);
    
    switch (effectiveType) {
      case 'primitive':
      case 'simple-text':
        return 1; // Highest priority - simple values

      case 'interpolated-text':
      case 'file-content':
      case 'section-content':
        return 2; // Medium-high priority - needs resolution but straightforward

      case 'object':
      case 'array':
        return variable.isComplex ? 4 : 3; // Priority based on complexity

      case 'command-result':
      case 'computed':
        return 5; // Lower priority - requires execution

      case 'template':
      case 'executable':
        return 6; // Low priority - complex evaluation

      case 'pipeline-input':
        return 7; // Lowest priority - pipeline dependency

      case 'imported':
        // Recursively determine priority of imported content
        const resolved = this.resolveImportedVariable(variable);
        return this.getEvaluationPriority(resolved) + 1; // Slightly lower than original

      default:
        return 5; // Default medium priority
    }
  }

  /**
   * Check if variable has lazy evaluation semantics
   */
  static hasLazyEvaluation(variable: Variable): boolean {
    const effectiveType = this.getEffectiveType(variable);
    
    return (
      effectiveType === 'template' ||
      effectiveType === 'pipeline-input' ||
      (effectiveType === 'executable' && variable.type !== 'imported') ||
      this.detectComplexVariable(variable)
    );
  }

  /**
   * Detect if variable contains interpolation points
   */
  static hasInterpolation(variable: Variable): boolean {
    switch (variable.type) {
      case 'interpolated-text':
        return variable.interpolationPoints.length > 0;
      
      case 'template':
        return true; // Templates always have interpolation
      
      case 'imported':
        return this.hasInterpolation(this.resolveImportedVariable(variable));
      
      default:
        return variable.source.hasInterpolation;
    }
  }

  /**
   * Get variable dependencies for evaluation ordering
   */
  static getVariableDependencies(variable: Variable): string[] {
    const dependencies: string[] = [];

    switch (variable.type) {
      case 'interpolated-text':
        // Extract variable names from interpolation points
        variable.interpolationPoints.forEach(point => {
          const matches = point.expression.match(/@([a-zA-Z_][a-zA-Z0-9_]*(-[a-zA-Z0-9_]+)*)/g);
          if (matches) {
            dependencies.push(...matches.map(m => m.substring(1)));
          }
        });
        break;

      case 'template':
        if (typeof variable.value === 'string') {
          // Extract dependencies from template string
          const matches = variable.value.match(/\{\{([^}]+)\}\}/g);
          if (matches) {
            matches.forEach(match => {
              const varName = match.slice(2, -2).trim().split('.')[0];
              if (varName && !dependencies.includes(varName)) {
                dependencies.push(varName);
              }
            });
          }
        }
        break;

      case 'imported':
        // Dependencies are resolved at import time
        break;

      default:
        // For other types, check source interpolation flag
        if (variable.source.hasInterpolation && typeof variable.value === 'string') {
          const matches = variable.value.match(/@([a-zA-Z_][a-zA-Z0-9_]*(-[a-zA-Z0-9_]+)*)/g);
          if (matches) {
            dependencies.push(...matches.map(m => m.substring(1)));
          }
        }
    }

    return [...new Set(dependencies)]; // Remove duplicates
  }

  /**
   * Check if variable creates a circular dependency
   */
  static hasCircularDependency(
    variable: Variable,
    allVariables: Map<string, Variable>,
    visited: Set<string> = new Set()
  ): boolean {
    if (visited.has(variable.name)) {
      return true; // Circular dependency detected
    }

    visited.add(variable.name);
    const dependencies = this.getVariableDependencies(variable);

    for (let i = 0; i < dependencies.length; i++) {
      const depName = dependencies[i];
      const depVariable = allVariables.get(depName);
      if (depVariable && this.hasCircularDependency(depVariable, allVariables, visited)) {
        return true;
      }
    }

    visited.delete(variable.name);
    return false;
  }

  /**
   * Determine if variable can be safely serialized
   */
  static isSerializable(variable: Variable): boolean {
    const effectiveType = this.getEffectiveType(variable);
    
    switch (effectiveType) {
      case 'simple-text':
      case 'interpolated-text':
      case 'file-content':
      case 'section-content':
      case 'command-result':
      case 'primitive':
        return true;

      case 'object':
      case 'array':
        return !this.detectComplexVariable(variable);

      case 'path':
        return true; // Path metadata is serializable

      case 'template':
      case 'executable':
      case 'pipeline-input':
      case 'computed':
        return false; // These require execution context

      case 'imported':
        return this.isSerializable(this.resolveImportedVariable(variable));

      default:
        return false;
    }
  }

  /**
   * Get variable complexity score for performance optimization
   */
  static getComplexityScore(variable: Variable): number {
    let score = 0;
    const effectiveType = this.getEffectiveType(variable);

    // Base complexity by type
    switch (effectiveType) {
      case 'primitive':
      case 'simple-text':
        score += 1;
        break;
      case 'interpolated-text':
        score += 2 + (variable as any).interpolationPoints?.length || 0;
        break;
      case 'template':
        score += 3;
        if (Array.isArray(variable.value)) score += 2; // Lazy evaluation
        break;
      case 'object':
      case 'array':
        score += 2;
        if (variable.isComplex) score += 3;
        break;
      case 'executable':
      case 'computed':
        score += 5;
        break;
      case 'pipeline-input':
        score += 4;
        break;
      default:
        score += 2;
    }

    // Additional complexity factors
    if (this.hasInterpolation(variable)) score += 1;
    if (this.detectComplexVariable(variable)) score += 2;
    if (variable.mx?.isImported) score += 1;
    
    const dependencies = this.getVariableDependencies(variable);
    score += dependencies.length * 0.5;

    return Math.round(score);
  }
}