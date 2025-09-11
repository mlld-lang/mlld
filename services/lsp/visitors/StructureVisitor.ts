import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';
import { embeddedLanguageService } from '@services/lsp/embedded/EmbeddedLanguageService';

export class StructureVisitor extends BaseVisitor {
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
    const sourceText = this.document.getText();
    const objectText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    
    if (node.properties && typeof node.properties === 'object') {
      // Check if this is a plain object (all values are primitives) or has mlld constructs
      const hasASTNodes = Object.values(node.properties).some(value => 
        typeof value === 'object' && value !== null && value.type
      );
      
      if (!hasASTNodes) {
        // Plain object - let embedded service handle all tokens including braces
        this.tokenizePlainObject(node, objectText);
        return; // Don't add braces manually
      } else {
        // Add opening brace for objects with mlld constructs
        this.operatorHelper.addOperatorToken(node.location.start.offset, 1);
        // Object with mlld constructs - process AST nodes
        let lastPropertyEndOffset = node.location.start.offset + 1; // After '{'
        
        for (const [key, value] of Object.entries(node.properties)) {
          // Find and tokenize the property key
          const keyPattern = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`);
          const keyMatch = objectText.match(keyPattern);
          if (keyMatch && keyMatch.index !== undefined) {
            const keyPosition = this.document.positionAt(node.location.start.offset + keyMatch.index);
            this.tokenBuilder.addToken({
              line: keyPosition.line,
              char: keyPosition.character,
              length: key.length + 2, // Include quotes
              tokenType: 'string',
              modifiers: []
            });
            
            // Find and tokenize the colon
            const colonIndex = objectText.indexOf(':', keyMatch.index + keyMatch[0].length);
            if (colonIndex !== -1) {
              this.operatorHelper.addOperatorToken(node.location.start.offset + colonIndex, 1);
            }
          }
          
          // Process the value
          if (typeof value === 'object' && value !== null) {
            if (value.type) {
              // Special-case: inline run inside object (e.g., "dynamic": run "echo test")
              if (value.type === 'command' && (value.hasRunKeyword || value.hasRun)) {
                const colonIndex = objectText.indexOf(':', keyMatch?.index !== undefined ? keyMatch.index + (keyMatch[0]?.length || 0) : 0);
                if (colonIndex !== -1) {
                  const absAfterColon = node.location.start.offset + colonIndex + 1;
                  const scannedLen = this.scanAndTokenizePrimitive(objectText, colonIndex + 1, node.location.start.offset);
                  if (scannedLen > 0) {
                    lastPropertyEndOffset = absAfterColon + scannedLen;
                    continue; // Skip normal visit for this value to avoid duplicate tokens
                  }
                }
              }
              // Regular AST node
              this.mainVisitor.visitNode(value, context);
              if (value.location) {
                lastPropertyEndOffset = value.location.end.offset;
              }
            } else if (value.content && Array.isArray(value.content) && value.wrapperType) {
              // Template value with content array
              for (const contentNode of value.content) {
                if (contentNode.type) {
                  this.mainVisitor.visitNode(contentNode, context);
                }
              }
              // Update last offset based on last content node
              const lastContent = value.content[value.content.length - 1];
              if (lastContent?.location) {
                lastPropertyEndOffset = lastContent.location.end.offset;
              }
            } else {
              // Non-AST object value (unlikely). Fall back to textual scan below
              const colonIndex = objectText.indexOf(':', keyMatch?.index !== undefined ? keyMatch.index + (keyMatch[0]?.length || 0) : 0);
              if (colonIndex !== -1) {
                const absAfterColon = node.location.start.offset + colonIndex + 1;
                const scannedLen = this.scanAndTokenizePrimitive(objectText, colonIndex + 1, node.location.start.offset);
                if (scannedLen > 0) {
                  lastPropertyEndOffset = absAfterColon + scannedLen;
                }
              }
            }
          } else {
            // Primitive value (string/number/boolean/null) – scan text to tokenize
            const colonIndex = objectText.indexOf(':', keyMatch?.index !== undefined ? keyMatch.index + (keyMatch[0]?.length || 0) : 0);
            if (colonIndex !== -1) {
              const absAfterColon = node.location.start.offset + colonIndex + 1;
              const scannedLen = this.scanAndTokenizePrimitive(objectText, colonIndex + 1, node.location.start.offset);
              if (scannedLen > 0) {
                lastPropertyEndOffset = absAfterColon + scannedLen;
              }
            }
          }
          
          // Find and tokenize comma if not the last property
          const entries = Object.entries(node.properties);
          const currentIndex = entries.findIndex(([k]) => k === key);
          if (currentIndex < entries.length - 1) {
            // Use helper to find and tokenize comma
            this.operatorHelper.tokenizeOperatorBetween(
              lastPropertyEndOffset,
              node.location.end.offset,
              ','
            );
          }
        }
      }
    }
    
    // Add closing brace
    this.operatorHelper.addOperatorToken(node.location.end.offset - 1, 1);
  }

  // Scan from a relative index after ':' and emit a primitive token found.
  // Returns the length of the scanned token (in characters) or 0 if none.
  private scanAndTokenizePrimitive(containerText: string, relStart: number, baseOffset: number): number {
    // Skip whitespace
    let i = relStart;
    while (i < containerText.length && /\s/.test(containerText[i])) i++;
    if (i >= containerText.length) return 0;

    // Detect inline 'run' keyword and a quoted argument
    const runMatch = containerText.substring(i).match(/^run\b/);
    if (runMatch) {
      // 'run'
      let consumed = runMatch[0].length;
      const runPos = this.document.positionAt(baseOffset + i);
      this.tokenBuilder.addToken({ line: runPos.line, char: runPos.character, length: consumed, tokenType: 'keyword', modifiers: [] });
      // Skip whitespace after run
      let j = i + consumed;
      while (j < containerText.length && /\s/.test(containerText[j])) j++;
      // Quoted string after run
      if (containerText[j] === '"') {
        let k = j + 1;
        while (k < containerText.length) {
          if (containerText[k] === '"' && containerText[k - 1] !== '\\') break;
          k++;
        }
        const len = (k < containerText.length ? k - j + 1 : 1);
        const strPos = this.document.positionAt(baseOffset + j);
        this.tokenBuilder.addToken({ line: strPos.line, char: strPos.character, length: len, tokenType: 'string', modifiers: [] });
        consumed += (j - (i + runMatch[0].length)) + len;
      }
      return (i - relStart) + consumed;
    }
    const ch = containerText[i];
    // String literal
    if (ch === '"') {
      let j = i + 1;
      while (j < containerText.length) {
        if (containerText[j] === '"' && containerText[j - 1] !== '\\') break;
        j++;
      }
      const length = (j < containerText.length ? j - i + 1 : 1);
      const pos = this.document.positionAt(baseOffset + i);
      this.tokenBuilder.addToken({ line: pos.line, char: pos.character, length, tokenType: 'string', modifiers: [] });
      return length + (i - relStart);
    }
    // Boolean/null
    const kwMatch = containerText.substring(i).match(/^(true|false|null)/);
    if (kwMatch) {
      const pos = this.document.positionAt(baseOffset + i);
      this.tokenBuilder.addToken({ line: pos.line, char: pos.character, length: kwMatch[0].length, tokenType: 'keyword', modifiers: [] });
      return (i - relStart) + kwMatch[0].length;
    }
    // Number
    const numMatch = containerText.substring(i).match(/^-?\d+(?:\.\d+)?/);
    if (numMatch) {
      const pos = this.document.positionAt(baseOffset + i);
      this.tokenBuilder.addToken({ line: pos.line, char: pos.character, length: numMatch[0].length, tokenType: 'number', modifiers: [] });
      return (i - relStart) + numMatch[0].length;
    }
    return 0;
  }
  
  private tokenizePlainObject(node: any, objectText: string): void {
    // Always use embedded language service for JSON tokenization
    embeddedLanguageService.ensureInitialized();
    
    const startPos = this.document.positionAt(node.location.start.offset);
    const tokens = embeddedLanguageService.generateTokens(
      objectText, 
      'javascript', // JavaScript parser handles JSON
      startPos.line,
      startPos.character
    );
    
    // Add the tokens from the embedded service
    for (const token of tokens) {
      this.tokenBuilder.addToken(token);
    }
  }
  
  private visitArrayExpression(node: any, context: VisitorContext): void {
    const sourceText = this.document.getText();
    const arrayText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    
    if (node.items && Array.isArray(node.items)) {
      // Check if this is a plain array (all values are primitives) or has mlld constructs
      const hasASTNodes = node.items.some((item: any) => 
        typeof item === 'object' && item !== null && item.type
      );
      
      if (process.env.DEBUG_LSP === 'true' || this.document.uri.includes('test-syntax')) {
        console.log('[ARRAY]', {
          hasASTNodes,
          items: node.items,
          arrayText
        });
      }
      
      if (!hasASTNodes) {
        // Plain array - let embedded service handle all tokens including brackets
        this.tokenizePlainArray(node, arrayText);
        return; // Don't add brackets manually
      } else {
        // Add opening bracket for arrays with mlld constructs
        this.operatorHelper.addOperatorToken(node.location.start.offset, 1);
        // Array with mlld constructs - process AST nodes
        let lastItemEndOffset = node.location.start.offset + 1; // After '['
        
        for (let i = 0; i < node.items.length; i++) {
          const item = node.items[i];
          
          // Process the item if it's an AST node
          if (typeof item === 'object' && item !== null && item.type) {
            this.mainVisitor.visitNode(item, context);
            if (item.location) {
              lastItemEndOffset = item.location.end.offset;
            }
          }
          
          // Find and tokenize comma if not the last item
          if (i < node.items.length - 1) {
            // Use helper to tokenize comma between items
            const nextItemStart = (i + 1 < node.items.length && node.items[i + 1]?.location) 
              ? node.items[i + 1].location.start.offset 
              : node.location.end.offset;
            this.operatorHelper.tokenizeOperatorBetween(
              lastItemEndOffset,
              nextItemStart,
              ','
            );
          }
        }
      }
    }
    
    // Add closing bracket
    this.operatorHelper.addOperatorToken(node.location.end.offset - 1, 1);
  }
  
  private tokenizePlainArray(node: any, arrayText: string): void {
    // Always use embedded language service for JSON tokenization
    embeddedLanguageService.ensureInitialized();
    
    const startPos = this.document.positionAt(node.location.start.offset);
    const tokens = embeddedLanguageService.generateTokens(
      arrayText, 
      'javascript', // JavaScript parser handles JSON arrays
      startPos.line,
      startPos.character
    );
    
    // Add the tokens from the embedded service
    for (const token of tokens) {
      this.tokenBuilder.addToken(token);
    }
  }
  
  private visitMemberExpression(node: any, context: VisitorContext): void {
    if (node.object) {
      this.mainVisitor.visitNode(node.object, context);
    }
    
    if (node.computed === false && node.property && node.object?.location) {
      // Use helper to tokenize dot operator
      this.operatorHelper.tokenizeOperatorBetween(
        node.object.location.end.offset,
        node.property.location?.start?.offset || node.location.end.offset,
        '.'
      );
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
      this.operatorHelper.addOperatorToken(node.colonLocation.start.offset, 1);
    }
    
    if (node.value) {
      this.mainVisitor.visitNode(node.value, context);
    }
  }
}
