/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';
import type { MeldNode } from '@core/syntax/types';

interface DirectiveNode extends MeldNode {
  directive: {
    kind: string;
    content?: string;
    path?: any;
    section?: string;
    variables?: {
      path?: string[];
    };
  };
}

describe('directives/@embed with multiline templates', () => {
  it('should parse multiline templates with [[ ... ]] syntax', async () => {
    const input = `@embed [[
Hello, world!
This is a multi-line
content for embed.
]]`;

    const result = await parse(input);
    expect(result.ast).toHaveLength(1); // Just the directive
    
    const directive = result.ast[0] as DirectiveNode;
    expect(directive.type).toBe('Directive');
    expect(directive.directive.kind).toBe('embed');
    expect(directive.directive.content).toBe(
      '\nHello, world!\nThis is a multi-line\ncontent for embed.\n'
    );
    // Should not have a path property
    expect(directive.directive.path).toBeUndefined();
  });

  it('should interpolate text variables in multiline embeds', async () => {
    const input = `@var docPath = "path/to/docs"
@embed [[
This references {{docPath}} in a multiline
template.
]]`;

    const result = await parse(input);
    expect(result.ast).toHaveLength(3); // 2 directives + 1 newline Text node
    
    // Find the multiline embed directive
    const embedDirective = result.ast.find(node => 
      node.type === 'Directive' && 
      (node as DirectiveNode).directive.kind === 'embed'
    ) as DirectiveNode | undefined;
    
    expect(embedDirective).toBeDefined();
    if (embedDirective) {
      expect(embedDirective.directive.kind).toBe('embed');
      expect(embedDirective.directive.content).toBe(
        '\nThis references {{docPath}} in a multiline\ntemplate.\n'
      );
      // Should not have a path property
      expect(embedDirective.directive.path).toBeUndefined();
    }
  });
  
  it('should treat path-like content in double brackets as string content', async () => {
    const input = `@embed [[ file.md # Introduction ]]`;

    const result = await parse(input);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0] as DirectiveNode;
    expect(directive.type).toBe('Directive');
    expect(directive.directive.kind).toBe('embed');
    expect(directive.directive.content).toBe(' file.md # Introduction ');
    // No section should be parsed
    expect(directive.directive.section).toBeUndefined();
    // Should not have a path property
    expect(directive.directive.path).toBeUndefined();
  });

  it('should treat path variables in double brackets as literal text, not variables', async () => {
    const input = `@embed [[
This contains a $path_variable that should be treated as literal text,
not as a path variable for interpolation.
]]`;

    const result = await parse(input);
    expect(result.ast).toHaveLength(1);
    
    const directive = result.ast[0] as DirectiveNode;
    expect(directive.type).toBe('Directive');
    expect(directive.directive.kind).toBe('embed');
    expect(directive.directive.content).toBe(
      '\nThis contains a $path_variable that should be treated as literal text,\nnot as a path variable for interpolation.\n'
    );
    // Should not have a path property
    expect(directive.directive.path).toBeUndefined();
    // Should not have variables.path
    expect(directive.directive.variables?.path).toBeUndefined();
  });
}); 