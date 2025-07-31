/**
 * AST Semantic Visitor for mlld Language Server (Refactored)
 * 
 * This visitor traverses the mlld AST and generates semantic tokens
 * with proper context awareness for template types, interpolation rules,
 * and embedded languages.
 */

import { SemanticTokensBuilder, Position } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ContextStack, VisitorContext } from '@services/lsp/context/VisitorContext';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';
import { DirectiveVisitor } from '@services/lsp/visitors/DirectiveVisitor';
import { VariableVisitor } from '@services/lsp/visitors/VariableVisitor';
import { TemplateVisitor } from '@services/lsp/visitors/TemplateVisitor';
import { CommandVisitor } from '@services/lsp/visitors/CommandVisitor';
import { ExpressionVisitor } from '@services/lsp/visitors/ExpressionVisitor';
import { LiteralVisitor } from '@services/lsp/visitors/LiteralVisitor';
import { StructureVisitor } from '@services/lsp/visitors/StructureVisitor';
import { FileReferenceVisitor } from '@services/lsp/visitors/FileReferenceVisitor';
import { INodeVisitor } from '@services/lsp/visitors/base/VisitorInterface';

export class ASTSemanticVisitor {
  private contextStack: ContextStack;
  private tokenBuilder: TokenBuilder;
  private visitors: Map<string, INodeVisitor>;
  private textCache = new Map<string, string>();
  
  constructor(
    private document: TextDocument,
    builder: SemanticTokensBuilder,
    tokenTypes: string[],
    tokenModifiers: string[],
    tokenTypeMap?: Record<string, string>
  ) {
    this.contextStack = new ContextStack();
    this.tokenBuilder = new TokenBuilder(builder, tokenTypes, tokenModifiers, document, tokenTypeMap);
    this.visitors = new Map();
    
    this.initializeVisitors();
  }
  
  private initializeVisitors(): void {
    const directiveVisitor = new DirectiveVisitor(this.document, this.tokenBuilder);
    const variableVisitor = new VariableVisitor(this.document, this.tokenBuilder);
    const templateVisitor = new TemplateVisitor(this.document, this.tokenBuilder);
    const commandVisitor = new CommandVisitor(this.document, this.tokenBuilder);
    const expressionVisitor = new ExpressionVisitor(this.document, this.tokenBuilder);
    const literalVisitor = new LiteralVisitor(this.document, this.tokenBuilder);
    const structureVisitor = new StructureVisitor(this.document, this.tokenBuilder);
    const fileReferenceVisitor = new FileReferenceVisitor(this.document, this.tokenBuilder);
    
    directiveVisitor.setMainVisitor(this);
    variableVisitor.setMainVisitor(this);
    templateVisitor.setMainVisitor(this);
    commandVisitor.setMainVisitor(this);
    expressionVisitor.setMainVisitor(this);
    structureVisitor.setMainVisitor(this);
    fileReferenceVisitor.setMainVisitor(this);
    
    this.registerVisitor('Directive', directiveVisitor);
    this.registerVisitor('VariableReference', variableVisitor);
    this.registerVisitor('StringLiteral', templateVisitor);
    this.registerVisitor('Template', templateVisitor);
    this.registerVisitor('CommandBase', commandVisitor);
    this.registerVisitor('command', commandVisitor);
    this.registerVisitor('ExecInvocation', commandVisitor);
    this.registerVisitor('CommandReference', commandVisitor);
    this.registerVisitor('BinaryExpression', expressionVisitor);
    this.registerVisitor('UnaryExpression', expressionVisitor);
    this.registerVisitor('TernaryExpression', expressionVisitor);
    this.registerVisitor('WhenExpression', expressionVisitor);
    this.registerVisitor('Literal', literalVisitor);
    this.registerVisitor('ObjectExpression', structureVisitor);
    this.registerVisitor('object', structureVisitor);
    this.registerVisitor('ArrayExpression', structureVisitor);
    this.registerVisitor('array', structureVisitor);
    this.registerVisitor('Property', structureVisitor);
    this.registerVisitor('MemberExpression', structureVisitor);
    this.registerVisitor('FileReference', fileReferenceVisitor);
    this.registerVisitor('load-content', fileReferenceVisitor);
    this.registerVisitor('Comment', fileReferenceVisitor);
    this.registerVisitor('Parameter', fileReferenceVisitor);
    this.registerVisitor('Frontmatter', fileReferenceVisitor);
    this.registerVisitor('CodeFence', fileReferenceVisitor);
    this.registerVisitor('MlldRunBlock', fileReferenceVisitor);
  }
  
  private registerVisitor(nodeType: string, visitor: INodeVisitor): void {
    this.visitors.set(nodeType, visitor);
  }
  
  get currentContext(): VisitorContext {
    return this.contextStack.current;
  }
  
  pushContext(context: Partial<VisitorContext>): void {
    this.contextStack.push(context);
  }
  
  popContext(): void {
    this.contextStack.pop();
  }
  
  visitAST(ast: any[]): void {
    this.textCache.clear();
    
    if (process.env.DEBUG_LSP) {
      console.log('ASTSemanticVisitor: Processing AST with', ast.length, 'nodes');
    }
    
    for (const node of ast) {
      this.visitNode(node);
    }
  }
  
