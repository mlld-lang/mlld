import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';

export class TemplateVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'Template' || node.type === 'StringLiteral';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    if (node.type === 'StringLiteral') {
      this.visitStringLiteral(node, context);
    } else {
      this.visitTemplate(node, context);
    }
  }
  
  private visitStringLiteral(node: any, context: VisitorContext): void {
    const text = this.getCachedText(
      { line: node.location.start.line - 1, character: node.location.start.column - 1 },
      { line: node.location.end.line - 1, character: node.location.end.column }
    );
    
    const isSingleQuoted = text.startsWith("'") && text.endsWith("'");
    
    if (isSingleQuoted) {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'string',
        modifiers: ['literal']
      });
    } else {
      const newContext = {
        ...context,
        interpolationAllowed: true,
        variableStyle: '@var' as const
      };
      
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'string',
        modifiers: []
      });
      
      this.visitChildren(node, newContext, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
    }
  }
  
  private visitTemplate(node: any, context: VisitorContext): void {
    let templateType: 'backtick' | 'doubleColon' | 'tripleColon' | null = null;
    let variableStyle: '@var' | '{{var}}' = '@var';
    let delimiterLength = 1;
    
    if (node.delimiter) {
      switch (node.delimiter) {
        case '`':
          templateType = 'backtick';
          delimiterLength = 1;
          break;
        case '::':
          templateType = 'doubleColon';
          delimiterLength = 2;
          break;
        case ':::':
          templateType = 'tripleColon';
          variableStyle = '{{var}}';
          delimiterLength = 3;
          break;
      }
    } else if (node.templateType) {
      templateType = node.templateType;
      delimiterLength = templateType === 'tripleColon' ? 3 : (templateType === 'doubleColon' ? 2 : 1);
      if (templateType === 'tripleColon') {
        variableStyle = '{{var}}';
      }
    }
    
    if (templateType) {
      if (node.openDelimiterLocation) {
        this.tokenBuilder.addToken({
          line: node.openDelimiterLocation.start.line - 1,
          char: node.openDelimiterLocation.start.column - 1,
          length: delimiterLength,
          tokenType: 'template',
          modifiers: []
        });
      }
      
      if (node.closeDelimiterLocation) {
        this.tokenBuilder.addToken({
          line: node.closeDelimiterLocation.start.line - 1,
          char: node.closeDelimiterLocation.start.column - 1,
          length: delimiterLength,
          tokenType: 'template',
          modifiers: []
        });
      }
      
      const newContext = {
        ...context,
        templateType,
        interpolationAllowed: true,
        variableStyle
      };
      
      this.visitChildren(node, newContext, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
    }
  }
}