import { describe, it, expect } from 'vitest';
import { EffectTokenHelper } from './EffectTokenHelper';

// Minimal mock document that supports positionAt over a given text
function createMockDocument(text: string) {
  return {
    positionAt(offset: number) {
      if (offset < 0) offset = 0;
      if (offset > text.length) offset = text.length;
      let line = 0;
      let lastLineStart = 0;
      for (let i = 0; i < offset; i++) {
        if (text[i] === '\n') {
          line++;
          lastLineStart = i + 1;
        }
      }
      const character = offset - lastLineStart;
      return { line, character };
    }
  } as any;
}

function createTokenSink() {
  const tokens: any[] = [];
  const tokenBuilder = {
    addToken(token: any) {
      tokens.push(token);
    }
  } as any;
  return { tokens, tokenBuilder };
}

describe('EffectTokenHelper', () => {
  it('tokenizes effect keyword at absolute offset', () => {
    const text = 'abc\ndef\n'; // 4th char is newline
    const doc = createMockDocument(text);
    const { tokens, tokenBuilder } = createTokenSink();
    const helper = new EffectTokenHelper(doc, tokenBuilder);

    // Place keyword starting at offset 4 (start of line 1)
    helper.tokenizeEffectKeyword('log', 4);

    expect(tokens).toHaveLength(1);
    expect(tokens[0].tokenType).toBe('keyword');
    expect(tokens[0].length).toBe(3);
    expect(tokens[0].line).toBe(1);
    expect(tokens[0].char).toBe(0);
  });

  it('tokenizes simple arg as string or variable', () => {
    const text = 'prefix padding for offsets';
    const doc = createMockDocument(text);
    const { tokens, tokenBuilder } = createTokenSink();
    const helper = new EffectTokenHelper(doc, tokenBuilder);

    // String argument
    helper.tokenizeSimpleArg(10, ' "msg"');
    expect(tokens.pop()).toMatchObject({ tokenType: 'string', length: 5 });

    // Variable argument
    helper.tokenizeSimpleArg(5, ' @var');
    expect(tokens.pop()).toMatchObject({ tokenType: 'variable', length: 4 });
  });

  it('tokenizes output args: var source, to keyword, and stream target', () => {
    const text = '................................';
    const doc = createMockDocument(text);
    const { tokens, tokenBuilder } = createTokenSink();
    const helper = new EffectTokenHelper(doc, tokenBuilder);

    helper.tokenizeOutputArgs(0, ' @src to stdout');

    // Expect variable token for @src, 'to' keyword, and stdout keyword
    const kinds = tokens.map(t => t.tokenType);
    expect(kinds).toEqual(['variable', 'keyword', 'keyword']);
  });
});

