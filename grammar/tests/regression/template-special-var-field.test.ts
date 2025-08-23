import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';

describe('Regression: field access on special variables in templates', () => {
  it('parses field access for @input inside double quotes', async () => {
    const input = '/show "Name: @input.name"';
    const result = (await parse(input)).ast;

    expect(result).toHaveLength(1);
    const showDir = result[0];
    const content = showDir.values.content;
    expect(content).toHaveLength(2);
    const varRef = content[1];
    expect(varRef.type).toBe('VariableReference');
    expect(varRef.identifier).toBe('input');
    expect(varRef.isSpecial).toBe(true);
    expect(varRef.fields).toHaveLength(1);
    expect(varRef.fields[0].value).toBe('name');
  });
});
