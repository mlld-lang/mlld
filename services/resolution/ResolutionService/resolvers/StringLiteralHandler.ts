import { ResolutionError } from '@services/resolution/ResolutionService/errors/ResolutionError.js';
import type { IParserService } from '@services/pipeline/ParserService/IParserService.js';
import type { MeldNode, TextNode } from '@core/syntax/types.js';

/**
 * Handles validation and parsing of string literals in text directives
 */
export class StringLiteralHandler {
  private readonly QUOTE_TYPES = ['\'', '"', '`'] as const;
  private readonly MIN_CONTENT_LENGTH = 1;
  private silentMode: boolean = false;

  constructor(private parserService?: IParserService) {}

  /**
   * Enable silent mode to suppress warning messages (useful for tests)
   */
  setSilentMode(silent: boolean): void {
    this.silentMode = silent;
  }

  /**
   * Checks if a value appears to be a string literal
   * This is a preliminary check before full validation
   */
  async isStringLiteralWithAst(value: string): Promise<boolean> {
    if (!this.parserService) {
      return this.isStringLiteral(value);
    }
    
    try {
      // Wrap the string in a directive to ensure proper parsing
      const wrappedValue = `@text test = ${value}`;
      
      // Parse with AST
      const nodes = await this.parserService.parse(wrappedValue);
      
      // Look for directive nodes
      const directiveNode = nodes.find(node => 
        node.type === 'Directive' && 
        (node as any).directive?.kind === 'text'
      );
      
      if (directiveNode) {
        // In the test environment, the mock parser doesn't create a StringLiteral type
        // but just passes the value through, so we need to check both formats
        const directiveValue = (directiveNode as any).directive?.value;
        
        // Check if it's a StringLiteral node in the AST
        if (directiveValue && typeof directiveValue === 'object' && directiveValue.type === 'StringLiteral') {
          return true;
        }
        
        // Check if it's a string value that looks like a string literal
        if (typeof directiveValue === 'string') {
          return this.isStringLiteral(directiveValue);
        }
      }
      
      return false;
    } catch (error) {
      if (!this.silentMode) {
        console.error('Failed to check string literal with AST, falling back to manual check:', error);
      }
      return this.isStringLiteral(value);
    }
  }

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
  async validateLiteralWithAst(value: string): Promise<void> {
    if (!this.parserService) {
      return this.validateLiteral(value);
    }
    
    try {
      // Wrap the string in a directive to ensure proper parsing
      const wrappedValue = `@text test = ${value}`;
      
      // Parse with AST
      const nodes = await this.parserService.parse(wrappedValue);
      
      // If parsing succeeds without errors, the literal is valid
      // Just check if it's actually a string literal node
      const directiveNode = nodes.find(node => 
        node.type === 'Directive' && 
        (node as any).directive?.kind === 'text'
      );
      
      if (!directiveNode) {
        throw new ResolutionError(
          'Failed to validate string literal with AST',
          { value }
        );
      }
      
      const directiveValue = (directiveNode as any).directive?.value;
      
      // In the test environment, the mock parser doesn't create a StringLiteral type
      // but just passes the value through, so we need to check both formats
      if (directiveValue && typeof directiveValue === 'object' && directiveValue.type === 'StringLiteral') {
        // Valid string literal object
        return;
      } else if (typeof directiveValue === 'string') {
        // Validate the string value as a string literal
        return this.validateLiteral(directiveValue);
      }
      
      throw new ResolutionError(
        'String literal is invalid',
        { value }
      );
    } catch (error) {
      // If parsing fails, fall back to manual validation
      if (!this.silentMode) {
        console.error('Failed to validate string literal with AST, falling back to manual validation:', error);
      }
      return this.validateLiteral(value);
    }
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
  async parseLiteralWithAst(value: string): Promise<string> {
    if (!this.parserService) {
      return this.parseLiteral(value);
    }
    
    try {
      // Validate first
      await this.validateLiteralWithAst(value);
      
      // Wrap the string in a directive to ensure proper parsing
      const wrappedValue = `@text test = ${value}`;
      
      // Parse with AST
      const nodes = await this.parserService.parse(wrappedValue);
      
      // Extract the string literal value
      const directiveNode = nodes.find(node => 
        node.type === 'Directive' && 
        (node as any).directive?.kind === 'text'
      );
      
      if (directiveNode) {
        const directiveValue = (directiveNode as any).directive?.value;
        
        if (directiveValue && 
            typeof directiveValue === 'object' && 
            directiveValue.type === 'StringLiteral') {
          // The parser has already handled quote escaping
          return directiveValue.value;
        } else if (typeof directiveValue === 'string') {
          // Parse as string literal
          return this.parseLiteral(directiveValue);
        }
      }
      
      // Fall back to manual parsing
      return this.parseLiteral(value);
    } catch (error) {
      // If parsing fails, fall back to manual parsing
      if (!this.silentMode) {
        console.error('Failed to parse string literal with AST, falling back to manual parsing:', error);
      }
      return this.parseLiteral(value);
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
      const escaped = false;
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