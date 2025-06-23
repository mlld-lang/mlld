import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';

describe('Parameterized Text Templates', () => {
  describe('Template Definition', () => {
    it('should parse basic parameterized template definition', async () => {
      const input = '/exe @greetingTemplate(name, title) = [[Hello {{title}} {{name}}!]]';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('Directive');
      expect(result[0].kind).toBe('exe');
      expect(result[0].subtype).toBe('exeTemplate');
      expect(result[0].source).toBe('template');
      
      // Check parameters
      expect(result[0].values.params).toHaveLength(2);
      expect(result[0].values.params[0].type).toBe('Parameter');
      expect(result[0].values.params[0].name).toBe('name');
      expect(result[0].values.params[1].type).toBe('Parameter');
      expect(result[0].values.params[1].name).toBe('title');
      expect(result[0].raw.params).toEqual(['name', 'title']);
      
      // Check metadata
      expect(result[0].meta.parameterCount).toBe(2);
      expect(result[0].meta.hasVariables).toBe(true);
    });

    it('should handle template with no parameters', async () => {
      const input = '/exe @staticTemplate() = [[Static content here]]';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      expect(result[0].values.params).toEqual([]);
      expect(result[0].meta.parameterCount).toBe(0);
    });

    it('should handle multiline template with parameter reuse', async () => {
      const input = `/exe @emailTemplate(name, subject) = [[
Subject: {{subject}}

Dear {{name}},

Thank you for your interest in {{subject}}.

Best regards,
The {{name}} Team
]]`;
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      expect(result[0].values.params).toHaveLength(2);
      expect(result[0].values.params[0].type).toBe('Parameter');
      expect(result[0].values.params[0].name).toBe('name');
      expect(result[0].values.params[1].type).toBe('Parameter');
      expect(result[0].values.params[1].name).toBe('subject');
      
      // Count how many times each parameter is used
      const content = result[0].values.template;
      const nameRefs = content.filter(node => 
        node.type === 'VariableReference' && node.identifier === 'name'
      );
      const subjectRefs = content.filter(node => 
        node.type === 'VariableReference' && node.identifier === 'subject'
      );
      
      expect(nameRefs).toHaveLength(2); // Used twice
      expect(subjectRefs).toHaveLength(2); // Used twice
    });
  });

  describe('Template Invocation', () => {
    it('should parse template invocation with string arguments', async () => {
      const input = '/show @greetingTemplate("Alice", "Dr.")';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('Directive');
      expect(result[0].kind).toBe('show');
      expect(result[0].subtype).toBe('showInvocation');
      expect(result[0].source).toBe('invocation');
      
      // Check invocation structure
      const invocation = result[0].values.invocation;
      expect(invocation).toBeDefined();
      expect(invocation.commandRef.name).toBe('greetingTemplate');
      
      // Check arguments
      expect(invocation.commandRef.args).toHaveLength(2);
      expect(invocation.commandRef.args[0].type).toBe('Text');
      expect(invocation.commandRef.args[0].content).toBe('Alice');
      expect(invocation.commandRef.args[1].type).toBe('Text');
      expect(invocation.commandRef.args[1].content).toBe('Dr.');
    });

    it('should parse template invocation with variable arguments', async () => {
      const input = '/show @greetingTemplate(@userName, @userTitle)';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      const invocation = result[0].values.invocation;
      expect(invocation.commandRef.args).toHaveLength(2);
      expect(invocation.commandRef.args[0].type).toBe('VariableReference');
      expect(invocation.commandRef.args[0].identifier).toBe('userName');
      expect(invocation.commandRef.args[1].type).toBe('VariableReference');
      expect(invocation.commandRef.args[1].identifier).toBe('userTitle');
    });

    it('should parse template invocation with mixed arguments', async () => {
      const input = '/show @emailTemplate(@userName, "Welcome to our service")';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      const invocation = result[0].values.invocation;
      expect(invocation.commandRef.args[0].type).toBe('VariableReference');
      expect(invocation.commandRef.args[0].identifier).toBe('userName');
      expect(invocation.commandRef.args[1].type).toBe('Text');
      expect(invocation.commandRef.args[1].content).toBe('Welcome to our service');
    });

    it('should parse template invocation with no arguments', async () => {
      const input = '/show @staticTemplate()';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      const invocation = result[0].values.invocation;
      expect(invocation.commandRef.args).toEqual([]);
    });
  });

  describe('Template Assignment', () => {
    it('should parse template invocation assigned to variable', async () => {
      // TODO: This syntax is not yet implemented in the grammar
      // For now, template invocations must be used directly with @add
      // Future enhancement: /text @result = /show @greetingTemplate("Bob", "Prof.")
      
      // Test the current supported syntax
      const input = '/show @greetingTemplate("Bob", "Prof.")';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('Directive');
      expect(result[0].kind).toBe('show');
      expect(result[0].subtype).toBe('showInvocation');
    });
  });

  describe('Edge Cases', () => {
    it('should handle single quotes in arguments', async () => {
      const input = '/show @greetingTemplate(\'Alice\', \'Dr.\')';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      const invocation = result[0].values.invocation;
      expect(invocation.commandRef.args[0].type).toBe('Text');
      expect(invocation.commandRef.args[0].content).toBe('Alice');
      expect(invocation.commandRef.args[1].type).toBe('Text');
      expect(invocation.commandRef.args[1].content).toBe('Dr.');
    });

    it('should handle template with header level', async () => {
      const input = '/show @greetingTemplate("Alice", "Dr.") as ##';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      expect(result[0].values.headerLevel).toBeDefined();
      expect(result[0].values.headerLevel[0].value).toBe(2);
    });

    it('should handle template with under header', async () => {
      const input = '/show @greetingTemplate("Alice", "Dr.") under Introduction';
      const parseResult = await parse(input);
      const result = parseResult.ast;
      
      expect(result[0].values.underHeader).toBeDefined();
      expect(result[0].values.underHeader[0].content).toBe('Introduction');
    });
  });
});