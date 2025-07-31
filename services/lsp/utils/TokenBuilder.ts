import { SemanticTokensBuilder } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

export interface TokenInfo {
  line: number;
  char: number;
  length: number;
  tokenType: string;
  modifiers: string[];
  data?: any;
}

export class TokenBuilder {
  constructor(
    private builder: SemanticTokensBuilder,
    private tokenTypes: string[],
    private tokenModifiers: string[],
    private document: TextDocument,
    private tokenTypeMap?: Record<string, string>
  ) {}
  
  addToken(token: TokenInfo): void {
    // Map custom token types to standard types if mapping provided
    const mappedType = this.tokenTypeMap?.[token.tokenType] || token.tokenType;
    
    const typeIndex = this.tokenTypes.indexOf(mappedType);
    if (typeIndex === -1) {
      console.warn(`Unknown token type: ${token.tokenType} (mapped to: ${mappedType})`);
      return;
    }
    
    let modifierMask = 0;
    for (const modifier of token.modifiers) {
      const modifierIndex = this.tokenModifiers.indexOf(modifier);
      if (modifierIndex !== -1) {
        modifierMask |= 1 << modifierIndex;
      }
    }
    
    // Enhanced debug logging for specific tokens we're having issues with
    const debugTokens = ['operator', 'template', 'comment', 'alligatorOpen', 'alligatorClose'];
    const shouldDebug = process.env.DEBUG_LSP === 'true' || 
                       this.document.uri.includes('fails.mld') || 
                       this.document.uri.includes('test-syntax') ||
                       debugTokens.includes(token.tokenType);
    
    if (shouldDebug) {
      const text = this.document.getText({
        start: { line: token.line, character: token.char },
        end: { line: token.line, character: token.char + token.length }
      });
      console.log(`[TOKEN] ${token.tokenType} -> ${mappedType} at ${token.line}:${token.char} len=${token.length} "${text}" mods=[${token.modifiers.join(',')}] typeIndex=${typeIndex}`);
    }
    
    this.builder.push(
      token.line,
      token.char,
      token.length,
      typeIndex,
      modifierMask
    );
  }
  
  getTokenTypeIndex(type: string): number {
    return this.tokenTypes.indexOf(type);
  }
  
  buildModifierMask(modifiers: string[]): number {
    let mask = 0;
    for (const modifier of modifiers) {
      const index = this.tokenModifiers.indexOf(modifier);
      if (index !== -1) {
        mask |= 1 << index;
      }
    }
    return mask;
  }
}