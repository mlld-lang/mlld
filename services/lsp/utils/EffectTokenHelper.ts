interface PositionAt {
  positionAt(offset: number): { line: number; character: number };
}

interface TokenEntry {
  line: number;
  char: number;
  length: number;
  tokenType: string;
  modifiers: string[];
}

interface TokenBuilder {
  addToken(token: TokenEntry): void;
}

export class EffectTokenHelper {
  constructor(private document: PositionAt, private tokenBuilder: TokenBuilder) {}

  tokenizeEffectKeyword(effect: string, absOffset: number): void {
    const pos = this.document.positionAt(absOffset);
    this.tokenBuilder.addToken({
      line: pos.line,
      char: pos.character,
      length: effect.length,
      tokenType: 'keyword',
      modifiers: []
    });
  }

  // Tokenize a simple argument immediately following an effect (e.g., log "msg" or log @a)
  tokenizeSimpleArg(absAfterEffectOffset: number, segment: string): void {
    const m = segment.match(/\s+(@[A-Za-z_][A-Za-z0-9_]*|`[^`]*`|"([^"\\]|\\.)*"|'([^'\\]|\\.)*')/);
    if (m && m.index !== undefined) {
      const argText = m[1] || m[0].trim();
      const aOffset = absAfterEffectOffset + m.index + m[0].indexOf(argText);
      const aPos = this.document.positionAt(aOffset);
      this.tokenBuilder.addToken({
        line: aPos.line,
        char: aPos.character,
        length: argText.length,
        tokenType: argText.startsWith('@') ? 'variable' : 'string',
        modifiers: []
      });
    }
  }

  // Tokenize output effect arguments: optional source var, 'to', target (stdout|stderr|@var|"quoted")
  tokenizeOutputArgs(absAfterEffectOffset: number, segment: string): void {
    // Optional source var after 'output'
    const varMatch = segment.match(/\s+(@[A-Za-z_][A-Za-z0-9_]*)/);
    if (varMatch && varMatch.index !== undefined) {
      const vOffset = absAfterEffectOffset + varMatch.index + varMatch[0].indexOf('@');
      const vPos = this.document.positionAt(vOffset);
      this.tokenBuilder.addToken({ line: vPos.line, char: vPos.character, length: varMatch[1].length, tokenType: 'variable', modifiers: [] });
    }
    // 'to' keyword
    const toMatch = segment.match(/\bto\b/);
    if (toMatch && toMatch.index !== undefined) {
      const toOffset = absAfterEffectOffset + toMatch.index;
      const toPos = this.document.positionAt(toOffset);
      this.tokenBuilder.addToken({ line: toPos.line, char: toPos.character, length: 2, tokenType: 'keyword', modifiers: [] });

      const targetRest = segment.slice(toMatch.index + toMatch[0].length);
      // Streams stdout/stderr
      const stream = targetRest.match(/^\s*(stdout|stderr)\b/);
      if (stream) {
        const sOffset = absAfterEffectOffset + toMatch.index + toMatch[0].length + targetRest.indexOf(stream[1]);
        const sPos = this.document.positionAt(sOffset);
        this.tokenBuilder.addToken({ line: sPos.line, char: sPos.character, length: stream[1].length, tokenType: 'keyword', modifiers: [] });
        return;
      }
      // Target variable
      const tVar = targetRest.match(/^\s*(@[A-Za-z_][A-Za-z0-9_]*)/);
      if (tVar) {
        const tvRel = toMatch.index + toMatch[0].length + targetRest.indexOf(tVar[1]);
        const tOffset = absAfterEffectOffset + tvRel;
        const tPos = this.document.positionAt(tOffset);
        this.tokenBuilder.addToken({ line: tPos.line, char: tPos.character, length: tVar[1].length, tokenType: 'variable', modifiers: [] });
        return;
      }
      // Quoted target
      const q = targetRest.match(/^\s*("([^"\\]|\\.)*")/);
      if (q) {
        const qRel = toMatch.index + toMatch[0].length + targetRest.indexOf(q[1]);
        const qOffset = absAfterEffectOffset + qRel;
        const qPos = this.document.positionAt(qOffset);
        this.tokenBuilder.addToken({ line: qPos.line, char: qPos.character, length: q[1].length, tokenType: 'string', modifiers: [] });
      }
    }
  }
}

