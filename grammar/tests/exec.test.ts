import { describe, expect, test } from 'vitest';
import { parse } from '@core/ast/parser';
import { isExecCommandDirectiveNode } from '../types/exec';

describe('Exec directive', () => {
  describe('ExecCommand subtype', () => {
    test('Basic exec command', async () => {
      const content = '@exec list = @run [ls -la]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCommand');
      
      // Check structured format
      expect(directiveNode.directive.values.name[0].content).toBe('list');
      expect(directiveNode.directive.values.command[0].content).toBe('ls -la');
      expect(directiveNode.directive.raw.name).toBe('list');
      expect(directiveNode.directive.raw.command).toBe('ls -la');
      expect(directiveNode.directive.meta.isCommand).toBe(true);
    });
    
    test('Exec command with parameters', async () => {
      const content = '@exec format(path, type) = @run [fmt $path --type=$type]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCommand');
      
      // Check parameters
      expect(directiveNode.directive.values.parameters).toBeDefined();
      expect(directiveNode.directive.values.parameters?.length).toBe(2);
      expect(directiveNode.directive.values.parameters?.[0][0].identifier).toBe('path');
      expect(directiveNode.directive.values.parameters?.[1][0].identifier).toBe('type');
      
      expect(directiveNode.directive.raw.parameters).toEqual(['path', 'type']);
      expect(directiveNode.directive.raw.command).toBe('fmt $path --type=$type');
    });
    
    test('Exec command with risk field', async () => {
      const content = '@exec dangerous.risk.high = @run [rm -rf /]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCommand');
      
      // Check field
      expect(directiveNode.directive.values.field).toBeDefined();
      expect(directiveNode.directive.values.field?.[0].content).toBe('risk.high');
      expect(directiveNode.directive.raw.field).toBe('risk.high');
      expect(directiveNode.directive.meta.field?.type).toBe('risk.high');
    });
  });
  
  // Additional tests for different execCommand scenarios
  describe('ExecCommand with parameters and fields', () => {
    test('ExecCommand with parameters', async () => {
      const content = '@exec template(name, title) = @run [echo "Hello, $name! Welcome to $title."]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCommand');
      
      // Check parameters
      expect(directiveNode.directive.values.parameters).toBeDefined();
      expect(directiveNode.directive.values.parameters?.length).toBe(2);
      expect(directiveNode.directive.values.parameters?.[0][0].identifier).toBe('name');
      expect(directiveNode.directive.values.parameters?.[1][0].identifier).toBe('title');
      
      expect(directiveNode.directive.raw.parameters).toEqual(['name', 'title']);
      expect(directiveNode.directive.raw.command).toBe('echo "Hello, $name! Welcome to $title."');
    });
    
    test('ExecCommand with meta field', async () => {
      const content = '@exec config.meta = @run [echo metadata]';
      const parseResult = await parse(content);
      
      expect(parseResult.ast).toHaveLength(1);
      
      const directiveNode = parseResult.ast[0];
      expect(directiveNode.type).toBe('Directive');
      expect(directiveNode.directive.kind).toBe('exec');
      expect(directiveNode.directive.subtype).toBe('execCommand');
      
      // Check field
      expect(directiveNode.directive.values.field).toBeDefined();
      expect(directiveNode.directive.values.field?.[0].content).toBe('meta');
      expect(directiveNode.directive.raw.field).toBe('meta');
      expect(directiveNode.directive.meta.field?.type).toBe('meta');
    });
  });
});