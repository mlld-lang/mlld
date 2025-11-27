import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('Export directive valueType regression', () => {
  test('single variable export should have valueType: identifier', async () => {
    const result = (await parse('/export { @myVar }')).ast;
    const directive = result[0];

    expect(directive.kind).toBe('export');
    expect(directive.values.exports).toHaveLength(1);
    expect(directive.values.exports[0].valueType).toBe('identifier');
    expect(directive.values.exports[0].identifier).toBe('myVar');
  });

  test('multiple variable exports should all have valueType: identifier', async () => {
    const result = (await parse('/export { @func1, @func2, @var3 }')).ast;
    const directive = result[0];

    expect(directive.kind).toBe('export');
    expect(directive.values.exports).toHaveLength(3);

    directive.values.exports.forEach((exp: any) => {
      expect(exp.valueType).toBe('identifier');
    });

    expect(directive.values.exports[0].identifier).toBe('func1');
    expect(directive.values.exports[1].identifier).toBe('func2');
    expect(directive.values.exports[2].identifier).toBe('var3');
  });

  test('wildcard export should have identifier: *', async () => {
    const result = (await parse('/export { * }')).ast;
    const directive = result[0];

    expect(directive.kind).toBe('export');
    expect(directive.values.exports).toHaveLength(1);
    expect(directive.values.exports[0].identifier).toBe('*');
  });

  test('mixed exports with wildcard', async () => {
    const result = (await parse('/export { @func, * }')).ast;
    const directive = result[0];

    expect(directive.kind).toBe('export');
    expect(directive.values.exports).toHaveLength(2);
    expect(directive.values.exports[0].valueType).toBe('identifier');
    expect(directive.values.exports[0].identifier).toBe('func');
    expect(directive.values.exports[1].identifier).toBe('*');
  });

  test('export with alias should have valueType: identifier', async () => {
    const result = (await parse('/export { @original as renamed }')).ast;
    const directive = result[0];

    expect(directive.kind).toBe('export');
    expect(directive.values.exports).toHaveLength(1);
    expect(directive.values.exports[0].valueType).toBe('identifier');
    expect(directive.values.exports[0].identifier).toBe('original');
    expect(directive.values.exports[0].alias).toBe('renamed');
  });

  test('no export should be marked as guardExport', async () => {
    const result = (await parse('/export { @a, @b, @c, @d }')).ast;
    const directive = result[0];

    directive.values.exports.forEach((exp: any) => {
      expect(exp.valueType).not.toBe('guardExport');
      expect(exp.valueType).toBe('identifier');
    });
  });
});
