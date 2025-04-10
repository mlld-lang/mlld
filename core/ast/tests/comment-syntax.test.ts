/// <reference types="vitest" />
import { parse } from '@core/ast.js';
import { expect, describe, it } from 'vitest';

describe('comment syntax', () => {
  it('should correctly parse comments at the start of lines', async () => {
    const input = '>> This is a comment\nSome regular text';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(2);
    expect(ast[0].type).toBe('Comment');
    expect(ast[0].content).toBe('This is a comment');
    expect(ast[1].type).toBe('Text');
    expect(ast[1].content).toBe('Some regular text');
  });

  it('should correctly parse multiple comments', async () => {
    const input = '>> Comment 1\n>> Comment 2\nText in between\n>> Comment 3';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(4);
    expect(ast[0].type).toBe('Comment');
    expect(ast[0].content).toBe('Comment 1');
    expect(ast[1].type).toBe('Comment');
    expect(ast[1].content).toBe('Comment 2');
    expect(ast[2].type).toBe('Text');
    expect(ast[2].content).toBe('Text in between\n');
    expect(ast[3].type).toBe('Comment');
    expect(ast[3].content).toBe('Comment 3');
  });

  it('should handle comments with special characters', async () => {
    const input = '>> Comment with @special #characters!';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Comment');
    expect(ast[0].content).toBe('Comment with @special #characters!');
  });

  it('should not treat >> as a comment if not at line start', async () => {
    const input = 'Text with >> not at line start';
    const { ast } = await parse(input);
    
    expect(ast).toHaveLength(1);
    expect(ast[0].type).toBe('Text');
    expect(ast[0].content).toBe('Text with >> not at line start');
  });
}); 