import { ResolutionError } from '@services/ResolutionService/errors/ResolutionError.js';
import { StringLiteralHandler } from './StringLiteralHandler.js';
import { IResolutionService } from '@services/ResolutionService/IResolutionService.js';
import { ResolutionContext } from '@services/ResolutionService/IResolutionService.js';

/**
 * Handles string concatenation operations using the ++ operator
 */
export class StringConcatenationHandler {
  private stringLiteralHandler: StringLiteralHandler;

  constructor(
    private resolutionService: IResolutionService
  ) {
    this.stringLiteralHandler = new StringLiteralHandler();
  }

  /**
   * Splits a value into its concatenation parts
   * @returns Array of parts to be concatenated
   * @throws ResolutionError if the concatenation syntax is invalid
   */
  private splitConcatenationParts(value: string): string[] {
    // Split by ++ operator, preserving spaces around it
    const parts = value.split(/\s*\+\+\s*/);
    
    // Validate each part is non-empty
    if (parts.some(part => part.trim().length === 0)) {
      throw new ResolutionError(
        'Empty part in string concatenation',
        { value }
      );
    }

    return parts;
  }

  /**
   * Checks if a value contains the ++ operator
   */
  hasConcatenation(value: string): boolean {
    // Look for ++ with required spaces on both sides
    return /\s\+\+\s/.test(value);
  }

  /**
   * Resolves a string concatenation expression
   * @throws ResolutionError if the concatenation is invalid
   */
  async resolveConcatenation(value: string, context: ResolutionContext): Promise<string> {
    // Split into parts
    const parts = this.splitConcatenationParts(value);

    // Resolve each part
    const resolvedParts: string[] = [];
    for (const part of parts) {
      const trimmedPart = part.trim();

      // Handle string literals
      if (this.stringLiteralHandler.isStringLiteral(trimmedPart)) {
        resolvedParts.push(this.stringLiteralHandler.parseLiteral(trimmedPart));
        continue;
      }

      // Handle variables and other expressions
      try {
        const resolved = await this.resolutionService.resolveInContext(trimmedPart, context);
        resolvedParts.push(resolved);
      } catch (error) {
        throw new ResolutionError(
          `Failed to resolve part in concatenation: ${trimmedPart}`,
          { value: trimmedPart, context, cause: error }
        );
      }
    }

    // Join all parts
    return resolvedParts.join('');
  }
} 