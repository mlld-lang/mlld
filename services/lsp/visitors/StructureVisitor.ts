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
    
    // Add opening brace
    this.operatorHelper.addOperatorToken(node.location.start.offset, 1);
    
    if (node.properties && typeof node.properties === 'object') {
      // Check if this is a plain object (all values are primitives) or has mlld constructs
      const hasASTNodes = Object.values(node.properties).some(value => 
        typeof value === 'object' && value !== null && value.type
      );
      
      if (!hasASTNodes) {
        // Plain object - need to manually parse and tokenize
        this.tokenizePlainObject(node, objectText);
      } else {
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
  
  private tokenizePlainObject(node: any, objectText: string): void {
    // Try to use embedded language service for JSON tokenization
    if (embeddedLanguageService.ensureInitialized()) {
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
      
      // The embedded service handles all tokens including delimiters
      return;
    }
    
    // Fallback to regex-based tokenization if embedded service not ready
    // This regex matches property patterns like "key": value
    const propertyRegex = /"([^"]+)":\s*(?:"([^"]*)"|(true|false|null|\d+(?:\.\d+)?))/g;
    let match;
    let lastMatchEnd = 1; // After '{'
    
    while ((match = propertyRegex.exec(objectText)) !== null) {
      const keyStart = match.index;
      const keyWithQuotes = match[0].substring(0, match[0].indexOf(':'));
      const colonIndex = match[0].indexOf(':');
      const valueStart = match[0].indexOf(':', colonIndex) + 1;
      
      // Token for property key (with quotes)
      const keyPosition = this.document.positionAt(node.location.start.offset + keyStart);
      this.tokenBuilder.addToken({
        line: keyPosition.line,
        char: keyPosition.character,
        length: keyWithQuotes.length,
        tokenType: 'string',
        modifiers: []
      });
      
      // Token for colon
      this.operatorHelper.addOperatorToken(node.location.start.offset + keyStart + colonIndex, 1);
      
      // Token for value
      const value = match[2] !== undefined ? `"${match[2]}"` : match[3];
      const valuePosition = this.document.positionAt(node.location.start.offset + match.index + match[0].indexOf(value));
      
      if (match[2] !== undefined) {
        // String value
        this.tokenBuilder.addToken({
          line: valuePosition.line,
          char: valuePosition.character,
          length: value.length,
          tokenType: 'string',
          modifiers: []
        });
      } else if (match[3] === 'true' || match[3] === 'false') {
        // Boolean
        this.tokenBuilder.addToken({
          line: valuePosition.line,
          char: valuePosition.character,
          length: match[3].length,
          tokenType: 'boolean',
          modifiers: []
        });
      } else if (match[3] === 'null') {
        // Null
        this.tokenBuilder.addToken({
          line: valuePosition.line,
          char: valuePosition.character,
          length: 4,
          tokenType: 'null',
          modifiers: []
        });
      } else {
        // Number
        this.tokenBuilder.addToken({
          line: valuePosition.line,
          char: valuePosition.character,
          length: match[3].length,
          tokenType: 'number',
          modifiers: []
        });
      }
      
      // Look for comma after this property
      const afterValue = match.index + match[0].length;
      const commaIndex = objectText.indexOf(',', afterValue);
      const nextPropertyIndex = objectText.indexOf('"', afterValue);
      
      // Only add comma if it comes before the next property or closing brace
      if (commaIndex !== -1 && (nextPropertyIndex === -1 || commaIndex < nextPropertyIndex)) {
        this.operatorHelper.addOperatorToken(node.location.start.offset + commaIndex, 1);
      }
      
      lastMatchEnd = afterValue;
    }
  }
  
  private visitArrayExpression(node: any, context: VisitorContext): void {
    const sourceText = this.document.getText();
    const arrayText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    
    // Add opening bracket
    this.operatorHelper.addOperatorToken(node.location.start.offset, 1);
    
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
        // Plain array - need to manually parse and tokenize
        this.tokenizePlainArray(node, arrayText);
      } else {
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
    // Try to use embedded language service for JSON tokenization
    if (embeddedLanguageService.ensureInitialized()) {
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
      
      // The embedded service handles all tokens including delimiters
      return;
    }
    
    // Fallback to regex-based tokenization if embedded service not ready
    // This regex matches array items like strings, numbers, booleans, null
    const itemRegex = /(?:"([^"]*)"|(true|false|null|\d+(?:\.\d+)?))/g;
    let match;
    let lastMatchEnd = 1; // After '['
    
    while ((match = itemRegex.exec(arrayText)) !== null) {
      const itemStart = match.index;
      const value = match[1] !== undefined ? `"${match[1]}"` : match[2];
      const valuePosition = this.document.positionAt(node.location.start.offset + itemStart);
      
      if (match[1] !== undefined) {
        // String value
        this.tokenBuilder.addToken({
          line: valuePosition.line,
          char: valuePosition.character,
          length: value.length,
          tokenType: 'string',
          modifiers: []
        });
      } else if (match[2] === 'true' || match[2] === 'false') {
        // Boolean
        this.tokenBuilder.addToken({
          line: valuePosition.line,
          char: valuePosition.character,
          length: match[2].length,
          tokenType: 'boolean',
          modifiers: []
        });
      } else if (match[2] === 'null') {
        // Null
        this.tokenBuilder.addToken({
          line: valuePosition.line,
          char: valuePosition.character,
          length: 4,
          tokenType: 'null',
          modifiers: []
        });
      } else {
        // Number
        this.tokenBuilder.addToken({
          line: valuePosition.line,
          char: valuePosition.character,
          length: match[2].length,
          tokenType: 'number',
          modifiers: []
        });
      }
      
      // Look for comma after this item
      const afterValue = match.index + match[0].length;
      const commaIndex = arrayText.indexOf(',', afterValue);
      
      // Check if we're not at the last item by looking for more content
      const remainingText = arrayText.substring(afterValue);
      const hasMoreItems = remainingText.search(/["tfn\d]/) !== -1;
      
      // Add comma if found and not at the end
      if (commaIndex !== -1 && hasMoreItems && commaIndex < afterValue + remainingText.search(/["tfn\d]/)) {
        this.operatorHelper.addOperatorToken(node.location.start.offset + commaIndex, 1);
      }
      
      lastMatchEnd = afterValue;
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