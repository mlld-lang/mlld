/// <reference types="vitest" />
import { describe, it, expect } from 'vitest';
import { parse } from '@core/ast';
import type { 
  TextNode, 
  CodeFenceNode, 
  VariableReferenceNode,
  DirectiveNode,
  MeldNode
} from '@core/ast/ast/astTypes';

describe('Parser', () => {
  describe('Text blocks', () => {
    it('should parse a simple text block', async () => {
      const input = 'Hello world';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as TextNode;
      expect(node.type).toBe('Text');
      expect(node.content).toBe('Hello world');
    });

    it('should parse multiple text blocks', async () => {
      const input = 'Hello\nworld';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as TextNode;
      expect(node.type).toBe('Text');
      expect(node.content).toBe('Hello\nworld');
    });
  });

  describe('Code fences', () => {
    it('should parse a code fence with language', async () => {
      const input = '```javascript\nconsole.log("hello");\n```';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as CodeFenceNode;
      expect(node.type).toBe('CodeFence');
      expect(node.language).toBe('javascript');
      expect(node.content).toBe('```javascript\nconsole.log("hello");\n```');
    });

    it('should parse a code fence without language', async () => {
      const input = '```\nconsole.log("hello");\n```';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as CodeFenceNode;
      expect(node.type).toBe('CodeFence');
      expect(node.language).toBeUndefined();
      expect(node.content).toBe('```\nconsole.log("hello");\n```');
    });

    it('should parse a code fence with 4 backticks', async () => {
      const input = '````javascript\nconsole.log("hello");\n````';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as CodeFenceNode;
      expect(node.type).toBe('CodeFence');
      expect(node.language).toBe('javascript');
      expect(node.content).toBe('````javascript\nconsole.log("hello");\n````');
    });

    it('should parse a code fence with 5 backticks', async () => {
      const input = '`````javascript\nconsole.log("hello");\n`````';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as CodeFenceNode;
      expect(node.type).toBe('CodeFence');
      expect(node.language).toBe('javascript');
      expect(node.content).toBe('`````javascript\nconsole.log("hello");\n`````');
    });

    it('should require matching number of backticks for opening and closing fence', async () => {
      const input = '````\nsome code\n```';
      await expect(parse(input)).rejects.toThrow();
    });

    it('should not preserve code fences when preserveCodeFences is false', async () => {
      const input = '```javascript\nconsole.log("hello");\n```';
      const { ast } = await parse(input, { preserveCodeFences: false });
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as CodeFenceNode;
      expect(node.type).toBe('CodeFence');
      expect(node.language).toBe('javascript');
      expect(node.content).toBe('console.log("hello");');
    });

    it('should not preserve code fences with no language when preserveCodeFences is false', async () => {
      const input = '```\nconsole.log("hello");\n```';
      const { ast } = await parse(input, { preserveCodeFences: false });
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as CodeFenceNode;
      expect(node.type).toBe('CodeFence');
      expect(node.language).toBeUndefined();
      expect(node.content).toBe('console.log("hello");');
    });

    it('should not preserve code fences with 4 backticks when preserveCodeFences is false', async () => {
      const input = '````javascript\nconsole.log("hello");\n````';
      const { ast } = await parse(input, { preserveCodeFences: false });
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as CodeFenceNode;
      expect(node.type).toBe('CodeFence');
      expect(node.language).toBe('javascript');
      expect(node.content).toBe('console.log("hello");');
    });

    it('should treat equal backticks as fence terminator', async () => {
      const input = '```\nouter\n```\nmore content';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(2);
      const [fence, text] = ast as [CodeFenceNode, TextNode];
      expect(fence.type).toBe('CodeFence');
      expect(fence.content).toBe('```\nouter\n```');
      expect(text.type).toBe('Text');
      expect(text.content).toBe('more content');
    });

    it('should treat equal backticks as fence terminator (CommonMark test case)', async () => {
      const input = '```\nouter\n```inner```\n```';
      const { ast } = await parse(input);
      
      // According to CommonMark spec:
      // 1. First ```inner terminates the fence
      // 2. Remaining backticks can either be treated as text or as another code fence
      expect(ast.length).toBeGreaterThanOrEqual(2);
      const [fence, ...rest] = ast as [CodeFenceNode, ...MeldNode[]];
      expect(fence.type).toBe('CodeFence');
      expect(fence.content).toBe('```\nouter\n```');
      
      // The remaining content can be interpreted either way:
      // 1. As a single text node: 'inner```\n```'
      // 2. As text + code fence: ['inner', '```\n\n```']
      if (rest.length === 1) {
        const text = rest[0] as TextNode;
        expect(text.type).toBe('Text');
        expect(text.content).toBe('inner```\n```');
      } else {
        const [text, fence2] = rest as [TextNode, CodeFenceNode];
        expect(text.type).toBe('Text');
        expect(text.content).toBe('inner');
        expect(fence2.type).toBe('CodeFence');
        expect(fence2.content).toBe('```\n\n```');
      }
    });

    it('should treat equal backticks as fence terminator (4 backticks)', async () => {
      const input = '````\nouter\n````inner````\n````';
      const { ast } = await parse(input);
      
      expect(ast.length).toBeGreaterThanOrEqual(2);
      const [fence, ...rest] = ast as [CodeFenceNode, ...MeldNode[]];
      expect(fence.type).toBe('CodeFence');
      expect(fence.content).toBe('````\nouter\n````');
      
      if (rest.length === 1) {
        const text = rest[0] as TextNode;
        expect(text.type).toBe('Text');
        expect(text.content).toBe('inner````\n````');
      } else {
        const [text, fence2] = rest as [TextNode, CodeFenceNode];
        expect(text.type).toBe('Text');
        expect(text.content).toBe('inner');
        expect(fence2.type).toBe('CodeFence');
        expect(fence2.content).toBe('````\n\n````');
      }
    });

    it('should treat equal backticks as fence terminator (5 backticks)', async () => {
      const input = '`````\nouter\n`````inner`````\n`````';
      const { ast } = await parse(input);
      
      expect(ast.length).toBeGreaterThanOrEqual(2);
      const [fence, ...rest] = ast as [CodeFenceNode, ...MeldNode[]];
      expect(fence.type).toBe('CodeFence');
      expect(fence.content).toBe('`````\nouter\n`````');
      
      if (rest.length === 1) {
        const text = rest[0] as TextNode;
        expect(text.type).toBe('Text');
        expect(text.content).toBe('inner`````\n`````');
      } else {
        const [text, fence2] = rest as [TextNode, CodeFenceNode];
        expect(text.type).toBe('Text');
        expect(text.content).toBe('inner');
        expect(fence2.type).toBe('CodeFence');
        expect(fence2.content).toBe('`````\n\n`````');
      }
    });

    it('should treat fewer backticks as literal content', async () => {
      const input = '```\nHere is some ``inline`` code\n```';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as CodeFenceNode;
      expect(node.type).toBe('CodeFence');
      expect(node.content).toBe('```\nHere is some ``inline`` code\n```');
    });
  });

  describe('Variables', () => {
    it('should parse a text variable', async () => {
      const input = '{{name}}';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as VariableReferenceNode;
      expect(node.type).toBe('VariableReference');
      expect(node.identifier).toBe('name');
      expect(node.valueType).toBe('text');
    });

    it('should parse a data variable', async () => {
      const input = 'Hello {{data.field}}';
      const { ast } = await parse(input);
      expect(ast).toHaveLength(2);
      const node = ast[1] as VariableReferenceNode;
      expect(node.type).toBe('VariableReference');
      expect(node.identifier).toBe('data');
      expect(node.valueType).toBe('data');
      expect(node.fields).toEqual([{ type: 'field', value: 'field' }]);
    });

    it('should parse a path variable', async () => {
      const input = '$HOMEPATH';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as VariableReferenceNode;
      expect(node.type).toBe('VariableReference');
      expect(node.identifier).toBe('HOMEPATH');
      expect(node.valueType).toBe('path');
    });
  });

  describe('Directives', () => {
    it('should parse an import directive', async () => {
      const input = '@import [path/to/file]';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('import');
      expect(node.directive.path).toBe('path/to/file');
    });

    it('should parse a run directive', async () => {
      const input = '@run [echo hello]';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('run');
      expect(node.directive.command).toBe('echo hello');
    });

    it('should parse a define directive', async () => {
      const input = '@define command = @run [echo hello]';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('define');
      expect(node.directive.name).toBe('command');
      expect(node.directive.command.kind).toBe('run');
      expect(node.directive.command.command).toBe('echo hello');
    });

    it('should parse a data directive', async () => {
      const input = '@data config = { name: "test" }';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('data');
      expect(node.directive.identifier).toBe('config');
      expect(node.directive.source).toBe('literal');
      expect(node.directive.value).toEqual({ name: 'test' });
    });

    it('should parse a var directive', async () => {
      const input = '@var name = "test"';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('var');
      expect(node.directive.identifier).toBe('name');
      expect(node.directive.value.type).toBe('string');
      expect(node.directive.value.value).toBe('test');
    });

    it('should parse a path directive', async () => {
      const input = '@path config = "$HOMEPATH/config"';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('path');
      expect(node.directive.identifier).toBe('config');
      expect(node.directive.path.base).toBe('$HOMEPATH');
      expect(node.directive.path.segments).toEqual(['config']);
    });

    it('should parse a path directive with single quotes', async () => {
      const input = "@path config = '$HOMEPATH/config'";
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('path');
      expect(node.directive.identifier).toBe('config');
      expect(node.directive.path.base).toBe('$HOMEPATH');
      expect(node.directive.path.segments).toEqual(['config']);
    });

    it('should parse a path directive with backticks', async () => {
      const input = "@path config = `$HOMEPATH/config`";
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('path');
      expect(node.directive.identifier).toBe('config');
      expect(node.directive.path.base).toBe('$HOMEPATH');
      expect(node.directive.path.segments).toEqual(['config']);
    });

    it('should parse a path directive with $PROJECTPATH', async () => {
      const input = '@path config = "$PROJECTPATH/config"';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('path');
      expect(node.directive.identifier).toBe('config');
      expect(node.directive.path.base).toBe('$PROJECTPATH');
      expect(node.directive.path.segments).toEqual(['config']);
    });

    it('should parse a path directive with $~', async () => {
      const input = '@path config = "$~/config"';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('path');
      expect(node.directive.identifier).toBe('config');
      expect(node.directive.path.base).toBe('$~');
      expect(node.directive.path.segments).toEqual(['config']);
    });

    it('should parse a path directive with $.', async () => {
      const input = '@path config = "$./config"';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('path');
      expect(node.directive.identifier).toBe('config');
      expect(node.directive.path.base).toBe('$.');
      expect(node.directive.path.segments).toEqual(['config']);
    });

    it('should parse an embed directive', async () => {
      const input = '@embed [path/to/file]';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('embed');
      expect(node.directive.path).toBe('path/to/file');
    });

    it('should accept a path directive without special path variable', async () => {
      const input = '@path config = "path/to/file"';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('path');
      expect(node.directive.identifier).toBe('config');
      expect(node.directive.path.raw).toBe('path/to/file');
    });

    it('should accept a path directive with relative path', async () => {
      const input = '@path config = "$HOMEPATH/../file"';
      const { ast } = await parse(input);
      
      expect(ast).toHaveLength(1);
      const node = ast[0] as DirectiveNode;
      expect(node.type).toBe('Directive');
      expect(node.directive.kind).toBe('path');
      expect(node.directive.identifier).toBe('config');
      expect(node.directive.path.raw).toBe('$HOMEPATH/../file');
    });

    it('should reject a path directive with unquoted value', async () => {
      const input = '@path config = $HOMEPATH/file';
      await expect(parse(input)).rejects.toThrow();
    });

    it('should reject a path directive with mixed quotes', async () => {
      const input = '@path config = "$HOMEPATH/file\'';
      await expect(parse(input)).rejects.toThrow();
    });

    it('should accept a path directive with just a special variable', async () => {
      const input = '@path config = "$HOMEPATH"';
      await expect(parse(input)).resolves.toBeTruthy();
    });
  });
});