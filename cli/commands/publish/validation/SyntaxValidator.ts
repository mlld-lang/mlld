/**
 * Syntax validation for mlld modules
 */

import { parseSync } from '@grammar/parser';
import { MlldError, ErrorSeverity } from '@core/errors';
import { ValidationStep } from '../types/PublishingStrategy';
import { ModuleMetadata, ValidationResult } from '../types/PublishingTypes';
import reservedWords from '@core/reserved.json';

interface ModuleData {
  metadata: ModuleMetadata;
  content: string;
  filePath: string;
}

export class SyntaxValidator implements ValidationStep {
  name = 'syntax';

  async validate(module: ModuleData): Promise<ValidationResult> {
    const errors: any[] = [];
    
    try {
      const ast = parseSync(module.content);
      
      // Check for reserved word conflicts
      const conflicts = this.checkReservedWordConflicts(ast);
      if (conflicts.length > 0) {
        errors.push({
          field: 'content',
          message: `Module exports variables that conflict with mlld reserved words:\n` +
                  `    Conflicting variables: ${conflicts.join(', ')}\n` +
                  `    Reserved words cannot be used as variable names.\n` +
                  `    Please rename these variables to avoid conflicts.`,
          severity: 'error' as const
        });
      }
    } catch (parseError: any) {
      const errorMessage = parseError.message || 'Unknown parse error';
      const location = parseError.location ? 
        ` at line ${parseError.location.start.line}, column ${parseError.location.start.column}` : '';
      
      errors.push({
        field: 'content',
        message: `Invalid mlld syntax${location}: ${errorMessage}`,
        severity: 'error' as const
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  private checkReservedWordConflicts(ast: any[]): string[] {
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