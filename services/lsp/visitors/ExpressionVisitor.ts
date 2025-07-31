import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';

export class ExpressionVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'BinaryExpression' || 
           node.type === 'UnaryExpression' ||
           node.type === 'TernaryExpression' ||
           node.type === 'WhenExpression';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    switch (node.type) {
      case 'BinaryExpression':
      case 'UnaryExpression':
        this.visitOperator(node, context);
        break;
      case 'TernaryExpression':
        this.visitTernaryExpression(node, context);
        break;
      case 'WhenExpression':
        this.visitWhenExpression(node, context);
        break;
    }
  }
  
  private visitOperator(node: any, context: VisitorContext): void {
    if (!node.operator) return;
    
    const operatorText = Array.isArray(node.operator) ? node.operator[0] : node.operator;
    
    if (operatorText) {
      if (node.type === 'UnaryExpression' && node.operand) {
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: operatorText.length,
          tokenType: 'operator',
          modifiers: []
        });
        
        this.mainVisitor.visitNode(node.operand, context);
      } else if (node.left && node.right) {
        const operatorStart = node.left.location.end.column;
        
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: operatorStart,
          length: operatorText.length,
          tokenType: 'operator',
          modifiers: []
        });
        
        this.mainVisitor.visitNode(node.left, context);
        this.mainVisitor.visitNode(node.right, context);
      }
    }
  }
  
  private visitTernaryExpression(node: any, context: VisitorContext): void {
    if (node.condition) this.mainVisitor.visitNode(node.condition, context);
    
    if (node.questionLocation) {
      this.tokenBuilder.addToken({
        line: node.questionLocation.start.line - 1,
        char: node.questionLocation.start.column - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    if (node.trueBranch) this.mainVisitor.visitNode(node.trueBranch, context);
    
    if (node.colonLocation) {
      this.tokenBuilder.addToken({
        line: node.colonLocation.start.line - 1,
        char: node.colonLocation.start.column - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    if (node.falseBranch) this.mainVisitor.visitNode(node.falseBranch, context);
  }
  
  private visitWhenExpression(node: any, context: VisitorContext): void {
    if (node.keywordLocation) {
      this.tokenBuilder.addToken({
        line: node.keywordLocation.start.line - 1,
        char: node.keywordLocation.start.column - 1,
        length: 4,
        tokenType: 'keyword',
        modifiers: []
      });
    }
    
    this.visitChildren(node, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
  }
}