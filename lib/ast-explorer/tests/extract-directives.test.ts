import { describe, it, expect } from 'vitest';
import { extractDirectives } from '../src/extract-directives';

describe('Directive Extraction', () => {
  it('extracts single-line directives', () => {
    const content = `# Sample document
    
@text greeting = "Hello, world!"
@text name = "Meld"
@add [[{{greeting}}, {{name}}!]]`;

    const directives = extractDirectives(content);
    
    expect(directives).toHaveLength(3);
    expect(directives[0]).toEqual('@text greeting = "Hello, world!"');
    expect(directives[1]).toEqual('@text name = "Meld"');
    expect(directives[2]).toEqual('@add [[{{greeting}}, {{name}}!]]');
  });

  it('extracts multiline directives with double brackets', () => {
    const content = `# Sample document
    
@text greeting = [[
  Hello, 
  world!
]]
@text name = "Meld"`;

    const directives = extractDirectives(content);
    
    expect(directives).toHaveLength(2);
    expect(directives[0]).toEqual('@text greeting = [[\n  Hello, \n  world!\n]]');
    expect(directives[1]).toEqual('@text name = "Meld"');
  });

  it('extracts multiline directives with quotes', () => {
    const content = `# Sample document
    
@text greeting = "Hello, 
world!"
@text name = "Meld"`;

    const directives = extractDirectives(content);
    
    expect(directives).toHaveLength(2);
    expect(directives[0]).toEqual('@text greeting = "Hello, \nworld!"');
    expect(directives[1]).toEqual('@text name = "Meld"');
  });

  it('handles nested multiline directives', () => {
    const content = `# Sample document
    
@data config = {
  greeting: [[
    Hello there!
  ]],
  name: "Meld"
}
@add [[{{config.greeting}}]]`;

    const directives = extractDirectives(content);
    
    expect(directives).toHaveLength(2);
    expect(directives[0]).toContain('greeting: [[');
    expect(directives[0]).toContain('Hello there!');
  });

  it('handles complex nested structures', () => {
    const content = `# Sample document
    
@data nested = {
  level1: {
    level2: [[
      Deeply
      nested
      content
    ]],
    other: "value"
  }
}`;

    const directives = extractDirectives(content);
    
    expect(directives).toHaveLength(1);
    expect(directives[0]).toContain('level2: [[');
    expect(directives[0]).toContain('Deeply');
    expect(directives[0]).toContain('nested');
    expect(directives[0]).toContain('content');
  });
});