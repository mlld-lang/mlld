import { describe, expect, test } from 'vitest';
import { parse } from '@core/ast/parser';
import { isExecCommandDirective, isExecCodeDirective } from '../types/exec';

describe('Exec directive', () => {
  describe('execCommand subtype', () => {
    test('Basic exec command', async () => {
      const content = '@exec listFiles = @run [ls -la]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('exec');
      expect(directiveNode.subtype).toBe('execCommand');
      
      // Check structured format
      expect(directiveNode.values.identifier[0].content).toBe('listFiles');
      expect(directiveNode.values.command[0].content).toBe('ls -la');
      expect(directiveNode.values.params).toEqual([]);
      expect(directiveNode.raw.identifier).toBe('listFiles');
      expect(directiveNode.raw.command).toBe('ls -la');
      expect(directiveNode.raw.params).toEqual([]);
      expect(directiveNode.meta.parameterCount).toBe(0);
      
      // Type guard
      expect(isExecCommandDirective(directiveNode)).toBe(true);
    });
    
    test('Exec command with parameters (with space)', async () => {
      const content = '@exec formatFile (file, type) = @run [fmt {{file}} --type={{type}}]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('exec');
      expect(directiveNode.subtype).toBe('execCommand');
      
      // Check structured format
      expect(directiveNode.values.identifier[0].content).toBe('formatFile');
      expect(directiveNode.values.params).toHaveLength(2);
      expect(directiveNode.values.params[0].identifier).toBe('file');
      expect(directiveNode.values.params[1].identifier).toBe('type');
      
      // Command should include text and variable references
      expect(directiveNode.values.command).toBeDefined();
      // Check nodes with pattern: ["fmt ", {var:file}, " --type=", {var:type}]
      expect(directiveNode.values.command.length).toBeGreaterThan(1);
      expect(directiveNode.values.command[0].type).toBe('Text');
      
      expect(directiveNode.raw.identifier).toBe('formatFile');
      expect(directiveNode.raw.params).toEqual(['file', 'type']);
      expect(directiveNode.raw.command).toBe('fmt {{file}} --type={{type}}');
      expect(directiveNode.meta.parameterCount).toBe(2);
      
      // Type guard
      expect(isExecCommandDirective(directiveNode)).toBe(true);
    });
    
    test('Exec command with parameters (without space)', async () => {
      const content = '@exec formatFile(file, type) = @run [fmt {{file}} --type={{type}}]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('exec');
      expect(directiveNode.subtype).toBe('execCommand');
      
      // Check structured format
      expect(directiveNode.values.identifier[0].content).toBe('formatFile');
      expect(directiveNode.values.params).toHaveLength(2);
      expect(directiveNode.values.params[0].identifier).toBe('file');
      expect(directiveNode.values.params[1].identifier).toBe('type');
      
      expect(directiveNode.raw.identifier).toBe('formatFile');
      expect(directiveNode.raw.params).toEqual(['file', 'type']);
      expect(directiveNode.meta.parameterCount).toBe(2);
      
      // Type guard
      expect(isExecCommandDirective(directiveNode)).toBe(true);
    });
    
    test('Exec command with metadata', async () => {
      const content = '@exec dangerous.risk.high = @run [rm -rf $dir]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('exec');
      expect(directiveNode.subtype).toBe('execCommand');
      
      // Check metadata
      expect(directiveNode.values.identifier[0].content).toBe('dangerous');
      expect(directiveNode.values.metadata).toBeDefined();
      expect(directiveNode.values.metadata[0].content).toBe('risk.high');
      expect(directiveNode.raw.metadata).toBe('risk.high');
      expect(directiveNode.meta.metadata?.type).toBe('risk.high');
      
      // Type guard
      expect(isExecCommandDirective(directiveNode)).toBe(true);
    });
  });
  
  describe('execCode subtype', () => {
    test('Basic code definition', async () => {
      const content = '@exec greet = @run javascript [\n  console.log("Hello, world!");\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('exec');
      expect(directiveNode.subtype).toBe('execCode');
      
      // Check structured format
      expect(directiveNode.values.identifier[0].content).toBe('greet');
      expect(directiveNode.values.params).toEqual([]);
      expect(directiveNode.values.lang[0].content).toBe('javascript');
      expect(directiveNode.values.code[0].content).toContain('console.log("Hello, world!")');
      
      expect(directiveNode.raw.identifier).toBe('greet');
      expect(directiveNode.raw.params).toEqual([]);
      expect(directiveNode.raw.lang).toBe('javascript');
      expect(directiveNode.raw.code).toContain('console.log("Hello, world!")');
      expect(directiveNode.meta.parameterCount).toBe(0);
      
      // Type guard
      expect(isExecCodeDirective(directiveNode)).toBe(true);
    });
    
    test('Code definition with parameters (with space)', async () => {
      const content = '@exec formatJson (data, style) = @run python [\n  import json\n  data_obj = json.loads(data)\n  print(json.dumps(data_obj, indent=4 if style == "pretty" else None))\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('exec');
      expect(directiveNode.subtype).toBe('execCode');
      
      // Check structured format
      expect(directiveNode.values.identifier[0].content).toBe('formatJson');
      expect(directiveNode.values.params).toHaveLength(2);
      expect(directiveNode.values.params[0].identifier).toBe('data');
      expect(directiveNode.values.params[1].identifier).toBe('style');
      expect(directiveNode.values.lang[0].content).toBe('python');
      
      expect(directiveNode.raw.identifier).toBe('formatJson');
      expect(directiveNode.raw.params).toEqual(['data', 'style']);
      expect(directiveNode.raw.lang).toBe('python');
      expect(directiveNode.meta.parameterCount).toBe(2);
      
      // Type guard
      expect(isExecCodeDirective(directiveNode)).toBe(true);
    });
    
    test('Code definition with parameters (without space)', async () => {
      const content = '@exec formatJson(data, style) = @run python [\n  import json\n  data_obj = json.loads(data)\n  print(json.dumps(data_obj, indent=4 if style == "pretty" else None))\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('exec');
      expect(directiveNode.subtype).toBe('execCode');
      
      // Check structured format
      expect(directiveNode.values.identifier[0].content).toBe('formatJson');
      expect(directiveNode.values.params).toHaveLength(2);
      expect(directiveNode.values.params[0].identifier).toBe('data');
      expect(directiveNode.values.params[1].identifier).toBe('style');
      
      expect(directiveNode.raw.identifier).toBe('formatJson');
      expect(directiveNode.raw.params).toEqual(['data', 'style']);
      expect(directiveNode.meta.parameterCount).toBe(2);
      
      // Type guard
      expect(isExecCodeDirective(directiveNode)).toBe(true);
    });
    
    test('Code definition containing variable syntax as text', async () => {
      const content = '@exec processTemplate = @run javascript [\n  const template = "{{template}}";\n  console.log(`Processing template: ${template}`);\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('exec');
      expect(directiveNode.subtype).toBe('execCode');
      
      // Check structured format
      expect(directiveNode.values.identifier[0].content).toBe('processTemplate');
      expect(directiveNode.values.lang[0].content).toBe('javascript');
      expect(directiveNode.values.code).toBeDefined();
      
      // Code should be a single text node containing the template variable syntax
      expect(directiveNode.values.code[0].type).toBe('Text');
      expect(directiveNode.values.code[0].content).toContain('const template = "{{template}}"');
      
      // Verify in raw content as well
      expect(directiveNode.raw.code).toContain('{{template}}');
      
      // Type guard
      expect(isExecCodeDirective(directiveNode)).toBe(true);
    });
    
    test('Code definition with metadata', async () => {
      const content = '@exec processData.meta = @run python [\n  import json\n  print(json.dumps(data))\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('exec');
      expect(directiveNode.subtype).toBe('execCode');
      
      // Check metadata
      expect(directiveNode.values.identifier[0].content).toBe('processData');
      expect(directiveNode.values.metadata).toBeDefined();
      expect(directiveNode.values.metadata[0].content).toBe('meta');
      expect(directiveNode.raw.metadata).toBe('meta');
      expect(directiveNode.meta.metadata?.type).toBe('meta');
      
      // Type guard
      expect(isExecCodeDirective(directiveNode)).toBe(true);
    });
  });
});