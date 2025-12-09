import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';

describe('Variable Boundary Escape', () => {
  describe('Backtick templates', () => {
    it('should parse @var\\.ext with backslash as boundary', async () => {
      const input = '/var @path = `users/@name\\.json`';
      const { ast } = await parse(input);

      const value = ast[0].values.value;
      expect(value).toHaveLength(3);

      expect(value[0]).toMatchObject({ type: 'Text', content: 'users/' });
      expect(value[1]).toMatchObject({
        type: 'VariableReference',
        identifier: 'name',
        boundary: { type: 'consumed' }
      });
      expect(value[2]).toMatchObject({ type: 'Text', content: '.json' });
    });

    it('should parse field access followed by boundary escape', async () => {
      const input = '/var @path = `data/@user.name\\.json`';
      const { ast } = await parse(input);

      const value = ast[0].values.value;
      expect(value).toHaveLength(3);

      expect(value[0]).toMatchObject({ type: 'Text', content: 'data/' });
      expect(value[1]).toMatchObject({
        type: 'VariableReference',
        identifier: 'user',
        fields: [{ type: 'field', value: 'name' }],
        boundary: { type: 'consumed' }
      });
      expect(value[2]).toMatchObject({ type: 'Text', content: '.json' });
    });

    it('should parse double backslash as literal backslash', async () => {
      const input = '/var @path = `users/@name\\\\.json`';
      const { ast } = await parse(input);

      const value = ast[0].values.value;
      expect(value[1]).toMatchObject({
        type: 'VariableReference',
        identifier: 'name',
        boundary: { type: 'literal', value: '\\' }
      });
    });

    it('should parse without boundary when no escape', async () => {
      const input = '/var @path = `users/@name.json`';
      const { ast } = await parse(input);

      const value = ast[0].values.value;
      expect(value).toHaveLength(2);

      expect(value[0]).toMatchObject({ type: 'Text', content: 'users/' });
      expect(value[1]).toMatchObject({
        type: 'VariableReference',
        identifier: 'name',
        fields: [{ type: 'field', value: 'json' }]
      });
      expect(value[1].boundary).toBeUndefined();
    });
  });

  describe('Double-colon templates', () => {
    it('should parse @var\\.ext in double-colon template', async () => {
      const input = '/var @path = ::users/@name\\.json::';
      const { ast } = await parse(input);

      const value = ast[0].values.value;
      expect(value).toHaveLength(3);

      expect(value[0]).toMatchObject({ type: 'Text', content: 'users/' });
      expect(value[1]).toMatchObject({
        type: 'VariableReference',
        identifier: 'name',
        boundary: { type: 'consumed' }
      });
      expect(value[2]).toMatchObject({ type: 'Text', content: '.json' });
    });
  });

  describe('Angle bracket paths (alligator)', () => {
    it('should parse @var\\.ext in file path', async () => {
      const input = '/var @content = <templates/@agent\\.att>';
      const { ast } = await parse(input);

      const source = ast[0].values.value[0].source;
      expect(source.type).toBe('path');

      const segments = source.segments;
      expect(segments).toHaveLength(4);

      expect(segments[0]).toMatchObject({ type: 'Text', content: 'templates' });
      expect(segments[1]).toMatchObject({ type: 'PathSeparator', value: '/' });
      expect(segments[2]).toMatchObject({
        type: 'VariableReference',
        identifier: 'agent',
        boundary: { type: 'consumed' }
      });
      expect(segments[3]).toMatchObject({ type: 'Text', content: '.att' });
    });

    it('should parse nested path with field access and boundary', async () => {
      const input = '/var @content = <agents/@config.dir/@name\\.mld>';
      const { ast } = await parse(input);

      const source = ast[0].values.value[0].source;
      const segments = source.segments;

      // Find the variable references
      const configVar = segments.find(s =>
        s.type === 'VariableReference' && s.identifier === 'config'
      );
      const nameVar = segments.find(s =>
        s.type === 'VariableReference' && s.identifier === 'name'
      );

      expect(configVar.fields[0].type).toBe('field');
      expect(configVar.fields[0].value).toBe('dir');
      expect(configVar.boundary).toBeUndefined();

      expect(nameVar.boundary).toEqual({ type: 'consumed' });
      expect(nameVar.fields).toBeUndefined();
    });
  });

  describe('Complex cases', () => {
    it('should handle multiple escaped variables in one template', async () => {
      const input = '/var @path = `@dir\\/@file\\.@ext`';
      const { ast } = await parse(input);

      const value = ast[0].values.value;

      // @dir with boundary
      expect(value[0]).toMatchObject({
        type: 'VariableReference',
        identifier: 'dir',
        boundary: { type: 'consumed' }
      });

      // literal /
      expect(value[1]).toMatchObject({ type: 'Text', content: '/' });

      // @file with boundary
      expect(value[2]).toMatchObject({
        type: 'VariableReference',
        identifier: 'file',
        boundary: { type: 'consumed' }
      });

      // literal .
      expect(value[3]).toMatchObject({ type: 'Text', content: '.' });

      // @ext (no boundary, at end)
      expect(value[4]).toMatchObject({
        type: 'VariableReference',
        identifier: 'ext'
      });
    });

    it('should handle escape before method-like extension', async () => {
      const input = '/var @path = `api/@user\\.json`';
      const { ast } = await parse(input);

      const value = ast[0].values.value;
      expect(value[1].identifier).toBe('user');
      expect(value[1].fields).toBeUndefined();
      expect(value[1].boundary).toEqual({ type: 'consumed' });
      expect(value[2].content).toBe('.json');
    });
  });
});
