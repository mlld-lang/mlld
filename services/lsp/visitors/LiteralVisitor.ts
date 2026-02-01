import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';

export class LiteralVisitor extends BaseVisitor {
  canHandle(node: any): boolean {
    return node.type === 'Literal';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    const value = node.value;
    const valueType = node.valueType;
    let tokenType = 'string';
    let modifiers: string[] = [];
    
    // Handle special keyword literals first
    if (valueType === 'wildcard' || valueType === 'none') {
      tokenType = 'keyword';
    } else if (valueType === 'retry') {
      tokenType = 'keyword';
    } else if (valueType === 'done' || valueType === 'continue') {
      // For done/continue, tokenize just the keyword, not the entire expression
      // The node location spans the entire expression (e.g., "done @value")
      // but we only want to highlight the keyword itself
      const keywordLength = valueType.length; // 'done' = 4, 'continue' = 8
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: keywordLength,
        tokenType: 'keyword',
        modifiers: []
      });

      // Visit the value/argument if it's an array (done/continue can have arguments)
      if (Array.isArray(value) && value.length > 0) {
        // The MainVisitor will handle the nested nodes
        const mainVisitor = (context as any).mainVisitor;
        if (mainVisitor) {
          for (const val of value) {
            if (val && typeof val === 'object' && val.type) {
              mainVisitor.visitNode(val, context);
            }
          }
        }
      }
      return;
    } else if (typeof value === 'number') {
      tokenType = 'number';
    } else if (typeof value === 'boolean') {
      tokenType = 'boolean';
    } else if (value === null) {
      tokenType = 'null';
    } else if (valueType === 'string') {
      const text = this.getCachedText(
        { line: node.location.start.line - 1, character: node.location.start.column - 1 },
        { line: node.location.end.line - 1, character: node.location.end.column }
      );

      if (text.startsWith("'") && text.endsWith("'")) {
        modifiers.push('literal');
      }
    }

    // For string literals, we need to include the quotes in the token
    let startChar = node.location.start.column - 1;
    let length = node.location.end.column - node.location.start.column;

    if (tokenType === 'string' && node.meta?.wrapperType) {
      // The AST location is for the content only, but we need to include quotes
      startChar -= 1; // Move start back to include opening quote
      length += 2;    // Add 2 for both quotes
    }

    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: startChar,
      length,
      tokenType,
      modifiers
    });
  }
}
