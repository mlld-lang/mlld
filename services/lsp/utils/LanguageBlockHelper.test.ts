import { describe, it, expect, beforeEach } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { LanguageBlockHelper } from '@services/lsp/utils/LanguageBlockHelper';
import { TokenBuilder } from '@services/lsp/utils/TokenBuilder';
import { ISemanticToken } from '@services/lsp/types';

describe('LanguageBlockHelper', () => {
  let document: TextDocument;
  let tokenBuilder: TokenBuilder;
  let helper: LanguageBlockHelper;
  let tokens: ISemanticToken[];

  beforeEach(() => {
    tokens = [];
    tokenBuilder = {
      addToken: (token: ISemanticToken) => tokens.push(token)
    } as any;
  });

  const createHelper = (content: string) => {
    document = TextDocument.create('test://test.mlld', 'mlld', 1, content);
    helper = new LanguageBlockHelper(document, tokenBuilder);
  };

  describe('tokenizeLanguageIdentifier', () => {
    it('should tokenize valid language identifiers', () => {
      createHelper('/run js { console.log("hello"); }');
      
      const result = helper.tokenizeLanguageIdentifier('js', 5);
      
      expect(result).toBe(true);
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        line: 0,
        char: 5,
        length: 2,
        tokenType: 'embedded'
      });
    });

    it('should reject invalid language identifiers', () => {
      createHelper('/run invalid { code }');
      
      const result = helper.tokenizeLanguageIdentifier('invalid', 5);
      
      expect(result).toBe(false);
      expect(tokens).toHaveLength(0);
    });

    it('should handle all supported language aliases', () => {
      createHelper('test');
      
      const languages = ['js', 'javascript', 'node', 'python', 'py', 'sh', 'bash'];
      
      for (const lang of languages) {
        tokens = [];
        const result = helper.tokenizeLanguageIdentifier(lang, 0);
        expect(result).toBe(true);
        expect(tokens).toHaveLength(1);
      }
    });
  });

  describe('findAndTokenizeLanguage', () => {
    it('should find and tokenize language in text', () => {
      createHelper('/run js { code }');
      
      const result = helper.findAndTokenizeLanguage('run js { code }', 1);
      
      expect(result).toEqual({ language: 'js', offset: 5 });
      expect(tokens).toHaveLength(1);
      expect(tokens[0]).toMatchObject({
        line: 0,
        char: 5,
        length: 2,
        tokenType: 'embedded'
      });
    });

    it('should return null for text without language identifiers', () => {
      createHelper('/run { echo "hello" }');
      
      const result = helper.findAndTokenizeLanguage('run { echo "hello" }', 1);
      
      expect(result).toBeNull();
      expect(tokens).toHaveLength(0);
    });
  });

  describe('tokenizeCodeBlock', () => {
    it('should tokenize complete code block with language detection', () => {
      const content = '/run js { console.log("hello"); }';
      createHelper(content);
      
      const directive = {
        location: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: content.length, line: 1, column: content.length + 1 }
        }
      };
      
      // Mock embedded service
      const mockEmbeddedService = {
        isLanguageSupported: () => true,
        generateTokens: () => [
          { line: 0, char: 10, length: 7, tokenType: 'variable', modifiers: [] },
          { line: 0, char: 17, length: 1, tokenType: 'operator', modifiers: [] }
        ]
      };
      
      helper = new LanguageBlockHelper(document, tokenBuilder, mockEmbeddedService as any);
      
      const result = helper.tokenizeCodeBlock(directive);
      
      expect(result).toBe(true);
      
      // Should have: language identifier, opening brace, embedded tokens, closing brace
      expect(tokens.length).toBeGreaterThanOrEqual(4);
      
      // Check language identifier
      expect(tokens[0]).toMatchObject({
        tokenType: 'embedded',
        length: 2
      });
      
      // Check braces
      const braceTokens = tokens.filter(t => t.tokenType === 'operator');
      expect(braceTokens.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle code blocks without language detection', () => {
      const content = '/var @x = js { return 42; }';
      createHelper(content);
      
      const directive = {
        location: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: content.length, line: 1, column: content.length + 1 }
        }
      };
      
      const result = helper.tokenizeCodeBlock(directive, 'js', 'return 42;');
      
      expect(result).toBe(true);
      expect(tokens.length).toBeGreaterThanOrEqual(3); // language, open brace, close brace
    });
  });

  describe('tokenizeInlineCode', () => {
    it('should tokenize /var directive with inline code', () => {
      const content = '/var @x = js { return 42; }';
      createHelper(content);
      
      const directive = {
        kind: 'var',
        location: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: content.length, line: 1, column: content.length + 1 }
        },
        values: {
          value: [{
            type: 'code',
            lang: 'js',
            code: 'return 42;'
          }]
        }
      };
      
      const codeNode = directive.values.value[0];
      
      const result = helper.tokenizeInlineCode(directive, codeNode);
      
      expect(result).toBe(true);
      expect(tokens.length).toBeGreaterThanOrEqual(3);
    });

    it('should tokenize /exe directive with inline code', () => {
      const content = '/exe @compile = js { return "compiled"; }';
      createHelper(content);
      
      const directive = {
        kind: 'exe',
        location: {
          start: { offset: 0, line: 1, column: 1 },
          end: { offset: content.length, line: 1, column: content.length + 1 }
        },
        raw: {
          lang: 'js',
          code: 'return "compiled";'
        }
      };
      
      const result = helper.tokenizeInlineCode(directive);
      
      expect(result).toBe(true);
      expect(tokens.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('tokenizeCommandBraces', () => {
    it('should tokenize opening and closing braces', () => {
      createHelper('/run { echo "hello" }');
      
      const firstCommand = { location: { start: { offset: 7 } } };
      const lastCommand = { location: { end: { offset: 19 } } };
      
      helper.tokenizeCommandBraces(firstCommand, lastCommand);
      
      expect(tokens).toHaveLength(2);
      expect(tokens[0]).toMatchObject({
        line: 0,
        char: 6, // offset 6 (7-1)
        length: 1,
        tokenType: 'operator'
      });
      expect(tokens[1]).toMatchObject({
        line: 0,
        char: 19,
        length: 1,
        tokenType: 'operator'
      });
    });
  });

  describe('extractCodeContent', () => {
    it('should extract and trim code content', () => {
      const text = '{ \n  console.log("hello");\n }';
      
      const result = helper.extractCodeContent(text, 0, text.length - 1);
      
      expect(result).toEqual({
        content: '  console.log("hello");',
        startOffset: 3,
        endOffset: 26
      });
    });

    it('should handle code without leading/trailing whitespace', () => {
      const text = '{return 42;}';
      
      const result = helper.extractCodeContent(text, 0, text.length - 1);
      
      expect(result).toEqual({
        content: 'return 42;',
        startOffset: 1,
        endOffset: 11
      });
    });
  });
});