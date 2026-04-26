import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { asData, isStructuredValue } from '@interpreter/utils/structured-value';
import { NodeFileSystem } from '@services/fs/NodeFileSystem';
import { PathService } from '@services/fs/PathService';

async function evaluateSource(source: string): Promise<Environment> {
  const env = new Environment(new NodeFileSystem(), new PathService(), process.cwd());
  await evaluate(parseSync(source) as any, env);
  return env;
}

function readValue(env: Environment, name: string): unknown {
  const variable = env.getVariable(name);
  expect(variable, `expected @${name} to be defined`).toBeDefined();
  return variable!.value;
}

function readData(env: Environment, name: string): unknown {
  const value = readValue(env, name);
  return isStructuredValue(value) ? asData(value) : value;
}

describe('inline record coercion', () => {
  it('coerces plain RHS values with dynamic schema references and preserves schema metadata', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/var @schema = @contact',
      '/var @result = { name: "Ada" } as record @schema',
      '/var @valid = @result.mx.schema.valid',
      '/var @code = @result.mx.schema.errors[0].code'
    ].join('\n'));

    expect(readData(env, 'valid')).toBe(false);
    expect(readData(env, 'code')).toBe('required');
  });

  it('supports grouped mx access after inline coercion', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], validate: "demote" }',
      '/var @schema = @contact',
      '/var @valid = ({ name: "Ada" } as record @schema).mx.schema.valid'
    ].join('\n'));

    expect(readData(env, 'valid')).toBe(false);
  });

  it('supports inline coercion inside object and array value positions', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/var @schema = @contact',
      '/var @payload = { checked: { name: "Ada" } as record @schema, items: [{ name: "Lin" } as record @schema] }',
      '/var @checkedValid = @payload.checked.mx.schema.valid',
      '/var @itemsValid = @payload.items[0].mx.schema.valid'
    ].join('\n'));

    expect(readData(env, 'checkedValid')).toBe(false);
    expect(readData(env, 'itemsValid')).toBe(false);
  });

  it('supports inline coercion in function arguments and parenthesized schema selection', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/record @strict_contact = { facts: [email: string], data: [name: string], validate: "strict" }',
      '/var @useStrict = false',
      '/exe @id(value) = @value',
      '/var @result = @id({ name: "Ada" } as record (@useStrict ? @strict_contact : @contact))',
      '/var @valid = @result.mx.schema.valid',
      '/var @code = @result.mx.schema.errors[0].code'
    ].join('\n'));

    expect(readData(env, 'valid')).toBe(false);
    expect(readData(env, 'code')).toBe('required');
  });

  it('preserves mx.schema metadata when coercion fails at the root input shape', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], validate: "demote" }',
      '/var @schema = @contact',
      '/var @result = "not-an-object" as record @schema',
      '/var @valid = @result.mx.schema.valid',
      '/var @code = @result.mx.schema.errors[0].code'
    ].join('\n'));

    expect(readData(env, 'valid')).toBe(false);
    expect(readData(env, 'code')).toBe('type');
  });

  it('preserves invalid typed field values for inline and exe output coercion', async () => {
    const env = await evaluateSource([
      '/record @example = {',
      '  key: name,',
      '  facts: [name: string],',
      '  data: {',
      '    trusted: [',
      '      stringField: string?,',
      '      arrayField: array?',
      '    ]',
      '  }',
      '}',
      '/var @schema = @example',
      '/exe @badTool() = { name: "test", stringField: "ok", arrayField: "this is a string not an array" } => record @schema',
      '/var @fromExe = @badTool()',
      '/var @fromInline = { name: "inline", stringField: "ok", arrayField: "still not an array" } as record @schema',
      '/var @exeArray = @fromExe.arrayField',
      '/var @inlineArray = @fromInline.arrayField',
      '/var @exeValid = @fromExe.mx.schema.valid',
      '/var @inlineActual = @fromInline.mx.schema.errors[0].actual'
    ].join('\n'));

    expect(readData(env, 'fromExe')).toMatchObject({
      name: 'test',
      stringField: 'ok',
      arrayField: 'this is a string not an array'
    });
    expect(readData(env, 'fromInline')).toMatchObject({
      name: 'inline',
      stringField: 'ok',
      arrayField: 'still not an array'
    });
    expect(readData(env, 'exeArray')).toBe('this is a string not an array');
    expect(readData(env, 'inlineArray')).toBe('still not an array');
    expect(readData(env, 'exeValid')).toBe(false);
    expect(readData(env, 'inlineActual')).toBe('string');
  });

  it('works inside when conditions through grouped mx access', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], validate: "demote" }',
      '/var @schema = @contact',
      '/var @status = when [',
      '  ({ name: "Ada" } as record @schema).mx.schema.valid == false => "bad"',
      '  * => "ok"',
      ']'
    ].join('\n'));

    expect(readData(env, 'status')).toBe('bad');
  });
});
