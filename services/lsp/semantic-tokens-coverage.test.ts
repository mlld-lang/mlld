import { describe, it, expect } from 'vitest';
import { getSemanticTokens } from '@services/lsp/semantic-tokens.test';

interface TokenExpectation {
  tokenType: string;
  text: string;
  modifiers?: string[];
}

async function expectTokens(code: string, expected: TokenExpectation[]): Promise<void> {
  const tokens = await getSemanticTokens(code);
  
  
  // Create a map of actual tokens by their text for easier comparison
  const actualTokensMap = new Map<string, any>();
  tokens.forEach(token => {
    if ((token as any).text) {
      actualTokensMap.set((token as any).text, token);
    }
  });
  
  // Check each expected token
  const missing: TokenExpectation[] = [];
  const incorrect: { expected: TokenExpectation; actual: any }[] = [];
  
  for (const exp of expected) {
    const actual = actualTokensMap.get(exp.text);
    
    if (!actual) {
      missing.push(exp);
    } else if (actual.tokenType !== exp.tokenType) {
      incorrect.push({ expected: exp, actual });
    } else if (exp.modifiers && !arraysEqual(actual.modifiers || [], exp.modifiers)) {
      incorrect.push({ expected: exp, actual });
    }
  }
  
  // Report results
  if (missing.length > 0 || incorrect.length > 0) {
    const report = [`Token Coverage Report for: ${code.substring(0, 50)}...`];
    
    // Debug: show actual tokens found
    if (code.includes('@greet("World")') || code.includes('docs.md #')) {
      report.push('\nFOUND TOKENS:');
      tokens.forEach(token => {
        const tokenInfo = token as any;
        report.push(`  - "${tokenInfo.text}" (type: ${tokenInfo.tokenType})`);
      });
    }
    
    if (missing.length > 0) {
      report.push('\nMISSING TOKENS:');
      missing.forEach(m => {
        report.push(`  - "${m.text}" (expected: ${m.tokenType})`);
      });
    }
    
    if (incorrect.length > 0) {
      report.push('\nINCORRECT TOKENS:');
      incorrect.forEach(({ expected, actual }) => {
        report.push(`  - "${expected.text}"`);
        report.push(`    expected: ${expected.tokenType}${expected.modifiers ? ` [${expected.modifiers.join(',')}]` : ''}`);
        report.push(`    actual: ${actual.tokenType}${actual.modifiers ? ` [${actual.modifiers.join(',')}]` : ''}`);
      });
    }
    
    report.push(`\nCoverage: ${((expected.length - missing.length) / expected.length * 100).toFixed(1)}%`);
    throw new Error(report.join('\n'));
  }
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

describe('Semantic Tokens Coverage Tests', () => {
  describe('Basic Directives and Variables', () => {
    it('tokenizes variable declarations with string values', async () => {
      const code = '/var @name = "John"';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@name', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"John"' }
      ]);
    });
    
    it('tokenizes /show with variable reference', async () => {
      const code = '/show @name';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/show' },
        { tokenType: 'variable', text: '@name', modifiers: ['reference'] }
      ]);
    });

    it('tokenizes /log with variable reference', async () => {
      const code = '/log @name';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/log' },
        { tokenType: 'variable', text: '@name', modifiers: ['reference'] }
      ]);
    });
    
    it('tokenizes /run with shell command', async () => {
      const code = '/run {echo "Hello"}';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/run' },
        { tokenType: 'operator', text: '{' },
        { tokenType: 'keyword', text: 'echo' },  // Shell commands should be highlighted
        { tokenType: 'string', text: '"Hello"' },
        { tokenType: 'operator', text: '}' }
      ]);
    });
  });
  
  describe('Variable Field Access', () => {
    it('tokenizes simple field access', async () => {
      const code = '/var @userName = @user.name';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@userName', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@user', modifiers: ['reference'] },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'name' }
      ]);
    });
    
    it('tokenizes nested field access', async () => {
      const code = '/var @host = @config.database.connection.host';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@host', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@config', modifiers: ['reference'] },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'database' },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'connection' },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'host' }
      ]);
    });
    
    it('tokenizes array index access', async () => {
      const code = '/var @firstItem = @items[0]';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@firstItem', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@items', modifiers: ['reference'] },
        { tokenType: 'operator', text: '[' },
        { tokenType: 'number', text: '0' },
        { tokenType: 'operator', text: ']' }
      ]);
    });
  });
  
  describe('Template Syntax', () => {
    it('tokenizes backtick templates with interpolation', async () => {
      const code = '/var @msg = `Hello @name!`';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '`' },
        { tokenType: 'string', text: 'Hello ' },
        { tokenType: 'variable', text: '@name' },
        { tokenType: 'string', text: '!' },
        { tokenType: 'operator', text: '`' }
      ]);
    });
    
    it('tokenizes double-colon templates', async () => {
      const code = '/var @msg = ::Welcome @user::';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '::' },
        { tokenType: 'string', text: 'Welcome ' },
        { tokenType: 'variable', text: '@user' },
        { tokenType: 'operator', text: '::' }
      ]);
    });
    
    it('tokenizes triple-colon templates with {{}} interpolation', async () => {
      const code = '/var @doc = :::Use {{package}} here:::';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@doc', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: ':::' },
        { tokenType: 'string', text: 'Use ' },
        { tokenType: 'variable', text: '{{package}}' },
        { tokenType: 'string', text: ' here' },
        { tokenType: 'operator', text: ':::' }
      ]);
    });
  });
  
  describe('String Literals', () => {
    it('tokenizes double-quoted strings with interpolation', async () => {
      const code = '/var @msg = "Hello @name from @city"';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"' },
        { tokenType: 'string', text: 'Hello ' },
        { tokenType: 'variable', text: '@name' },
        { tokenType: 'string', text: ' from ' },
        { tokenType: 'variable', text: '@city' },
        { tokenType: 'string', text: '"' }
      ]);
    });
    
    it('tokenizes single-quoted strings as literals', async () => {
      const code = "/var @msg = 'Hello @name!'";
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: "'Hello @name!'", modifiers: ['literal'] }
      ]);
    });
  });
  
  describe('Language-specific Code Blocks', () => {
    it('tokenizes /run js with embedded code', async () => {
      const code = '/run js { console.log("Hi"); }';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/run' },
        { tokenType: 'label', text: 'js' },
        { tokenType: 'operator', text: '{' },
        // JavaScript tokens would appear here when tree-sitter-javascript is loaded
        { tokenType: 'operator', text: '}' }
      ]);
    });
    
    // TODO: Enable when tree-sitter-python WASM is built and integrated
    it.skip('tokenizes /run python with embedded code', async () => {
      const code = '/run python { print(f"Result: {x}") }';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/run' },
        { tokenType: 'label', text: 'python' },
        { tokenType: 'operator', text: '{' },
        { tokenType: 'string', text: ' print(f"Result: {x}") ' },
        { tokenType: 'operator', text: '}' }
      ]);
    });
  });
  
  describe('Operators and Expressions', () => {
    it('tokenizes comparison operators', async () => {
      const code = '/var @check = @x > 5 && @y <= 10';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@check', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@x', modifiers: ['reference'] },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'number', text: '5' },
        { tokenType: 'operator', text: '&&' },
        { tokenType: 'variable', text: '@y', modifiers: ['reference'] },
        { tokenType: 'operator', text: '<=' },
        { tokenType: 'number', text: '10' }
      ]);
    });
    
    it('tokenizes ternary expressions', async () => {
      const code = '/var @msg = @isValid ? "Yes" : "No"';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@isValid', modifiers: ['reference'] },
        { tokenType: 'operator', text: '?' },
        { tokenType: 'string', text: '"Yes"' },
        { tokenType: 'operator', text: ':' },
        { tokenType: 'string', text: '"No"' }
      ]);
    });
  });

  describe('Pipelines And With-Clause', () => {
    it('tokenizes parallel groups in shorthand pipelines', async () => {
      const code = '/var @out = @x | @a || @b | @c';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@out', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@x', modifiers: ['reference'] },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@a' },
        { tokenType: 'operator', text: '||' },
        { tokenType: 'variable', text: '@b' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@c' }
      ]);
    });

    it('tokenizes with.pipeline nested arrays', async () => {
      const code = '/var @out = "x" with { pipeline: [ [@left, @right], @combine ] }';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@out', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"x"' },
        { tokenType: 'operator', text: '[' },
        { tokenType: 'operator', text: '[' },
        { tokenType: 'variable', text: '@left' },
        { tokenType: 'operator', text: ',' },
        { tokenType: 'variable', text: '@right' },
        { tokenType: 'operator', text: ']' },
        { tokenType: 'operator', text: ',' },
        { tokenType: 'variable', text: '@combine' },
        { tokenType: 'operator', text: ']' }
      ]);
    });

    it('tokenizes with { format: "json" }', async () => {
      const code = '/var @out = @data with { format: "json", pipeline: [@id] }';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@out', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@data', modifiers: ['reference'] },
        { tokenType: 'keyword', text: 'format' },
        { tokenType: 'string', text: '"json"' },
        { tokenType: 'operator', text: '[' },
        { tokenType: 'variable', text: '@id' },
        { tokenType: 'operator', text: ']' }
      ]);
    });
    it('tokenizes inline show effect in pipeline', async () => {
      const code = '/var @a = "textA" | show';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@a', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"textA"' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'keyword', text: 'show' }
      ]);
    });

    it('tokenizes inline log effect with string arg', async () => {
      const code = '/var @a = "x" | log "msg"';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@a', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"x"' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'keyword', text: 'log' },
        { tokenType: 'string', text: '"msg"' }
      ]);
    });

    it('tokenizes all pipes with even number of transforms (GH#328)', async () => {
      const code = '/var @x = @data | @transform1 | @transform2';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@x', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@data', modifiers: ['reference'] },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@transform1' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@transform2' }
      ]);
    });

    it('tokenizes all pipes with four transforms', async () => {
      const code = '/var @x = @val | @t1 | @t2 | @t3 | @t4';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@x', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@val', modifiers: ['reference'] },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@t1' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@t2' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@t3' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@t4' }
      ]);
    });

    it('tokenizes inline log effect with variable arg', async () => {
      const code = '/var @a = @x | log @a';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@a', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@x', modifiers: ['reference'] },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'keyword', text: 'log' },
        { tokenType: 'variable', text: '@a' }
      ]);
    });

    it('tokenizes inline output to stdout', async () => {
      const code = '/var @x = "hello" | output @input to stdout';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@x', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"hello"' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'keyword', text: 'output' },
        { tokenType: 'variable', text: '@input' },
        { tokenType: 'keyword', text: 'to' },
        { tokenType: 'keyword', text: 'stdout' }
      ]);
    });

    it('tokenizes inline output to quoted file', async () => {
      const code = '/var @w = "c" | output @input to "x-inline.txt"';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@w', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"c"' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'keyword', text: 'output' },
        { tokenType: 'variable', text: '@input' },
        { tokenType: 'keyword', text: 'to' },
        { tokenType: 'string', text: '"x-inline.txt"' }
      ]);
    });

    it('tokenizes with.pipeline effects: show/log', async () => {
      const code = '/var @x = "seed" with { pipeline: [ show, log "msg" ] }';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@x', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"seed"' },
        { tokenType: 'keyword', text: 'show' },
        { tokenType: 'keyword', text: 'log' },
        { tokenType: 'string', text: '"msg"' }
      ]);
    });

    it('tokenizes with.pipeline effect: output to stdout', async () => {
      const code = '/var @x = "hello" with { pipeline: [ output @input to stdout ] }';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@x', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"hello"' },
        { tokenType: 'keyword', text: 'output' },
        { tokenType: 'variable', text: '@input' },
        { tokenType: 'keyword', text: 'to' },
        { tokenType: 'keyword', text: 'stdout' }
      ]);
    });

    it('tokenizes with.pipeline effect: output to quoted file', async () => {
      const code = '/var @x = "hi" with { pipeline: [ output @input to "out.txt" ] }';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@x', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"hi"' },
        { tokenType: 'keyword', text: 'output' },
        { tokenType: 'variable', text: '@input' },
        { tokenType: 'keyword', text: 'to' },
        { tokenType: 'string', text: '"out.txt"' }
      ]);
    });
  });

  describe('Iteration Parallel', () => {
    it('tokenizes /for parallel with pacing', async () => {
      const code = '/for (3, 1s) parallel @n in @names => /show @n';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/for' },
        { tokenType: 'operator', text: '(' },
        { tokenType: 'number', text: '3' },
        { tokenType: 'operator', text: ',' },
        { tokenType: 'number', text: '1' },
        { tokenType: 'operator', text: ')' },
        { tokenType: 'keyword', text: 'parallel' },
        { tokenType: 'variable', text: '@n' },
        { tokenType: 'keyword', text: 'in' },
        { tokenType: 'variable', text: '@names' },
        { tokenType: 'operator', text: '=>' },
        { tokenType: 'keyword', text: '/show' },
        { tokenType: 'variable', text: '@n' }
      ]);
    });

    it('tokenizes /for parallel without pacing', async () => {
      const code = '/for parallel @n in [1,2] => /show @n';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/for' },
        { tokenType: 'keyword', text: 'parallel' },
        { tokenType: 'variable', text: '@n' },
        { tokenType: 'keyword', text: 'in' },
        { tokenType: 'operator', text: '[' },
        { tokenType: 'number', text: '1' },
        { tokenType: 'operator', text: ',' },
        { tokenType: 'number', text: '2' },
        { tokenType: 'operator', text: ']' },
        { tokenType: 'operator', text: '=>' },
        { tokenType: 'keyword', text: '/show' },
        { tokenType: 'variable', text: '@n' }
      ]);
    });
  });
  
  describe('File References (Alligator Syntax)', () => {
    it('tokenizes basic file references', async () => {
      const code = '/var @content = <README.md>';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@content', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'README.md' },
        { tokenType: 'operator', text: '>' }
      ]);
    });
    
    it('tokenizes file references with sections', async () => {
      const code = '/show <docs.md # Installation>';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/show' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'docs.md' },
        { tokenType: 'operator', text: '#' },
        { tokenType: 'label', text: 'Installation' },
        { tokenType: 'operator', text: '>' }
      ]);
    });
    
    it('tokenizes URLs', async () => {
      const code = '/var @data = <https://api.example.com/data>';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@data', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'https://api.example.com/data' },
        { tokenType: 'operator', text: '>' }
      ]);
    });
    
    it('tokenizes file references with field access', async () => {
      const code = '/var @author = `<package.json>.author.name`';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@author', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '`' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'package.json' },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'author' },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'name' },
        { tokenType: 'operator', text: '`' }
      ]);
    });
    
    it('tokenizes file references with pipes', async () => {
      const code = '/var @formatted = `<data.json>|@json|@xml`';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@formatted', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '`' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'data.json' },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@json' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variable', text: '@xml' },
        { tokenType: 'operator', text: '`' }
      ]);
    });
    
    it('tokenizes file references in double quotes', async () => {
      const code = '/var @item = "<file.md>"';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@item', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'file.md' },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'string', text: '"' }
      ]);
    });
    
    it('tokenizes file references in double-colon templates', async () => {
      const code = '/var @item = ::<file.md>::';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@item', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '::' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'file.md' },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'operator', text: '::' }
      ]);
    });
    
    it('does not tokenize file references in single quotes', async () => {
      const code = '/var @item = \'<file.md>\'';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@item', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '\'<file.md>\'', modifiers: ['literal'] }
      ]);
    });
    
    it('tokenizes file references in triple-colon templates', async () => {
      const code = '/var @item = :::<file.md>:::';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@item', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: ':::' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'file.md' },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'operator', text: ':::' }
      ]);
    });
    
    it('tokenizes file references with section and as template', async () => {
      const code = '/var @file = <somefile.md # Something> as "## Something else"';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@file', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'somefile.md' },
        { tokenType: 'operator', text: '#' },
        { tokenType: 'label', text: 'Something' },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'keyword', text: 'as' },
        { tokenType: 'operator', text: '"' },
        { tokenType: 'string', text: '## Something else' },
        { tokenType: 'operator', text: '"' }
      ]);
    });
    
    // Fixed: Grammar now properly parses field access in direct assignments
    it('tokenizes file references with field access in direct assignment', async () => {
      const code = '/var @version = <package.json>.version';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@version', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'package.json' },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'version' }
      ]);
    });
    
    // Fixed: Grammar now properly parses pipes in direct assignments
    it('tokenizes file references with pipes in direct assignment', async () => {
      const code = '/var @formatted = <data.json>|@json|@xml';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@formatted', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '<' },
        { tokenType: 'string', text: 'data.json' },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'operator', text: '@' },
        { tokenType: 'variable', text: 'json' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'operator', text: '@' },
        { tokenType: 'variable', text: 'xml' }
      ]);
    });
  });
  
  describe('When Expressions', () => {
    it('tokenizes when with arrow', async () => {
      const code = '/when @isDev => /show "Dev mode"';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/when' },
        { tokenType: 'variable', text: '@isDev', modifiers: ['reference'] },
        { tokenType: 'operator', text: '=>' },
        { tokenType: 'keyword', text: '/show' },
        { tokenType: 'string', text: '"Dev mode"' }
      ]);
    });
    
    // TODO: Fix when block action tokenization - operators inside blocks not being captured
    it.skip('tokenizes when blocks', async () => {
      const code = `/when @env => [
  @config = "prod.json"
  /show "Production"
]`;
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/when' },
        { tokenType: 'variable', text: '@env', modifiers: ['reference'] },
        { tokenType: 'operator', text: '=>' },
        { tokenType: 'operator', text: '[' },
        { tokenType: 'variable', text: '@config', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"prod.json"' },
        { tokenType: 'keyword', text: '/show' },
        { tokenType: 'string', text: '"Production"' },
        { tokenType: 'operator', text: ']' }
      ]);
    });
  });
  
  describe('Parameters and Execution', () => {
    it('tokenizes /exe with parameters', async () => {
      const code = '/exe @greet(name) = `Hello @name!`';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/exe' },
        { tokenType: 'variable', text: '@greet', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '(' },
        { tokenType: 'parameter', text: 'name' },
        { tokenType: 'operator', text: ')' },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '`' },
        { tokenType: 'string', text: 'Hello ' },
        { tokenType: 'variable', text: '@name' },
        { tokenType: 'string', text: '!' },
        { tokenType: 'operator', text: '`' }
      ]);
    });

    it('tokenizes function invocation', async () => {
      const code = '/var @msg = @greet("World")';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variable', text: '@greet', modifiers: ['reference'] },
        { tokenType: 'operator', text: '(' },
        { tokenType: 'string', text: '"World"' },
        { tokenType: 'operator', text: ')' }
      ]);
    });
  });

  describe('Objects and Arrays with mlld Values (GH#332)', () => {
    it('tokenizes object with variable values', async () => {
      const code = '/var @data = { name: @userName, age: @userAge }';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@data', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '{' },
        // Note: Property keys ("name", "age") and colons are not currently tokenized
        // This is a known limitation separate from GH#332
        { tokenType: 'variable', text: '@userName' },
        { tokenType: 'operator', text: ',' },
        { tokenType: 'variable', text: '@userAge' },
        { tokenType: 'operator', text: '}' }
      ]);
    });

    it('tokenizes array with variable values', async () => {
      const code = '/var @items = [@a, @b, @c]';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@items', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '[' },
        { tokenType: 'variable', text: '@a' },
        { tokenType: 'operator', text: ',' },
        { tokenType: 'variable', text: '@b' },
        { tokenType: 'operator', text: ',' },
        { tokenType: 'variable', text: '@c' },
        { tokenType: 'operator', text: ']' }
      ]);
    });

    it('tokenizes nested object and array with variables', async () => {
      const code = '/var @data = { items: [@x, @y] }';
      await expectTokens(code, [
        { tokenType: 'keyword', text: '/var' },
        { tokenType: 'variable', text: '@data', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'operator', text: '{' },
        // Note: Property keys and colons not currently tokenized
        { tokenType: 'operator', text: '[' },
        { tokenType: 'variable', text: '@x' },
        { tokenType: 'operator', text: ',' },
        { tokenType: 'variable', text: '@y' },
        { tokenType: 'operator', text: ']' },
        { tokenType: 'operator', text: '}' }
      ]);
    });
  });
});

// Run a summary report at the end
describe('Coverage Summary', () => {
  it('generates coverage report', async () => {
    // This will run after all tests and show overall coverage
    console.log('\n=== Semantic Token Coverage Summary ===');
    console.log('Run individual tests to see specific failures');
    console.log('Each failure shows missing or incorrect tokens');
  });
});
