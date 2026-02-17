import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseVisitor } from '@services/lsp/visitors/base/BaseVisitor';
import { INodeVisitor } from '@services/lsp/visitors/base/VisitorInterface';
import { VisitorContext } from '@services/lsp/context/VisitorContext';
import { OperatorTokenHelper } from '@services/lsp/utils/OperatorTokenHelper';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';
import { embeddedLanguageService } from '@services/lsp/embedded/EmbeddedLanguageService';
import { LspAstNode, asLspAstNode } from '@services/lsp/visitors/base/LspAstNode';

type AstNode = LspAstNode;

interface AstNodeWithLocation extends AstNode {
  location: NonNullable<AstNode['location']>;
}

interface ObjectEntry {
  type: string;
  key: string;
  value: AstNode | unknown;
}

export class StructureVisitor extends BaseVisitor {
  private mainVisitor!: INodeVisitor;
  private operatorHelper: OperatorTokenHelper;

  constructor(document: TextDocument, tokenBuilder: TokenBuilder) {
    super(document, tokenBuilder);
    this.operatorHelper = new OperatorTokenHelper(document, tokenBuilder);
  }

  setMainVisitor(visitor: INodeVisitor): void {
    this.mainVisitor = visitor;
  }

  canHandle(node: unknown): boolean {
    const astNode = asLspAstNode(node);
    return astNode.type === 'ObjectExpression' ||
           astNode.type === 'object' ||
           astNode.type === 'ArrayExpression' ||
           astNode.type === 'array' ||
           astNode.type === 'Property' ||
           astNode.type === 'MemberExpression';
  }

  visitNode(node: unknown, context: VisitorContext): void {
    const astNode = asLspAstNode(node);
    if (!astNode.location) return;
    
    switch (astNode.type) {
      case 'ObjectExpression':
      case 'object':
        this.visitObjectExpression(astNode as AstNodeWithLocation, context);
        break;
      case 'ArrayExpression':
      case 'array':
        this.visitArrayExpression(astNode as AstNodeWithLocation, context);
        break;
      case 'Property':
        this.visitProperty(astNode as AstNodeWithLocation, context);
        break;
      case 'MemberExpression':
        this.visitMemberExpression(astNode as AstNodeWithLocation, context);
        break;
    }
  }
  
