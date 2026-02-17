import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { INodeVisitor } from '@services/lsp/visitors/base/VisitorInterface';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';

export class ForeachVisitor extends BaseVisitor {
  private mainVisitor: INodeVisitor;
  private operatorHelper: OperatorTokenHelper;

  constructor(document: TextDocument, tokenBuilder: TokenBuilder) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
  }

  setMainVisitor(visitor: INodeVisitor): void {
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
      if (typeof withClause === 'object' && withClause !== null) {
        // Manually tokenize the with clause object content
        const sourceText = this.document.getText();
        
        // Find opening brace after 'with'
        const openBraceOffset = this.operatorHelper.findOperatorNear(
          withOffset + 4, // After 'with'
          '{',
          20,
          'forward'
        );
        
        if (openBraceOffset !== null) {
          // Add opening brace token
          const openBracePos = this.document.positionAt(openBraceOffset);
          this.tokenBuilder.addToken({
            line: openBracePos.line,
            char: openBracePos.character,
            length: 1,
            tokenType: 'operator',
            modifiers: []
          });
          
          // Process each property in the with clause
          for (const [key, value] of Object.entries(withClause)) {
            // Find the property key in the source
            const keyPattern = new RegExp(`"?${key}"?\\s*:`);
            const searchStart = openBraceOffset + 1;
            const searchEnd = node.location?.end?.offset || searchStart + 100;
            const searchText = sourceText.substring(searchStart, searchEnd);
            const keyMatch = searchText.match(keyPattern);
            
            if (keyMatch && keyMatch.index !== undefined) {
              const keyOffset = searchStart + keyMatch.index;
              const keyPos = this.document.positionAt(keyOffset);
              
              // Tokenize the property name (with or without quotes)
              const hasQuotes = keyMatch[0].startsWith('"');
              this.tokenBuilder.addToken({
                line: keyPos.line,
                char: keyPos.character,
                length: hasQuotes ? key.length + 2 : key.length,
                tokenType: 'string',
                modifiers: []
              });
              
              // Find and tokenize the colon
              const colonOffset = keyOffset + (hasQuotes ? key.length + 2 : key.length);
              const colonSearchText = sourceText.substring(colonOffset, colonOffset + 5);
              const colonMatch = colonSearchText.match(/\s*:/);
              if (colonMatch && colonMatch.index !== undefined) {
                const actualColonOffset = colonOffset + colonMatch.index + colonMatch[0].indexOf(':');
                const colonPos = this.document.positionAt(actualColonOffset);
                this.tokenBuilder.addToken({
                  line: colonPos.line,
                  char: colonPos.character,
                  length: 1,
                  tokenType: 'operator',
                  modifiers: []
                });
                
                // Tokenize the value
                if (typeof value === 'string') {
                  // Find the string value with quotes
                  const valuePattern = new RegExp(`"${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
                  const valueSearchStart = actualColonOffset + 1;
                  const valueSearchText = sourceText.substring(valueSearchStart, searchEnd);
                  const valueMatch = valueSearchText.match(valuePattern);
                  
                  if (valueMatch && valueMatch.index !== undefined) {
                    const valueOffset = valueSearchStart + valueMatch.index;
                    const valuePos = this.document.positionAt(valueOffset);
                    this.tokenBuilder.addToken({
                      line: valuePos.line,
                      char: valuePos.character,
                      length: value.length + 2, // Including quotes
                      tokenType: 'string',
                      modifiers: []
                    });
                  }
                }
              }
            }
          }
          
          // Find and tokenize closing brace
          const closeBraceOffset = this.operatorHelper.findOperatorNear(
            openBraceOffset + 10, // After some content
            '}',
            100,
            'forward'
          );
          
          if (closeBraceOffset !== null) {
            const closeBracePos = this.document.positionAt(closeBraceOffset);
            this.tokenBuilder.addToken({
              line: closeBracePos.line,
              char: closeBracePos.character,
              length: 1,
              tokenType: 'operator',
              modifiers: []
            });
          }
        }
      }
    }
  }
}