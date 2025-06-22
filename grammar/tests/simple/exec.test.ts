/**
 * Simple test for the exec directive
 */
import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Exec Directive Basic Test', () => {
  test('Basic exec value parses', async () => {
    const content = '/exec @greeting = @run {echo "Hello World"}';
    
    const result = await parse(content);
    console.log('Parse Result:', JSON.stringify(result.ast, null, 2));
    
    expect(result.ast.length).toBeGreaterThan(0);
    expect(result.ast[0].type).toBe('Directive');
    expect(result.ast[0].kind).toBe('exec');
  });
  
  test('Basic exec command parses', async () => {
    const content = '/exec @list = @run {ls -la}';
    
    const result = await parse(content);
    console.log('Parse Result:', JSON.stringify(result.ast, null, 2));
    
    expect(result.ast.length).toBeGreaterThan(0);
    expect(result.ast[0].type).toBe('Directive');
    expect(result.ast[0].kind).toBe('exec');
  });
});