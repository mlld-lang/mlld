import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';

/**
 * Helper class for consistent operator tokenization across all visitors.
 * Provides common patterns for finding and tokenizing operators in mlld code.
 */
export class OperatorTokenHelper {
  constructor(
    private document: TextDocument,
    private tokenBuilder: TokenBuilder
  ) {}

  /**
   * Tokenize an operator between two AST node positions
   * @param startOffset Start offset to search from
   * @param endOffset End offset to search to
   * @param operator The operator string to find (e.g., '=>', '=', ',')
   * @param tokenType Token type (default: 'operator')
   * @returns true if operator was found and tokenized
   */
  tokenizeOperatorBetween(
    startOffset: number,
    endOffset: number,
    operator: string,
    tokenType: string = 'operator'
  ): boolean {
    const sourceText = this.document.getText();
    const betweenText = sourceText.substring(startOffset, endOffset);
    const operatorIndex = betweenText.indexOf(operator);
    
    if (operatorIndex !== -1) {
      const position = this.document.positionAt(startOffset + operatorIndex);
      this.tokenBuilder.addToken({
        line: position.line,
        char: position.character,
        length: operator.length,
        tokenType,
        modifiers: []
      });
      return true;
    }
    
    return false;
  }

  /**
   * Tokenize all operators in a binary expression
   * Handles: ==, !=, >=, <=, >, <, &&, ||
   * @param node Binary expression node with left, right, and operator
   */
  tokenizeBinaryExpression(node: any): void {
    if (!node.operator || !node.left?.location || !node.right?.location) return;
    
    const operatorText = Array.isArray(node.operator) ? node.operator[0] : node.operator;
    if (!operatorText) return;
    
    // Find operator between left and right operands
    this.tokenizeOperatorBetween(
      node.left.location.end.offset,
      node.right.location.start.offset,
      operatorText
    );
  }

