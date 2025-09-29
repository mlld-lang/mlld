import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';

export class TemplateVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'Template' ||
           node.type === 'StringLiteral' ||
           node.type === 'TemplateForBlock' ||
           node.type === 'TemplateInlineShow';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;

    if (node.type === 'TemplateForBlock') {
      this.visitTemplateForBlock(node, context);
      return;
    }

    if (node.type === 'TemplateInlineShow') {
      this.visitTemplateInlineShow(node, context);
      return;
    }

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

  private visitTemplateForBlock(node: any, context: VisitorContext): void {
    // Heuristic tokenization: highlight 'for' and 'end' markers inside the block span
    const src = this.document.getText();
    const text = src.substring(node.location.start.offset, node.location.end.offset);
    // Match slash-style and mustache-style
    const forRegexes = [/\/(for)\b/, /\{\{\s*(for)\b/];
    const endRegexes = [/\/(end)\b/, /\{\{\s*(end)\s*\}\}/];

    for (const re of forRegexes) {
      const m = text.match(re);
      if (m && m.index !== undefined && m[1]) {
        const abs = node.location.start.offset + m.index + (m[0].length - m[1].length);
        const pos = this.document.positionAt(abs);
        this.tokenBuilder.addToken({ line: pos.line, char: pos.character, length: m[1].length, tokenType: 'keyword', modifiers: [] });
        break;
      }
    }
    for (const re of endRegexes) {
      const m = text.match(re);
      if (m && m.index !== undefined && m[1]) {
        const abs = node.location.start.offset + m.index + (m[0].length - m[1].length);
        const pos = this.document.positionAt(abs);
        this.tokenBuilder.addToken({ line: pos.line, char: pos.character, length: m[1].length, tokenType: 'keyword', modifiers: [] });
        break;
      }
    }

    // Visit block body for nested nodes
    if (Array.isArray(node.body)) {
      for (const child of node.body) {
        this.mainVisitor.visitNode(child, context);
      }
    }
  }

  private visitTemplateInlineShow(node: any, context: VisitorContext): void {
    // Highlight '/show' or '{{show}}' marker at start of node
    const src = this.document.getText();
    const text = src.substring(node.location.start.offset, node.location.end.offset);
    const re = /(\/show)\b|\{\{\s*show\b/;
    const m = text.match(re);
    if (m && m.index !== undefined) {
      const len = m[1] ? m[1].length : 4; // '/show' or 'show'
      const offsetAdjust = m[1] ? 0 : (m[0].indexOf('show'));
      const abs = node.location.start.offset + m.index + offsetAdjust;
      const pos = this.document.positionAt(abs);
      this.tokenBuilder.addToken({ line: pos.line, char: pos.character, length: len, tokenType: 'directive', modifiers: [] });
    }

    // Visit children within inline show payloads
    this.visitChildren(node, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
  }
}
