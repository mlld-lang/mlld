import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';

/**
 * Handles validation and parsing of string literals in text directives
 */
export class StringLiteralHandler {
  private readonly QUOTE_TYPES = ["'", '"', '`'] as const;
  private readonly MIN_CONTENT_LENGTH = 1;

  /**
   * Checks if a value appears to be a string literal
   * This is a preliminary check before full validation
   */
  isStringLiteral(value: string): boolean {
    if (!value || value.length < 2) {
      return false;
    }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    
    // Check for matching quotes
    if (!this.QUOTE_TYPES.includes(firstChar as any) || firstChar !== lastChar) {
      return false;
    }

    // Check for unclosed quotes
    let isEscaped = false;
    for (let i = 1; i < value.length - 1; i++) {
      if (value[i] === '\\') {
        isEscaped = !isEscaped;
      } else if (value[i] === firstChar && !isEscaped) {
        return false; // Found an unescaped quote in the middle
      } else {
        isEscaped = false;
      }
    }

    return true;
  }

  /**
   * Validates a string literal for proper quoting and content
   * @throws ResolutionError if the literal is invalid
   */
  validateLiteral(value: string): void {
    if (!value || value.length < 2) {
      throw new ResolutionError(
        'String literal is empty or too short',
        { value }
      );
    }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];

    // Check if starts with a valid quote
    if (!this.QUOTE_TYPES.includes(firstChar as any)) {
      throw new ResolutionError(
        'String literal must start with a quote (\', ", or `)',
        { value }
      );
    }

    // Check if quotes match
    if (firstChar !== lastChar) {
      throw new ResolutionError(
        'String literal has mismatched quotes',
        { value }
      );
    }

    // Check for mixed quotes
    const otherQuotes = this.QUOTE_TYPES.filter(q => q !== firstChar);
    const content = value.slice(1, -1);
    
    for (const quote of otherQuotes) {
      if (content.includes(quote) && !this.isEscaped(content, quote)) {
        throw new ResolutionError(
          'String literal contains unescaped mixed quotes',
          { value }
        );
      }
    }

    // Check content length
    if (content.length < this.MIN_CONTENT_LENGTH) {
      throw new ResolutionError(
        'String literal content is empty',
        { value }
      );
    }

    // Check for newlines in single/double quoted strings
    if (firstChar !== '`' && content.includes('\n')) {
      throw new ResolutionError(
        'Single and double quoted strings cannot contain newlines',
        { value }
      );
    }
  }

  /**
   * Parses a string literal, removing quotes and handling escapes
   * @throws ResolutionError if the literal is invalid
   */
  parseLiteral(value: string): string {
    // First validate the literal
    this.validateLiteral(value);

    // Get the content between quotes
    const content = value.slice(1, -1);

    // Handle escaped quotes based on quote type
    const quoteType = value[0];
    return this.unescapeQuotes(content, quoteType as typeof this.QUOTE_TYPES[number]);
  }

  /**
   * Checks if a character at a given position is escaped
   */
  private isEscaped(str: string, char: string, pos?: number): boolean {
    if (pos === undefined) {
      // If no position given, check all occurrences
      let escaped = false;
      for (let i = 0; i < str.length; i++) {
        if (str[i] === char && !this.isEscaped(str, char, i)) {
          return false;
        }
      }
      return true;
    }

    // Count backslashes before the character
    let backslashCount = 0;
    let i = pos - 1;
    while (i >= 0 && str[i] === '\\') {
      backslashCount++;
      i--;
    }
    return backslashCount % 2 === 1;
  }

  /**
   * Unescapes quotes in the content based on quote type
   */
  private unescapeQuotes(content: string, quoteType: typeof this.QUOTE_TYPES[number]): string {
    // Replace escaped quotes with actual quotes
    return content.replace(
      new RegExp(`\\\\${quoteType}`, 'g'),
      quoteType
    );
  }
} 