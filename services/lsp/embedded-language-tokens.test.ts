import { describe, it, expect } from 'vitest';
import { getSemanticTokens } from './semantic-tokens.test';

describe('Embedded Language Tokens', () => {
  describe('JavaScript', () => {
    it('should tokenize inline JavaScript in /var directive', async () => {
      const code = '/var @result = js { return 42; }';
      const tokens = await getSemanticTokens(code);
      
      // Should have tokens for:
      // - /var (directive)
      // - @result (variable declaration)
      // - = (operator)
      // - js (embedded language)
      // - { (operator)
      // - return (keyword from JS)
      // - 42 (number from JS)
      // - ; (operator from JS)
      // - } (operator)
      
      const tokenTypes = tokens.map(t => t.tokenType);
      console.log('Tokens:', tokens.map(t => ({ type: t.tokenType, text: t.text })));
      expect(tokenTypes).toContain('keyword'); // '/var' directive mapped to keyword
      expect(tokenTypes).toContain('variable');
      expect(tokenTypes).toContain('label');   // 'js' embedded language mapped to label
      expect(tokenTypes.filter(t => t === 'keyword').length).toBeGreaterThan(1); // Both /var and return
      expect(tokenTypes).toContain('number');  // '42' from JS
    });
    
    it('should tokenize JavaScript function in /exe directive', async () => {
      const code = '/exe @add(a, b) = js { return a + b; }';
      const tokens = await getSemanticTokens(code);
      
      const tokenTypes = tokens.map(t => t.tokenType);
      console.log('Exe tokens:', tokens.map(t => ({ type: t.tokenType, text: t.text })));
      expect(tokenTypes).toContain('keyword');  // '/exe' directive
      expect(tokenTypes).toContain('variable');
      expect(tokenTypes).toContain('parameter');
      expect(tokenTypes).toContain('label');    // 'js' embedded language
      expect(tokenTypes.filter(t => t === 'keyword').length).toBeGreaterThan(1); // Both /exe and return
      expect(tokenTypes).toContain('operator'); // '+'
    });
    
    it('should tokenize multi-line JavaScript in /run directive', async () => {
      const code = `/run js {
  const x = 10;
  console.log(x);
}`;
      const tokens = await getSemanticTokens(code);
      
      const tokenTypes = tokens.map(t => t.tokenType);
      expect(tokenTypes).toContain('keyword');  // '/run' directive
      expect(tokenTypes).toContain('label');    // 'js' embedded language
      expect(tokenTypes.filter(t => t === 'keyword').length).toBeGreaterThan(1); // /run and const
      expect(tokenTypes).toContain('variable'); // 'x'
      expect(tokenTypes).toContain('number');   // '10'
      expect(tokenTypes).toContain('property'); // 'log'
    });
  });
  
  
  describe('Bash', () => {
    it('should tokenize inline Bash code', async () => {
      const code = '/run sh { echo "Hello $USER" }';
      const tokens = await getSemanticTokens(code);
      
      const tokenTypes = tokens.map(t => t.tokenType);
      expect(tokenTypes).toContain('keyword');  // '/run' directive
      expect(tokenTypes).toContain('label');    // 'sh' embedded language
      expect(tokenTypes).toContain('variable'); // command/variable tokens from Bash parser
      expect(tokenTypes).toContain('string');   // string literal from Bash parser

      const echoToken = tokens.find(t => t.text === 'echo');
      expect(echoToken?.tokenType).toBe('variable');
    });
    
    it('should tokenize multi-line Bash script', async () => {
      const code = `/run sh {
  if [ -f "file.txt" ]; then
    cat file.txt
  fi
}`;
      const tokens = await getSemanticTokens(code);
      
      const tokenTypes = tokens.map(t => t.tokenType);
      expect(tokenTypes).toContain('keyword');  // '/run' directive
      expect(tokenTypes).toContain('label');    // 'sh' embedded language
      expect(tokenTypes.filter(t => t === 'keyword').length).toBeGreaterThan(1); // /run + Bash keywords
      expect(tokenTypes).toContain('variable'); // command tokens from Bash parser
      expect(tokenTypes).toContain('string');   // "file.txt"
    });
  });

  describe('Python', () => {
    it('should tokenize multi-line Python code', async () => {
      const code = `/run python {
  if value > 0:
    print("Hello")
}`;
      const tokens = await getSemanticTokens(code);

      const tokenTypes = tokens.map(t => t.tokenType);
      expect(tokenTypes).toContain('keyword');  // '/run' + Python keyword(s)
      expect(tokenTypes).toContain('label');    // 'python' embedded language
      expect(tokenTypes).toContain('variable'); // identifiers
      expect(tokenTypes).toContain('number');   // 0
      expect(tokenTypes).toContain('string');   // "Hello"
      expect(tokenTypes.filter(t => t === 'keyword').length).toBeGreaterThan(1); // /run + if
    });
  });
  
  describe('Error Handling', () => {
    it('should handle unsupported languages gracefully', async () => {
      // Test with a language mlld supports syntactically but we don't have tree-sitter for.
      const code = '/run cmd { echo @name }';
      const tokens = await getSemanticTokens(code);
      
      // Should still tokenize mlld parts with fallback string/@variable tokenization.
      const tokenTypes = tokens.map(t => t.tokenType);
      expect(tokenTypes).toContain('keyword');  // '/run' directive
      expect(tokenTypes).toContain('label');    // 'cmd' identifier
      expect(tokenTypes).toContain('string');   // fallback code tokenization
      expect(tokenTypes).toContain('variable'); // @name interpolation in fallback
    });
    
    it('should handle syntax errors in embedded code', async () => {
      const code = '/var @result = js { return }'; // Missing value after return
      const tokens = await getSemanticTokens(code);
      
      // Should still tokenize what it can
      const tokenTypes = tokens.map(t => t.tokenType);
      expect(tokenTypes).toContain('keyword');  // '/var' directive
      expect(tokenTypes).toContain('variable');
      expect(tokenTypes).toContain('label');     // 'js' embedded language
      // JavaScript should tokenize even with syntax errors
    });
  });
});
