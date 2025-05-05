import { describe, expect, test } from 'vitest';
import { parse } from '@core/ast/parser';
import { isRunCommandDirective, isRunCodeDirective, isRunExecDirective } from '../types/run';

describe('Run directive', () => {
  describe('runCommand subtype', () => {
    test('Basic shell command', async () => {
      const content = '@run [ls -la]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runCommand');
      
      // Check structured format
      expect(directiveNode.directive.values.command).toBeDefined();
      expect(directiveNode.directive.values.command[0].content).toBe('ls -la');
      expect(directiveNode.directive.raw.command).toBe('ls -la');
      expect(directiveNode.directive.meta.isMultiLine).toBe(false);
      
      // Type guard
      expect(isRunCommandDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Multi-line shell command', async () => {
      const content = '@run [\nfind . -name "*.js" | \nxargs grep "TODO"\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runCommand');
      
      // Check structured format
      expect(directiveNode.directive.values.command).toBeDefined();
      expect(directiveNode.directive.raw.command).toContain('find . -name "*.js"');
      expect(directiveNode.directive.raw.command).toContain('xargs grep "TODO"');
      expect(directiveNode.directive.meta.isMultiLine).toBe(true);
      
      // Type guard
      expect(isRunCommandDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Command with variable interpolation', async () => {
      const content = '@run [ls -la {{directory}}]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runCommand');
      
      // Check structured format
      expect(directiveNode.directive.values.command).toBeDefined();
      expect(directiveNode.directive.values.command).toHaveLength(2);
      expect(directiveNode.directive.values.command[0].content).toBe('ls -la ');
      expect(directiveNode.directive.values.command[1].identifier).toBe('directory');
      expect(directiveNode.directive.raw.command).toBe('ls -la {{directory}}');
      
      // Type guard
      expect(isRunCommandDirective(directiveNode.directive)).toBe(true);
    });
  });
  
  describe('runCode subtype', () => {
    test('Basic code execution', async () => {
      const content = '@run javascript [\nconsole.log("Hello, world!");\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runCode');
      
      // Check structured format
      expect(directiveNode.directive.values.lang).toBeDefined();
      expect(directiveNode.directive.values.lang[0].content).toBe('javascript');
      expect(directiveNode.directive.values.args).toEqual([]);
      expect(directiveNode.directive.values.code).toBeDefined();
      expect(directiveNode.directive.values.code[0].content.trim()).toBe('console.log("Hello, world!");');
      expect(directiveNode.directive.raw.lang).toBe('javascript');
      expect(directiveNode.directive.raw.args).toEqual([]);
      expect(directiveNode.directive.meta.isMultiLine).toBe(true);
      
      // Type guard
      expect(isRunCodeDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Code with arguments', async () => {
      const content = '@run python (data, format) [\nimport json\ndata_obj = json.loads(data)\nprint(json.dumps(data_obj, indent=4 if format == "pretty" else None))\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runCode');
      
      // Check structured format
      expect(directiveNode.directive.values.lang).toBeDefined();
      expect(directiveNode.directive.values.lang[0].content).toBe('python');
      expect(directiveNode.directive.values.args).toHaveLength(2);
      expect(directiveNode.directive.values.args[0][0].identifier).toBe('data');
      expect(directiveNode.directive.values.args[1][0].identifier).toBe('format');
      expect(directiveNode.directive.raw.lang).toBe('python');
      expect(directiveNode.directive.raw.args).toEqual(['data', 'format']);
      
      // Type guard
      expect(isRunCodeDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Code with variable interpolation', async () => {
      const content = '@run javascript [\nconst greeting = "{{greeting}}";\nconsole.log(greeting);\n]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runCode');
      
      // Check structured format
      expect(directiveNode.directive.values.code).toBeDefined();
      expect(directiveNode.directive.values.code).toHaveLength(3);
      expect(directiveNode.directive.values.code[0].content).toBe('\nconst greeting = "');
      expect(directiveNode.directive.values.code[1].identifier).toBe('greeting');
      expect(directiveNode.directive.values.code[2].content).toBe('";\nconsole.log(greeting);\n');
      
      // Type guard
      expect(isRunCodeDirective(directiveNode.directive)).toBe(true);
    });
  });
  
  describe('runExec subtype', () => {
    test('Basic command execution', async () => {
      const content = '@run $listFiles';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runExec');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier).toBeDefined();
      expect(directiveNode.directive.values.identifier[0].content).toBe('listFiles');
      expect(directiveNode.directive.values.args).toEqual([]);
      expect(directiveNode.directive.raw.identifier).toBe('listFiles');
      expect(directiveNode.directive.raw.args).toEqual([]);
      expect(directiveNode.directive.meta.argumentCount).toBe(0);
      
      // Type guard
      expect(isRunExecDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Command with arguments (with space)', async () => {
      const content = '@run $formatData ("large_file.json", "pretty")';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runExec');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier).toBeDefined();
      expect(directiveNode.directive.values.identifier[0].content).toBe('formatData');
      expect(directiveNode.directive.values.args).toHaveLength(2);
      expect(directiveNode.directive.raw.identifier).toBe('formatData');
      expect(directiveNode.directive.raw.args).toEqual(['large_file.json', 'pretty']);
      expect(directiveNode.directive.meta.argumentCount).toBe(2);
      
      // Type guard
      expect(isRunExecDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Command with arguments (without space)', async () => {
      const content = '@run $formatData("large_file.json", "pretty")';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runExec');
      
      // Check structured format
      expect(directiveNode.directive.values.identifier).toBeDefined();
      expect(directiveNode.directive.values.identifier[0].content).toBe('formatData');
      expect(directiveNode.directive.values.args).toHaveLength(2);
      expect(directiveNode.directive.raw.identifier).toBe('formatData');
      expect(directiveNode.directive.raw.args).toEqual(['large_file.json', 'pretty']);
      expect(directiveNode.directive.meta.argumentCount).toBe(2);
      
      // Type guard
      expect(isRunExecDirective(directiveNode.directive)).toBe(true);
    });
    
    test('Command with variable arguments', async () => {
      const content = '@run $processFile ({{filename}}, {{options}})';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('run');
      expect(directiveNode.directive.subtype).toBe('runExec');
      
      // Check structured format
      expect(directiveNode.directive.values.args).toHaveLength(2);
      expect(directiveNode.directive.values.args[0][0].identifier).toBe('filename');
      expect(directiveNode.directive.values.args[1][0].identifier).toBe('options');
      
      // Type guard
      expect(isRunExecDirective(directiveNode.directive)).toBe(true);
    });
  });
});