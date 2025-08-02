import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';

export class ForeachVisitor extends BaseVisitor {
  private mainVisitor: any;
  private operatorHelper: OperatorTokenHelper;
  
  constructor(document: any, tokenBuilder: any) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
  }
  
  setMainVisitor(visitor: any): void {
    this.mainVisitor = visitor;
  }
  
  canHandle(node: any): boolean {
    return node.type === 'foreach' || node.type === 'foreach-command';
  }
  
  visitNode(node: any, context: VisitorContext): void {
    // Foreach nodes may not have location info, but their execInvocation does
    // We need to find the 'foreach' keyword in the source text
    
    let startOffset: number;
    
    if (node.execInvocation?.location) {
      // The exec invocation starts after 'foreach '
      // So we search backwards from that position
      startOffset = node.execInvocation.location.start.offset;
      
      // Search for 'foreach' before the exec invocation
      const sourceText = this.document.getText();
      const searchStart = Math.max(0, startOffset - 20);
      const searchText = sourceText.substring(searchStart, startOffset);
      const foreachIndex = searchText.lastIndexOf('foreach');
      
      if (foreachIndex !== -1) {
        const foreachOffset = searchStart + foreachIndex;
        const foreachPosition = this.document.positionAt(foreachOffset);
        this.tokenBuilder.addToken({
          line: foreachPosition.line,
          char: foreachPosition.character,
          length: 7, // 'foreach' is 7 characters
          tokenType: 'keyword',
          modifiers: []
        });
        
        this.debugLog('Tokenized foreach keyword', {
          offset: foreachOffset,
          position: foreachPosition
        });
      }
    }
    
    // Handle exec invocation - let CommandVisitor handle the details
    if (node.execInvocation) {
      this.mainVisitor.visitNode(node.execInvocation, context);
    }
    
    // Handle with clause if present
    if (node.withClause || node.with) {
      const withClause = node.withClause || node.with;
      // Find and tokenize 'with' keyword
      const withOffset = this.operatorHelper.findOperatorNear(
        node.execInvocation?.location?.end?.offset || node.location.start.offset + 7,
        'with',
        50,
        'forward'
      );
      if (withOffset !== null) {
        const withPosition = this.document.positionAt(withOffset);
        this.tokenBuilder.addToken({
          line: withPosition.line,
          char: withPosition.character,
          length: 4, // 'with'
          tokenType: 'keyword',
          modifiers: []
        });
      }
      
      // Process with clause options
      if (typeof withClause === 'object') {
        // Handle separator and template options
        // These would be tokenized by other visitors
      }
    }
  }
}