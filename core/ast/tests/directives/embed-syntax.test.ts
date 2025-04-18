/// <reference types="vitest" />
import { parse } from '@core/ast';
import { expect, describe, it } from 'vitest';

describe('directives/@embed syntax boundaries', () => {
  describe('single bracket path syntax', () => {
    it('should parse paths with single brackets', async () => {
      const input = `@embed [file.md]`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.path).toBeDefined();
      expect(directive.directive.path.raw).toBe('file.md');
      expect(directive.directive.content).toBeUndefined();
    });

    it('should parse paths with section specifiers in single brackets', async () => {
      const input = `@embed [file.md # Introduction]`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.path).toBeDefined();
      expect(directive.directive.path.raw).toBe('file.md');
      expect(directive.directive.section).toBe('Introduction');
      expect(directive.directive.content).toBeUndefined();
    });

    it('should parse text variables in path syntax as part of the path string', async () => {
      const input = `@embed [{{file_path}}]`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.path).toBeDefined();
      expect(directive.directive.path.raw).toBe('{{file_path}}');
      expect(directive.directive.path.structured.variables.text).toContain('file_path');
      expect(directive.directive.content).toBeUndefined();
    });

    it('should parse path variables in path syntax for interpolation', async () => {
      const input = `@embed [$file_path]`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.path).toBeDefined();
      expect(directive.directive.path.raw).toBe('$file_path');
      expect(directive.directive.path.structured.variables.path).toContain('file_path');
      expect(directive.directive.content).toBeUndefined();
    });

    it('should treat content with spaces in single brackets as a path', async () => {
      const input = `@embed [This is a path with spaces]`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.path).toBeDefined();
      expect(directive.directive.path.raw).toBe('This is a path with spaces');
      expect(directive.directive.content).toBeUndefined();
    });
  });

  describe('double bracket content syntax', () => {
    it('should parse string content with double brackets', async () => {
      const input = `@embed [[ Simple content ]]`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.content).toBeDefined();
      expect(directive.directive.content).toEqual([
        expect.objectContaining({ type: 'Text', content: ' Simple content ' })
      ]);
      expect(directive.directive.path).toBeUndefined();
    });

    it('should parse multiline content with double brackets', async () => {
      const input = `@embed [[
Line 1
Line 2
Line 3
]]`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.content).toBeDefined();
      expect(directive.directive.content).toEqual([
        expect.objectContaining({ type: 'Text', content: '\nLine 1\nLine 2\nLine 3\n' })
      ]);
      expect(directive.directive.path).toBeUndefined();
    });

    it('should handle text variable interpolation in content', async () => {
      const input = `@var name = "World"
@embed [[ Hello, {{name}}! ]]`;
      const result = await parse(input);
      
      expect(result.ast.length).toBeGreaterThan(1);
      const directive = result.ast.find(node => 
        node.type === 'Directive' && 
        node.directive.kind === 'embed'
      );
      
      expect(directive).toBeDefined();
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.content).toBeDefined();
      expect(directive.directive.content).toEqual([
        expect.objectContaining({ type: 'Text', content: ' Hello, ' }),
        expect.objectContaining({ type: 'VariableReference', identifier: 'name', valueType: 'text' }),
        expect.objectContaining({ type: 'Text', content: '! ' })
      ]);
      expect(directive.directive.path).toBeUndefined();
    });

    it('should treat path variables in double brackets as literal text', async () => {
      const input = `@embed [[ Content with $path_var ]]`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.content).toBeDefined();
      expect(directive.directive.content).toEqual([
        expect.objectContaining({ type: 'Text', content: ' Content with $path_var ' })
      ]);
      expect(directive.directive.path).toBeUndefined();
    });

    it('should treat content that looks like a path as content in double brackets', async () => {
      const input = `@embed [[ file.md # Introduction ]]`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.type).toBe('Directive');
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.content).toBeDefined();
      expect(directive.directive.content).toEqual([
        expect.objectContaining({ type: 'Text', content: ' file.md # Introduction ' })
      ]);
      expect(directive.directive.section).toBeUndefined();
      expect(directive.directive.path).toBeUndefined();
    });
  });

  describe('compatibility with header level and under header', () => {
    it('should support header level with path syntax', async () => {
      const input = `@embed [file.md] as ###`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.path).toBeDefined();
      expect(directive.directive.headerLevel).toBe(3);
    });

    it('should support header level with content syntax', async () => {
      const input = `@embed [[ Content ]] as ###`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.content).toBeDefined();
      expect(directive.directive.headerLevel).toBe(3);
    });

    it('should support under header with path syntax', async () => {
      const input = `@embed [file.md] under My Section`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.path).toBeDefined();
      expect(directive.directive.underHeader).toBe('My Section');
    });

    it('should support under header with content syntax', async () => {
      const input = `@embed [[ Content ]] under My Section`;
      const result = await parse(input);
      
      expect(result.ast).toHaveLength(1);
      const directive = result.ast[0];
      expect(directive.directive.kind).toBe('embed');
      expect(directive.directive.content).toBeDefined();
      expect(directive.directive.underHeader).toBe('My Section');
    });
  });
}); 