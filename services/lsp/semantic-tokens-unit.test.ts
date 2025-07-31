import { describe, it, expect, vi } from 'vitest';
import { parse } from '@grammar/parser';

// Mock the vscode-languageserver modules
vi.mock('vscode-languageserver/node', () => ({
  SemanticTokensBuilder: vi.fn().mockImplementation(() => {
    const tokens: number[] = [];
    let lastLine = 0;
    let lastChar = 0;
    
    return {
      push: (line: number, char: number, length: number, tokenType: number, modifiers: number) => {
        // Delta encoding as per LSP spec
        tokens.push(line - lastLine);
        tokens.push(line === lastLine ? char - lastChar : char);
        tokens.push(length);
        tokens.push(tokenType);
        tokens.push(modifiers);
        
        lastLine = line;
        lastChar = char;
      },
      build: () => ({ data: tokens })
    };
  })
}));

vi.mock('vscode-languageserver-textdocument', () => ({
  TextDocument: {
    create: (uri: string, languageId: string, version: number, content: string) => ({
      uri,
      languageId,
      version,
      getText: (range?: any) => {
        if (!range) return content;
        // Extract text based on range
        const lines = content.split('\n');
        if (range.start.line === range.end.line) {
          // Single line range
          return lines[range.start.line].substring(range.start.character, range.end.character);
        } else {
          // Multi-line range (simplified for testing)
          let result = lines[range.start.line].substring(range.start.character);
          for (let i = range.start.line + 1; i < range.end.line; i++) {
            result += '\n' + lines[i];
          }
          if (range.end.line < lines.length) {
            result += '\n' + lines[range.end.line].substring(0, range.end.character);
          }
          return result;
        }
      },
      offsetAt: (position: any) => 0,
      positionAt: (offset: number) => ({ line: 0, character: offset })
    })
  }
}));

// Import after mocks are set up
import { ASTSemanticVisitor } from '@services/lsp/ASTSemanticVisitor';
import { SemanticTokensBuilder } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Token types from LSP
const TOKEN_TYPES = [
  'directive',
  'variable',
  'variableRef',
  'interpolation',
  'template',
  'templateContent',
  'operator',
  'keyword',
  'embedded',
  'embeddedCode',
  'alligator',
  'xmlTag',
  'section',
  'parameter',
  'comment',
  'string',
  'number',
  'boolean',
  'null'
];

const TOKEN_MODIFIERS = [
  'declaration',
  'reference',
  'readonly',
  'interpolated',
  'literal',
  'invalid',
  'deprecated'
];

interface SemanticToken {
  line: number;
  char: number;
  length: number;
  tokenType: string;
  modifiers: string[];
  text?: string; // For easier debugging
}

function parseSemanticTokens(data: number[], sourceText: string): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  let line = 0;
  let char = 0;
  const lines = sourceText.split('\n');
  
  for (let i = 0; i < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    const length = data[i + 2];
    const tokenTypeIndex = data[i + 3];
    const modifierMask = data[i + 4];
    
    // Update position
    if (deltaLine > 0) {
      line += deltaLine;
      char = deltaChar;
    } else {
      char += deltaChar;
    }
    
    // Decode modifiers
    const modifiers: string[] = [];
    for (let j = 0; j < TOKEN_MODIFIERS.length; j++) {
      if (modifierMask & (1 << j)) {
        modifiers.push(TOKEN_MODIFIERS[j]);
      }
    }
    
    // Extract text for easier debugging
    let text = '';
    if (lines[line]) {
      text = lines[line].substring(char, char + length);
    }
    
    tokens.push({
      line,
      char,
      length,
      tokenType: TOKEN_TYPES[tokenTypeIndex] || 'unknown',
      modifiers,
      text
    });
  }
  
  return tokens;
}

async function getSemanticTokens(code: string): Promise<SemanticToken[]> {
  const document = TextDocument.create('test://test.mld', 'mlld', 1, code);
  const parseResult = await parse(code);
  
  if (!parseResult.success) {
    throw new Error(`Parse error: ${parseResult.error.message}`);
  }
  
  const builder = new SemanticTokensBuilder();
  const visitor = new ASTSemanticVisitor(document, builder, TOKEN_TYPES, TOKEN_MODIFIERS);
  visitor.visitAST(parseResult.ast);
  
  const result = builder.build();
  return parseSemanticTokens(result.data, code);
}