  visitNode(node: any, context?: VisitorContext): void {
    if (!node || !node.type) return;
    
    if (this.shouldSkipNode(node)) return;
    
    const actualContext = context || this.currentContext;
    
    if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('fails.mld') || this.document.uri.includes('test-syntax')) {
      console.log(`[VISITOR] Node: ${node.type}`, {
        location: node.location ? `${node.location.start.line}:${node.location.start.column}` : 'none',
        content: node.content || node.identifier || node.value || '?'
      });
    }
    
    if (!node.location && node.type !== 'Text' && node.type !== 'Newline' && process.env.DEBUG_LSP) {
      console.warn(`Node type ${node.type} missing location`);
    }
    
    const visitor = this.visitors.get(node.type);
    if (visitor) {
      visitor.visitNode(node, actualContext);
    } else {
      switch (node.type) {
        case 'Text':
          this.visitText(node, actualContext);
          break;
        case 'Newline':
          break;
        case 'Error':
          this.visitError(node);
          break;
        case 'Parameter':
          this.visitParameter(node, actualContext);
          break;
        default:
          console.warn(`Unknown node type: ${node.type}`);
          this.visitChildren(node, actualContext);
      }
    }
  }
  
  private shouldSkipNode(node: any): boolean {
    if (!node.type) return true;
    
    const skipTypes = ['Newline', 'Whitespace', 'EOF'];
    if (skipTypes.includes(node.type)) return true;
    
    if (node.error || node.isError) return false;
    
    if (node.type.startsWith('_') || node.type.startsWith('$')) return true;
    
    return false;
  }
  
  visitChildren(node: any, context?: VisitorContext): void {
    const actualContext = context || this.currentContext;
    const childProps = ['values', 'children', 'body', 'content', 'nodes', 'elements'];
    
    for (const prop of childProps) {
      if (node[prop]) {
        if (Array.isArray(node[prop])) {
          for (const child of node[prop]) {
            this.visitNode(child, actualContext);
          }
        } else if (typeof node[prop] === 'object') {
          this.visitNode(node[prop], actualContext);
        }
      }
    }
  }
  
  visitText(node: any, context: VisitorContext): void {
    if (!node.location || !node.content) return;
    
    // In command context, check if this is a quoted string or a string argument
    if (context.inCommand) {
      if (node.content.startsWith('"') && node.content.endsWith('"')) {
        // String already has quotes
        this.tokenBuilder.addToken({
          line: node.location.start.line - 1,
          char: node.location.start.column - 1,
          length: node.content.length,
          tokenType: 'string',
          modifiers: []
        });
      } else if (!node.content.includes(' ') && !node.content.startsWith('-')) {
        // String argument without quotes in AST - likely a function argument
        // Use the document text to get the actual source with quotes
        const source = this.document?.getText() || '';
        const lineStart = source.split('\n').slice(0, node.location.start.line - 1).join('\n').length + (node.location.start.line > 1 ? 1 : 0);
        const charStart = lineStart + node.location.start.column - 1;
        
        // Check if there's a quote before the content
        if (charStart > 0 && source[charStart - 1] === '"') {
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: node.location.start.column - 2, // Include opening quote
            length: node.content.length + 2, // Include both quotes
            tokenType: 'string',
            modifiers: []
          });
        } else {
          // Just tokenize the content as is
          this.tokenBuilder.addToken({
            line: node.location.start.line - 1,
            char: node.location.start.column - 1,
            length: node.content.length,
            tokenType: 'string',
            modifiers: []
          });
        }
      }
    } else if (context.templateType) {
      // In template context, add as template content or string
      const tokenType = context.templateType === 'string' ? 'string' : 'templateContent';
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: node.location.start.column - 1,
        length: node.content.length,
        tokenType: tokenType,
        modifiers: []
      });
    }
    
    if (context.interpolationAllowed) {
      this.visitChildren(node, context);
    }
  }
  
  visitError(node: any): void {
    if (!node.location) {
      if (this.tryInferLocation(node)) {
      } else {
        return;
      }
    }
    
    const errorType = this.getErrorTokenType(node);
    
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.content?.length || node.text?.length || 1,
      tokenType: errorType,
      modifiers: ['invalid']
    });
    
    if (node.partialContent || node.children) {
      this.visitChildren(node);
    }
  }
  
  private tryInferLocation(node: any): boolean {
    if (node.parent?.location) {
      node.location = node.parent.location;
      return true;
    }
    
    if (node.previousSibling?.location && node.nextSibling?.location) {
      node.location = {
        start: node.previousSibling.location.end,
        end: node.nextSibling.location.start
      };
      return true;
    }
    
    return false;
  }
  
  private getErrorTokenType(node: any): string {
    if (node.expectedType) {
      switch (node.expectedType) {
        case 'directive': return 'directive';
        case 'variable': return 'variable';
        case 'string': return 'string';
        case 'number': return 'number';
        default: return 'variable';
      }
    }
    
    if (node.content || node.text) {
      const text = node.content || node.text;
      if (text.startsWith('/')) return 'directive';
      if (text.startsWith('@')) return 'variable';
      if (text.match(/^[\"']|^`|^::|^:::/)) return 'string';
      if (text.match(/^\\d/)) return 'number';
    }
    
    return 'variable';
  }
  
  visitParameter(node: any, context: VisitorContext): void {
    if (!node.location || !node.name) return;
    
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: node.name.length,
      tokenType: 'parameter',
      modifiers: []
    });
  }
}