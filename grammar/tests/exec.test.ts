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
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCommand');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier[0].content).toBe('listFiles');
      expect(directiveNode.directive.values.command[0].content).toBe('ls -la');
      expect(directiveNode.directive.values.params).toEqual([]);
      expect(directiveNode.directive.raw.identifier).toBe('listFiles');
      expect(directiveNode.directive.raw.command).toBe('ls -la');
      expect(directiveNode.directive.raw.params).toEqual([]);
      expect(directiveNode.directive.meta.parameterCount).toBe(0);
      
      // Type guard
      expect(isExecCommandDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Exec command with parameters (with space)', async () => {
      const content = '@exec formatFile (file, type) = @run [fmt $file --type=$type]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCommand');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier[0].content).toBe('formatFile');
      expect(directiveNode.directive.values.params).toHaveLength(2);
      expect(directiveNode.directive.values.params[0][0].identifier).toBe('file');
      expect(directiveNode.directive.values.params[1][0].identifier).toBe('type');
      expect(directiveNode.directive.values.command[0].content).toBe('fmt $file --type=$type');
      
      expect(directiveNode.directive.raw.identifier).toBe('formatFile');
      expect(directiveNode.directive.raw.params).toEqual(['file', 'type']);
      expect(directiveNode.directive.raw.command).toBe('fmt $file --type=$type');
      expect(directiveNode.directive.meta.parameterCount).toBe(2);
      
      // Type guard
      expect(isExecCommandDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Exec command with parameters (without space)', async () => {
      const content = '@exec formatFile(file, type) = @run [fmt $file --type=$type]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCommand');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier[0].content).toBe('formatFile');
      expect(directiveNode.directive.values.params).toHaveLength(2);
      expect(directiveNode.directive.values.params[0][0].identifier).toBe('file');
      expect(directiveNode.directive.values.params[1][0].identifier).toBe('type');
      
      expect(directiveNode.directive.raw.identifier).toBe('formatFile');
      expect(directiveNode.directive.raw.params).toEqual(['file', 'type']);
      expect(directiveNode.directive.meta.parameterCount).toBe(2);
      
      // Type guard
      expect(isExecCommandDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Exec command with metadata', async () => {
      const content = '@exec dangerous.risk.high = @run [rm -rf $dir]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCommand');
      
      // Check metadata
      expect(directiveNode.directive.values.identifier[0].content).toBe('dangerous');
      expect(directiveNode.directive.values.metadata).toBeDefined();
      expect(directiveNode.directive.values.metadata[0].content).toBe('risk.high');
      expect(directiveNode.directive.raw.metadata).toBe('risk.high');
      expect(directiveNode.directive.meta.metadata?.type).toBe('risk.high');
      
      // Type guard
      expect(isExecCommandDirective(directiveNode.directive)).toBe(true);
    });
  });
  
  describe('execCode subtype', () => {
    test('Basic code definition', async () => {
      const content = '@exec greet = @run javascript [\n  console.log("Hello, world!");\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCode');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier[0].content).toBe('greet');
      expect(directiveNode.directive.values.params).toEqual([]);
      expect(directiveNode.directive.values.lang[0].content).toBe('javascript');
      expect(directiveNode.directive.values.code[0].content).toContain('console.log("Hello, world!")');
      
      expect(directiveNode.directive.raw.identifier).toBe('greet');
      expect(directiveNode.directive.raw.params).toEqual([]);
      expect(directiveNode.directive.raw.lang).toBe('javascript');
      expect(directiveNode.directive.raw.code).toContain('console.log("Hello, world!")');
      expect(directiveNode.directive.meta.parameterCount).toBe(0);
      
      // Type guard
      expect(isExecCodeDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Code definition with parameters (with space)', async () => {
      const content = '@exec formatJson (data, style) = @run python [\n  import json\n  data_obj = json.loads(data)\n  print(json.dumps(data_obj, indent=4 if style == "pretty" else None))\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCode');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier[0].content).toBe('formatJson');
      expect(directiveNode.directive.values.params).toHaveLength(2);
      expect(directiveNode.directive.values.params[0][0].identifier).toBe('data');
      expect(directiveNode.directive.values.params[1][0].identifier).toBe('style');
      expect(directiveNode.directive.values.lang[0].content).toBe('python');
      
      expect(directiveNode.directive.raw.identifier).toBe('formatJson');
      expect(directiveNode.directive.raw.params).toEqual(['data', 'style']);
      expect(directiveNode.directive.raw.lang).toBe('python');
      expect(directiveNode.directive.meta.parameterCount).toBe(2);
      
      // Type guard
      expect(isExecCodeDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Code definition with parameters (without space)', async () => {
      const content = '@exec formatJson(data, style) = @run python [\n  import json\n  data_obj = json.loads(data)\n  print(json.dumps(data_obj, indent=4 if style == "pretty" else None))\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCode');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier[0].content).toBe('formatJson');
      expect(directiveNode.directive.values.params).toHaveLength(2);
      expect(directiveNode.directive.values.params[0][0].identifier).toBe('data');
      expect(directiveNode.directive.values.params[1][0].identifier).toBe('style');
      
      expect(directiveNode.directive.raw.identifier).toBe('formatJson');
      expect(directiveNode.directive.raw.params).toEqual(['data', 'style']);
      expect(directiveNode.directive.meta.parameterCount).toBe(2);
      
      // Type guard
      expect(isExecCodeDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Code definition with variable interpolation', async () => {
      const content = '@exec processTemplate = @run javascript [\n  const template = "{{template}}";\n  console.log(`Processing template: ${template}`);\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCode');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier[0].content).toBe('processTemplate');
      expect(directiveNode.directive.values.lang[0].content).toBe('javascript');
      expect(directiveNode.directive.values.code).toBeDefined();
      expect(directiveNode.directive.values.code.some(node => 
        node.type === 'VariableReference' && node.identifier === 'template'
      )).toBe(true);
      
      // Type guard
      expect(isExecCodeDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Code definition with metadata', async () => {
      const content = '@exec processData.meta = @run python [\n  import json\n  print(json.dumps(data))\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCode');
      
      // Check metadata
      expect(directiveNode.directive.values.identifier[0].content).toBe('processData');
      expect(directiveNode.directive.values.metadata).toBeDefined();
      expect(directiveNode.directive.values.metadata[0].content).toBe('meta');
      expect(directiveNode.directive.raw.metadata).toBe('meta');
      expect(directiveNode.directive.meta.metadata?.type).toBe('meta');
      
      // Type guard
      expect(isExecCodeDirective(directiveNode.directive)).toBe(true);
    });
  });
});