  /**
   * Tokenize property access operators and identifiers
   * Handles: .property, [index]
   * @param node Node with property access (must have accurate field locations)
   */
  tokenizePropertyAccess(node: any): void {
    if (!node.fields || !Array.isArray(node.fields)) return;
    
    let currentOffset = node.location.end.offset;
    
    for (const field of node.fields) {
      if (!field.location) continue;
      
      if (field.type === 'field' && field.value) {
        // The field location should point to the start of the field name (after the dot)
        // We need to verify the dot is actually before it
        const sourceText = this.document.getText();
        const dotOffset = field.location.start.offset - 1;

        // Verify there's actually a dot at this position
        if (sourceText[dotOffset] === '.') {
          const dotPosition = this.document.positionAt(dotOffset);

          this.tokenBuilder.addToken({
            line: dotPosition.line,
            char: dotPosition.character,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });

          // Check if this is a type-checking builtin method
          const typeCheckMethods = ['isArray', 'isObject', 'isString', 'isNumber', 'isBoolean', 'isNull', 'isDefined'];
          const isTypeCheckMethod = typeCheckMethods.includes(field.value);

          // Token for property name (field location already points to it)
          const propPosition = this.document.positionAt(field.location.start.offset);
          this.tokenBuilder.addToken({
            line: propPosition.line,
            char: propPosition.character,
            length: field.value.length,
            tokenType: isTypeCheckMethod ? 'function' : 'property',
            modifiers: isTypeCheckMethod ? ['defaultLibrary'] : []
          });
          this.addOptionalSuffixToken(field);
        } else {
          // If no dot found, the location might be off - try to find it
          console.error('[FIELD-ERROR] No dot found before field', {
            fieldValue: field.value,
            expectedDotOffset: dotOffset,
            charAtOffset: sourceText[dotOffset],
            contextBefore: sourceText.substring(dotOffset - 5, dotOffset),
            contextAfter: sourceText.substring(dotOffset, dotOffset + 5)
          });
        }
      } else if (field.type === 'numericField') {
        const sourceText = this.document.getText();
        const dotOffset = field.location.start.offset - 1;

        if (sourceText[dotOffset] === '.') {
          const dotPosition = this.document.positionAt(dotOffset);
          this.tokenBuilder.addToken({
            line: dotPosition.line,
            char: dotPosition.character,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });

          const valueText = String(field.value);
          const valuePosition = this.document.positionAt(field.location.start.offset);
          this.tokenBuilder.addToken({
            line: valuePosition.line,
            char: valuePosition.character,
            length: valueText.length,
            tokenType: 'property',
            modifiers: []
          });
          this.addOptionalSuffixToken(field);
        } else {
          console.error('[NUMERIC-FIELD-ERROR] No dot found before numeric field', {
            fieldValue: field.value,
            expectedDotOffset: dotOffset,
            charAtOffset: sourceText[dotOffset],
            contextBefore: sourceText.substring(dotOffset - 5, dotOffset),
            contextAfter: sourceText.substring(dotOffset, dotOffset + 5)
          });
        }
      } else if (field.type === 'arrayIndex') {
        // Token for opening bracket
        const openBracketPos = this.document.positionAt(field.location.start.offset);
        this.tokenBuilder.addToken({
          line: openBracketPos.line,
          char: openBracketPos.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });

        // Token for index value
        if (field.value !== undefined) {
          const indexStr = String(field.value);
          const indexPos = this.document.positionAt(field.location.start.offset + 1);
          this.tokenBuilder.addToken({
            line: indexPos.line,
            char: indexPos.character,
            length: indexStr.length,
            tokenType: 'number',
            modifiers: []
          });
        }

        // Token for closing bracket
        const closeBracketOffset = field.location.end.offset - (field.optional ? 2 : 1);
        const closeBracketPos = this.document.positionAt(closeBracketOffset);
        this.tokenBuilder.addToken({
          line: closeBracketPos.line,
          char: closeBracketPos.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        this.addOptionalSuffixToken(field);
      } else if (field.type === 'variableIndex') {
        // Token for opening bracket
        const openBracketPos = this.document.positionAt(field.location.start.offset);
        this.tokenBuilder.addToken({
          line: openBracketPos.line,
          char: openBracketPos.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });

        // The value is a VariableReference - visit it via callback if provided
        // For now, just tokenize brackets; the nested VariableReference will be handled by visitChildren

        // Token for closing bracket
        const closeBracketOffset = field.location.end.offset - (field.optional ? 2 : 1);
        const closeBracketPos = this.document.positionAt(closeBracketOffset);
        this.tokenBuilder.addToken({
          line: closeBracketPos.line,
          char: closeBracketPos.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        this.addOptionalSuffixToken(field);
      } else if (field.type === 'stringIndex' || field.type === 'bracketAccess') {
        // Token for opening bracket
        const openBracketPos = this.document.positionAt(field.location.start.offset);
        this.tokenBuilder.addToken({
          line: openBracketPos.line,
          char: openBracketPos.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });

        const sourceText = this.document.getText();
        const closeBracketOffset = field.location.end.offset - (field.optional ? 2 : 1);
        const segment = sourceText.substring(field.location.start.offset, closeBracketOffset + 1);

        const doubleQuoteIndex = segment.indexOf('"');
        const singleQuoteIndex = segment.indexOf('\'');
        let quoteIndex = -1;
        let quoteChar = '';

        if (doubleQuoteIndex !== -1 && singleQuoteIndex !== -1) {
          if (doubleQuoteIndex < singleQuoteIndex) {
            quoteIndex = doubleQuoteIndex;
            quoteChar = '"';
          } else {
            quoteIndex = singleQuoteIndex;
            quoteChar = '\'';
          }
        } else if (doubleQuoteIndex !== -1) {
          quoteIndex = doubleQuoteIndex;
          quoteChar = '"';
        } else if (singleQuoteIndex !== -1) {
          quoteIndex = singleQuoteIndex;
          quoteChar = '\'';
        }

        if (quoteIndex !== -1) {
          const lastQuoteIndex = segment.lastIndexOf(quoteChar);
          if (lastQuoteIndex > quoteIndex) {
            const quoteOffset = field.location.start.offset + quoteIndex;
            const quotePos = this.document.positionAt(quoteOffset);
            this.tokenBuilder.addToken({
              line: quotePos.line,
              char: quotePos.character,
              length: lastQuoteIndex - quoteIndex + 1,
              tokenType: 'string',
              modifiers: quoteChar === '\'' ? ['literal'] : []
            });
          }
        } else if (field.value !== undefined) {
          const valueText = String(field.value);
          const valuePos = this.document.positionAt(field.location.start.offset + 1);
          this.tokenBuilder.addToken({
            line: valuePos.line,
            char: valuePos.character,
            length: valueText.length,
            tokenType: 'string',
            modifiers: []
          });
        }

        // Token for closing bracket
        const closeBracketPos = this.document.positionAt(closeBracketOffset);
        this.tokenBuilder.addToken({
          line: closeBracketPos.line,
          char: closeBracketPos.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        this.addOptionalSuffixToken(field);
      } else if (field.type === 'arraySlice') {
        // Token for opening bracket
        const openBracketPos = this.document.positionAt(field.location.start.offset);
        this.tokenBuilder.addToken({
          line: openBracketPos.line,
          char: openBracketPos.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        
        // Token for start index (if present)
        if (field.start !== undefined && field.start !== null) {
          const startStr = String(field.start);
          // Start index is right after the opening bracket
          const startPos = this.document.positionAt(field.location.start.offset + 1);
          this.tokenBuilder.addToken({
            line: startPos.line,
            char: startPos.character,
            length: startStr.length,
            tokenType: 'number',
            modifiers: []
          });
        }
        
        // Token for colon separator
        const sourceText = this.document.getText();
        const rangeText = sourceText.substring(field.location.start.offset, field.location.end.offset);
        const colonIndex = rangeText.indexOf(':');
        if (colonIndex !== -1) {
          const colonPos = this.document.positionAt(field.location.start.offset + colonIndex);
          this.tokenBuilder.addToken({
            line: colonPos.line,
            char: colonPos.character,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
        }
        
        // Token for end index (if present)
        if (field.end !== undefined && field.end !== null) {
          const endStr = String(field.end);
          // End index is after the colon
          if (colonIndex !== -1) {
            const endPos = this.document.positionAt(field.location.start.offset + colonIndex + 1);
            this.tokenBuilder.addToken({
              line: endPos.line,
              char: endPos.character,
              length: endStr.length,
              tokenType: 'number',
              modifiers: []
            });
          }
        }
        
        // Token for closing bracket
        const closeBracketOffset = field.location.end.offset - (field.optional ? 2 : 1);
        const closeBracketPos = this.document.positionAt(closeBracketOffset);
        this.tokenBuilder.addToken({
          line: closeBracketPos.line,
          char: closeBracketPos.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
        this.addOptionalSuffixToken(field);
      }
      
      currentOffset = field.location.end.offset;
    }
  }

  /**
   * Find and tokenize all pipeline operators in a range
   * @param startOffset Start of range
   * @param endOffset End of range
   */
  tokenizePipelineOperators(startOffset: number, endOffset: number): void {
    const sourceText = this.document.getText();
    const rangeText = sourceText.substring(startOffset, endOffset);
    
    let index = 0;
    while ((index = rangeText.indexOf('|', index)) !== -1) {
      const position = this.document.positionAt(startOffset + index);
      this.tokenBuilder.addToken({
        line: position.line,
        char: position.character,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
      index++;
    }
  }

  /**
   * Find an operator near a position with bounded search
   * @param searchStart Starting offset for search
   * @param operator Operator to find
   * @param maxDistance Maximum characters to search (default: 10)
   * @param direction Search direction (default: 'forward')
   * @returns Offset of operator or null if not found
   */
  findOperatorNear(
    searchStart: number,
    operator: string,
    maxDistance: number = 10,
    direction: 'forward' | 'backward' = 'forward'
  ): number | null {
    const sourceText = this.document.getText();
    
    if (direction === 'forward') {
      const searchEnd = Math.min(searchStart + maxDistance, sourceText.length);
      const searchText = sourceText.substring(searchStart, searchEnd);
      const index = searchText.indexOf(operator);
      return index !== -1 ? searchStart + index : null;
    } else {
      const searchBegin = Math.max(0, searchStart - maxDistance);
      const searchText = sourceText.substring(searchBegin, searchStart);
      const index = searchText.lastIndexOf(operator);
      return index !== -1 ? searchBegin + index : null;
    }
  }

  /**
   * Tokenize a series of operators (useful for comma-separated lists)
   * @param startOffset Start of range
   * @param endOffset End of range
   * @param operator Operator to find (default: ',')
   */
  tokenizeListSeparators(
    startOffset: number,
    endOffset: number,
    operator: string = ','
  ): number[] {
    const positions: number[] = [];
    const sourceText = this.document.getText();
    const rangeText = sourceText.substring(startOffset, endOffset);
    
    let index = 0;
    while ((index = rangeText.indexOf(operator, index)) !== -1) {
      const absoluteOffset = startOffset + index;
      const position = this.document.positionAt(absoluteOffset);
      
      this.tokenBuilder.addToken({
        line: position.line,
        char: position.character,
        length: operator.length,
        tokenType: 'operator',
        modifiers: []
      });
      
      positions.push(absoluteOffset);
      index += operator.length;
    }
    
    return positions;
  }

  /**
   * Tokenize opening and closing delimiters (braces, brackets, parens)
   * @param openOffset Offset of opening delimiter
   * @param closeOffset Offset of closing delimiter
   * @param delimiterType Type of delimiter: 'brace', 'bracket', 'paren'
   */
  tokenizeDelimiters(
    openOffset: number,
    closeOffset: number,
    delimiterType: 'brace' | 'bracket' | 'paren'
  ): void {
    const delimiters = {
      brace: { open: '{', close: '}' },
      bracket: { open: '[', close: ']' },
      paren: { open: '(', close: ')' }
    };
    
    const { open, close } = delimiters[delimiterType];
    
    // Token for opening delimiter
    const openPos = this.document.positionAt(openOffset);
    this.tokenBuilder.addToken({
      line: openPos.line,
      char: openPos.character,
      length: 1,
      tokenType: 'operator',
      modifiers: []
    });
    
    // Token for closing delimiter
    const closePos = this.document.positionAt(closeOffset);
    this.tokenBuilder.addToken({
      line: closePos.line,
      char: closePos.character,
      length: 1,
      tokenType: 'operator',
      modifiers: []
    });
  }

  /**
   * Tokenize ternary operator components (? and :)
   * @param conditionEnd End offset of condition
   * @param trueBranchStart Start offset of true branch
   * @param trueBranchEnd End offset of true branch
   * @param falseBranchStart Start offset of false branch
   */
  tokenizeTernaryOperators(
    conditionEnd: number,
    trueBranchStart: number,
    trueBranchEnd: number,
    falseBranchStart: number
  ): void {
    // Find and tokenize '?'
    this.tokenizeOperatorBetween(conditionEnd, trueBranchStart, '?');
    
    // Find and tokenize ':'
    this.tokenizeOperatorBetween(trueBranchEnd, falseBranchStart, ':');
  }

  /**
   * Helper to add a single operator token at a specific position
   * @param offset Absolute offset in document
   * @param length Length of operator
   * @param tokenType Token type (default: 'operator')
   */
  addOperatorToken(
    offset: number,
    length: number,
    tokenType: string = 'operator'
  ): void {
    const position = this.document.positionAt(offset);
    
    
    this.tokenBuilder.addToken({
      line: position.line,
      char: position.character,
      length,
      tokenType,
      modifiers: []
    });
  }

  private addOptionalSuffixToken(field: any): void {
    if (!field?.optional || !field.location) return;

    const sourceText = this.document.getText();
    const optionalOffset = field.location.end.offset - 1;
    if (optionalOffset < field.location.start.offset) return;

    if (sourceText[optionalOffset] === '?') {
      this.addOperatorToken(optionalOffset, 1);
    }
  }
}
