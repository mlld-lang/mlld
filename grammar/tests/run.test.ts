import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';
import { isRunCommandDirective, isRunCodeDirective, isRunExecDirective } from '@core/types/run';

describe('Run directive', () => {
  describe('runCommand subtype', () => {
    test('Basic shell command', async () => {
      const content = '/run {ls -la}';
      const parseResult = await parse(content);
      
      // The tests now pass with a single directive node in the AST
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runCommand');
      
      // Check structured format
      expect(directiveNode.values.command).toBeDefined();
      // Command is now tokenized into parts
      expect(directiveNode.values.command).toHaveLength(3); // 'ls', ' ', '-la'
      expect(directiveNode.values.command[0].content).toBe('ls');
      expect(directiveNode.values.command[1].content).toBe(' ');
      expect(directiveNode.values.command[2].content).toBe('-la');
      expect(directiveNode.raw.command).toBe('ls -la');
      expect(directiveNode.meta.isMultiLine).toBe(false);
      
      // Type guard
      expect(isRunCommandDirective(directiveNode)).toBe(true);
    });

    test('Command stdin pipe sugar', async () => {
      const content = '/run @data | cmd {cat}';
      const parseResult = await parse(content);

      expect(parseResult.ast).toHaveLength(1);

      const directiveNode: any = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runCommand');

      expect(directiveNode.values.withClause).toBeDefined();
      expect(directiveNode.values.withClause.stdin).toBeDefined();
      expect(directiveNode.values.withClause.stdin.type).toBe('VariableReference');
      expect(directiveNode.values.withClause.stdin.identifier).toBe('data');

      expect(directiveNode.raw.command).toBe('cat');
      expect(isRunCommandDirective(directiveNode)).toBe(true);
    });
    
    test('Multi-line shell command', async () => {
      const content = '/run {\nfind . -name "*.js" | \nxargs grep "TODO"\n}';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runCommand');
      
      // Check structured format - just verify the command is defined and has content
      expect(directiveNode.values.command).toBeDefined();
      expect(directiveNode.raw.command).toContain('find');
      expect(directiveNode.raw.command).toContain('xargs');
      expect(directiveNode.meta.isMultiLine).toBe(true);
      
      // Type guard
      expect(isRunCommandDirective(directiveNode)).toBe(true);
    });
    
    test('Command with variable interpolation', async () => {
      const content = '/run {ls -la @directory}';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runCommand');
      
      // Check structured format
      expect(directiveNode.values.command).toBeDefined();
      // Command is now tokenized: 'ls', ' ', '-la', ' ', '@directory'
      expect(directiveNode.values.command.length).toBeGreaterThanOrEqual(4);
      expect(directiveNode.values.command[0].content).toBe('ls');
      expect(directiveNode.values.command[2].content).toBe('-la');
      // Find the variable reference
      const varRef = directiveNode.values.command.find(n => n.type === 'VariableReference');
      expect(varRef).toBeDefined();
      expect(varRef.identifier).toBe('directory');
      expect(directiveNode.raw.command).toBe('ls -la @directory');
      
      // Type guard
      expect(isRunCommandDirective(directiveNode)).toBe(true);
    });
  });
  
  describe('runCode subtype', () => {
    test('Basic code execution', async () => {
      const content = '/run javascript {\nconsole.log("Hello, world!");\n}';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runCode');
      
      // Check structured format
      expect(directiveNode.values.lang).toBeDefined();
      expect(directiveNode.values.lang[0].content).toBe('javascript');
      expect(directiveNode.values.args).toEqual([]);
      expect(directiveNode.values.code).toBeDefined();
      expect(directiveNode.values.code[0].content).toContain('console.log("Hello, world!")');
      expect(directiveNode.raw.lang).toBe('javascript');
      expect(directiveNode.raw.args).toEqual([]);
      expect(directiveNode.meta.isMultiLine).toBe(true);
      
      // Type guard
      expect(isRunCodeDirective(directiveNode)).toBe(true);
    });
    
    test('Code with arguments', async () => {
      const content = '/run python (@data, @format) {\nimport json\ndata_obj = json.loads(data)\nprint(json.dumps(data_obj, indent=4 if format == "pretty" else None))\n}';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runCode');
      
      // Check structured format
      expect(directiveNode.values.lang).toBeDefined();
      expect(directiveNode.values.lang[0].content).toBe('python');
      expect(directiveNode.values.args).toHaveLength(2);
      expect(directiveNode.values.args[0].type).toBe('VariableReference');
      expect(directiveNode.values.args[0].identifier).toBe('data');
      expect(directiveNode.values.args[1].type).toBe('VariableReference');
      expect(directiveNode.values.args[1].identifier).toBe('format');
      expect(directiveNode.raw.lang).toBe('python');
      expect(directiveNode.raw.args).toEqual(['@data', '@format']);
      
      // Type guard
      expect(isRunCodeDirective(directiveNode)).toBe(true);
    });
    
    test('Code containing variable syntax as text', async () => {
      const content = '/run javascript {\nconst greeting = "{{greeting}}";\nconsole.log(greeting);\n}';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runCode');
      
      // Check structured format - code should be a single text node
      expect(directiveNode.values.code).toBeDefined();
      expect(directiveNode.values.code[0].type).toBe('Text');
      expect(directiveNode.values.code[0].content).toContain('const greeting = "{{greeting}}"');
      
      // Verify in raw content as well
      expect(directiveNode.raw.code).toContain('{{greeting}}');
      
      // Type guard
      expect(isRunCodeDirective(directiveNode)).toBe(true);
    });
  });
  
  describe('runExec subtype', () => {
    // Skip: Issue #100 - raw.identifier not populated in runExec AST nodes
    test('Basic command execution', async () => {
      const content = '/run @listFiles';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runExec');
      
      // Check structured format
      expect(directiveNode.values.identifier).toBeDefined();
      expect(directiveNode.values.identifier[0].identifier).toBe('listFiles');
      expect(directiveNode.values.args).toEqual([]);
      expect(directiveNode.raw.identifier).toBe('listFiles');
      expect(directiveNode.raw.args).toEqual([]);
      expect(directiveNode.meta.argumentCount).toBe(0);
      
      // Type guard
      expect(isRunExecDirective(directiveNode)).toBe(true);
    });
    
    // Skip: Grammar issue - space between identifier and arguments causes parsing problems
    test.skip('Command with arguments (with space)', async () => {
      const content = '/run @formatData ("large_file.json", "pretty")';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runExec');
      
      // Check structured format
      expect(directiveNode.values.identifier).toBeDefined();
      expect(directiveNode.values.identifier[0].identifier).toBe('formatData');
      expect(directiveNode.values.args).toHaveLength(2);
      expect(directiveNode.values.args[0].content).toBe('large_file.json');
      expect(directiveNode.values.args[1].content).toBe('pretty');
      expect(directiveNode.raw.identifier).toBe('formatData');
      expect(directiveNode.raw.args).toEqual(['large_file.json', 'pretty']);
      expect(directiveNode.meta.argumentCount).toBe(2);
      
      // Type guard
      expect(isRunExecDirective(directiveNode)).toBe(true);
    });
    
    // Skip: Issue #100 - raw.identifier not populated in runExec AST nodes
    test('Command with arguments (without space)', async () => {
      const content = '/run @formatData("large_file.json", "pretty")';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runExec');
      
      // Check structured format
      expect(directiveNode.values.identifier).toBeDefined();
      expect(directiveNode.values.identifier[0].identifier).toBe('formatData');
      expect(directiveNode.values.args).toHaveLength(2);
      expect(directiveNode.values.args[0].content).toBe('large_file.json');
      expect(directiveNode.values.args[1].content).toBe('pretty');
      expect(directiveNode.raw.identifier).toBe('formatData');
      expect(directiveNode.raw.args).toEqual(['large_file.json', 'pretty']);
      expect(directiveNode.meta.argumentCount).toBe(2);
      
      // Type guard
      expect(isRunExecDirective(directiveNode)).toBe(true);
    });
    
    test('Command with variable arguments', async () => {
      const content = '/run @processFile(@filename, @options)';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.kind).toBe('run');
      expect(directiveNode.subtype).toBe('runExec');
      
      // Check structured format
      expect(directiveNode.values.args).toHaveLength(2);
      expect(directiveNode.values.args[0].type).toBe('VariableReference');
      expect(directiveNode.values.args[0].identifier).toBe('filename');
      expect(directiveNode.values.args[1].type).toBe('VariableReference');
      expect(directiveNode.values.args[1].identifier).toBe('options');
      
      // Type guard
      expect(isRunExecDirective(directiveNode)).toBe(true);
    });
  });
});
