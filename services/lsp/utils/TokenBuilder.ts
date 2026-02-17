import { SemanticTokensBuilder } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';
import type { TokenAttempt } from '../../tests/utils/token-validator/types.js';

export interface TokenInfo {
  line: number;
  char: number;
  length: number;
  tokenType: string;
  modifiers: string[];
  data?: unknown;
}

export class TokenBuilder {
  private emittedPositions = new Set<string>();
  private tokenAttempts: TokenAttempt[] = [];
  private currentSourceNode?: string;

  constructor(
    private builder: SemanticTokensBuilder,
    private tokenTypes: string[],
    private tokenModifiers: string[],
    private document: TextDocument,
    private tokenTypeMap?: Record<string, string>
  ) {}

  clear(): void {
    this.emittedPositions.clear();
    this.tokenAttempts = [];
  }

  setSourceNode(nodeId: string): void {
    this.currentSourceNode = nodeId;
  }

  clearSourceNode(): void {
    this.currentSourceNode = undefined;
  }

  getAttempts(): TokenAttempt[] {
    return this.tokenAttempts;
  }
  
  addToken(token: TokenInfo): void {
    const attempt: TokenAttempt = {
      tokenType: token.tokenType,
      position: { line: token.line, char: token.char, length: token.length },
      accepted: false,
      sourceNode: this.currentSourceNode
    };

    // Validate token position
    if (!Number.isFinite(token.line) || !Number.isFinite(token.char) || !Number.isFinite(token.length)) {
      attempt.rejectionReason = 'nan_value';
      this.tokenAttempts.push(attempt);

      // Get source text to show what was being tokenized
      const sourceText = this.document.getText();
      const lineText = sourceText.split('\n')[token.line] || '';

      console.error(`[TOKEN-ERROR] Invalid token position:`, {
        line: token.line,
        char: token.char,
        length: token.length,
        tokenType: token.tokenType,
        lineText: lineText.substring(0, 100),
        uri: this.document.uri
      });
      return;
    }

    if (token.line < 0 || token.char < 0 || token.length < 0) {
      attempt.rejectionReason = 'negative_position';
      this.tokenAttempts.push(attempt);

      const sourceText = this.document.getText();
      const lineText = sourceText.split('\n')[token.line] || '';

      console.error(`[TOKEN-ERROR] Negative token position:`, {
        line: token.line,
        char: token.char,
        length: token.length,
        tokenType: token.tokenType,
        lineText: lineText.substring(0, 100),
        uri: this.document.uri
      });

      // Log stack trace to find where this is coming from
      if (process.env.DEBUG) {
        console.error('[TOKEN-ERROR-STACK]', new Error().stack);
      }

      return;
    }

    // Skip duplicate tokens at the same position
    const positionKey = `${token.line}:${token.char}:${token.length}`;
    if (this.emittedPositions.has(positionKey)) {
      attempt.rejectionReason = 'duplicate';
      this.tokenAttempts.push(attempt);
      return;
    }
    this.emittedPositions.add(positionKey);

    // Map custom token types to standard types if mapping provided
    const mappedType = this.tokenTypeMap?.[token.tokenType] || token.tokenType;

    const typeIndex = this.tokenTypes.indexOf(mappedType);
    if (typeIndex === -1) {
      attempt.rejectionReason = 'unknown_type';
      this.tokenAttempts.push(attempt);
      console.warn(`Unknown token type: ${token.tokenType} (mapped to: ${mappedType})`);
      return;
    }

    // Success!
    attempt.accepted = true;

    // Validate token length matches source text (helps catch off-by-one bugs)
    const sourceText = this.document.getText({
      start: { line: token.line, character: token.char },
      end: { line: token.line, character: token.char + token.length }
    });

    if (sourceText.length !== token.length && process.env.DEBUG) {
      console.warn(`[TOKEN-LENGTH-MISMATCH] ${token.tokenType} at ${token.line}:${token.char}`, {
        expectedLength: token.length,
        actualLength: sourceText.length,
        text: sourceText,
        tokenType: token.tokenType
      });
    }

    this.tokenAttempts.push(attempt);

    let modifierMask = 0;
    for (const modifier of token.modifiers) {
      const modifierIndex = this.tokenModifiers.indexOf(modifier);
      if (modifierIndex !== -1) {
        modifierMask |= 1 << modifierIndex;
      }
    }
    
    // Enhanced debug logging for specific tokens we're having issues with
    const debugTokens = ['operator', 'template', 'comment', 'alligatorOpen', 'alligatorClose'];
    const shouldDebug = process.env.DEBUG_LSP === 'true' && (
      this.document.uri.includes('fails.mld') ||
      this.document.uri.includes('test-syntax') ||
      debugTokens.includes(token.tokenType)
    );
    
    if (shouldDebug) {
      const text = this.document.getText({
        start: { line: token.line, character: token.char },
        end: { line: token.line, character: token.char + token.length }
      });
      console.error(`[TOKEN] ${token.tokenType} -> ${mappedType} at ${token.line}:${token.char} len=${token.length} "${text}" mods=[${token.modifiers.join(',')}] typeIndex=${typeIndex}`);
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
