import { TextDocument } from 'vscode-languageserver-textdocument';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';

/**
 * Helper class for consistent comment tokenization across visitors.
 * Handles >> and << comment markers with special position calculation logic.
 */
export class CommentTokenHelper {
  constructor(
    private document: TextDocument,
    private tokenBuilder: TokenBuilder
  ) {}

  /**
   * Tokenize an end-of-line comment attached to a directive
   * @param comment Comment object with location and marker info
   */
  tokenizeEndOfLineComment(comment: any): void {
    if (!comment.location) return;
    
    const sourceText = this.document.getText();
    
    // The comment location in the AST starts after the space after the marker
    // We need to find the actual position of the marker in the source text
    const lineStart = sourceText.split('\n').slice(0, comment.location.start.line - 1).join('\n').length;
    const lineOffset = lineStart > 0 ? lineStart + 1 : 0; // +1 for newline if not first line
    
    // Find the marker position by searching backwards from the comment start
    const searchStart = Math.max(0, comment.location.start.offset - 10); // Look back up to 10 chars
    const searchText = sourceText.substring(searchStart, comment.location.start.offset);
    const markerIndex = searchText.lastIndexOf(comment.marker);
    
    if (markerIndex !== -1) {
      // Found the marker, calculate the actual start position
      const markerOffset = searchStart + markerIndex;
      const markerLine = comment.location.start.line - 1;
      const markerChar = markerOffset - lineOffset;
      const totalLength = comment.location.end.offset - markerOffset;
      
      // Token for the entire comment including the marker
      this.tokenBuilder.addToken({
        line: markerLine,
        char: markerChar,
        length: totalLength,
        tokenType: 'comment',
        modifiers: []
      });
    } else {
      // Fallback: just use the comment location as-is
      this.tokenBuilder.addToken({
        line: comment.location.start.line - 1,
        char: comment.location.start.column - 1,
        length: comment.location.end.offset - comment.location.start.offset,
        tokenType: 'comment',
        modifiers: []
      });
    }
  }

  /**
   * Tokenize a standalone comment node (full line comment)
   * @param node Comment AST node
   */
  tokenizeStandaloneComment(node: any): void {
    if (!node.location) return;
    
    // For standalone comments, the location includes the marker
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.location.end.offset - node.location.start.offset,
      tokenType: 'comment',
      modifiers: []
    });
  }

  /**
   * Find and tokenize comment markers in a text range
   * Useful for finding comments that aren't part of the AST
   * @param startOffset Start of range to search
   * @param endOffset End of range to search
   * @returns Array of comment offsets found
   */
  findAndTokenizeComments(startOffset: number, endOffset: number): number[] {
    const positions: number[] = [];
    const sourceText = this.document.getText();
    const rangeText = sourceText.substring(startOffset, endOffset);
    
    // Look for >> and << comment markers
    const commentRegex = /(>>|<<).*$/gm;
    let match;
    
    while ((match = commentRegex.exec(rangeText)) !== null) {
      const absoluteOffset = startOffset + match.index;
      const position = this.document.positionAt(absoluteOffset);
      
      // Calculate length to end of line
      const lineEnd = rangeText.indexOf('\n', match.index);
      const length = lineEnd !== -1 
        ? lineEnd - match.index 
        : rangeText.length - match.index;
      
      this.tokenBuilder.addToken({
        line: position.line,
        char: position.character,
        length,
        tokenType: 'comment',
        modifiers: []
      });
      
      positions.push(absoluteOffset);
    }
    
    return positions;
  }

  /**
   * Check if a position is inside a comment
   * @param offset Position to check
   * @returns true if position is inside a comment
   */
  isInsideComment(offset: number): boolean {
    const sourceText = this.document.getText();
    
    // Find the start of the current line
    let lineStart = offset;
    while (lineStart > 0 && sourceText[lineStart - 1] !== '\n') {
      lineStart--;
    }
    
    // Check if there's a comment marker before this position on the same line
    const lineText = sourceText.substring(lineStart, offset);
    return lineText.includes('>>') || lineText.includes('<<');
  }
}