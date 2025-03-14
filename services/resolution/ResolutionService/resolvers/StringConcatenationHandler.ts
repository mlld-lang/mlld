import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import { StringLiteralHandler } from './StringLiteralHandler.js';
import { IResolutionService } from '@services/resolution/ResolutionService/IResolutionService.js';
import { ResolutionContext } from '@services/resolution/ResolutionService/IResolutionService.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, TextNode } from '@core/syntax/types';

/**
 * Handles string concatenation operations using the ++ operator
 */
export class StringConcatenationHandler {
  private stringLiteralHandler: StringLiteralHandler;
  private silentMode: boolean = false;

  constructor(
    private resolutionService: IResolutionService,
    private parserService?: IParserService
  ) {
    this.stringLiteralHandler = new StringLiteralHandler();
  }

  /**
   * Enable silent mode to suppress warning messages (useful for tests)
   */
  setSilentMode(silent: boolean): void {
    this.silentMode = silent;
    this.stringLiteralHandler.setSilentMode(silent);
  }

  /**
   * Splits a value into its concatenation parts
   * @returns Array of parts to be concatenated
   * @throws ResolutionError if the concatenation syntax is invalid
   */
  private async splitConcatenationParts(value: string): Promise<string[]> {
    // If ParserService is available, try to use it for more accurate parsing
    if (this.parserService) {
      try {
        // Create a simple element to parse with the concatenation
        // Add some context to make it valid Meld syntax
        const wrappedValue = `@text test = ${value}`;
        
        // Parse with AST
        const nodes = await this.parserService.parse(wrappedValue);
        
        // Look for directive nodes with concatenation operators
        const directiveNode = nodes.find(node => 
          node.type === 'Directive' && 
          (node as any).directive?.kind === 'text'
        );
        
        if (directiveNode) {
          // Access the value which should contain our concatenation
          const directiveValue = (directiveNode as any).directive?.value;
          
          // If the parser properly recognized the concatenation
          if (directiveValue && 
              typeof directiveValue === 'object' && 
              directiveValue.type === 'Concatenation') {
            
            // Extract parts
            const parts = directiveValue.parts?.map((part: any) => {
              if (part?.type === 'StringLiteral') {
                return part.value;
              } else if (part?.type === 'VariableReference') {
                return `{{${part.name}}}`;
              } else {
                return String(part);
              }
            });
            
            if (Array.isArray(parts) && parts.length > 0) {
              return parts;
            }
          }
        }
        
        // If we didn't extract parts, fall back to regex-based splitting
        if (!this.silentMode) {
          console.error('Failed to extract concatenation parts from AST, falling back to manual parsing');
        }
      } catch (error) {
        // If parsing fails, log and fall back to regex-based splitting
        if (!this.silentMode) {
          console.error('Failed to parse concatenation with AST, falling back to manual parsing:', error);
        }
      }
    }
    
    // Fallback: Split by ++ operator, preserving spaces around it
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
  async hasConcatenation(value: string): Promise<boolean> {
    // Try to use the parser to detect concatenation if available
    if (this.parserService) {
      try {
        // Wrap the value for parsing
        const wrappedValue = `@text test = ${value}`;
        
        // Parse the wrapped value
        const nodes = await this.parserService.parse(wrappedValue);
        
        // Look for directive nodes with concatenation operators
        const directiveNode = nodes.find(node => 
          node.type === 'Directive' && 
          (node as any).directive?.kind === 'text'
        );
        
        if (directiveNode) {
          // Check if the parser recognized a Concatenation node
          const directiveValue = (directiveNode as any).directive?.value;
          return directiveValue && 
                 typeof directiveValue === 'object' && 
                 directiveValue.type === 'Concatenation';
        }
      } catch (error) {
        // If parsing fails, fall back to regex check
        if (!this.silentMode) {
          console.error('Failed to check concatenation with AST, falling back to regex:', error);
        }
      }
    }
    
    // Fallback: Look for ++ with required spaces on both sides
    return /\s\+\+\s/.test(value);
  }

  /**
   * Resolves a string concatenation expression
   * @throws ResolutionError if the concatenation is invalid
   */
  async resolveConcatenation(value: string, context: ResolutionContext): Promise<string> {
    // Split into parts
    const parts = await this.splitConcatenationParts(value);

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