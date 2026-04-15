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
      offsetAt: (position: any) => {
        const lines = content.split('\n');
        let offset = 0;
        for (let i = 0; i < position.line; i++) {
          offset += (lines[i]?.length || 0) + 1;
        }
        return offset + position.character;
      },
      positionAt: (offset: number) => {
        const lines = content.split('\n');
        let remaining = offset;

        for (let line = 0; line < lines.length; line++) {
          const lineLength = lines[line].length;
          if (remaining <= lineLength) {
            return { line, character: remaining };
          }
          remaining -= lineLength + 1;
        }

        const lastLine = Math.max(lines.length - 1, 0);
        return { line: lastLine, character: lines[lastLine]?.length || 0 };
      }
    })
  }
}));

// Import after mocks are set up
import { ASTSemanticVisitor } from '@services/lsp/ASTSemanticVisitor';
import { SemanticTokensBuilder } from 'vscode-languageserver/node';
import { TextDocument } from 'vscode-languageserver-textdocument';

// Token types from LSP visitors and embedded tokenization
const TOKEN_TYPES = [
  'directive',
  'directiveDefinition',
  'directiveAction',
  'cmdLanguage',
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
  'alligatorOpen',
  'alligatorClose',
  'xmlTag',
  'section',
  'namespace',
  'typeParameter',
  'label',
  'type',
  'property',
  'function',
  'modifier',
  'enum',
  'interface',
  'method',
  'class',
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
  const parseResult = await parse(code, { mode: 'strict', startRule: 'Start' });
  
  if (!parseResult.success) {
    throw new Error(`Parse error: ${parseResult.error.message}`);
  }
  
  const builder = new SemanticTokensBuilder();
  const visitor = new ASTSemanticVisitor(document, builder, TOKEN_TYPES, TOKEN_MODIFIERS);
  await visitor.visitAST(parseResult.ast);
  
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

      const directive = tokens.find(t => t.text === '/var' && (t.tokenType === 'directiveDefinition' || t.tokenType === 'directive'));
      expect(directive).toBeDefined();
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

    it('highlights record directives and record display keys', async () => {
      const code = `/record @contact = {
  facts: [email: string, name: string],
  data: [notes: string?],
  display: {
    role:planner: [name, { ref: "email" }],
    role:worker: [name, { mask: "email" }]
  }
}`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '/record',
        tokenType: 'directiveDefinition'
      });
      expectToken(tokens, {
        text: '@contact',
        tokenType: 'variable',
        modifiers: ['declaration']
      });
      expectToken(tokens, {
        text: 'facts',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'data',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'display',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'role:planner',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'role:worker',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'mask',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'ref',
        tokenType: 'property'
      });
    });

    it('highlights authorizable policy keys and plain-object role labels', async () => {
      const code = `/var @policy = {
  authorizations: {
    authorizable: {
      role:planner: [@sendEmail]
    }
  }
}`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: 'authorizations',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'authorizable',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'role:planner',
        tokenType: 'property'
      });
    });

    it('highlights input-record catalog keys and trust sections', async () => {
      const code = `/record @send_email_inputs = {
  facts: [recipient: string],
  data: {
    trusted: [subject: string?],
    untrusted: [body: string]
  },
  key: recipient,
  correlate: true,
  exact: [subject],
  update: [body],
  allowlist: { recipient: @approvedRecipients },
  blocklist: { recipient: ["blocked-recipient"] },
  optional_benign: [],
  validate: "strict"
}

var tools @agentTools = {
  send_email: {
    mlld: @send_email,
    inputs: @send_email_inputs,
    labels: ["execute:w"],
    authorizable: "role:planner",
    description: "Send a message",
    instructions: "Prefer drafts first"
  }
}`;
      const tokens = await getSemanticTokens(code);

      for (const text of [
        'trusted',
        'untrusted',
        'key',
        'correlate',
        'exact',
        'update',
        'allowlist',
        'blocklist',
        'optional_benign',
        'validate',
        'inputs',
        'labels',
        'authorizable',
        'description',
        'instructions'
      ]) {
        expectToken(tokens, {
          text,
          tokenType: 'property'
        });
      }
    });
    
    it('highlights multiple directives', async () => {
      const code = `/var @x = 1
/show @x
/exe @cmd = run {ls}`;
      const tokens = await getSemanticTokens(code);

      const directives = tokens.filter(t =>
        ['directiveDefinition', 'directiveAction', 'directive'].includes(t.tokenType) &&
        t.text?.startsWith('/')
      );
      expect(directives.map(d => d.text)).toEqual(['/var', '/show', '/exe']);
    });

    it('highlights canonical named-op filters in guard directives', async () => {
      const code = '/guard before @gate for op:named:email.send = when [ * => allow ]';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: 'before',
        tokenType: 'keyword'
      });
      expectToken(tokens, {
        text: '@gate',
        tokenType: 'variable',
        modifiers: ['declaration']
      });
      expectToken(tokens, {
        text: 'op',
        tokenType: 'keyword'
      });
      expectToken(tokens, {
        text: 'named:email.send',
        tokenType: 'variable'
      });
    });

    it('highlights named-op hooks and @mx.op.named field access', async () => {
      const code = `/hook before op:named:claudePoll("review") = when [
  @mx.op.named == "op:named:claudepoll" => show "hit"
]`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: 'before',
        tokenType: 'keyword'
      });
      expectToken(tokens, {
        text: 'op',
        tokenType: 'keyword'
      });
      expectToken(tokens, {
        text: 'named:claudePoll',
        tokenType: 'variable'
      });
      expectToken(tokens, {
        text: '"review"',
        tokenType: 'string'
      });
      expectToken(tokens, {
        text: '@mx',
        tokenType: 'variableRef'
      });
      expectToken(tokens, {
        text: 'op',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'named',
        tokenType: 'property'
      });
    });

    it('highlights /export directive and members', async () => {
      const code = '/export { name, other as alias }';
      const tokens = await getSemanticTokens(code);

      // Directive token
      expectToken(tokens, {
        text: '/export',
        tokenType: 'directive'
      });

      // At least one exported symbol marked as variable declaration
      const decl = tokens.find(t => t.tokenType === 'variable' && t.modifiers.includes('declaration'));
      expect(decl).toBeDefined();
    });

    it('highlights append template interpolations and nested fields', async () => {
      const code = '/append `@mx.op.name hit=@mx.checkpoint.hit` to "cache.log"';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '@mx',
        tokenType: 'interpolation'
      });
      expectToken(tokens, {
        text: 'op',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'checkpoint',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'to',
        tokenType: 'keyword'
      });
    });

    it('highlights dynamic tool collection dispatch', async () => {
      const code = '/show @writeTools[@step.write_tool](@step.args) with { policy: @auth.policy }';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '@writeTools',
        tokenType: 'function',
        modifiers: ['reference']
      });
      expectToken(tokens, {
        text: '@step',
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
      expectToken(tokens, {
        text: 'write_tool',
        tokenType: 'property'
      });
    });

    it('highlights trailing property access after exec invocations', async () => {
      const code = '/when @policy.validate(@output, @writeTools).valid == false => show "retry"';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '@policy',
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
      expectToken(tokens, {
        text: 'validate',
        tokenType: 'function'
      });
      expectToken(tokens, {
        text: 'valid',
        tokenType: 'property'
      });
    });

    it('highlights pipeline stages after literal values', async () => {
      const code = '/var @msg = "  hello pipeline  " | @trim';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '@trim',
        tokenType: 'function'
      });
    });

    it('highlights @cast and handle accessors', async () => {
      const code = '/show @cast(@raw, @contact).mx.handles';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '@cast',
        tokenType: 'function'
      });
      expectToken(tokens, {
        text: 'mx',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'handles',
        tokenType: 'property'
      });
    });

    it('highlights sign directive targets and methods', async () => {
      const code = 'sign @template with sha256';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '@template',
        tokenType: 'variableRef'
      });
      expectToken(tokens, {
        text: 'with',
        tokenType: 'keyword'
      });
      expectToken(tokens, {
        text: 'sha256',
        tokenType: 'keyword'
      });
    });

    it('highlights shelf directives and shelf declarations', async () => {
      const code = `/shelf @pipeline = {
  recipients: contact[],
  selected: contact? from recipients
}`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '/shelf',
        tokenType: 'directiveDefinition'
      });
      expectToken(tokens, {
        text: '@pipeline',
        tokenType: 'variable',
        modifiers: ['declaration']
      });
    });
  });
  
  describe('Template Contexts', () => {
    it('highlights backtick templates with @var interpolation', async () => {
      const code = '/var @msg = `Hello @name!`';
      const tokens = await getSemanticTokens(code);
      
      // Should have template delimiters
      const templates = tokens.filter(t => t.tokenType === 'operator' && t.text === '`');
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

    it('highlights inline /for and /end keywords inside templates', async () => {
      const code = `/var @arr = ["a","b"]
/var @msg = ::
/for @x in @arr
@x
/end
::`;
      const tokens = await getSemanticTokens(code);

      const interpolations = tokens.filter(t => t.tokenType === 'interpolation' && t.length === 2);
      expect(interpolations.length).toBeGreaterThan(0);
    });

    it('visits inline /for source literals inside templates', async () => {
      const code = `/var @tpl = \`
/for @v in ["x","y"]
- @v
/end
\``;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '"x"',
        tokenType: 'string'
      });
      expectToken(tokens, {
        text: '"y"',
        tokenType: 'string'
      });
    });

    it('highlights inline /show inside templates', async () => {
      const code = `/var @msg = \`
/show {echo "ok"}
\``;
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const tokens = await getSemanticTokens(code);
        const backticks = tokens.filter(t => t.tokenType === 'operator' && t.text === '`');
        expect(backticks.length).toBeGreaterThanOrEqual(1);
        expect(errorSpy.mock.calls.some(([message]) => String(message).includes('[TOKEN-ERROR]'))).toBe(false);
      } finally {
        errorSpy.mockRestore();
      }
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
      const code = '/when @score > 90 => show "A"';
      const tokens = await getSemanticTokens(code);
      
      // Should have > operator
      expectToken(tokens, {
        text: '>',
        tokenType: 'operator'
      });
      
      // Should have => operator
      const arrow = tokens.find(t => t.text === '=>' && (t.tokenType === 'operator' || t.tokenType === 'modifier'));
      expect(arrow).toBeDefined();
    });
    
    it('highlights logical operators', async () => {
      const code = '/when @isValid && !@isLocked => show "OK"';
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
      
      // Python isn't supported by embedded language service yet (no WASM file)
      // Braces are tokenized
      const openBrace = tokens.find(t => t.text === '{');
      expect(openBrace).toBeDefined();
      const closeBrace = tokens.find(t => t.text === '}');
      expect(closeBrace).toBeDefined();
    });
  });
  
  describe('Variable References', () => {
    it('distinguishes declarations from references', async () => {
      const code = `/var @name = "Alice"
/show @name`;
      const tokens = await getSemanticTokens(code);
      
      // First @name should be declaration
      const firstNameToken = tokens.find(t => t.text === '@name' && t.modifiers.includes('declaration'));
      expect(firstNameToken?.tokenType).toBe('variable');
      expect(firstNameToken?.modifiers).toContain('declaration');
      
      // Second @name should be reference
      const secondNameToken = tokens.find(t => t.tokenType === 'variableRef' && t.modifiers.includes('reference'));
      expect(secondNameToken?.tokenType).toBe('variableRef');
      expect(secondNameToken?.modifiers).toContain('reference');
    });

    it('highlights implicit record fact source shorthands', async () => {
      const code = `/record @contact = {
  facts: [email: string]
}`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: 'email',
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
    });

    it('highlights bare output-record references after exe code blocks', async () => {
      const code = `record @contact = {
  facts: [email: string]
}

exe @emitContacts() = js {
  return []
} => contact`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: 'contact',
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
    });
  });
  
  describe('Complex Scenarios', () => {
    it('handles nested contexts correctly', async () => {
      const code = `/exe @greet(name) = \`Hello @name!\`
/var @msg = @greet("World")
/show @msg`;
      
      const tokens = await getSemanticTokens(code);
      
      // Should have 3 directives
      const directives = tokens.filter(t =>
        ['directiveDefinition', 'directiveAction', 'directive'].includes(t.tokenType) &&
        t.text?.startsWith('/')
      );
      expect(directives.length).toBeGreaterThanOrEqual(2);
      
      // Should have parameter in exe
      const params = tokens.filter(t => t.tokenType === 'parameter');
      expect(params.length).toBeGreaterThan(0);
      
      // Should have interpolation in template
      const interpolations = tokens.filter(t => t.tokenType === 'interpolation');
      expect(interpolations.length).toBeGreaterThan(0);
    });
    
    it('handles when expressions', async () => {
      const code = `/when @env: [
  "prod" => show "Production"
  "dev" => show "Development"
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

    it('highlights nullish operators in block expressions', async () => {
      const code = `loop(1) [
  let @x = @none ?? \`loop-@suffix\`
  show @x
]`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '??',
        tokenType: 'operator'
      });
    });

    it('highlights skip results in for/when filters as keywords', async () => {
      const code = `var @filtered = for @x in @items => when [
  none => skip
]`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: 'skip',
        tokenType: 'keyword'
      });
    });
  });

  describe('Foreach Wrappers', () => {
    it('handles foreach-command wrappers in exe bodies', async () => {
      const code = 'exe @wrapAll(items) = foreach @wrap(@items)';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: 'foreach',
        tokenType: 'keyword'
      });
      expectToken(tokens, {
        text: '@wrap',
        tokenType: 'function',
        modifiers: ['reference']
      });
    });

    it('visits variable refs inside piped cmd blocks', async () => {
      const code = `exe llm @agent(prompt, config) = [
  => @prompt | cmd { claude -p --allowedTools "@mx.llm.allowed" }
]`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '@mx',
        tokenType: 'variableRef',
        modifiers: ['reference']
      });
      expectToken(tokens, {
        text: 'llm',
        tokenType: 'property'
      });
      expectToken(tokens, {
        text: 'allowed',
        tokenType: 'property'
      });
    });
  });

  describe('MCP Import Directives', () => {
    it('tokenizes tools and mcp keywords in selected MCP import', async () => {
      const code = '/import tools { @readFile } from mcp "filesystem"';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '/import',
        tokenType: 'directive'
      });

      expectToken(tokens, {
        text: 'tools',
        tokenType: 'keyword'
      });

      expectToken(tokens, {
        text: 'mcp',
        tokenType: 'keyword'
      });

      expectToken(tokens, {
        text: 'from',
        tokenType: 'keyword'
      });
    });

    it('tokenizes tools and mcp keywords in namespace MCP import', async () => {
      const code = '/import tools from mcp "filesystem" as @fs';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: 'tools',
        tokenType: 'keyword'
      });

      expectToken(tokens, {
        text: 'mcp',
        tokenType: 'keyword'
      });
    });

    it('tokenizes MCP tool collections sourced from variables', async () => {
      const code = `var @serverSpec = "node ./calendar-server.cjs"
var tools trusted @calendarTools = mcp @serverSpec`;
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '@serverSpec',
        tokenType: 'variableRef'
      });
    });
  });

  describe('Box Directives', () => {
    it('tokenizes box directive with config and block', async () => {
      const code = '/box @config [show "hello"]';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '/box',
        tokenType: 'directive'
      });

      // Config variable reference
      expectToken(tokens, {
        text: '@config',
        tokenType: 'variableRef'
      });

      // Block brackets
      const brackets = tokens.filter(t => t.tokenType === 'operator' && (t.text === '[' || t.text === ']'));
      expect(brackets.length).toBeGreaterThanOrEqual(2);
    });

    it('tokenizes box with-clause literals', async () => {
      const code = '/box with { profile: "readonly" } [show "hello"]';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '"readonly"',
        tokenType: 'string'
      });
    });
  });

  describe('Loop Expressions', () => {
    it('tokenizes loop expressions with variable limits and control flow', async () => {
      const code = 'var @finalResponse = loop(@maxIterations) until @done [ continue ]';
      const tokens = await getSemanticTokens(code);

      const loopKeyword = tokens.find(t => t.tokenType === 'keyword' && t.text?.includes('loop'));
      expect(loopKeyword).toBeDefined();

      expectToken(tokens, {
        text: '@maxIterations',
        tokenType: 'variableRef'
      });

      expectToken(tokens, {
        text: 'until',
        tokenType: 'keyword'
      });

      expectToken(tokens, {
        text: '@done',
        tokenType: 'variableRef'
      });

      expectToken(tokens, {
        text: 'continue',
        tokenType: 'keyword'
      });
    });
  });

  describe('File Projection Directives', () => {
    it('tokenizes file and files targets', async () => {
      const fileTokens = await getSemanticTokens('/file "task.md" = "hello"');
      const quotedTarget = fileTokens.find(t => t.tokenType === 'string' && t.text?.includes('"task.md"'));
      expect(quotedTarget).toBeDefined();

      const filesTokens = await getSemanticTokens('/files <@workspace/src/> = []');
      expectToken(filesTokens, {
        text: '@workspace',
        tokenType: 'variableRef'
      });

      const resolverSuffix = filesTokens.find(t => t.tokenType === 'alligator' && t.text?.includes('/src/'));
      expect(resolverSuffix).toBeDefined();
    });

    it('tokenizes path-segment fields inside load-content references', async () => {
      const tokens = await getSemanticTokens('exe @pick() = [ => <@mx.outPath>? | @parse.llm ]');

      expectToken(tokens, {
        text: 'outPath',
        tokenType: 'property'
      });
    });
  });

  describe('Policy Directives', () => {
    it('tokenizes policy directive with object expression', async () => {
      const code = '/policy @myPolicy = { rules: [] }';
      const tokens = await getSemanticTokens(code);

      expectToken(tokens, {
        text: '/policy',
        tokenType: 'directiveDefinition'
      });

      // Policy name as variable declaration
      expectToken(tokens, {
        text: '@myPolicy',
        tokenType: 'variable',
        modifiers: ['declaration']
      });

      // = operator
      expectToken(tokens, {
        text: '=',
        tokenType: 'operator'
      });
    });
  });
});
