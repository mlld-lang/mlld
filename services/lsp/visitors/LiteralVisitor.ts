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
    
    if (typeof value === 'number') {
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