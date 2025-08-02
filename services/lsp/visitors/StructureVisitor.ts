import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { VisitorContext } from '@services/lsp/context/VisitorContext';

export class StructureVisitor extends BaseVisitor {
  private mainVisitor: any;
  
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
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: 1,
      tokenType: 'operator',
      modifiers: []
    });
    
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
              const colonPosition = this.document.positionAt(node.location.start.offset + colonIndex);
              this.tokenBuilder.addToken({
                line: colonPosition.line,
                char: colonPosition.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }
          
          // Process the value if it's an AST node
          if (typeof value === 'object' && value !== null && value.type) {
            this.mainVisitor.visitNode(value, context);
            if (value.location) {
              lastPropertyEndOffset = value.location.end.offset;
            }
          }
          
          // Find and tokenize comma if not the last property
          const entries = Object.entries(node.properties);
          const currentIndex = entries.findIndex(([k]) => k === key);
          if (currentIndex < entries.length - 1) {
            const searchStart = lastPropertyEndOffset - node.location.start.offset;
            const commaIndex = objectText.indexOf(',', searchStart);
            if (commaIndex !== -1) {
              const commaPosition = this.document.positionAt(node.location.start.offset + commaIndex);
              this.tokenBuilder.addToken({
                line: commaPosition.line,
                char: commaPosition.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }
        }
      }
    }
    
    // Add closing brace
    const closeBracePosition = this.document.positionAt(node.location.end.offset - 1);
    this.tokenBuilder.addToken({
      line: closeBracePosition.line,
      char: closeBracePosition.character,
      length: 1,
      tokenType: 'operator',
      modifiers: []
    });
  }
  
  private tokenizePlainObject(node: any, objectText: string): void {
    // For plain objects, we need to manually parse and tokenize
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
      const colonPosition = this.document.positionAt(node.location.start.offset + keyStart + colonIndex);
      this.tokenBuilder.addToken({
        line: colonPosition.line,
        char: colonPosition.character,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
      
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
        const commaPosition = this.document.positionAt(node.location.start.offset + commaIndex);
        this.tokenBuilder.addToken({
          line: commaPosition.line,
          char: commaPosition.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
      
      lastMatchEnd = afterValue;
    }
  }
  
  private visitArrayExpression(node: any, context: VisitorContext): void {
    const sourceText = this.document.getText();
    const arrayText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    
    // Add opening bracket
    this.tokenBuilder.addToken({
      line: node.location.start.line - 1,
      char: node.location.start.column - 1,
      length: 1,
      tokenType: 'operator',
      modifiers: []
    });
    
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
            const searchStart = lastItemEndOffset - node.location.start.offset;
            const commaIndex = arrayText.indexOf(',', searchStart);
            if (commaIndex !== -1) {
              const commaPosition = this.document.positionAt(node.location.start.offset + commaIndex);
              this.tokenBuilder.addToken({
                line: commaPosition.line,
                char: commaPosition.character,
                length: 1,
                tokenType: 'operator',
                modifiers: []
              });
            }
          }
        }
      }
    }
    
    // Add closing bracket
    const closeBracketPosition = this.document.positionAt(node.location.end.offset - 1);
    this.tokenBuilder.addToken({
      line: closeBracketPosition.line,
      char: closeBracketPosition.character,
      length: 1,
      tokenType: 'operator',
      modifiers: []
    });
  }
  
  private tokenizePlainArray(node: any, arrayText: string): void {
    // For plain arrays, we need to manually parse and tokenize
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
        const commaPosition = this.document.positionAt(node.location.start.offset + commaIndex);
        this.tokenBuilder.addToken({
          line: commaPosition.line,
          char: commaPosition.character,
          length: 1,
          tokenType: 'operator',
          modifiers: []
        });
      }
      
      lastMatchEnd = afterValue;
    }
  }
  
  private visitMemberExpression(node: any, context: VisitorContext): void {
    if (node.object) {
      this.mainVisitor.visitNode(node.object, context);
    }
    
    if (node.computed === false && node.property) {
      const objectEnd = node.object?.location?.end?.column || node.location.start.column;
      
      this.tokenBuilder.addToken({
        line: node.location.start.line - 1,
        char: objectEnd - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
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
      this.tokenBuilder.addToken({
        line: node.colonLocation.start.line - 1,
        char: node.colonLocation.start.column - 1,
        length: 1,
        tokenType: 'operator',
        modifiers: []
      });
    }
    
    if (node.value) {
      this.mainVisitor.visitNode(node.value, context);
    }
  }
}