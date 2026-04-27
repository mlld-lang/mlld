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

  it('preserves structured metadata when array augmented assignment appends proof-bearing entries', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/var @schema = @contact',
      '/exe @viaConcat(ctx, entry) = [',
      '  let @entries = @ctx.entries',
      '  let @entries = @entries.concat([@entry])',
      '  => { entries: @entries }',
      ']',
      '/exe @viaAugmented(ctx, entry) = [',
      '  let @entries = @ctx.entries',
      '  let @entries += [@entry]',
      '  => { entries: @entries }',
      ']',
      '/var @entry = { email: "ada@example.com", name: "Ada" } as record @schema',
      '/var @bucketEntry = { identity_value: @entry, field_values: { email: @entry.email }, value: { email: @entry.email } }',
      '/var @ctx = { entries: [] }',
      '/var @concat = @viaConcat(@ctx, @bucketEntry)',
      '/var @augmented = @viaAugmented(@ctx, @bucketEntry)',
      '/var @concatIdentityLabel = @concat.entries[0].identity_value.email.mx.labels[0]',
      '/var @augmentedIdentityLabel = @augmented.entries[0].identity_value.email.mx.labels[0]',
      '/var @concatFieldSource = @concat.entries[0].field_values.email.mx.factsources[0].ref',
      '/var @augmentedFieldSource = @augmented.entries[0].field_values.email.mx.factsources[0].ref',
      '/var @concatValueSource = @concat.entries[0].value.email.mx.factsources[0].ref',
      '/var @augmentedValueSource = @augmented.entries[0].value.email.mx.factsources[0].ref',
      '/var @concatSchemaValid = @concat.entries[0].identity_value.mx.schema.valid',
      '/var @augmentedSchemaValid = @augmented.entries[0].identity_value.mx.schema.valid'
    ].join('\n'));

    expect(readVariableData(env, 'concatIdentityLabel')).toBe('fact:@contact.email');
    expect(readVariableData(env, 'augmentedIdentityLabel')).toBe('fact:@contact.email');
    expect(readVariableData(env, 'concatFieldSource')).toBe('@contact.email');
    expect(readVariableData(env, 'augmentedFieldSource')).toBe('@contact.email');
    expect(readVariableData(env, 'concatValueSource')).toBe('@contact.email');
    expect(readVariableData(env, 'augmentedValueSource')).toBe('@contact.email');
    expect(readVariableData(env, 'concatSchemaValid')).toBe(true);
    expect(readVariableData(env, 'augmentedSchemaValid')).toBe(true);
  });

  it('preserves structured metadata when loop accumulators append proof-bearing entries', async () => {
    const env = await evaluateSource([
      '/record @contact = { facts: [email: string], data: [name: string], validate: "demote" }',
      '/var @schema = @contact',
      '/exe @loopConcat(first, second) = loop(3) [',
      '  let @ctx = when [',
      '    @input.kind == "append" => @input',
      '    * => { kind: "append", index: 0, entries: [] }',
      '  ]',
      '  if @ctx.index >= 2 [ done @ctx.entries ]',
      '  let @entry = when [',
      '    @ctx.index == 0 => @first',
      '    * => @second',
      '  ]',
      '  let @nextEntries = @ctx.entries',
      '  let @nextEntries = @nextEntries.concat([@entry])',
      '  continue { kind: "append", index: @ctx.index + 1, entries: @nextEntries }',
      ']',
      '/exe @loopAugmented(first, second) = loop(3) [',
      '  let @ctx = when [',
      '    @input.kind == "append" => @input',
      '    * => { kind: "append", index: 0, entries: [] }',
      '  ]',
      '  if @ctx.index >= 2 [ done @ctx.entries ]',
      '  let @entry = when [',
      '    @ctx.index == 0 => @first',
      '    * => @second',
      '  ]',
      '  let @nextEntries = @ctx.entries',
      '  let @nextEntries += [@entry]',
      '  continue { kind: "append", index: @ctx.index + 1, entries: @nextEntries }',
      ']',
      '/var @ada = { email: "ada@example.com", name: "Ada" } as record @schema',
      '/var @lin = { email: "lin@example.com", name: "Lin" } as record @schema',
      '/var @first = { identity_value: @ada, field_values: { email: @ada.email }, value: { email: @ada.email } }',
      '/var @second = { identity_value: @lin, field_values: { email: @lin.email }, value: { email: @lin.email } }',
      '/var @concat = @loopConcat(@first, @second)',
      '/var @augmented = @loopAugmented(@first, @second)',
      '/var @concatSecondLabel = @concat[1].identity_value.email.mx.labels[0]',
      '/var @augmentedSecondLabel = @augmented[1].identity_value.email.mx.labels[0]',
      '/var @concatSecondFieldSource = @concat[1].field_values.email.mx.factsources[0].ref',
      '/var @augmentedSecondFieldSource = @augmented[1].field_values.email.mx.factsources[0].ref',
      '/var @concatSecondValueSource = @concat[1].value.email.mx.factsources[0].ref',
      '/var @augmentedSecondValueSource = @augmented[1].value.email.mx.factsources[0].ref',
      '/var @concatSecondSchemaValid = @concat[1].identity_value.mx.schema.valid',
      '/var @augmentedSecondSchemaValid = @augmented[1].identity_value.mx.schema.valid'
    ].join('\n'));

    expect(readVariableData(env, 'concatSecondLabel')).toBe('fact:@contact.email');
    expect(readVariableData(env, 'augmentedSecondLabel')).toBe('fact:@contact.email');
    expect(readVariableData(env, 'concatSecondFieldSource')).toBe('@contact.email');
    expect(readVariableData(env, 'augmentedSecondFieldSource')).toBe('@contact.email');
    expect(readVariableData(env, 'concatSecondValueSource')).toBe('@contact.email');
    expect(readVariableData(env, 'augmentedSecondValueSource')).toBe('@contact.email');
    expect(readVariableData(env, 'concatSecondSchemaValid')).toBe(true);
    expect(readVariableData(env, 'augmentedSecondSchemaValid')).toBe(true);
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
