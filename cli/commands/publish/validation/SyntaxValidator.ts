/**
 * Syntax validation for mlld modules
 */

import { ValidationStep } from '../types/PublishingStrategy';
import type { ModuleData, ValidationResult, ValidationError, ValidationWarning, ValidationContext } from '../types/PublishingTypes';
import type { MlldNode } from '@core/types';
import reservedWords from '@core/reserved.json';

export class SyntaxValidator implements ValidationStep {
  name = 'syntax';

  async validate(module: ModuleData, _context: ValidationContext): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const ast = module.ast;

    if (!Array.isArray(ast)) {
      errors.push({
        field: 'content',
        message: 'Module parser output is unavailable. Rebuild grammar before publishing.',
        severity: 'error'
      });
      return { valid: false, errors, warnings };
    }

    const conflicts = this.checkReservedWordConflicts(ast);
    if (conflicts.length > 0) {
      errors.push({
        field: 'content',
        message: `Module exports variables that conflict with mlld reserved words:\n` +
                `    Conflicting variables: ${conflicts.join(', ')}\n` +
                '    Reserved words cannot be used as variable names.\n' +
                '    Rename the variables listed above to continue.',
        severity: 'error'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  private checkReservedWordConflicts(ast: MlldNode[]): string[] {
    const exportedVariables = new Set<string>();
    
    for (const node of ast) {
      // Skip non-directive nodes
      if (node.type !== 'Directive') continue;
      
      const directive = node as any;
      
      // Check for variable definitions (/var, /path, /exe)
      if (['var', 'path', 'exe'].includes(directive.kind)) {
        // Extract the identifier from the directive
        const identifierNodes = directive.values?.identifier;
        if (identifierNodes && Array.isArray(identifierNodes)) {
          // The identifier is in a VariableReference node
          for (const node of identifierNodes) {
            if (node.type === 'VariableReference' && node.identifier) {
              exportedVariables.add(node.identifier);
            }
          }
        }
      }
    }
    
    // Check exported variables against reserved words
    const conflictingExports: string[] = [];
    for (const varName of exportedVariables) {
      if (reservedWords.reservedWords.includes(varName)) {
        conflictingExports.push(varName);
      }
    }
    
    return conflictingExports;
  }
}