function expectToken(tokens: SemanticToken[], expected: Partial<SemanticToken>): void {
  const found = tokens.find(t => {
    if (expected.text && t.text !== expected.text) return false;
    if (expected.tokenType && t.tokenType !== expected.tokenType) return false;
    if (expected.line !== undefined && t.line !== expected.line) return false;
    if (expected.char !== undefined && t.char !== expected.char) return false;
    if (expected.modifiers && !expected.modifiers.every(m => t.modifiers.includes(m))) return false;
    return true;
  });
  
  if (!found) {
    const tokenDesc = expected.text ? `"${expected.text}"` : `at ${expected.line}:${expected.char}`;
    console.log('Available tokens:', tokens.map(t => ({
      text: t.text,
      type: t.tokenType,
      pos: `${t.line}:${t.char}`,
      mods: t.modifiers
    })));
    throw new Error(`Expected token ${tokenDesc} with type "${expected.tokenType}" not found`);
  }
  
  expect(found).toBeDefined();
}

describe('Semantic Tokens - Unit Tests', () => {
  describe('Directives', () => {
    it('highlights directive keywords', async () => {
      const code = '/var @name = "Alice"';
      const tokens = await getSemanticTokens(code);
      
      expectToken(tokens, {
        text: '/var',
        tokenType: 'directive',
        line: 0,
        char: 0
      });
    });
    
    it('highlights variable declarations', async () => {
      const code = '/var @name = "Alice"';
      const tokens = await getSemanticTokens(code);
      
      expectToken(tokens, {
        text: '@name',
        tokenType: 'variable',
        modifiers: ['declaration']
      });
    });
    
    it('highlights multiple directives', async () => {
      const code = `/var @x = 1
/show @x
/exe @cmd = run {ls}`;
      const tokens = await getSemanticTokens(code);
      
      const directives = tokens.filter(t => t.tokenType === 'directive');
      expect(directives).toHaveLength(3);
      expect(directives[0].text).toBe('/var');
      expect(directives[1].text).toBe('/show');
      expect(directives[2].text).toBe('/exe');
    });
  });
  
  describe('Template Contexts', () => {
    it('highlights backtick templates with @var interpolation', async () => {
      const code = '/var @msg = `Hello @name!`';
      const tokens = await getSemanticTokens(code);
      
      // Should have template delimiters
      const templates = tokens.filter(t => t.tokenType === 'template');
      expect(templates.length).toBeGreaterThanOrEqual(1);
      
      // Should have interpolation
      expectToken(tokens, {
        text: '@name',
        tokenType: 'interpolation'
      });
    });
    
    it('highlights double-colon templates', async () => {
      const code = '/var @msg = ::Hello @user::';
      const tokens = await getSemanticTokens(code);
      
      // Should have @var interpolation
      expectToken(tokens, {
        text: '@user',
        tokenType: 'interpolation'
      });
    });
    
    it('highlights triple-colon templates with {{var}}', async () => {
      const code = '/var @tweet = :::Tweet by @alice about {{topic}}:::';
      const tokens = await getSemanticTokens(code);
      
      // Should have {{var}} interpolation
      const interpolations = tokens.filter(t => t.tokenType === 'interpolation');
      const mustacheInterp = interpolations.find(t => t.text?.includes('{{'));
      expect(mustacheInterp).toBeDefined();
      
      // @alice should NOT be highlighted as interpolation
      const atInterpolations = interpolations.filter(t => t.text?.startsWith('@'));
      expect(atInterpolations).toHaveLength(0);
    });
    
    it('treats single quotes as literal', async () => {
      const code = "/var @msg = 'Hello @name!'";
      const tokens = await getSemanticTokens(code);
      
      // Should have literal string
      const strings = tokens.filter(t => t.tokenType === 'string');
      const literalString = strings.find(t => t.modifiers.includes('literal'));
      expect(literalString).toBeDefined();
      
      // Should NOT have interpolations
      const interpolations = tokens.filter(t => t.tokenType === 'interpolation');
      expect(interpolations).toHaveLength(0);
    });
  });
  
  describe('Comments', () => {
    it('highlights >> comments', async () => {
      const code = `>> This is a comment
/var @x = 1`;
      const tokens = await getSemanticTokens(code);
      
      expectToken(tokens, {
        tokenType: 'comment',
        line: 0
      });
    });
    
    it('highlights << comments', async () => {
      const code = `<< Another style
/var @y = 2`;
      const tokens = await getSemanticTokens(code);
      
      expectToken(tokens, {
        tokenType: 'comment',
        line: 0
      });
    });
  });
  
  describe('Operators', () => {
    it('highlights comparison operators', async () => {
      const code = '/when @score > 90 => /show "A"';
      const tokens = await getSemanticTokens(code);
      
      // Should have > operator
      expectToken(tokens, {
        text: '>',
        tokenType: 'operator'
      });
      
      // Should have => operator
      expectToken(tokens, {
        text: '=>',
        tokenType: 'operator'
      });
    });
    
    it('highlights logical operators', async () => {
      const code = '/when @isValid && !@isLocked => /show "OK"';
      const tokens = await getSemanticTokens(code);
      
      const operators = tokens.filter(t => t.tokenType === 'operator');
      const andOp = operators.find(t => t.text === '&&');
      const notOp = operators.find(t => t.text === '!');
      
      expect(andOp).toBeDefined();
      expect(notOp).toBeDefined();
    });
  });
  
  describe('Embedded Languages', () => {
    it('highlights language identifiers', async () => {
      const code = '/run js { console.log("Hi"); }';
      const tokens = await getSemanticTokens(code);
      
      expectToken(tokens, {
        text: 'js',
        tokenType: 'embedded'
      });
    });
    
    it('marks embedded code regions', async () => {
      const code = '/run python { print("Hello") }';
      const tokens = await getSemanticTokens(code);
      
      expectToken(tokens, {
        text: 'python',
        tokenType: 'embedded'
      });
      
      // Should have embedded code region
      const embeddedCode = tokens.find(t => t.tokenType === 'embeddedCode');
      expect(embeddedCode).toBeDefined();
    });
  });
  
  describe('Variable References', () => {
    it('distinguishes declarations from references', async () => {
      const code = `/var @name = "Alice"
/show @name`;
      const tokens = await getSemanticTokens(code);
      
      // First @name should be declaration
      const firstNameToken = tokens.find(t => t.text === '@name' && t.line === 0);
      expect(firstNameToken?.tokenType).toBe('variable');
      expect(firstNameToken?.modifiers).toContain('declaration');
      
      // Second @name should be reference
      const secondNameToken = tokens.find(t => t.text === 'name' && t.line === 1);
      expect(secondNameToken?.tokenType).toBe('variableRef');
      expect(secondNameToken?.modifiers).toContain('reference');
    });
  });
  
  describe('Complex Scenarios', () => {
    it('handles nested contexts correctly', async () => {
      const code = `/exe @greet(name) = \`Hello @name!\`
/var @msg = @greet("World")
/show @msg`;
      
      const tokens = await getSemanticTokens(code);
      
      // Should have 3 directives
      const directives = tokens.filter(t => t.tokenType === 'directive');
      expect(directives).toHaveLength(3);
      
      // Should have parameter in exe
      const params = tokens.filter(t => t.tokenType === 'parameter');
      expect(params.length).toBeGreaterThan(0);
      
      // Should have interpolation in template
      const interpolations = tokens.filter(t => t.tokenType === 'interpolation');
      expect(interpolations.length).toBeGreaterThan(0);
    });
    
    it('handles when expressions', async () => {
      const code = `/when @env first: [
  "prod" => /show "Production"
  "dev" => /show "Development"
]`;
      
      const tokens = await getSemanticTokens(code);
      
      // Should have /when directive
      expectToken(tokens, {
        text: '/when',
        tokenType: 'directive'
      });
      
      // Should have strings
      const strings = tokens.filter(t => t.tokenType === 'string');
      expect(strings.length).toBeGreaterThan(0);
    });
  });
});