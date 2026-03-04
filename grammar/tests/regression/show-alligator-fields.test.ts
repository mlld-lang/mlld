import { describe, expect, test } from 'vitest';
import { parse } from '@grammar/parser';

describe('show alligator field-access regression', () => {
  test('parses /show <file>.mx.field as FileReference load content', async () => {
    const result = await parse('/show <@root/task.md>.mx.diff', { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;

    const directive = result.ast[0] as any;
    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('show');
    expect(directive.subtype).toBe('showLoadContent');
    expect(directive.values.loadContent.type).toBe('FileReference');
    expect(directive.values.loadContent.fields.map((field: any) => field.value)).toEqual(['mx', 'diff']);
  });

  test('parses external pipelines after /show <file>.mx.field', async () => {
    const result = await parse('/show <task.md>.mx.filename | @upper', { mode: 'strict' });
    expect(result.success).toBe(true);
    if (!result.success) throw result.error;

    const directive = result.ast[0] as any;
    expect(directive.values.loadContent.type).toBe('FileReference');
    expect(directive.values.loadContent.pipes).toHaveLength(1);
    expect(directive.values.loadContent.pipes[0].transform).toBe('upper');
  });
});
