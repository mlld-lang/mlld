import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import type { BaseMlldNode, SourceLocation } from '@core/types/primitives';

/**
 * Helper class for consistent template delimiter tokenization.
 * Handles backticks, double-colon, and triple-colon templates.
 */
export class TemplateTokenHelper {
  constructor(
    private document: TextDocument,
    private tokenBuilder: TokenBuilder
  ) {}

  /**
   * Tokenize template delimiters based on wrapper type
   * @param wrapperType The template wrapper type
   * @param templateNodes Array of template content nodes
   * @param nodeLocation Location of the containing node
   * @returns Template context for content processing
   */
  tokenizeTemplateDelimiters(
    wrapperType: string,
    templateNodes: BaseMlldNode[],
    nodeLocation: SourceLocation
  ): { templateType: string | null; variableStyle: '@var' | '{{var}}'; interpolationAllowed: boolean; delimiterLength: number } {
    let templateType: 'backtick' | 'doubleColon' | 'tripleColon' | 'string' | null = null;
    let variableStyle: '@var' | '{{var}}' = '@var';
    let interpolationAllowed = true;
    let delimiterLength = 1;
    
    switch (wrapperType) {
      case 'backtick':
        templateType = 'backtick';
        delimiterLength = 1;
        break;
      case 'doubleColon':
        templateType = 'doubleColon';
        delimiterLength = 2;
        break;
      case 'tripleColon':
        templateType = 'tripleColon';
        variableStyle = '{{var}}';
        delimiterLength = 3;
        break;
      case 'singleQuote':
        interpolationAllowed = false;
        delimiterLength = 1;
        break;
      case 'doubleQuote':
        // Check if this is a simple string literal (no interpolation)
        if (templateNodes.length === 1 && templateNodes[0].type === 'Text') {
          return {
            templateType: null,
            variableStyle,
            interpolationAllowed: false,
            delimiterLength
          };
        }
        // Otherwise, it has interpolation
        templateType = 'string';
        interpolationAllowed = true;
        variableStyle = '@var';
        delimiterLength = 1;
        break;
    }
    
    if (templateType && templateNodes.length > 0) {
      const firstNode = templateNodes[0];
      const lastNode = templateNodes[templateNodes.length - 1];
      
      if (firstNode.location) {
        // Add opening delimiter token
        const openDelimiterOffset = firstNode.location.start.offset - delimiterLength;
        const openDelimiterPos = this.document.positionAt(openDelimiterOffset);
        
        this.tokenBuilder.addToken({
          line: openDelimiterPos.line,
          char: openDelimiterPos.character,
          length: delimiterLength,
          tokenType: templateType === 'string' ? 'string' : 'template',
          modifiers: []
        });
      }
      
      if (lastNode.location) {
        // Add closing delimiter token
        const closeDelimiterOffset = lastNode.location.end.offset;
        const closeDelimiterPos = this.document.positionAt(closeDelimiterOffset);
        
        this.tokenBuilder.addToken({
          line: closeDelimiterPos.line,
          char: closeDelimiterPos.character,
          length: delimiterLength,
          tokenType: templateType === 'string' ? 'string' : 'template',
          modifiers: []
        });
      }
    }
    
    return {
      templateType,
      variableStyle,
      interpolationAllowed,
      delimiterLength
    };
  }

  /**
   * Tokenize a simple string literal (no interpolation)
   * @param node String literal node
   * @param offset Offset adjustment if needed
   */
  tokenizeStringLiteral(node: BaseMlldNode, offset: number = 0): void {
    if (!node.location) return;
    
    const startOffset = node.location.start.offset - 1; // Include opening quote
    const endOffset = node.location.end.offset + 1; // Include closing quote
    const source = this.document.getText();
    const stringContent = source.substring(startOffset, endOffset);
    
    const position = this.document.positionAt(startOffset + offset);
    
    this.tokenBuilder.addToken({
      line: position.line,
      char: position.character,
      length: stringContent.length,
      tokenType: 'string',
      modifiers: []
    });
  }

  /**
   * Create template context for visitor processing
   * @param baseContext Base visitor context
   * @param templateType Template type
   * @param interpolationAllowed Whether interpolation is allowed
   * @param variableStyle Variable interpolation style
   * @returns New context with template settings
   */
  createTemplateContext(
    baseContext: VisitorContext,
    templateType: VisitorContext['templateType'],
    interpolationAllowed: boolean,
    variableStyle: '@var' | '{{var}}'
  ): VisitorContext {
    return {
      ...baseContext,
      templateType,
      interpolationAllowed,
      variableStyle,
      inSingleQuotes: !interpolationAllowed && variableStyle === '@var'
    };
  }

  /**
   * Tokenize template quotes in the "as" clause
   * @param directiveLocation Location of the directive
   * @param asIndex Index of "as" keyword in directive text
   * @param directiveText Full directive text
   */
  tokenizeAsClauseQuotes(
    directiveLocation: SourceLocation,
    asIndex: number,
    directiveText: string
  ): void {
    // Find the opening quote position - it comes after "as "
    const asKeywordEnd = asIndex + 4; // " as " is 4 characters
    const afterAs = directiveText.substring(asKeywordEnd);
    const openQuoteIndex = afterAs.indexOf('"');
    
    if (openQuoteIndex !== -1) {
      const openQuotePosition = asKeywordEnd + openQuoteIndex;
      
      // Token for opening quote
      const openPos = this.document.positionAt(directiveLocation.start.offset + openQuotePosition);
      this.tokenBuilder.addToken({
        line: openPos.line,
        char: openPos.character,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
      
      // Find the closing quote position
      const closingQuoteIndex = directiveText.lastIndexOf('"');
      if (closingQuoteIndex !== -1 && closingQuoteIndex > openQuotePosition) {
        // Token for closing quote
        const closePos = this.document.positionAt(directiveLocation.start.offset + closingQuoteIndex);
        this.tokenBuilder.addToken({
          line: closePos.line,
          char: closePos.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
    }
  }

  /**
   * Check if a wrapper type represents a template
   * @param wrapperType Wrapper type to check
   * @returns true if it's a template type
   */
  isTemplate(wrapperType: string): boolean {
    return ['backtick', 'doubleColon', 'tripleColon'].includes(wrapperType);
  }

  /**
   * Get delimiter length for a wrapper type
   * @param wrapperType Wrapper type
   * @returns Number of characters in the delimiter
   */
  getDelimiterLength(wrapperType: string): number {
    switch (wrapperType) {
      case 'tripleColon':
        return 3;
      case 'doubleColon':
        return 2;
      default:
        return 1;
    }
  }
}