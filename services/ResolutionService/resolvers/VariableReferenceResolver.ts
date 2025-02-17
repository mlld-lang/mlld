import type { IStateService } from '@services/StateService/IStateService.js';
import type { ResolutionContext } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionErrorCode } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';
import type { IResolutionService } from '@services/ResolutionService/IResolutionService.js';

/**
 * Handles resolution of variable references (${var})
 */
export class VariableReferenceResolver {
  private readonly variablePattern = /\${([^}]+)}/g;
  private readonly nestedVariablePattern = /\${([^${}]*\${[^}]+}[^}]*)}/g;
  private readonly MAX_RESOLUTION_DEPTH = 10;
  private readonly MAX_ITERATIONS = 100;

  constructor(
    private readonly stateService: IStateService,
    private readonly resolutionService: IResolutionService
  ) {}

  /**
   * Resolves all variable references in the given text
   * @param text Text containing variable references like ${varName}
   * @param context Resolution context
   * @returns Resolved text with all variables replaced with their values
   */
  async resolve(text: string, context: ResolutionContext): Promise<string> {
    if (!text.includes('${')) {
      return text;
    }

    // Track variables being resolved to detect circular references
    const resolutionPath: string[] = [];
    return this.resolveWithDepth(text, context, 0, resolutionPath);
  }

  /**
   * Resolves variables with depth tracking to prevent infinite loops
   */
  private async resolveWithDepth(
    text: string,
    context: ResolutionContext,
    depth: number,
    resolutionPath: string[]
  ): Promise<string> {
    if (depth >= this.MAX_RESOLUTION_DEPTH) {
      throw new ResolutionError(
        'Maximum resolution depth exceeded',
        ResolutionErrorCode.MAX_DEPTH_EXCEEDED,
        { value: text, context }
      );
    }

    // First resolve any nested variables
    let resolvedText = text;
    let hasNested = true;
    let iterations = 0;

    while (hasNested && iterations < this.MAX_ITERATIONS) {
      hasNested = false;
      iterations++;

      // Find all variable references
      this.variablePattern.lastIndex = 0;
      const matches = Array.from(resolvedText.matchAll(this.variablePattern));

      if (matches.length === 0) {
        break;
      }

      // Process each reference
      for (const match of matches) {
        const [fullMatch, varRef] = match;
        
        // Skip if no nested variables
        if (!varRef.includes('${')) {
          continue;
        }

        // Extract the innermost variable reference
        const innerMatch = varRef.match(/\${([^}$]+)}/);
        if (innerMatch) {
          const innerVar = innerMatch[1];
          const baseVar = innerVar.split('.')[0];
          
          // Check for circular references
          const currentPath = [...resolutionPath, baseVar];
          if (this.hasCircularReference(currentPath)) {
            const pathStr = currentPath.join(' -> ');
            throw new ResolutionError(
              `Circular reference detected: ${pathStr}`,
              ResolutionErrorCode.CIRCULAR_REFERENCE,
              { value: text, context }
            );
          }

          try {
            // Resolve the inner variable
            const resolvedInner = await this.resolveWithDepth(
              '${' + innerVar + '}',
              context,
              depth + 1,
              currentPath
            );

            // Replace in the original text
            resolvedText = resolvedText.replace(
              fullMatch,
              fullMatch.replace('${' + innerVar + '}', resolvedInner)
            );
            hasNested = true;
          } catch (error) {
            if (error instanceof ResolutionError) {
              throw error;
            }
            throw new ResolutionError(
              'Failed to resolve nested variable',
              ResolutionErrorCode.RESOLUTION_FAILED,
              { value: innerVar, context, cause: error }
            );
          }
        }
      }
    }

    if (iterations >= this.MAX_ITERATIONS) {
      throw new ResolutionError(
        'Too many resolution iterations',
        ResolutionErrorCode.MAX_ITERATIONS_EXCEEDED,
        { value: text, context }
      );
    }

    // Then resolve any remaining simple variables
    return this.resolveSimpleVariables(resolvedText, context, resolutionPath);
  }

  /**
   * Resolves simple (non-nested) variable references
   */
  private resolveSimpleVariables(
    text: string,
    context: ResolutionContext,
    resolutionPath: string[]
  ): string {
    this.variablePattern.lastIndex = 0;
    return text.replace(this.variablePattern, (match, varRef) => {
      // Handle environment variables with fallbacks
      if (varRef.startsWith('ENV_') && varRef.includes(':-')) {
        const [envVar, fallback] = varRef.split(':-');
        const value = process.env[envVar];
        if (value !== undefined) {
          return value;
        }
        return fallback;
      }

      // Handle field access (e.g., data.user.name)
      const parts = varRef.split('.');
      const baseVar = parts[0];

      // Check for circular references only for the base variable
      const currentPath = [...resolutionPath, baseVar];
      if (this.hasCircularReference(currentPath)) {
        const pathStr = currentPath.join(' -> ');
        throw new ResolutionError(
          `Circular reference detected: ${pathStr}`,
          ResolutionErrorCode.CIRCULAR_REFERENCE,
          { value: text, context }
        );
      }

      // Try text variable first
      let value = this.stateService.getTextVar(baseVar);
      
      // If not found in text vars, try data vars
      if (value === undefined && context.allowedVariableTypes.data) {
        value = this.stateService.getDataVar(baseVar);
      }

      // Handle environment variables
      if (value === undefined && baseVar.startsWith('ENV_')) {
        const envVar = process.env[baseVar];
        if (envVar === undefined) {
          throw new ResolutionError(
            'Environment variable not set: ' + baseVar,
            ResolutionErrorCode.UNDEFINED_VARIABLE,
            { value: baseVar, context }
          );
        }
        return envVar;
      }

      // Handle undefined variables
      if (value === undefined) {
        throw new ResolutionError(
          'Undefined variable: ' + baseVar,
          ResolutionErrorCode.UNDEFINED_VARIABLE,
          { value: baseVar, context }
        );
      }

      // Handle field access for data variables
      if (parts.length > 1 && typeof value === 'object') {
        try {
          value = parts.slice(1).reduce((obj: any, field) => {
            if (field.includes('[') && field.includes(']')) {
              const [arrayName, indexExpr] = field.split('[');
              const index = indexExpr.slice(0, -1); // Remove closing bracket
              
              // If index is a variable reference, resolve it
              if (index.startsWith('${') && index.endsWith('}')) {
                const indexVar = index.slice(2, -1);
                const indexValue = this.stateService.getTextVar(indexVar);
                if (indexValue === undefined) {
                  throw new ResolutionError(
                    'Undefined index variable: ' + indexVar,
                    ResolutionErrorCode.UNDEFINED_VARIABLE,
                    { value: indexVar, context }
                  );
                }
                return obj[indexValue];
              }
              return obj[index];
            }
            return obj[field];
          }, value);
        } catch (error) {
          throw new ResolutionError(
            'Invalid field access: ' + parts.slice(1).join('.'),
            ResolutionErrorCode.FIELD_ACCESS_ERROR,
            { value: varRef, context }
          );
        }
      }

      return String(value);
    });
  }

  /**
   * Checks if a resolution path contains a circular reference
   */
  private hasCircularReference(path: string[]): boolean {
    const seen = new Set<string>();
    for (const varName of path) {
      if (seen.has(varName)) {
        return true;
      }
      seen.add(varName);
    }
    return false;
  }

  /**
   * Extracts all unique variable references from the given text
   * @param text Text containing variable references
   * @returns Array of unique variable names (without ${} and field access)
   */
  extractReferences(text: string): string[] {
    const matches = text.match(this.variablePattern);
    if (!matches) {
      return [];
    }

    const refs = matches.map(match => {
      // Remove ${} and get base variable name (before any field access)
      const varRef = match.slice(2, -1);
      return varRef.split('.')[0];
    });

    // Return unique references
    return [...new Set(refs)];
  }
} 