import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';

export class StructureVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'ObjectExpression' || 
           node.type === 'object' ||
           node.type === 'ArrayExpression' ||
           node.type === 'array' ||
           node.type === 'Property' ||
           node.type === 'MemberExpression';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    switch (node.type) {
      case 'ObjectExpression':
      case 'object':
        this.visitObjectExpression(node, context);
        break;
      case 'ArrayExpression':
      case 'array':
        this.visitArrayExpression(node, context);
        break;
      case 'Property':
        this.visitProperty(node, context);
        break;
      case 'MemberExpression':
        this.visitMemberExpression(node, context);
        break;
    }
  }
  
  private visitObjectExpression(node: any, context: VisitorContext): void {
    const text = this.getCachedText(
      { line: node.location.start.line - 1, character: node.location.start.column - 1 },
      { line: node.location.end.line - 1, character: node.location.end.column - 1 }
    );
    
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: 1,
      tokenType: 'operator',
      modifiers: []
    });
    
    if (node.properties && typeof node.properties === 'object') {
      for (const [key, value] of Object.entries(node.properties)) {
        if (typeof value === 'object' && value !== null && value.type) {
          this.mainVisitor.visitNode(value, context);
        } else if (typeof value === 'object' && value !== null && value.content) {
          if (value.wrapperType) {
            const newContext = {
              ...context,
              templateType: value.wrapperType as any,
              interpolationAllowed: value.wrapperType !== 'singleQuote',
              variableStyle: value.wrapperType === 'tripleColon' ? '{{var}}' as const : '@var' as const
            };
            
            if (Array.isArray(value.content)) {
              for (const contentNode of value.content) {
                this.mainVisitor.visitNode(contentNode, newContext);
              }
            }
          } else if (Array.isArray(value.content)) {
            for (const contentNode of value.content) {
              this.mainVisitor.visitNode(contentNode, context);
            }
          }
        }
      }
    }
    
    if (text.endsWith('}')) {
      this.tokenBuilder.addToken({
        line: node.location.end.line - 1,
        char: node.location.end.column - 2,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
  }
  
  private visitArrayExpression(node: any, context: VisitorContext): void {
    const text = this.getCachedText(
      { line: node.location.start.line - 1, character: node.location.start.column - 1 },
      { line: node.location.end.line - 1, character: node.location.end.column - 1 }
    );
    
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: 1,
      tokenType: 'operator',
      modifiers: []
    });
    
    if (node.items && Array.isArray(node.items)) {
      for (const item of node.items) {
        if (typeof item === 'object' && item !== null && item.type) {
          this.mainVisitor.visitNode(item, context);
        } else if (typeof item === 'object' && item !== null && item.content) {
          if (Array.isArray(item.content)) {
            for (const contentNode of item.content) {
              this.mainVisitor.visitNode(contentNode, context);
            }
          }
        }
      }
    }
    
    if (text.endsWith(']')) {
      this.tokenBuilder.addToken({
        line: node.location.end.line - 1,
        char: node.location.end.column - 2,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
  }
  
  private visitMemberExpression(node: any, context: VisitorContext): void {
    if (node.object) {
      this.mainVisitor.visitNode(node.object, context);
    }
    
    if (node.computed === false && node.property) {
      const objectEnd = node.object?.location?.end?.column || node.location.start.column;
      
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: objectEnd - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    if (node.property) {
      if (node.computed) {
        this.mainVisitor.visitNode(node.property, context);
      } else {
        if (node.property.location) {
          this.tokenBuilder.addToken({
            line: node.property.location.start.line - 1,
            char: node.property.location.start.column - 1,
            length: node.property.name?.length || node.property.identifier?.length || 0,
            tokenType: 'property',
            modifiers: []
          });
        }
      }
    }
  }
  
  private visitProperty(node: any, context: VisitorContext): void {
    if (node.key) {
      if (node.key.type === 'Literal' || node.key.type === 'StringLiteral') {
        this.mainVisitor.visitNode(node.key, context);
      } else if (node.key.location) {
        this.tokenBuilder.addToken({
          line: node.key.location.start.line - 1,
          char: node.key.location.start.column - 1,
          length: node.key.name?.length || node.key.identifier?.length || 0,
          tokenType: 'property',
          modifiers: []
        });
      }
    }
    
    if (node.colonLocation) {
      this.tokenBuilder.addToken({
        line: node.colonLocation.start.line - 1,
        char: node.colonLocation.start.column - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    if (node.value) {
      this.mainVisitor.visitNode(node.value, context);
    }
  }
}