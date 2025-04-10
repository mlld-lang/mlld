import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast.js';

describe('Line Start Directives', () => {
  it('should only recognize directives at the start of a line', async () => {
    const input = `This demo shows the core capabilities of Meld:
- Variable definitions (@text, @data, @path)
- Command execution (@run, @define)
- File embedding (@embed)
- Code fences for literal content
- Variable interpolation ({{var}}, {{data.field}})`;

    const { ast } = await parse(input);
    
    console.log('AST for first test:', JSON.stringify(ast, null, 2));
    
    // The content should be parsed as text and variables, but not as directives
    expect(ast.length).toBeGreaterThan(0);
    
    // Check that there are no directive nodes
    const directiveNodes = ast.filter(node => node.type === 'Directive');
    expect(directiveNodes).toHaveLength(0);
    
    // The first node should be text and contain directive-like text
    expect(ast[0].type).toBe('Text');
    expect(ast[0].content).toContain('@text');
    expect(ast[0].content).toContain('@run');
    expect(ast[0].content).toContain('@embed');
  });
  
  it('should recognize directives at the start of a line', async () => {
    const input = `Some text
@run [echo hello]
More text`;

    const { ast } = await parse(input);
    
    // There should be three nodes: text, directive, text
    expect(ast).toHaveLength(3);
    expect(ast[0].type).toBe('Text');
    expect(ast[1].type).toBe('Directive');
    expect(ast[1].directive.kind).toBe('run');
    expect(ast[2].type).toBe('Text');
  });
  
  it('should handle comments properly', async () => {
    const input = `Some text
>> This is a comment
More text`;
    
    console.log('Comments test input (JSON):', JSON.stringify(input));
    console.log('Comments test input (raw):', input);

    const { ast } = await parse(input);
    
    console.log('AST for comments test:', JSON.stringify(ast, null, 2));
    
    // There should be three nodes: text, comment, text
    expect(ast).toHaveLength(3);
    expect(ast[0].type).toBe('Text');
    expect(ast[1].type).toBe('Comment');
    expect(ast[1].content).toBe('This is a comment');
    expect(ast[2].type).toBe('Text');
  });
}); 