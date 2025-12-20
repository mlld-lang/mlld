/**
 * Tests for template file (.att/.mtt) support in the language server
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';

describe('Template file parsing', () => {
  describe('ATT files (.att)', () => {
    it('should parse @var interpolation', async () => {
      const content = 'Hello @name!';
      const result = await parse(content, { startRule: 'TemplateBodyAtt' });

      expect(result.success).toBe(true);
      expect(result.ast.length).toBe(3);
      expect(result.ast[0].type).toBe('Text');
      expect(result.ast[0].content).toBe('Hello ');
      expect(result.ast[1].type).toBe('VariableReference');
      expect(result.ast[1].identifier).toBe('name');
      expect(result.ast[2].type).toBe('Text');
      expect(result.ast[2].content).toBe('!');
    });

    it('should parse /for loops', async () => {
      const content = `/for @item in @items
- @item
/end`;
      const result = await parse(content, { startRule: 'TemplateBodyAtt' });

      expect(result.success).toBe(true);
      expect(result.ast.length).toBe(1);
      expect(result.ast[0].type).toBe('TemplateForBlock');
      expect(result.ast[0].variable.identifier).toBe('item');
    });

    it('should parse <file.md> references', async () => {
      const content = 'Include: <footer.md>';
      const result = await parse(content, { startRule: 'TemplateBodyAtt' });

      expect(result.success).toBe(true);
      expect(result.ast.some(n => n.type === 'FileReference')).toBe(true);
    });

    it('should parse field access @var.field', async () => {
      const content = 'Name: @user.name';
      const result = await parse(content, { startRule: 'TemplateBodyAtt' });

      expect(result.success).toBe(true);
      const varRef = result.ast.find(n => n.type === 'VariableReference');
      expect(varRef).toBeDefined();
      expect(varRef.identifier).toBe('user');
      expect(varRef.fields?.length).toBeGreaterThan(0);
    });

    it('should preserve correct line/column locations', async () => {
      const content = `Line 1 @var1
Line 2 @var2`;
      const result = await parse(content, { startRule: 'TemplateBodyAtt' });

      expect(result.success).toBe(true);
      const var1 = result.ast.find(n => n.type === 'VariableReference' && n.identifier === 'var1');
      const var2 = result.ast.find(n => n.type === 'VariableReference' && n.identifier === 'var2');

      expect(var1?.location.start.line).toBe(1);
      expect(var2?.location.start.line).toBe(2);
    });
  });

  describe('MTT files (.mtt)', () => {
    it('should parse {{var}} interpolation', async () => {
      const content = 'Hello {{name}}!';
      const result = await parse(content, { startRule: 'TemplateBodyMtt' });

      expect(result.success).toBe(true);
      expect(result.ast.length).toBe(3);
      expect(result.ast[0].type).toBe('Text');
      expect(result.ast[0].content).toBe('Hello ');
      expect(result.ast[1].type).toBe('VariableReference');
      expect(result.ast[1].identifier).toBe('name');
      expect(result.ast[2].type).toBe('Text');
      expect(result.ast[2].content).toBe('!');
    });

    it('should parse multiple variables', async () => {
      const content = '{{greeting}} {{name}}!';
      const result = await parse(content, { startRule: 'TemplateBodyMtt' });

      expect(result.success).toBe(true);
      const vars = result.ast.filter(n => n.type === 'VariableReference');
      expect(vars.length).toBe(2);
      expect(vars[0].identifier).toBe('greeting');
      expect(vars[1].identifier).toBe('name');
    });

    it('should preserve correct line/column locations', async () => {
      const content = `Line 1 {{var1}}
Line 2 {{var2}}`;
      const result = await parse(content, { startRule: 'TemplateBodyMtt' });

      expect(result.success).toBe(true);
      const var1 = result.ast.find(n => n.type === 'VariableReference' && n.identifier === 'var1');
      const var2 = result.ast.find(n => n.type === 'VariableReference' && n.identifier === 'var2');

      expect(var1?.location.start.line).toBe(1);
      expect(var2?.location.start.line).toBe(2);
    });

    it('should treat text as plain text (no @var interpretation)', async () => {
      const content = 'Hello @name!'; // @ should be literal in MTT
      const result = await parse(content, { startRule: 'TemplateBodyMtt' });

      expect(result.success).toBe(true);
      // In MTT, @name is just text, not a variable
      expect(result.ast.length).toBe(1);
      expect(result.ast[0].type).toBe('Text');
      expect(result.ast[0].content).toBe('Hello @name!');
    });
  });
});
