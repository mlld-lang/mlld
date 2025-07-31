import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { TextExtractor } from '@services/lsp/utils/TextExtractor';

export class FileReferenceVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'FileReference' || 
           node.type === 'load-content' ||
           node.type === 'Comment' ||
           node.type === 'Parameter' ||
           node.type === 'Frontmatter' ||
           node.type === 'CodeFence' ||
           node.type === 'MlldRunBlock';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    switch (node.type) {
      case 'FileReference':
        this.visitFileReference(node, context);
        break;
      case 'load-content':
        this.visitLoadContent(node, context);
        break;
      case 'Comment':
        this.visitComment(node);
        break;
      case 'Parameter':
        this.visitParameter(node);
        break;
      case 'Frontmatter':
        this.visitFrontmatter(node, context);
        break;
      case 'CodeFence':
      case 'MlldRunBlock':
        this.visitCodeFence(node);
        break;
    }
  }
  
  private visitFileReference(node: any, context: VisitorContext): void {
    const text = TextExtractor.extract([node]);
    
    if (context.templateType === 'tripleColon') {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'xmlTag',
        modifiers: []
      });
    } else {
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: text.length,
        tokenType: 'alligator',
        modifiers: []
      });
      
      if (node.section && node.sectionLocation) {
        this.tokenBuilder.addToken({
          line: node.sectionLocation.start.line - 1,
          char: node.sectionLocation.start.column - 1,
          length: node.section.length,
          tokenType: 'section',
          modifiers: []
        });
      }
    }
  }
  
  private visitLoadContent(node: any, context: VisitorContext): void {
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.location.end.column - node.location.start.column,
      tokenType: 'alligator',
      modifiers: []
    });
    
    if (node.options?.section?.identifier) {
      const sectionNode = node.options.section.identifier;
      if (sectionNode.location) {
        this.tokenBuilder.addToken({
          line: sectionNode.location.start.line - 1,
          char: sectionNode.location.start.column - 1,
          length: sectionNode.location.end.column - sectionNode.location.start.column,
          tokenType: 'section',
          modifiers: []
        });
      }
    }
  }
  
  private visitComment(node: any): void {
    // Use the full location span to include the >> or << marker
    const length = node.location.end.column - node.location.start.column;
    
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: length,
      tokenType: 'comment',
      modifiers: []
    });
  }
  
  private visitParameter(node: any): void {
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.name?.length || TextExtractor.extract([node]).length,
      tokenType: 'parameter',
      modifiers: []
    });
  }
  
  private visitFrontmatter(node: any, context: VisitorContext): void {
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: 3,
      tokenType: 'comment',
      modifiers: []
    });
    
    this.visitChildren(node, context, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
    
    if (node.closeLocation) {
      this.tokenBuilder.addToken({
        line: node.closeLocation.start.line - 1,
        char: node.closeLocation.start.column - 1,
        length: 3,
        tokenType: 'comment',
        modifiers: []
      });
    }
  }
  
  private visitCodeFence(node: any): void {
    if (node.language && node.languageLocation) {
      this.tokenBuilder.addToken({
        line: node.languageLocation.start.line - 1,
        char: node.languageLocation.start.column - 1,
        length: node.language.length,
        tokenType: 'embedded',
        modifiers: []
      });
    }
    
    if (node.codeLocation && node.language) {
      this.tokenBuilder.addToken({
        line: node.codeLocation.start.line - 1,
        char: node.codeLocation.start.column - 1,
        length: node.code?.length || 0,
        tokenType: 'embeddedCode',
        modifiers: [],
        data: { language: node.language }
      });
    }
  }
}