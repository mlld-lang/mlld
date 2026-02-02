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

// Token types and modifiers normalized to the expectation set used in tests
const TOKEN_TYPES = [
  'keyword',          // 0 - Keywords and directives
  'variable',         // 1 - Variables (declarations and references)
  'string',           // 2 - Strings, templates, file paths
  'operator',         // 3 - Operators and brackets
  'label',            // 4 - Labels for sections and languages
  'type',             // 5 - Types (used for XML tags)
  'parameter',        // 6 - Function parameters
  'comment',          // 7 - Comments
  'number',           // 8 - Numbers
  'property'          // 9 - Object properties
];

// Map mlld-specific token names to the expectation set used in tests
const TOKEN_TYPE_MAP: Record<string, string> = {
  // mlld-specific mappings
  'directive': 'keyword',          // /var, /show, etc.
  'directiveDefinition': 'keyword',
  'directiveAction': 'keyword',
  'cmdLanguage': 'label',
  'variableRef': 'variable',       // @variable references
  'interpolation': 'variable',     // @var in templates
  'template': 'operator',          // Template delimiters
  'templateContent': 'string',     // Template content
  'embedded': 'label',             // Language labels (js, python)
  'embeddedCode': 'string',        // Embedded code content
  'alligator': 'string',           // File paths in <>
  'alligatorOpen': 'operator',     // < bracket
  'alligatorClose': 'operator',    // > bracket
  'xmlTag': 'type',                // XML tags
  'section': 'label',              // Section names
  'boolean': 'keyword',            // true/false
  'null': 'keyword',               // null
  'namespace': 'label',
  'typeParameter': 'type',
  'function': 'variable',
  'modifier': 'operator',
  'enum': 'operator',
  'interface': 'string',
  'method': 'variable',
  'class': 'type',
  // Standard types (pass through)
  'keyword': 'keyword',
  'variable': 'variable',
  'string': 'string',
  'operator': 'operator',
  'parameter': 'parameter',
  'comment': 'comment',
  'number': 'number',
  'property': 'property',
  'label': 'label',
  'type': 'type'
};

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
  const parseResult = await parse(code, { mode: 'strict', startRule: 'Start' });
  
  if (!parseResult.success) {
    throw new Error(`Parse error: ${parseResult.error.message}`);
  }
  
  const builder = new SemanticTokensBuilder();
  const visitor = new ASTSemanticVisitor(document, builder, TOKEN_TYPES, TOKEN_MODIFIERS, TOKEN_TYPE_MAP);
  await visitor.visitAST(parseResult.ast);
  
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
        tokenType: 'keyword'
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
      
      // Find template delimiters (backticks)
      // Backtick delimiters are tokenized as separate operator tokens
      const templateTokens = tokens.filter(t => t.tokenType === 'operator' && t.text?.includes('`'));
      expect(templateTokens.length).toBeGreaterThanOrEqual(2);
      
      // Find interpolation
      const interpolation = tokens.find(t => t.tokenType === 'variable');
      expect(interpolation).toBeDefined();
      expect(interpolation?.tokenType).toBe('variable');
    });
    
    it('should handle double-colon templates with @var interpolation', async () => {
      const code = '/var @msg = ::Hello @name!::';
      const tokens = await getSemanticTokens(code);
      
      // Template delimiters (::)
      // Double-colon delimiters are tokenized as separate operator tokens
      const templateTokens = tokens.filter(t => t.tokenType === 'operator' && t.text?.includes('::'));
      expect(templateTokens.length).toBeGreaterThanOrEqual(2);
      
      // Should have @var interpolation
      const interpolation = tokens.find(t => t.tokenType === 'variable');
      expect(interpolation).toBeDefined();
    });
    
    it('should handle triple-colon templates with {{var}} interpolation', async () => {
      const code = '/var @tweet = :::Hey @alice, check out {{topic}}!:::';
      const tokens = await getSemanticTokens(code);
      
      // Template delimiters (:::)
      // Triple-colon delimiters are tokenized as separate operator tokens
      const templateTokens = tokens.filter(t => t.tokenType === 'operator' && t.text?.includes(':::'));
      expect(templateTokens.length).toBeGreaterThanOrEqual(2);
      
      // Should have {{var}} interpolation
      const interpolation = tokens.find(t => t.tokenType === 'variable' && t.length === 9); // {{topic}}
      expect(interpolation).toBeDefined();
      
      // @alice should NOT be interpolated in triple-colon
      const invalidInterpolation = tokens.find(t => 
        t.tokenType === 'variable' && t.char === 17 // position of @alice
      );
      expect(invalidInterpolation).toBeUndefined();
    });
    
    it('should not interpolate in single quotes', async () => {
      const code = "/var @msg = 'Hello @name!'";
      const tokens = await getSemanticTokens(code);
      
      // Should have literal string modifier
      const stringToken = tokens.find(t => t.tokenType === 'string');
      expect(stringToken?.modifiers).toContain('literal');
      
      // Should not have any interpolation tokens within the string
      // @msg at position 5 is the declaration, @name would be at position 19 if interpolated
      const interpolations = tokens.filter(t => t.tokenType === 'variable' && t.char > 12);
      expect(interpolations).toHaveLength(0);
    });
  });
  
  describe('File References (Alligator Syntax)', () => {
    it.skip('should highlight file references in interpolating contexts', async () => {
      // TODO: Fix template parsing when template contains only a file reference
      const code = '/var @content = `<README.md>`';
      const tokens = await getSemanticTokens(code);
      
      // File references in templates should have either:
      // 1. An alligator token (if tokenized as components)
      // 2. Or operator tokens for < and > (if fully tokenized)
      const hasFileRefTokens = tokens.some(t => t.tokenType === 'string') ||
                              (tokens.some(t => t.text === '<' && t.tokenType === 'operator') &&
                               tokens.some(t => t.text === '>' && t.tokenType === 'operator'));
      expect(hasFileRefTokens).toBe(true);
    });
    
    it('should highlight file references with sections', async () => {
      const code = '/var @intro = <docs.md # Introduction>';
      const tokens = await getSemanticTokens(code);
      
      const alligator = tokens.find(t => t.tokenType === 'string');
      expect(alligator).toBeDefined();
      
      const section = tokens.find(t => t.tokenType === 'label');
      expect(section).toBeDefined();
    });
    
    it('should tokenize file references in triple-colon templates', async () => {
      const code = '/var @xml = :::<file.md>:::';
      const tokens = await getSemanticTokens(code);
      
      // Triple-colon templates tokenize delimiters; file refs stay inside template content
      const delimiters = tokens.filter(t => t.tokenType === 'operator' && t.text === ':::');
      expect(delimiters.length).toBeGreaterThanOrEqual(2);
    });
  });
  
  describe('Embedded Languages', () => {
    it('should highlight language identifiers', async () => {
      const code = '/run js { console.log("Hello"); }';
      const tokens = await getSemanticTokens(code);
      
      const embedded = tokens.find(t => t.tokenType === 'label');
      expect(embedded).toMatchObject({
        tokenType: 'label',
        length: 2 // 'js'
      });
    });
    
    it('should mark embedded code regions', async () => {
      const code = '/run python { print("Hello") }';
      const tokens = await getSemanticTokens(code);
      
      // We don't tokenize the entire code block as a string
      // Instead, we tokenize the language identifier as 'label'
      const languageToken = tokens.find(t => t.tokenType === 'label' && t.text === 'python');
      expect(languageToken).toBeDefined();
      
      // Braces are tokenized
      const braces = tokens.filter(t => t.text === '{' || t.text === '}');
      expect(braces.length).toBeGreaterThanOrEqual(2);
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
        tokenType: 'label'
      }));
      
      // The code block should be marked as embedded
      const embeddedCode = tokens.filter(t => t.tokenType === 'string');
      expect(embeddedCode.length).toBeGreaterThan(0);
    });
  });
  
  describe('Operators', () => {
    it('should highlight logical operators', async () => {
      const code = '/when @isValid && @hasPermission => show "OK"';
      const tokens = await getSemanticTokens(code);
      
      const operators = tokens.filter(t => t.tokenType === 'operator');
      expect(operators.length).toBeGreaterThan(0);
      
      // Should include && and =>
      const andOp = operators.find(t => t.length === 2);
      expect(andOp).toBeDefined();
    });
    
    it('should highlight comparison operators', async () => {
      const code = '/when @score > 90 => show "Excellent!"';
      const tokens = await getSemanticTokens(code);
      
      const operators = tokens.filter(t => t.tokenType === 'operator');
      const gtOp = operators.find(t => t.length === 1);
      expect(gtOp).toBeDefined();
    });

    it('highlights pattern matching arrow operator', async () => {
      const code = `/when @status => show "Processing"`;
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
    
    it('should highlight end-of-line >> comments', async () => {
      const code = '/var @x = 10 >> this is a comment';
      const tokens = await getSemanticTokens(code);
      
      const comment = tokens.find(t => t.tokenType === 'comment');
      expect(comment).toBeDefined();
      expect(comment?.line).toBe(0);
      expect(comment?.char).toBeGreaterThanOrEqual(12); // After the value
    });
    
    it('should highlight end-of-line << comments', async () => {
      const code = '/show @result << another comment style';
      const tokens = await getSemanticTokens(code);
      
      const comment = tokens.find(t => t.tokenType === 'comment');
      expect(comment).toBeDefined();
      expect(comment?.tokenType).toBe('comment');
    });

    it('should highlight comments inside blocks', async () => {
      const code = `/loop(endless) [
  >> inside block
  /show "hi"
]`;
      const tokens = await getSemanticTokens(code);

      const comment = tokens.find(t => t.tokenType === 'comment');
      expect(comment).toBeDefined();
    });

    it('should highlight comments inside when blocks', async () => {
      const code = `/when [
  >> when block comment
  * => "ok"
]`;
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
      
      const boolean = tokens.find(t => t.tokenType === 'keyword');
      expect(boolean).toMatchObject({
        tokenType: 'keyword',
        length: 4 // 'true'
      });
    });
    
    it('should highlight null literals', async () => {
      const code = '/var @empty = null';
      const tokens = await getSemanticTokens(code);
      
      const nullToken = tokens.find(t => t.tokenType === 'keyword');
      expect(nullToken).toMatchObject({
        tokenType: 'keyword',
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
      const directives = tokens.filter(t => t.tokenType === 'keyword' && t.text?.startsWith('/'));
      expect(directives).toHaveLength(2);
      
      // Should have variable declaration and reference
      const varDecl = tokens.find(t => 
        t.tokenType === 'variable' && t.modifiers.includes('declaration')
      );
      expect(varDecl).toBeDefined();
      
      
      const varRef = tokens.find(t => 
        t.tokenType === 'variable' && t.modifiers?.includes('reference') && t.modifiers.includes('reference')
      );
      expect(varRef).toBeDefined();
    });
    
    it('should handle when expressions with multiple conditions', async () => {
      const code = `/when @request: [
  @method == "GET" && @path == "/users" => show \`List users\`
  @method == "POST" => show \`Create user\`
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
        tokenType: 'variable'
      }));
      
      // Check variable reference outside template
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@total',
        tokenType: 'variable'
      }));
    });
  });

  describe('Command Content Interpolation', () => {
    it('handles shell commands with @var interpolation', async () => {
      const code = '/run {echo "@name"}';
      const tokens = await getSemanticTokens(code);
      
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '/run',
        tokenType: 'keyword'
      }));
      
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@name',
        tokenType: 'variable'
      }));
    });
    
    it('handles complex shell commands with multiple interpolations', async () => {
      const code = '/run {cp "@source" "@dest"}'; // mlld doesn't support && in commands
      const tokens = await getSemanticTokens(code);

      const interpolations = tokens.filter(t => t.tokenType === 'variable');
      expect(interpolations).toHaveLength(2);
      expect(interpolations.map(t => t.text)).toEqual(['@source', '@dest']);
    });

    it('highlights variables in /run cmd blocks', async () => {
      const code = '/run cmd { echo @message }';
      const tokens = await getSemanticTokens(code);

      expect(tokens).toContainEqual(expect.objectContaining({
        text: '/run',
        tokenType: 'keyword'
      }));

      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@message',
        tokenType: 'variable'
      }));
    });

    it('highlights multiple variables in /run cmd blocks', async () => {
      const code = '/run cmd { curl @url -H @header }';
      const tokens = await getSemanticTokens(code);

      const interpolations = tokens.filter(t => t.tokenType === 'variable');
      expect(interpolations).toHaveLength(2);
      expect(interpolations.map(t => t.text)).toEqual(['@url', '@header']);
    });

    it('highlights function calls in /run @function(@arg)', async () => {
      const code = '/run @processor(@data)';
      const tokens = await getSemanticTokens(code);

      // Check that @processor is highlighted as a variable reference
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@processor',
        tokenType: 'variable'
      }));

      // Check that @data is highlighted as a variable
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@data',
        tokenType: 'variable'
      }));

      // Check that parentheses are highlighted as operators
      const operators = tokens.filter(t => t.tokenType === 'operator');
      expect(operators.some(t => t.text === '(')).toBe(true);
      expect(operators.some(t => t.text === ')')).toBe(true);
    });

    it('highlights function calls with multiple arguments', async () => {
      const code = '/run @transform(@input, @config)';
      const tokens = await getSemanticTokens(code);

      // Check function name
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@transform',
        tokenType: 'variable'
      }));

      // Check all arguments are highlighted
      const variables = tokens.filter(t => t.tokenType === 'variable');
      expect(variables).toHaveLength(3); // @transform, @input, @config
      expect(variables.map(t => t.text)).toEqual(['@transform', '@input', '@config']);

      // Check comma is highlighted as operator
      const operators = tokens.filter(t => t.tokenType === 'operator');
      expect(operators.some(t => t.text === ',')).toBe(true);
    });
  });

  describe('Structured Data', () => {
    it('highlights JSON objects', async () => {
      const code = '/var @config = {"name": "test", "value": 42}';
      const tokens = await getSemanticTokens(code);
      
      // Check braces
      const braces = tokens.filter(t => t.tokenType === 'operator' && (t.text === '{' || t.text === '}'));
      expect(braces.length).toBeGreaterThanOrEqual(2); // May have more with embedded language service
      
      // With embedded language service, we now get tokens for property names and values
      const strings = tokens.filter(t => t.tokenType === 'string');
      expect(strings.length).toBeGreaterThan(0); // Property names are tokenized as strings
      
      const numbers = tokens.filter(t => t.tokenType === 'number');
      expect(numbers).toContainEqual(expect.objectContaining({
        text: '42'
      }));
    });
    
    it('highlights arrays', async () => {
      const code = '/var @items = [1, 2, 3]';
      const tokens = await getSemanticTokens(code);
      
      // Check brackets
      const brackets = tokens.filter(t => t.tokenType === 'operator' && (t.text === '[' || t.text === ']'));
      expect(brackets.length).toBeGreaterThanOrEqual(2); // May have more with embedded language service
      
      // With embedded language service, we now get tokens for array items
      const numbers = tokens.filter(t => t.tokenType === 'number');
      expect(numbers).toHaveLength(3); // All three numbers should be tokenized
      expect(numbers).toContainEqual(expect.objectContaining({ text: '1' }));
      expect(numbers).toContainEqual(expect.objectContaining({ text: '2' }));
      expect(numbers).toContainEqual(expect.objectContaining({ text: '3' }));
    });
    
    it('highlights arrays with mlld constructs', async () => {
      const code = '/var @items = [<file.md>, @exec(@cmd), @var]';
      const tokens = await getSemanticTokens(code);
      
      // Check brackets
      const brackets = tokens.filter(t => t.tokenType === 'operator' && (t.text === '[' || t.text === ']'));
      expect(brackets).toHaveLength(2);
      
      // mlld constructs DO get highlighted - file references are now tokenized as <, filename, >
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '<',
        tokenType: 'operator'
      }));
      expect(tokens).toContainEqual(expect.objectContaining({
        text: 'file.md',
        tokenType: 'string'
      }));
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '>',
        tokenType: 'operator'
      }));
      
      // @exec(@cmd) is parsed as ExecInvocation
      const execToken = tokens.find(t => t.text?.includes('exec'));
      expect(execToken).toBeDefined();
      
      expect(tokens).toContainEqual(expect.objectContaining({
        text: '@var',
        tokenType: 'variable'
      }));
    });
    
    it('highlights field access with dot notation', async () => {
      const code = '/show @user.profile.name';
      const tokens = await getSemanticTokens(code);
      
      // Check variable reference base
      const varRef = tokens.find(t => t.tokenType === 'variable' && t.modifiers?.includes('reference') && t.text === '@user');
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
      
      const varRef = tokens.find(t => t.tokenType === 'variable' && t.modifiers?.includes('reference'));
      expect(varRef).toBeDefined();
      expect(varRef?.text).toBe('@items');
      
      const numbers = tokens.filter(t => t.tokenType === 'number');
      expect(numbers).toHaveLength(1);
      expect(numbers[0].text).toBe('0');
    });
  });

  describe('While Loops', () => {
    it('should highlight while directive with cap', async () => {
      const code = '/while (100) @processor';
      const tokens = await getSemanticTokens(code);

      // Check while directive
      const directive = tokens.find(t => t.tokenType === 'keyword' && t.text === '/while');
      expect(directive).toBeDefined();

      // Check parentheses as operators
      const operators = tokens.filter(t => t.tokenType === 'operator');
      expect(operators.some(o => o.text === '(')).toBe(true);
      expect(operators.some(o => o.text === ')')).toBe(true);

      // Check cap number
      const number = tokens.find(t => t.tokenType === 'number' && t.text === '100');
      expect(number).toBeDefined();

      // Check processor reference
      const varRef = tokens.find(t => t.tokenType === 'variable' && t.text === '@processor');
      expect(varRef).toBeDefined();
    });

    it('should highlight done keyword', async () => {
      const code = '/exe @countdown(n) = when [@n <= 0 => done "finished"]';
      const tokens = await getSemanticTokens(code);

      // Check done token
      const doneToken = tokens.find(t => t.text === 'done');
      expect(doneToken).toBeDefined();
      expect(['keyword', 'operator']).toContain(doneToken?.tokenType);
    });

    it('should highlight continue keyword', async () => {
      const code = '/exe @countdown(n) = when [* => continue (@n - 1)]';
      const tokens = await getSemanticTokens(code);

      // Check continue token
      const continueToken = tokens.find(t => t.text === 'continue');
      expect(continueToken).toBeDefined();
      expect(['keyword', 'operator']).toContain(continueToken?.tokenType);
    });
  });

  describe('Loop Blocks', () => {
    it('should highlight loop directive with until', async () => {
      const code = '/loop(3) until @done [continue]';
      const tokens = await getSemanticTokens(code);

      const directive = tokens.find(t => t.tokenType === 'keyword' && t.text === '/loop');
      expect(directive).toBeDefined();

      const untilToken = tokens.find(t => t.tokenType === 'keyword' && t.text === 'until');
      expect(untilToken).toBeDefined();

      const number = tokens.find(t => t.tokenType === 'number' && t.text === '3');
      expect(number).toBeDefined();

      const varRef = tokens.find(t => t.tokenType === 'variable' && t.text === '@done');
      expect(varRef).toBeDefined();
    });
  });

  describe('Streaming', () => {
    it('should highlight stream directive', async () => {
      const code = '/stream @output';
      const tokens = await getSemanticTokens(code);

      // Check stream directive
      const directive = tokens.find(t => t.tokenType === 'keyword' && t.text === '/stream');
      expect(directive).toBeDefined();

      // Check reference
      const varRef = tokens.find(t => t.tokenType === 'variable' && t.text === '@output');
      expect(varRef).toBeDefined();
    });
  });

  describe('Block Syntax (rc78)', () => {
    it('should highlight exe blocks with let and return', async () => {
      const code = '/exe @add(@a, @b) = [let @result = @a + @b; => @result]';
      const tokens = await getSemanticTokens(code);

      // Check directive
      const directive = tokens.find(t => t.tokenType === 'keyword' && t.text === '/exe');
      expect(directive).toBeDefined();

      // Check function name
      const funcName = tokens.find(t => t.tokenType === 'variable' && t.text === '@add' && t.modifiers?.includes('declaration'));
      expect(funcName).toBeDefined();

      // Check brackets
      const brackets = tokens.filter(t => t.tokenType === 'operator' && (t.text === '[' || t.text === ']'));
      expect(brackets).toHaveLength(2);

      // Check let keyword
      const letKeyword = tokens.find(t => t.tokenType === 'keyword' && t.text === 'let');
      expect(letKeyword).toBeDefined();

      // Check return arrow
      const returnArrow = tokens.find(t => t.tokenType === 'operator' && t.text === '=>');
      expect(returnArrow).toBeDefined();
    });

    it('should highlight let with += operator', async () => {
      const code = '/exe @counter() = [let @count = 0; let @count += 1; => @count]';
      const tokens = await getSemanticTokens(code);

      // Check let keywords
      const letKeywords = tokens.filter(t => t.tokenType === 'keyword' && t.text === 'let');
      expect(letKeywords).toHaveLength(2);

      // Check += operator
      const plusEqual = tokens.find(t => t.tokenType === 'operator' && t.text === '+=');
      expect(plusEqual).toBeDefined();

      // Check = operator (should also exist)
      const equal = tokens.find(t => t.tokenType === 'operator' && t.text === '=');
      expect(equal).toBeDefined();
    });

    it('should highlight for blocks with let', async () => {
      const code = '/for @item in @items [let @index = 0; show @item]';
      const tokens = await getSemanticTokens(code);

      // Check for directive
      const directive = tokens.find(t => t.tokenType === 'keyword' && t.text === '/for');
      expect(directive).toBeDefined();

      // Check brackets
      const brackets = tokens.filter(t => t.tokenType === 'operator' && (t.text === '[' || t.text === ']'));
      expect(brackets).toHaveLength(2);

      // Check let keyword inside block
      const letKeyword = tokens.find(t => t.tokenType === 'keyword' && t.text === 'let');
      expect(letKeyword).toBeDefined();
    });

    it('should highlight when blocks', async () => {
      const code = '/when @value: [1 => "one"; 2 => "two"]';
      const tokens = await getSemanticTokens(code);

      // Check when directive
      const directive = tokens.find(t => t.tokenType === 'keyword' && t.text === '/when');
      expect(directive).toBeDefined();

      // Check brackets
      const brackets = tokens.filter(t => t.tokenType === 'operator' && (t.text === '[' || t.text === ']'));
      expect(brackets).toHaveLength(2);

      // Check arrows
      const arrows = tokens.filter(t => t.tokenType === 'operator' && t.text === '=>');
      expect(arrows).toHaveLength(2);
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
          tokenType: 'keyword'
        }));
      } catch (e) {
        // Parse error is also acceptable
        expect(e).toBeInstanceOf(Error);
        expect(e.message).toContain('Parse error');
      }
    });
  });
});
