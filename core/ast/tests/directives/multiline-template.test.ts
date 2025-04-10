/// <reference types="vitest" />
import { parse } from '@core/ast.js';
import { expect, describe, it } from 'vitest';

describe('directives/@text with multiline templates', () => {
  it('should parse multiline templates with [[ ... ]] syntax', async () => {
    const input = `@text template = [[
Hello, world!
This is a multi-line
template without backticks.
]]`;

    const result = await parse(input);
    expect(result.ast).toHaveLength(1); // Just the directive
    
    const directive = result.ast[0];
    expect(directive.type).toBe('Directive');
    expect(directive.directive.kind).toBe('text');
    expect(directive.directive.identifier).toBe('template');
    expect(directive.directive.source).toBe('literal');
    expect(directive.directive.value).toEqual([
      expect.objectContaining({ type: 'Text', content: '\nHello, world!\nThis is a multi-line\ntemplate without backticks.\n' })
    ]);
  });

  it('should support variable interpolation in multiline templates', async () => {
    const input = `@text greeting = "Hello"
@text name = "World"
@text template = [[
{{greeting}}!
It is nice to meet you, {{name}}.
]]`;

    const result = await parse(input);
    expect(result.ast.length).toBeGreaterThanOrEqual(3); 
    
    // Find the multiline template directive
    const templateDirective = result.ast.find(node => 
      node.type === 'Directive' && 
      node.directive.kind === 'text' && 
      node.directive.identifier === 'template'
    );
    
    expect(templateDirective).toBeDefined();
    expect(templateDirective.directive.kind).toBe('text');
    expect(templateDirective.directive.identifier).toBe('template');
    expect(templateDirective.directive.source).toBe('literal');
    expect(templateDirective.directive.value).toEqual([
      expect.objectContaining({ type: 'Text', content: '\n' }),
      expect.objectContaining({ type: 'VariableReference', identifier: 'greeting', valueType: 'text' }),
      expect.objectContaining({ type: 'Text', content: '!\nIt is nice to meet you, ' }),
      expect.objectContaining({ type: 'VariableReference', identifier: 'name', valueType: 'text' }),
      expect.objectContaining({ type: 'Text', content: '.\n' })
    ]);
  });
}); 