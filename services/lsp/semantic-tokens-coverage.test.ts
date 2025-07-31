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
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@name', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"John"' }
      ]);
    });
    
    it('tokenizes /show with variable reference', async () => {
      const code = '/show @name';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/show' },
        { tokenType: 'variableRef', text: '@name', modifiers: ['reference'] }
      ]);
    });
    
    it('tokenizes /run with shell command', async () => {
      const code = '/run {echo "Hello"}';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/run' },
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
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@userName', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variableRef', text: '@user', modifiers: ['reference'] },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'name' }
      ]);
    });
    
    it('tokenizes nested field access', async () => {
      const code = '/var @host = @config.database.connection.host';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@host', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variableRef', text: '@config', modifiers: ['reference'] },
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
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@firstItem', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variableRef', text: '@items', modifiers: ['reference'] },
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
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'template', text: '`' },
        { tokenType: 'templateContent', text: 'Hello ' },
        { tokenType: 'interpolation', text: '@name' },
        { tokenType: 'templateContent', text: '!' },
        { tokenType: 'template', text: '`' }
      ]);
    });
    
    it('tokenizes double-colon templates', async () => {
      const code = '/var @msg = ::Welcome @user::';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'template', text: '::' },
        { tokenType: 'templateContent', text: 'Welcome ' },
        { tokenType: 'interpolation', text: '@user' },
        { tokenType: 'template', text: '::' }
      ]);
    });
    
    it('tokenizes triple-colon templates with {{}} interpolation', async () => {
      const code = '/var @doc = :::Use {{package}} here:::';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@doc', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'template', text: ':::' },
        { tokenType: 'templateContent', text: 'Use ' },
        { tokenType: 'interpolation', text: '{{package}}' },
        { tokenType: 'templateContent', text: ' here' },
        { tokenType: 'template', text: ':::' }
      ]);
    });
  });
  
  describe('String Literals', () => {
    it('tokenizes double-quoted strings with interpolation', async () => {
      const code = '/var @msg = "Hello @name from @city"';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"' },
        { tokenType: 'string', text: 'Hello ' },
        { tokenType: 'interpolation', text: '@name' },
        { tokenType: 'string', text: ' from ' },
        { tokenType: 'interpolation', text: '@city' },
        { tokenType: 'string', text: '"' }
      ]);
    });
    
    it('tokenizes single-quoted strings as literals', async () => {
      const code = "/var @msg = 'Hello @name!'";
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
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
        { tokenType: 'directive', text: '/run' },
        { tokenType: 'embedded', text: 'js' },
        { tokenType: 'operator', text: '{' },
        { tokenType: 'embeddedCode', text: ' console.log("Hi"); ' },
        { tokenType: 'operator', text: '}' }
      ]);
    });
    
    it('tokenizes /run python with embedded code', async () => {
      const code = '/run python { print(f"Result: {x}") }';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/run' },
        { tokenType: 'embedded', text: 'python' },
        { tokenType: 'operator', text: '{' },
        { tokenType: 'embeddedCode', text: ' print(f"Result: {x}") ' },
        { tokenType: 'operator', text: '}' }
      ]);
    });
  });
  
  describe('Operators and Expressions', () => {
    it('tokenizes comparison operators', async () => {
      const code = '/var @check = @x > 5 && @y <= 10';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@check', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variableRef', text: '@x', modifiers: ['reference'] },
        { tokenType: 'operator', text: '>' },
        { tokenType: 'number', text: '5' },
        { tokenType: 'operator', text: '&&' },
        { tokenType: 'variableRef', text: '@y', modifiers: ['reference'] },
        { tokenType: 'operator', text: '<=' },
        { tokenType: 'number', text: '10' }
      ]);
    });
    
    it('tokenizes ternary expressions', async () => {
      const code = '/var @msg = @isValid ? "Yes" : "No"';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variableRef', text: '@isValid', modifiers: ['reference'] },
        { tokenType: 'operator', text: '?' },
        { tokenType: 'string', text: '"Yes"' },
        { tokenType: 'operator', text: ':' },
        { tokenType: 'string', text: '"No"' }
      ]);
    });
  });
  
  describe('File References (Alligator Syntax)', () => {
    it('tokenizes basic file references', async () => {
      const code = '/var @content = <README.md>';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@content', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'README.md' },
        { tokenType: 'alligatorClose', text: '>' }
      ]);
    });
    
    it('tokenizes file references with sections', async () => {
      const code = '/show <docs.md # Installation>';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/show' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'docs.md' },
        { tokenType: 'operator', text: '#' },
        { tokenType: 'section', text: 'Installation' },
        { tokenType: 'alligatorClose', text: '>' }
      ]);
    });
    
    it('tokenizes URLs', async () => {
      const code = '/var @data = <https://api.example.com/data>';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@data', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'https://api.example.com/data' },
        { tokenType: 'alligatorClose', text: '>' }
      ]);
    });
    
    it('tokenizes file references with field access', async () => {
      const code = '/var @author = `<package.json>.author.name`';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@author', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'template', text: '`' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'package.json' },
        { tokenType: 'alligatorClose', text: '>' },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'author' },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'name' },
        { tokenType: 'template', text: '`' }
      ]);
    });
    
    it('tokenizes file references with pipes', async () => {
      const code = '/var @formatted = `<data.json>|@json|@xml`';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@formatted', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'template', text: '`' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'data.json' },
        { tokenType: 'alligatorClose', text: '>' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variableRef', text: '@json' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variableRef', text: '@xml' },
        { tokenType: 'template', text: '`' }
      ]);
    });
    
    it('tokenizes file references in double quotes', async () => {
      const code = '/var @item = "<file.md>"';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@item', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'file.md' },
        { tokenType: 'alligatorClose', text: '>' },
        { tokenType: 'string', text: '"' }
      ]);
    });
    
    it('tokenizes file references in double-colon templates', async () => {
      const code = '/var @item = ::<file.md>::';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@item', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'template', text: '::' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'file.md' },
        { tokenType: 'alligatorClose', text: '>' },
        { tokenType: 'template', text: '::' }
      ]);
    });
    
    it('does not tokenize file references in single quotes', async () => {
      const code = '/var @item = \'<file.md>\'';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@item', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '\'<file.md>\'', modifiers: ['literal'] }
      ]);
    });
    
    it('tokenizes file references in triple-colon templates', async () => {
      const code = '/var @item = :::<file.md>:::';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@item', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'template', text: ':::' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'file.md' },
        { tokenType: 'alligatorClose', text: '>' },
        { tokenType: 'template', text: ':::' }
      ]);
    });
    
    it('tokenizes file references with section and as template', async () => {
      const code = '/var @file = <somefile.md # Something> as "## Something else"';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@file', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'somefile.md' },
        { tokenType: 'operator', text: '#' },
        { tokenType: 'section', text: 'Something' },
        { tokenType: 'alligatorClose', text: '>' },
        { tokenType: 'keyword', text: 'as' },
        { tokenType: 'string', text: '"' },
        { tokenType: 'string', text: '## Something else' },
        { tokenType: 'string', text: '"' }
      ]);
    });
    
    // TODO: Fix grammar to properly parse field access in direct assignments
    // See issues/GRAMMAR-FILE-REFERENCE-FIELD-ACCESS.md
    it.skip('tokenizes file references with field access in direct assignment', async () => {
      const code = '/var @version = <package.json>.version';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@version', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'package.json' },
        { tokenType: 'alligatorClose', text: '>' },
        { tokenType: 'operator', text: '.' },
        { tokenType: 'property', text: 'version' }
      ]);
    });
    
    // TODO: Fix grammar to properly parse pipes in direct assignments
    // See issues/GRAMMAR-FILE-REFERENCE-FIELD-ACCESS.md
    it.skip('tokenizes file references with pipes in direct assignment', async () => {
      const code = '/var @formatted = <data.json>|@json|@xml';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@formatted', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'alligatorOpen', text: '<' },
        { tokenType: 'alligator', text: 'data.json' },
        { tokenType: 'alligatorClose', text: '>' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variableRef', text: '@json' },
        { tokenType: 'operator', text: '|' },
        { tokenType: 'variableRef', text: '@xml' }
      ]);
    });
  });
  
  describe('When Expressions', () => {
    it('tokenizes when with arrow', async () => {
      const code = '/when @isDev => /show "Dev mode"';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/when' },
        { tokenType: 'variableRef', text: '@isDev', modifiers: ['reference'] },
        { tokenType: 'operator', text: '=>' },
        { tokenType: 'directive', text: '/show' },
        { tokenType: 'string', text: '"Dev mode"' }
      ]);
    });
    
    it('tokenizes when blocks', async () => {
      const code = `/when @env => [
  @config = "prod.json"
  /show "Production"
]`;
      await expectTokens(code, [
        { tokenType: 'directive', text: '/when' },
        { tokenType: 'variableRef', text: '@env', modifiers: ['reference'] },
        { tokenType: 'operator', text: '=>' },
        { tokenType: 'operator', text: '[' },
        { tokenType: 'variable', text: '@config', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'string', text: '"prod.json"' },
        { tokenType: 'directive', text: '/show' },
        { tokenType: 'string', text: '"Production"' },
        { tokenType: 'operator', text: ']' }
      ]);
    });
  });
  
  describe('Parameters and Execution', () => {
    it('tokenizes /exe with parameters', async () => {
      const code = '/exe @greet(name) = `Hello @name!`';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/exe' },
        { tokenType: 'variable', text: '@greet', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '(' },
        { tokenType: 'parameter', text: 'name' },
        { tokenType: 'operator', text: ')' },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'template', text: '`' },
        { tokenType: 'templateContent', text: 'Hello ' },
        { tokenType: 'interpolation', text: '@name' },
        { tokenType: 'templateContent', text: '!' },
        { tokenType: 'template', text: '`' }
      ]);
    });
    
    it('tokenizes function invocation', async () => {
      const code = '/var @msg = @greet("World")';
      await expectTokens(code, [
        { tokenType: 'directive', text: '/var' },
        { tokenType: 'variable', text: '@msg', modifiers: ['declaration'] },
        { tokenType: 'operator', text: '=' },
        { tokenType: 'variableRef', text: '@greet', modifiers: ['reference'] },
        { tokenType: 'operator', text: '(' },
        { tokenType: 'string', text: '"World"' },
        { tokenType: 'operator', text: ')' }
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