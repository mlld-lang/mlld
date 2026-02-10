import { describe, expect, it } from 'vitest';
import type { Variable } from '@core/types/variable';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';
import {
  buildPostVariablePreview,
  clonePostGuardVariable,
  clonePostGuardVariableWithDescriptor,
  resolvePostGuardValue,
  truncatePostPreview
} from '@interpreter/hooks/guard-post-materialization';

function createVariable(name: string, value: unknown, labels: string[] = []): Variable {
  const variable = createSimpleTextVariable(
    name,
    typeof value === 'string' ? value : `${name}-value`,
    {
      directive: 'var',
      syntax: 'quoted',
      hasInterpolation: false,
      isMultiLine: false
    },
    {
      security: makeSecurityDescriptor({ labels, sources: [`source:${name}`] })
    }
  ) as Variable;
  (variable as any).value = value;
  return variable;
}

describe('guard post materialization', () => {
  it('builds previews for representative variable shapes without secret redaction', () => {
    const textVar = createVariable('text', 'hello world');
    const objectTextVar = createVariable('objectText', { text: 'from-text-field' });
    const objectVar = createVariable('object', { nested: 42 });
    const secretVar = createVariable('secret', 'classified', ['secret']);

    expect(buildPostVariablePreview(textVar)).toBe('hello world');
    expect(buildPostVariablePreview(objectTextVar)).toBe('from-text-field');
    expect(buildPostVariablePreview(objectVar)).toBe(JSON.stringify({ nested: 42 }));
    expect(buildPostVariablePreview(secretVar)).toBe('classified');
  });

  it('clones input variables and replacement variables with descriptor updates', () => {
    const original = createVariable('secretVar', 'raw-secret', ['secret']);
    const descriptor = makeSecurityDescriptor({
      labels: ['blessed'],
      sources: ['guard:post']
    });

    const inputClone = clonePostGuardVariable(original);
    expect(inputClone).not.toBe(original);
    expect(inputClone.name).toBe('input');
    expect(inputClone.internal?.isReserved).toBe(true);
    expect(inputClone.internal?.isSystem).toBe(true);

    const descriptorClone = clonePostGuardVariableWithDescriptor(original, descriptor);
    expect(descriptorClone).not.toBe(original);
    expect(descriptorClone.mx?.labels ?? []).toEqual(expect.arrayContaining(['blessed']));
    expect(descriptorClone.mx?.sources ?? []).toEqual(expect.arrayContaining(['guard:post']));
  });

  it('resolves post-guard values and falls back to preview output for nullish values', () => {
    const textField = createVariable('textField', { text: 'from-text' });
    const dataField = createVariable('dataField', { data: 'from-data' });
    const nullish = createVariable('nullish', null);
    const fallback = createVariable('fallback', 'fallback-preview');

    expect(resolvePostGuardValue(textField, fallback)).toBe('from-text');
    expect(resolvePostGuardValue(dataField, fallback)).toBe('from-data');
    expect(resolvePostGuardValue(nullish, fallback)).toBe('fallback-preview');
    expect(resolvePostGuardValue(undefined, fallback)).toBe('fallback-preview');
  });

  it('truncates long previews with a stable suffix', () => {
    const longText = 'x'.repeat(210);
    expect(truncatePostPreview(longText, 20)).toBe(`${'x'.repeat(20)}…`);
  });
});
