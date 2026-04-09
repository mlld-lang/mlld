import { describe, it, expect } from 'vitest';
import { getSemanticTokens } from './semantic-tokens.test';

describe('AS Modifier Tokenization', () => {
  it('should tokenize simple as modifier', async () => {
    const code = '/var @files = <*.md> as "prefix"';
    const tokens = await getSemanticTokens(code);
    
    // Check that we have tokens for the as modifier part
    const asToken = tokens.find(t => t.text === 'as');
    expect(asToken).toBeDefined();
    expect(asToken?.tokenType).toBe('keyword');
    
    // Check for quote tokens
    const quoteTokens = tokens.filter(t => t.text === '"');
    expect(quoteTokens).toHaveLength(2);
    expect(quoteTokens[0]?.tokenType).toBe('operator');
    expect(quoteTokens[1]?.tokenType).toBe('operator');
    
    // Check for content token
    const contentToken = tokens.find(t => t.text === 'prefix');
    expect(contentToken).toBeDefined();
    expect(contentToken?.tokenType).toBe('string');
  });
  
  it('should tokenize as modifier with placeholder', async () => {
    const code = '/var @files = <*.md> as "<>"';
    const tokens = await getSemanticTokens(code);
    
    // Check for placeholder token
    const placeholderTokens = tokens.filter(t => t.text === '<>' || (t.text === '<' && t.char > 20));
    expect(placeholderTokens.length).toBeGreaterThan(0);
  });
  
  it('should tokenize complex as modifier', async () => {
    const code = '/var @files = <*.md> as "## <>.fm.title"';
    const tokens = await getSemanticTokens(code);
    
    console.log('All tokens:', tokens.map(t => ({ 
      text: t.text, 
      type: t.tokenType, 
      pos: `${t.line}:${t.char}` 
    })));
    
    // Should have 'as' keyword
    const asToken = tokens.find(t => t.text === 'as');
    expect(asToken).toBeDefined();
    expect(asToken?.tokenType).toBe('keyword');
    
    // Should have opening quote
    const firstQuoteIndex = code.indexOf('"', code.indexOf('as'));
    const openQuote = tokens.find(t => t.char === firstQuoteIndex);
    expect(openQuote).toBeDefined();
    expect(openQuote?.tokenType).toBe('operator');
    
    // Should have "## " as string
    const prefixToken = tokens.find(t => t.text?.includes('##'));
    expect(prefixToken).toBeDefined();
    expect(prefixToken?.tokenType).toBe('string');
    
    // Should have placeholder as variable
    const placeholderToken = tokens.find(t => t.text === '<>' && t.char > 25);
    expect(placeholderToken).toBeDefined();
    expect(placeholderToken?.tokenType).toBe('variable');
    
    // Should have field access
    const fieldTokens = tokens.filter(t => t.text === 'fm' || t.text === 'title');
    expect(fieldTokens).toHaveLength(2);
  });

  it('should tokenize inline record coercion keywords', async () => {
    const code = '/var @result = @value as record @schema';
    const tokens = await getSemanticTokens(code);

    const asToken = tokens.find(t => t.text === 'as' && t.char > code.indexOf('@value'));
    expect(asToken).toBeDefined();
    expect(asToken?.tokenType).toBe('keyword');

    const recordToken = tokens.find(t => t.text === 'record' && t.char > asToken!.char);
    expect(recordToken).toBeDefined();
    expect(recordToken?.tokenType).toBe('keyword');

    const schemaToken = tokens.find(t => t.text === '@schema');
    expect(schemaToken).toBeDefined();
    expect(schemaToken?.tokenType).toBe('variable');
  });

  it('should tokenize grouped inline record coercion before metadata access', async () => {
    const code = '/var @valid = (@value as record @schema).mx.schema.valid';
    const tokens = await getSemanticTokens(code);

    const recordToken = tokens.find(t => t.text === 'record');
    expect(recordToken).toBeDefined();
    expect(recordToken?.tokenType).toBe('keyword');

    const propertyTokens = tokens.filter(t => ['mx', 'schema', 'valid'].includes(t.text ?? ''));
    expect(propertyTokens).toHaveLength(3);
    for (const token of propertyTokens) {
      expect(token.tokenType).toBe('property');
    }
  });
});
