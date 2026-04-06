import { describe, expect, it } from 'vitest';
import { parseSync } from '@grammar/parser';
import { evaluate } from '@interpreter/core/interpreter';
import { Environment } from '@interpreter/env/Environment';
import { TestEffectHandler } from '@interpreter/env/EffectHandler';
import { accessField } from '@interpreter/utils/field-access';
import { asData, getRecordProjectionMetadata, isStructuredValue } from '@interpreter/utils/structured-value';
import { MemoryFileSystem } from '@tests/utils/MemoryFileSystem';
import { PathService } from '@services/fs/PathService';
import { createSimpleTextVariable } from '@core/types/variable';
import { makeSecurityDescriptor } from '@core/types/security';

async function evaluateSource(
  source: string,
  options: {
    captureOutput?: boolean;
    configureEnv?: (env: Environment) => void;
  } = {}
): Promise<Environment> {
  const env = new Environment(new MemoryFileSystem(), new PathService(), '/');
  if (options.captureOutput) {
    env.setEffectHandler(new TestEffectHandler());
  }
  options.configureEnv?.(env);
  await evaluate(parseSync(source) as any, env);
  return env;
}

function readVariableData(env: Environment, name: string): unknown {
  const variable = env.getVariable(name);
  expect(variable, `expected @${name} to be defined`).toBeDefined();
  const value = variable!.value;
  return isStructuredValue(value) ? asData(value) : value;
}

function readOutput(env: Environment): string {
  const handler = env.getEffectHandler();
  expect(handler).toBeInstanceOf(TestEffectHandler);
  return (handler as TestEffectHandler).getOutput().trim();
}

describe('wrapper boundary matrix', () => {
  it('preserves known policy authorization proofs through bare exe passthroughs', async () => {
    const env = await evaluateSource([
      '/var known @approvedRecipient = "acct-1"',
      '/exe tool:w @sendMoney(recipient, amount) = `sent:@amount` with { controlArgs: ["recipient"] }',
      '/exe @passthrough(item) = [',
      '  let @w = @item',
      '  => @w',
      ']',
      '/var @approvedViaPassthrough = @passthrough(@approvedRecipient)',
      '/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { sendMoney: { args: { recipient: @approvedViaPassthrough } } } } }',
      '/show @sendMoney("acct-1", 5) with { policy: @taskPolicy }'
    ].join('\n'), {
      captureOutput: true
    });

    expect(readOutput(env)).toBe('sent:5');
  });

  it('preserves fact-backed policy authorization proofs through bare exe passthroughs', async () => {
    const env = await evaluateSource([
      '/exe exfil:send, tool:w @createCalendarEvent(participants, title) = `sent:@title` with { controlArgs: ["participants"] }',
      '/exe @passthrough(item) = [',
      '  let @w = @item',
      '  => @w',
      ']',
      '/var @participantsViaPassthrough = @passthrough(@participants)',
      '/var @taskPolicy = { defaults: { rules: ["no-send-to-unknown"] }, operations: { "exfil:send": ["tool:w"] }, authorizations: { allow: { createCalendarEvent: { args: { participants: @participantsViaPassthrough } } } } }',
      '/show @createCalendarEvent(@participants, "Lunch") with { policy: @taskPolicy }'
    ].join('\n'), {
      captureOutput: true,
      configureEnv(env) {
        env.setVariable(
          'participants',
          createSimpleTextVariable(
            'participants',
            'group-1',
            {
              directive: 'var',
              syntax: 'quoted',
              hasInterpolation: false,
              isMultiLine: false
            },
            {
              security: makeSecurityDescriptor({
                labels: ['fact:@calendar_evt.participants']
              })
            }
          )
        );
      }
    });

    expect(readOutput(env)).toBe('sent:Lunch');
  });

  it('preserves record field fact labels through exe passthrough and shelf read boundaries', async () => {
    const env = await evaluateSource([
      '/record @contact = {',
      '  key: id,',
      '  facts: [id: string, email: string],',
      '  data: [name: string]',
      '}',
      '/shelf @state = {',
      '  selected: contact?',
      '}',
      '/exe @coerce(v) = js { return v; } => contact',
      '/exe @passthrough(item) = [',
      '  let @w = @item',
      '  => @w',
      ']',
      '/var @candidate = @passthrough(@coerce({ id: "c_1", email: "ada@example.com", name: "Ada" }))',
      '@shelf.write(@state.selected, @candidate)',
      '/var @emailLabels = @shelf.read(@state.selected).email.mx.labels'
    ].join('\n'));

    expect(readVariableData(env, 'emailLabels')).toContain('fact:@contact.email');
  });

  it('preserves record projection metadata through exe passthrough and shelf read boundaries', async () => {
    const env = await evaluateSource([
      '/record @contact = {',
      '  key: id,',
      '  facts: [id: string, email: string],',
      '  data: [name: string]',
      '}',
      '/shelf @state = {',
      '  selected: contact?',
      '}',
      '/exe @coerce(v) = js { return v; } => contact',
      '/exe @passthrough(item) = [',
      '  let @w = @item',
      '  => @w',
      ']',
      '/var @candidate = @passthrough(@coerce({ id: "c_1", email: "ada@example.com", name: "Ada" }))',
      '@shelf.write(@state.selected, @candidate)',
      '/var @selected = @shelf.read(@state.selected)'
    ].join('\n'));

    const selected = env.getVariable('selected')?.value;
    expect(selected).toBeDefined();
    expect(getRecordProjectionMetadata(selected)).toMatchObject({
      kind: 'record',
      recordName: 'contact'
    });

    const email = await accessField(selected, { type: 'field', value: 'email' } as any, { env });
    expect(getRecordProjectionMetadata(email)).toMatchObject({
      kind: 'field',
      recordName: 'contact',
      fieldName: 'email',
      classification: 'fact'
    });
  });
});
