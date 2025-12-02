import { describe, it, expect } from 'vitest';
import {
  interpolateTemplate,
  applyTemplates,
  hasTemplateVariables,
  extractVariablePaths,
  createFieldTemplate,
  DEFAULT_TEMPLATES
} from '@interpreter/streaming/template-interpolator';

describe('template-interpolator', () => {
  describe('interpolateTemplate', () => {
    it('should replace simple variable', () => {
      const data = { message: 'hello' };
      expect(interpolateTemplate('@evt.message', data)).toBe('hello');
    });

    it('should replace nested variable', () => {
      const data = { user: { name: 'Alice' } };
      expect(interpolateTemplate('Hello, @evt.user.name!', data)).toBe('Hello, Alice!');
    });

    it('should handle multiple variables', () => {
      const data = { name: 'Bob', age: 30 };
      expect(interpolateTemplate('@evt.name is @evt.age years old', data)).toBe('Bob is 30 years old');
    });

    it('should handle array indexing', () => {
      const data = { items: ['first', 'second', 'third'] };
      expect(interpolateTemplate('@evt.items[0]', data)).toBe('first');
    });

    it('should use empty string for missing variables by default', () => {
      const data = { existing: 'yes' };
      expect(interpolateTemplate('@evt.missing', data)).toBe('');
    });

    it('should use custom missing value when specified', () => {
      const data = {};
      expect(interpolateTemplate('@evt.missing', data, 'text', { missingValue: '???' })).toBe('???');
    });

    it('should handle escape sequences', () => {
      const data = { value: 'test' };
      expect(interpolateTemplate('Email: user@@example.com', data)).toBe('Email: user@example.com');
      expect(interpolateTemplate('100%% complete', data)).toBe('100% complete');
    });

    it('should not replace escaped @@evt', () => {
      const data = { value: 'test' };
      expect(interpolateTemplate('Use @@evt.field for variables', data)).toBe('Use @evt.field for variables');
    });
  });

  describe('format: text', () => {
    it('should output plain text', () => {
      const data = { text: 'hello' };
      expect(interpolateTemplate('@evt.text', data, 'text')).toBe('hello');
    });

    it('should strip ANSI markers in text format', () => {
      const data = { text: 'message' };
      expect(interpolateTemplate('%red%@evt.text%reset%', data, 'text')).toBe('message');
    });

    it('should handle objects as JSON strings', () => {
      const data = { config: { key: 'value' } };
      expect(interpolateTemplate('@evt.config', data, 'text')).toBe('{"key":"value"}');
    });
  });

  describe('format: ansi', () => {
    it('should expand ANSI codes', () => {
      const data = { text: 'error' };
      const result = interpolateTemplate('%red%@evt.text%reset%', data, 'ansi');
      expect(result).toContain('\x1b[31m');  // red
      expect(result).toContain('error');
      expect(result).toContain('\x1b[0m');   // reset
    });

    it('should preserve text without ANSI markers', () => {
      const data = { text: 'plain message' };
      expect(interpolateTemplate('@evt.text', data, 'ansi')).toBe('plain message');
    });
  });

  describe('format: json', () => {
    it('should quote strings', () => {
      const data = { name: 'Alice' };
      expect(interpolateTemplate('@evt.name', data, 'json')).toBe('"Alice"');
    });

    it('should not quote numbers', () => {
      const data = { count: 42 };
      expect(interpolateTemplate('@evt.count', data, 'json')).toBe('42');
    });

    it('should not quote booleans', () => {
      const data = { flag: true };
      expect(interpolateTemplate('@evt.flag', data, 'json')).toBe('true');
    });

    it('should handle null', () => {
      const data = { value: null };
      expect(interpolateTemplate('@evt.value', data, 'json')).toBe('null');
    });

    it('should stringify objects', () => {
      const data = { obj: { a: 1, b: 2 } };
      expect(interpolateTemplate('@evt.obj', data, 'json')).toBe('{"a":1,"b":2}');
    });

    it('should stringify arrays', () => {
      const data = { arr: [1, 2, 3] };
      expect(interpolateTemplate('@evt.arr', data, 'json')).toBe('[1,2,3]');
    });

    it('should strip ANSI markers', () => {
      const data = { text: 'message' };
      expect(interpolateTemplate('%red%@evt.text%reset%', data, 'json')).toBe('"message"');
    });
  });

  describe('applyTemplates', () => {
    it('should generate plain and ansi output', () => {
      const data = { text: 'hello' };
      const templates = {
        text: 'Message: @evt.text',
        ansi: '%green%Message:%reset% @evt.text'
      };

      const result = applyTemplates(data, templates);

      expect(result.plain).toBe('Message: hello');
      expect(result.ansi).toContain('\x1b[32m');  // green
      expect(result.ansi).toContain('hello');
    });

    it('should fallback ansi to text template', () => {
      const data = { text: 'hello' };
      const templates = {
        text: 'Message: @evt.text'
      };

      const result = applyTemplates(data, templates);

      expect(result.plain).toBe('Message: hello');
      expect(result.ansi).toBe('Message: hello');
    });

    it('should include json when template provided', () => {
      const data = { text: 'hello' };
      const templates = {
        text: '@evt.text',
        json: '{"message": @evt.text}'
      };

      const result = applyTemplates(data, templates);

      expect(result.json).toBe('{"message": "hello"}');
    });
  });

  describe('hasTemplateVariables', () => {
    it('should detect template variables', () => {
      expect(hasTemplateVariables('@evt.field')).toBe(true);
      expect(hasTemplateVariables('Hello @evt.name!')).toBe(true);
    });

    it('should not detect escaped variables', () => {
      expect(hasTemplateVariables('@@evt.field')).toBe(false);
    });

    it('should not detect regular text', () => {
      expect(hasTemplateVariables('Hello world')).toBe(false);
      expect(hasTemplateVariables('@other.field')).toBe(false);
    });
  });

  describe('extractVariablePaths', () => {
    it('should extract simple paths', () => {
      expect(extractVariablePaths('@evt.field')).toEqual(['field']);
    });

    it('should extract nested paths', () => {
      expect(extractVariablePaths('@evt.user.name')).toEqual(['user.name']);
    });

    it('should extract multiple paths', () => {
      const template = '@evt.name is @evt.age years old';
      expect(extractVariablePaths(template)).toEqual(['name', 'age']);
    });

    it('should extract array paths', () => {
      expect(extractVariablePaths('@evt.items[0].name')).toEqual(['items[0].name']);
    });

    it('should not extract escaped paths', () => {
      expect(extractVariablePaths('@@evt.field')).toEqual([]);
    });
  });

  describe('createFieldTemplate', () => {
    it('should create simple field template', () => {
      expect(createFieldTemplate('text')).toBe('@evt.text');
      expect(createFieldTemplate('user_name')).toBe('@evt.user_name');
    });
  });

  describe('DEFAULT_TEMPLATES', () => {
    it('should have thinking templates', () => {
      expect(DEFAULT_TEMPLATES.thinking.text).toContain('@evt.text');
      expect(DEFAULT_TEMPLATES.thinking.ansi).toContain('%dim%');
    });

    it('should have message templates', () => {
      expect(DEFAULT_TEMPLATES.message.text).toContain('@evt.chunk');
    });

    it('should have toolUse templates', () => {
      expect(DEFAULT_TEMPLATES.toolUse.text).toContain('@evt.name');
      expect(DEFAULT_TEMPLATES.toolUse.ansi).toContain('%cyan%');
    });

    it('should have error templates', () => {
      expect(DEFAULT_TEMPLATES.error.text).toContain('@evt.message');
      expect(DEFAULT_TEMPLATES.error.ansi).toContain('%red%');
    });
  });

  describe('real-world patterns', () => {
    it('should format Claude thinking event', () => {
      const data = { text: 'Let me think about this...' };
      const result = interpolateTemplate(DEFAULT_TEMPLATES.thinking.ansi!, data, 'ansi');
      expect(result).toContain('Let me think about this...');
      expect(result).toContain('\x1b[2m');  // dim
    });

    it('should format tool use event', () => {
      const data = {
        name: 'read_file',
        input: { path: 'test.txt' }
      };
      const result = interpolateTemplate(DEFAULT_TEMPLATES.toolUse.text!, data, 'text');
      expect(result).toBe('[read_file] {"path":"test.txt"}');
    });

    it('should format error event', () => {
      const data = { message: 'Something went wrong' };
      const result = interpolateTemplate(DEFAULT_TEMPLATES.error.ansi!, data, 'ansi');
      expect(result).toContain('Something went wrong');
      expect(result).toContain('\x1b[31m');  // red
    });

    it('should format metadata event', () => {
      const data = { inputTokens: 100, outputTokens: 50 };
      const result = interpolateTemplate(DEFAULT_TEMPLATES.metadata.text!, data, 'text');
      expect(result).toBe('Tokens: 100 in / 50 out');
    });
  });
});
