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

function requireVariable(env: Environment, name: string) {
  const variable = env.getVariable(name);
  expect(variable, `expected @${name} to be defined`).toBeDefined();
  return variable!;
}

function readVariableData(env: Environment, name: string): unknown {
  const value = requireVariable(env, name).value;
  return isStructuredValue(value) ? asData(value) : value;
}

describe('exe block return structured metadata', () => {
  it('preserves labels on direct .mx access after returning a let-bound variable', async () => {
    const env = await evaluateSource([
      '/exe @passthrough(item) = [',
      '  let @w = @item',
      '  => @w',
      ']',
      '/var untrusted @input = "attacker"',
      '/var @label = @passthrough(@input).mx.labels[0]'
    ].join('\n'));

    expect(readVariableData(env, 'label')).toBe('untrusted');
  });

  it('preserves nested fact labels after storing a returned let-bound record', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string] }',
      '/exe @coerce(v) = js { return v; } => contact',
      '/exe @passthrough(item) = [',
      '  let @w = @coerce(@item)',
      '  => @w',
      ']',
      '/var @result = @passthrough({ email: "ada@example.com" })',
      '/var @factLabel = @result.email.mx.labels[0]'
    ].join('\n'));

    expect(readVariableData(env, 'factLabel')).toBe('fact:@contact.email');
  });

  it('preserves schema metadata after storing a returned let-bound record', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/exe @coerce(v) = js { return v; } => contact',
      '/exe @passthrough(item) = [',
      '  let @w = @coerce(@item)',
      '  => @w',
      ']',
      '/var @result = @passthrough({ name: "No Email" })',
      '/var @schemaValid = @result.mx.schema.valid',
      '/var @schemaCode = @result.mx.schema.errors[0].code'
    ].join('\n'));

    expect(readVariableData(env, 'schemaValid')).toBe(false);
    expect(readVariableData(env, 'schemaCode')).toBe('required');
  });

  it('preserves schema metadata through bare template exe passthroughs', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/exe @id(item) = @item',
      '/var @result = @id({ name: "No Email" } as record @contact)',
      '/var @schemaValid = @result.mx.schema.valid',
      '/var @schemaCode = @result.mx.schema.errors[0].code'
    ].join('\n'));

    expect(readVariableData(env, 'schemaValid')).toBe(false);
    expect(readVariableData(env, 'schemaCode')).toBe('required');
  });

  it('preserves schema metadata through let-bound object wrappers returned from exe blocks', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/exe @coerce(v) = js { return v; } => contact',
      '/exe @broken(item) = [',
      '  let @w = @coerce(@item)',
      '  let @wrap = { payload: @w }',
      '  => @wrap',
      ']',
      '/var @result = @broken({ name: "No Email" })',
      '/var @schemaValid = @result.payload.mx.schema.valid',
      '/var @schemaCode = @result.payload.mx.schema.errors[0].code'
    ].join('\n'));

    expect(readVariableData(env, 'schemaValid')).toBe(false);
    expect(readVariableData(env, 'schemaCode')).toBe('required');
  });

  it('preserves structured payload metadata through loop result assembly', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/exe @coerce(v) = js { return v; } => contact',
      '/var @result = loop(1) [',
      '  let @w = @coerce({ name: "No Email" })',
      '  done { payload: @w }',
      ']',
      '/var @schemaValid = @result.payload.mx.schema.valid',
      '/var @schemaCode = @result.payload.mx.schema.errors[0].code'
    ].join('\n'));

    expect(readVariableData(env, 'schemaValid')).toBe(false);
    expect(readVariableData(env, 'schemaCode')).toBe('required');
  });

  it('preserves deep mx field access through interpolation after exe passthrough wrapping', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/exe @coerce(v) = js { return v; } => contact',
      '/exe @broken(item) = [',
      '  let @w = @coerce(@item)',
      '  let @wrap = { payload: @w }',
      '  => @wrap',
      ']',
      '/var @result = @broken({ name: "No Email" })',
      '/var @message = `valid=@result.payload.mx.schema.valid code=@result.payload.mx.schema.errors[0].code`'
    ].join('\n'));

    expect(readVariableData(env, 'message')).toBe('valid=false code=required');
  });
});
