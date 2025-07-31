import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';

export class CommandVisitor extends BaseVisitor {
  private mainVisitor: any;
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'CommandBase' || 
           node.type === 'command' || 
           node.type === 'ExecInvocation' ||
           node.type === 'CommandReference';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    if (!node.location) return;
    
    switch (node.type) {
      case 'ExecInvocation':
        this.visitExecInvocation(node, context);
        break;
      case 'CommandReference':
        this.visitCommandReference(node, context);
        break;
      default:
        this.visitCommand(node, context);
    }
  }
  
  private visitCommand(node: any, context: VisitorContext): void {
    if (node.language) {
      if (node.languageLocation) {
        this.tokenBuilder.addToken({
          line: node.languageLocation.start.line - 1,
          char: node.languageLocation.start.column - 1,
          length: node.language.length,
          tokenType: 'embedded',
          modifiers: []
        });
      }
      
      if (node.codeLocation) {
        const newContext = {
          ...context,
          interpolationAllowed: false,
          commandLanguage: node.language
        };
        
        this.tokenBuilder.addToken({
          line: node.codeLocation.start.line - 1,
          char: node.codeLocation.start.column - 1,
          length: node.code?.length || 0,
          tokenType: 'embeddedCode',
          modifiers: []
        });
      }
    } else {
      const newContext = {
        ...context,
        inCommand: true,
        interpolationAllowed: true,
        variableStyle: '@var' as const
      };
      
      if (node.content && Array.isArray(node.content)) {
        for (const part of node.content) {
          this.mainVisitor.visitNode(part, newContext);
        }
      } else if (node.values && Array.isArray(node.values)) {
        for (const value of node.values) {
          this.mainVisitor.visitNode(value, newContext);
        }
      } else {
        this.visitChildren(node, newContext, (child, ctx) => this.mainVisitor.visitNode(child, ctx));
      }
    }
  }
  
  private visitExecInvocation(node: any, context: VisitorContext): void {
    if (node.commandRef && node.commandRef.name) {
      const name = node.commandRef.name;
      const charPos = node.location.start.column - 1;
      
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: charPos,
        length: name.length + 1,
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
      
      if (node.commandRef.args && Array.isArray(node.commandRef.args)) {
        const newContext = {
          ...context,
          inCommand: true,
          interpolationAllowed: true,
          variableStyle: '@var' as const
        };
        
        for (const arg of node.commandRef.args) {
          this.mainVisitor.visitNode(arg, newContext);
        }
      }
    }
  }
  
  private visitCommandReference(node: any, context: VisitorContext): void {
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.name?.length || 0,
      tokenType: 'variableRef',
      modifiers: ['reference']
    });
  }
}