import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver/node';
import { INodeVisitor } from '@services/lsp/visitors/base/VisitorInterface';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';
import { LocationHelpers } from '@services/lsp/utils/LocationHelpers';
import { TextExtractor } from '@services/lsp/utils/TextExtractor';
import { BaseMlldNode } from '@core/types';

export abstract class BaseVisitor implements INodeVisitor {
  protected textCache = new Map<string, string>();
  
  constructor(
    protected document: TextDocument,
    protected tokenBuilder: TokenBuilder
  ) {}
  
  abstract canHandle(node: BaseMlldNode): boolean;
  abstract visitNode(node: BaseMlldNode, context: VisitorContext): void;
  
  protected getCachedText(start: Position, end: Position): string {
    const key = `${start.line}:${start.character}-${end.line}:${end.character}`;
    if (!this.textCache.has(key)) {
      this.textCache.set(key, this.document.getText({ start, end }));
    }
    return this.textCache.get(key)!;
  }
  
  protected visitChildren(node: BaseMlldNode & Record<string, unknown>, context: VisitorContext, childVisitor: (child: BaseMlldNode, mx: VisitorContext) => void): void {
    const childProps = ['values', 'children', 'body', 'content', 'nodes', 'elements'];
    
    for (const prop of childProps) {
      if (node[prop]) {
        if (Array.isArray(node[prop])) {
          for (const child of node[prop]) {
            childVisitor(child, context);
          }
        } else if (typeof node[prop] === 'object') {
          childVisitor(node[prop], context);
        }
      }
    }
  }
  
  protected shouldSkipNode(node: BaseMlldNode & Record<string, unknown>): boolean {
    if (!node.type) return true;
    
    const skipTypes = ['Newline', 'Whitespace', 'EOF'];
    if (skipTypes.includes(node.type)) return true;
    
    if (node.error || node.isError) return false;
    
    if (node.type.startsWith('_') || node.type.startsWith('$')) return true;
    
    return false;
  }
  
  protected debugLog(message: string, data?: unknown): void {
    if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('fails.mld')) {
      console.log(`[${this.constructor.name}] ${message}`, data || '');
    }
  }
}