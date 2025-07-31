import { describe, it, expect, vi } from 'vitest';
import { parse } from '@grammar/parser';
import { HIGHLIGHTING_RULES, shouldInterpolate, isXMLTag } from '@core/highlighting/rules';

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

// Token types and modifiers from the LSP
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
  'null',
  'property'
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
}

function parseSemanticTokens(data: number[], sourceText?: string): SemanticToken[] {
  const tokens: SemanticToken[] = [];
  let line = 0;
  let char = 0;
  const lines = sourceText?.split('\n') || [];
  
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
    
    const token: SemanticToken = {
      line,
      char,
      length,
      tokenType: TOKEN_TYPES[tokenTypeIndex] || 'unknown',
      modifiers
    };
    
    // Add text for debugging if source is provided
    if (lines[line]) {
      (token as any).text = lines[line].substring(char, char + length);
    }
    
    tokens.push(token);
  }
  
  return tokens;
}

export async function getSemanticTokens(code: string): Promise<SemanticToken[]> {
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

describe('Semantic Tokens', () => {
  describe('Directives', () => {
    it('should highlight directive keywords', async () => {
      const code = '/var @name = "Alice"';
      const tokens = await getSemanticTokens(code);
      
      expect(tokens[0]).toMatchObject({
        line: 0,
        char: 0,
        length: 4, // /var
        tokenType: 'directive'
      });
    });
    
    it('should highlight variable declarations', async () => {
      const code = '/var @name = "Alice"';
      const tokens = await getSemanticTokens(code);
      
      const varToken = tokens.find(t => t.tokenType === 'variable');
      expect(varToken).toMatchObject({
        line: 0,
        char: 5,
        length: 5, // @name
        tokenType: 'variable',
        modifiers: ['declaration']
      });
    });
  });
  
  describe('Template Contexts', () => {
    it('should handle backtick templates with @var interpolation', async () => {
      const code = '/var @msg = `Hello @name!`';
      const tokens = await getSemanticTokens(code);
      
      // Find template delimiters
      const templateTokens = tokens.filter(t => t.tokenType === 'template');
      expect(templateTokens).toHaveLength(2); // opening and closing backticks
      
      // Find interpolation
      const interpolation = tokens.find(t => t.tokenType === 'interpolation');
      expect(interpolation).toBeDefined();
      expect(interpolation?.tokenType).toBe('interpolation');
    });
    
    it('should handle double-colon templates with @var interpolation', async () => {
      const code = '/var @msg = ::Hello @name!::';
      const tokens = await getSemanticTokens(code);
      
      // Template delimiters
      const templateTokens = tokens.filter(t => t.tokenType === 'template');
      expect(templateTokens).toHaveLength(2);
      
      // Should have @var interpolation
      const interpolation = tokens.find(t => t.tokenType === 'interpolation');
      expect(interpolation).toBeDefined();
    });
    
    it('should handle triple-colon templates with {{var}} interpolation', async () => {
      const code = '/var @tweet = :::Hey @alice, check out {{topic}}!:::';
      const tokens = await getSemanticTokens(code);
      
      // Template delimiters
      const templateTokens = tokens.filter(t => t.tokenType === 'template');
      expect(templateTokens).toHaveLength(2);
      
      // Should have {{var}} interpolation
      const interpolation = tokens.find(t => t.tokenType === 'interpolation' && t.length === 9); // {{topic}}
      expect(interpolation).toBeDefined();
      
      // @alice should NOT be interpolated in triple-colon
      const invalidInterpolation = tokens.find(t => 
        t.tokenType === 'interpolation' && t.char === 17 // position of @alice
      );
      expect(invalidInterpolation).toBeUndefined();
    });
    
    it('should not interpolate in single quotes', async () => {
      const code = "/var @msg = 'Hello @name!'";
      const tokens = await getSemanticTokens(code);
      
      // Should have literal string modifier
      const stringToken = tokens.find(t => t.tokenType === 'string');
      expect(stringToken?.modifiers).toContain('literal');
      
      // Should not have any interpolation tokens
      const interpolations = tokens.filter(t => t.tokenType === 'interpolation');
      expect(interpolations).toHaveLength(0);
    });
  });
  
  describe('File References (Alligator Syntax)', () => {
    it('should highlight file references in interpolating contexts', async () => {
      const code = '/var @content = `<README.md>`';
      const tokens = await getSemanticTokens(code);
      
      const alligator = tokens.find(t => t.tokenType === 'alligator');
      expect(alligator).toBeDefined();
    });
    
    it('should highlight file references with sections', async () => {
      const code = '/var @intro = <docs.md # Introduction>';
      const tokens = await getSemanticTokens(code);
      
      const alligator = tokens.find(t => t.tokenType === 'alligator');
      expect(alligator).toBeDefined();
      
      const section = tokens.find(t => t.tokenType === 'section');
      expect(section).toBeDefined();
    });
    
    it('should treat <file.md> as XML in triple-colon templates', async () => {
      const code = '/var @xml = :::<file.md>:::';
      const tokens = await getSemanticTokens(code);
      
      const xmlTag = tokens.find(t => t.tokenType === 'xmlTag');
      expect(xmlTag).toBeDefined();
      
      const alligator = tokens.find(t => t.tokenType === 'alligator');
      expect(alligator).toBeUndefined();
    });
  });
  
  describe('Embedded Languages', () => {
    it('should highlight language identifiers', async () => {
      const code = '/run js { console.log("Hello"); }';
      const tokens = await getSemanticTokens(code);
      
      const embedded = tokens.find(t => t.tokenType === 'embedded');
      expect(embedded).toMatchObject({
        tokenType: 'embedded',
        length: 2 // 'js'
      });
    });
    
    it('should mark embedded code regions', async () => {
      const code = '/run python { print("Hello") }';
      const tokens = await getSemanticTokens(code);
      
      const embeddedCode = tokens.find(t => t.tokenType === 'embeddedCode');
      expect(embeddedCode).toBeDefined();
    });

    it('handles commands with embedded code blocks', async () => {
      const code = `/run js {
  const result = \`prefix\${value}\`;
  console.log(result);
}`; // mlld doesn't interpolate in embedded code
      const tokens = await getSemanticTokens(code);
      
      // Check language identifier
      expect(tokens).toContainEqual(expect.objectContaining({
        text: 'js',
        tokenType: 'embedded'
      }));
      
      // The code block should be marked as embedded
      const embeddedCode = tokens.filter(t => t.tokenType === 'embeddedCode');
      expect(embeddedCode.length).toBeGreaterThan(0);
    });
  });
  
  describe('Operators', () => {
    it('should highlight logical operators', async () => {
      const code = '/when @isValid && @hasPermission => /show "OK"';
      const tokens = await getSemanticTokens(code);
      
      const operators = tokens.filter(t => t.tokenType === 'operator');
      expect(operators.length).toBeGreaterThan(0);
      
      // Should include && and =>
      const andOp = operators.find(t => t.length === 2);
      expect(andOp).toBeDefined();
    });
    
    it('should highlight comparison operators', async () => {
      const code = '/when @score > 90 => /show "Excellent!"';
      const tokens = await getSemanticTokens(code);
      
      const operators = tokens.filter(t => t.tokenType === 'operator');
      const gtOp = operators.find(t => t.length === 1);
      expect(gtOp).toBeDefined();
    });

    it('highlights pattern matching arrow operator', async () => {
      const code = `/when @status => /show "Processing"`;
      const tokens = await getSemanticTokens(code);
      
      // Check for arrow operator
      const operators = tokens.filter(t => t.tokenType === 'operator');
      expect(operators.some(o => o.text === '=>')).toBe(true);
    });
  });
  
  describe('Comments', () => {
    it('should highlight >> comments', async () => {
      const code = '>> This is a comment\n/var @x = 1';
      const tokens = await getSemanticTokens(code);
      
      const comment = tokens.find(t => t.tokenType === 'comment');
      expect(comment).toBeDefined();
      expect(comment?.line).toBe(0);
    });
    
    it('should highlight << comments', async () => {
      const code = '<< Another comment style\n/var @y = 2';
      const tokens = await getSemanticTokens(code);
      
      const comment = tokens.find(t => t.tokenType === 'comment');
      expect(comment).toBeDefined();
    });
  });
  
  describe('Literals', () => {
    it('should highlight numeric literals', async () => {
      const code = '/var @count = 42';
      const tokens = await getSemanticTokens(code);
      
      const number = tokens.find(t => t.tokenType === 'number');
      expect(number).toMatchObject({
        tokenType: 'number',
        length: 2 // '42'
      });
    });
    
    it('should highlight boolean literals', async () => {
      const code = '/var @active = true';
      const tokens = await getSemanticTokens(code);
      
      const boolean = tokens.find(t => t.tokenType === 'boolean');
      expect(boolean).toMatchObject({
        tokenType: 'boolean',
        length: 4 // 'true'
      });
    });
    
    it('should highlight null literals', async () => {
      const code = '/var @empty = null';
      const tokens = await getSemanticTokens(code);
      
      const nullToken = tokens.find(t => t.tokenType === 'null');
      expect(nullToken).toMatchObject({
        tokenType: 'null',
        length: 4 // 'null'
      });
    });
  });
  
  describe('Complex Scenarios', () => {
    it('should handle nested contexts correctly', async () => {
      const code = `/exe @greet(name) = \`Hello @name!\`
/var @msg = @greet("World")`;
      const tokens = await getSemanticTokens(code);
      
      // Should have multiple directives
      const directives = tokens.filter(t => t.tokenType === 'directive');
      expect(directives).toHaveLength(2);
      
      // Should have variable declaration and reference
      const varDecl = tokens.find(t => 
        t.tokenType === 'variable' && t.modifiers.includes('declaration')
      );
      expect(varDecl).toBeDefined();
      
      
      const varRef = tokens.find(t => 
        t.tokenType === 'variableRef' && t.modifiers.includes('reference')
      );
      expect(varRef).toBeDefined();
    });
    
    it('should handle when expressions with multiple conditions', async () => {
      const code = `/when @request first: [
  @method == "GET" && @path == "/users" => /show \`List users\`
  @method == "POST" => /show \`Create user\`
]`;
      const tokens = await getSemanticTokens(code);
      
      // Should have multiple operators
      const operators = tokens.filter(t => t.tokenType === 'operator');
      expect(operators.length).toBeGreaterThan(2);
      
      // Should have string literals
      const strings = tokens.filter(t => t.tokenType === 'string');
      expect(strings.length).toBeGreaterThan(0);
    });

    it('handles templates within objects', async () => {
      const code = '/var @config = {"message": `Hello @name!`, "count": @total}';
      const tokens = await getSemanticTokens(code);
      
      // NOTE: Template delimiters in object values don't have exact positions in AST
      // so we don't tokenize them (avoiding position guessing per architect feedback)
      
      // Check interpolation inside template
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@name',
        tokenType: 'interpolation'
      }));
      
      // Check variable reference outside template
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@total',
        tokenType: 'variableRef'
      }));
    });
  });

  describe('Command Content Interpolation', () => {
    it('handles shell commands with @var interpolation', async () => {
      const code = '/run {echo "@name"}';
      const tokens = await getSemanticTokens(code);
      
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '/run',
        tokenType: 'directive'
      }));
      
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@name',
        tokenType: 'interpolation'
      }));
    });
    
    it('handles complex shell commands with multiple interpolations', async () => {
      const code = '/run {cp "@source" "@dest"}'; // mlld doesn't support && in commands
      const tokens = await getSemanticTokens(code);
      
      const interpolations = tokens.filter(t => t.tokenType === 'interpolation');
      expect(interpolations).toHaveLength(2);
      expect(interpolations.map(t => t.text)).toEqual(['@source', '@dest']);
    });
  });

  describe('Structured Data', () => {
    it('highlights JSON objects', async () => {
      const code = '/var @config = {"name": "test", "value": 42}';
      const tokens = await getSemanticTokens(code);
      
      // Check braces
      const braces = tokens.filter(t => t.tokenType === 'operator' && (t.text === '{' || t.text === '}'));
      expect(braces).toHaveLength(2);
      
      // Note: Property keys and primitive values are not AST nodes
      // The mlld AST only preserves mlld constructs as nodes
    });
    
    it('highlights arrays', async () => {
      const code = '/var @items = [1, 2, 3]';
      const tokens = await getSemanticTokens(code);
      
      // Check brackets
      const brackets = tokens.filter(t => t.tokenType === 'operator' && (t.text === '[' || t.text === ']'));
      expect(brackets).toHaveLength(2);
      
      // Note: Primitive values (numbers) are not AST nodes
      // Only mlld constructs get location data
    });
    
    it('highlights arrays with mlld constructs', async () => {
      const code = '/var @items = [<file.md>, @exec(@cmd), @var]';
      const tokens = await getSemanticTokens(code);
      
      // Check brackets
      const brackets = tokens.filter(t => t.tokenType === 'operator' && (t.text === '[' || t.text === ']'));
      expect(brackets).toHaveLength(2);
      
      // mlld constructs DO get highlighted
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '<file.md>',
        tokenType: 'alligator'
      }));
      
      // @exec(@cmd) is parsed as ExecInvocation
      const execToken = tokens.find(t => t.text?.includes('exec'));
      expect(execToken).toBeDefined();
      
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@var',
        tokenType: 'variableRef'
      }));
    });
    
    it('highlights field access with dot notation', async () => {
      const code = '/show @user.profile.name';
      const tokens = await getSemanticTokens(code);
      
      // Check variable reference base
      const varRef = tokens.find(t => t.tokenType === 'variableRef' && t.text === '@user');
      expect(varRef).toBeDefined();
      
      // Check dots as operators  
      const dots = tokens.filter(t => t.tokenType === 'operator' && t.text === '.');
      expect(dots).toHaveLength(2);
      
      // Check properties
      const properties = tokens.filter(t => t.tokenType === 'property');
      expect(properties).toHaveLength(2); // profile and name
      expect(properties[0].text).toBe('profile');
      expect(properties[1].text).toBe('name');
    });
    
    it('highlights array indexing', async () => {
      const code = '/show @items[0]';
      const tokens = await getSemanticTokens(code);
      
      const varRef = tokens.find(t => t.tokenType === 'variableRef');
      expect(varRef).toBeDefined();
      expect(varRef?.text).toBe('@items');
      
      const numbers = tokens.filter(t => t.tokenType === 'number');
      expect(numbers).toHaveLength(1);
      expect(numbers[0].text).toBe('0');
    });
  });

  describe('Error Recovery', () => {
    it('handles partial AST gracefully', async () => {
      const code = '/var @incomplete ='; // Incomplete directive
      
      // Parse error should throw
      await expect(getSemanticTokens(code)).rejects.toThrow('Parse error');
    });
    
    it('handles syntax errors without crashing', async () => {
      const code = '/var @test = {{invalid}}'; // Wrong template syntax
      
      // This might throw or might produce partial tokens depending on parser
      try {
        const tokens = await getSemanticTokens(code);
        // If it doesn't throw, should still provide some tokens
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens).toContainEqual(expect.objectContaining({
          text: '/var',
          tokenType: 'directive'
        }));
      } catch (e) {
        // Parse error is also acceptable
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toContain('Parse error');
      }
    });
  });
});