  private visitObjectExpression(node: AstNodeWithLocation, context: VisitorContext): void {
    const sourceText = this.document.getText();
    const objectText = sourceText.substring(node.location.start.offset, node.location.end.offset);

    // Handle both 'entries' (AST format) and 'properties' (legacy format)
    const entries = node.entries || (node.properties ? Object.entries(node.properties).map(([key, value]) => ({
      type: 'pair',
      key,
      value
    })) : []);

    if (entries.length > 0) {
      // Check if this is a plain object (all values are primitives) or has mlld constructs
      const hasASTNodes = entries.some((entry: ObjectEntry) => {
        const value = entry.value;
        return typeof value === 'object' && value !== null && (value as AstNode).type;
      });

      if (!hasASTNodes) {
        // Plain object - let embedded service handle all tokens including braces
        this.tokenizePlainObject(node, objectText);
        return; // Don't add braces manually
      } else {
        const findColonIndex = (startIndex: number): number => {
          let idx = startIndex;
          while (idx < objectText.length && objectText[idx] !== ':') idx++;
          return idx < objectText.length ? idx : -1;
        };

        // Add opening brace for objects with mlld constructs
        this.operatorHelper.addOperatorToken(node.location.start.offset, 1);
        // Object with mlld constructs - process AST nodes
        let lastPropertyEndOffset = node.location.start.offset + 1; // After '{'

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.type === 'spread') {
            const spreadValues = Array.isArray(entry.value) ? entry.value : [];

            if (spreadValues.length > 0) {
              const firstSpread = spreadValues[0];
              const lastSpread = spreadValues[spreadValues.length - 1];

              if (firstSpread?.location) {
                const searchStart = Math.max(0, firstSpread.location.start.offset - 5);
                const searchText = sourceText.substring(searchStart, firstSpread.location.start.offset);
                const spreadIndex = searchText.lastIndexOf('...');
                if (spreadIndex !== -1) {
                  this.operatorHelper.addOperatorToken(searchStart + spreadIndex, 3);
                }
              }

              for (const spreadValue of spreadValues) {
                if (spreadValue && typeof spreadValue === 'object' && spreadValue.type) {
                  this.mainVisitor.visitNode(spreadValue, context);
                }
              }

              if (lastSpread?.location) {
                lastPropertyEndOffset = lastSpread.location.end.offset;
              }
            }

            if (i < entries.length - 1) {
              this.operatorHelper.tokenizeOperatorBetween(
                lastPropertyEndOffset,
                node.location.end.offset,
                ','
              );
            }
            continue;
          }

          const key = entry.key;
          const value = entry.value;

          // Find and tokenize the property key (quoted or unquoted)
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const quotedPattern = new RegExp(`"${escapedKey}"`);
          const unquotedPattern = new RegExp(`\\b${escapedKey}\\s*:`);

          const quotedMatch = objectText.match(quotedPattern);
          const unquotedMatch = objectText.match(unquotedPattern);

          const keyMatch = quotedMatch || unquotedMatch; // For use in subsequent code
          const keyMatchIndex = quotedMatch?.index ?? unquotedMatch?.index;
          const colonIndex = (() => {
            if (quotedMatch && quotedMatch.index !== undefined) {
              return findColonIndex(quotedMatch.index + quotedMatch[0].length);
            }
            if (unquotedMatch && unquotedMatch.index !== undefined) {
              return findColonIndex(unquotedMatch.index + key.length);
            }
            return -1;
          })();

          if (quotedMatch && quotedMatch.index !== undefined) {
            // Quoted key
            const keyPosition = this.document.positionAt(node.location.start.offset + quotedMatch.index);
            this.tokenBuilder.addToken({
              line: keyPosition.line,
              char: keyPosition.character,
              length: key.length + 2, // Include quotes
              tokenType: 'string',
              modifiers: []
            });

            // Find and tokenize the colon
            const colonIndex = objectText.indexOf(':', quotedMatch.index + quotedMatch[0].length);
            if (colonIndex !== -1) {
              this.operatorHelper.addOperatorToken(node.location.start.offset + colonIndex, 1);
            }
          } else if (unquotedMatch && unquotedMatch.index !== undefined) {
            // Unquoted key
            const keyPosition = this.document.positionAt(node.location.start.offset + unquotedMatch.index);
            this.tokenBuilder.addToken({
              line: keyPosition.line,
              char: keyPosition.character,
              length: key.length,
              tokenType: 'property',
              modifiers: []
            });

            // Tokenize the colon (it's part of the match)
            const colonOffset = node.location.start.offset + unquotedMatch.index + key.length;
            const sourceText = this.document.getText();
            // Find the colon after the key
            let colonPos = colonOffset;
            while (colonPos < sourceText.length && sourceText[colonPos] !== ':') {
              colonPos++;
            }
            if (sourceText[colonPos] === ':') {
              this.operatorHelper.addOperatorToken(colonPos, 1);
            }
          }

          // Process the value
          if (typeof value === 'object' && value !== null) {
            if (value.type) {
              // Special-case: inline run inside object (e.g., "dynamic": run "echo test")
              if (value.type === 'command' && (value.hasRunKeyword || value.hasRun)) {
                if (colonIndex !== -1) {
                  const absAfterColon = node.location.start.offset + colonIndex + 1;
                  const scannedLen = this.scanAndTokenizePrimitive(objectText, colonIndex + 1, node.location.start.offset);
                  if (scannedLen > 0) {
                    lastPropertyEndOffset = absAfterColon + scannedLen;
                    continue; // Skip normal visit for this value to avoid duplicate tokens
                  }
                }
              }
              // Regular AST node - RECURSIVE VISITATION FOR MLLD VALUES
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
            if (colonIndex !== -1) {
              const absAfterColon = node.location.start.offset + colonIndex + 1;
              const scannedLen = this.scanAndTokenizePrimitive(objectText, colonIndex + 1, node.location.start.offset);
              if (scannedLen > 0) {
                lastPropertyEndOffset = absAfterColon + scannedLen;
              }
            }
          }

          // Find and tokenize comma if not the last property
          if (i < entries.length - 1) {
            // Use helper to find and tokenize comma
            this.operatorHelper.tokenizeOperatorBetween(
              lastPropertyEndOffset,
              node.location.end.offset,
              ','
            );
          }
        }
      }
    } else if (node.properties && typeof node.properties === 'object') {
      // Fallback for old format with properties object but no entries
      this.tokenizePlainObject(node, objectText);
      return;
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
  
  private tokenizePlainObject(node: AstNodeWithLocation, objectText: string): void {
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
  
  private visitArrayExpression(node: AstNodeWithLocation, context: VisitorContext): void {
    const sourceText = this.document.getText();
    const arrayText = sourceText.substring(node.location.start.offset, node.location.end.offset);
    
    if (node.items && Array.isArray(node.items)) {
      // Check if this is a plain array (all values are primitives) or has mlld constructs
      const hasASTNodes = node.items.some((item: AstNode | unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const n = item as AstNode;
        if (n.type) return true;
        if (Array.isArray(n.content)) {
          return n.content.some((part: AstNode | unknown) => typeof part === 'object' && part !== null && (part as AstNode).type);
        }
        return false;
      });

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

          if (typeof item === 'object' && item !== null && item.type) {
            // AST node (variable/object/array/etc.)
            this.mainVisitor.visitNode(item, context);
            if (item.location) lastItemEndOffset = item.location.end.offset;
          } else if (typeof item === 'object' && item !== null && Array.isArray(item.content)) {
            // Wrapper object that contains AST nodes (e.g., quoted string content)
            for (const part of item.content) {
              if (part && typeof part === 'object' && part.type) {
                this.mainVisitor.visitNode(part, context);
              }
            }
            const lastPartWithLocation = [...item.content].reverse().find((p: AstNode | unknown) => (p as AstNode)?.location);
            if (lastPartWithLocation?.location) {
              lastItemEndOffset = lastPartWithLocation.location.end.offset;
            }
          } else {
            // Primitive value - scan and tokenize
            let relStart = lastItemEndOffset - node.location.start.offset;
            while (relStart < arrayText.length && /[\s,]/.test(arrayText[relStart])) relStart++;
            const scannedLen = this.scanAndTokenizePrimitive(arrayText, relStart, node.location.start.offset);
            if (scannedLen > 0) {
              lastItemEndOffset = node.location.start.offset + relStart + scannedLen;
            }
          }

          // Find and tokenize comma if not the last item
          if (i < node.items.length - 1) {
            // Use helper to tokenize comma between items
            const nextItem = node.items[i + 1];
            const nextItemContent = Array.isArray(nextItem?.content) ? nextItem.content : [];
            const nextItemStart =
              (nextItem?.location?.start?.offset) ??
              ((nextItemContent.find((p: AstNode | unknown) => (p as AstNode)?.location) as AstNode | undefined)?.location?.start?.offset) ??
              node.location.end.offset;
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
  
  private tokenizePlainArray(node: AstNodeWithLocation, arrayText: string): void {
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
  
  private visitMemberExpression(node: AstNodeWithLocation, context: VisitorContext): void {
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
  
  private visitProperty(node: AstNodeWithLocation, context: VisitorContext): void {
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
