import { describe, it, expect } from 'vitest';
import { parse } from '@grammar/parser';

describe('NewExpression', () => {
  it('parses new expressions in /var assignments', async () => {
    const content = '/var @client = new @URL("https://example.com")';
    const { ast } = await parse(content);
    const directive = ast[0];

    expect(directive.type).toBe('Directive');
    expect(directive.kind).toBe('var');

    const valueNode: any = directive.values.value[0];
    expect(valueNode.type).toBe('NewExpression');
    expect(valueNode.target.identifier).toBe('URL');
    expect(valueNode.args).toHaveLength(1);
    expect(valueNode.args[0].type).toBe('Text');
    expect(valueNode.args[0].content).toBe('https://example.com');
  });

  it('parses new expressions with field access targets', async () => {
    const content = '/var @joiner = new @path.posix.join("base")';
    const { ast } = await parse(content);
    const directive = ast[0];

    const valueNode: any = directive.values.value[0];
    expect(valueNode.type).toBe('NewExpression');
    expect(valueNode.target.identifier).toBe('path');
    expect(valueNode.target.fields).toHaveLength(2);
    expect(valueNode.target.fields[0].type).toBe('field');
    expect(valueNode.target.fields[0].value).toBe('posix');
    expect(valueNode.target.fields[1].type).toBe('field');
    expect(valueNode.target.fields[1].value).toBe('join');
  });

  it('parses new expressions without args', async () => {
    const content = '/var @child = new @sandbox';
    const { ast } = await parse(content);
    const directive = ast[0];

    const valueNode: any = directive.values.value[0];
    expect(valueNode.type).toBe('NewExpression');
    expect(valueNode.target.identifier).toBe('sandbox');
    expect(valueNode.args).toHaveLength(0);
  });
});
