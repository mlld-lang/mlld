import { describe, expect, it } from 'vitest';
import { evaluateExecInvocationArgs } from './args';
import { wrapStructured } from '@interpreter/utils/structured-value';

const SERVICES = {
  interpolate: async () => '',
  evaluateExecInvocation: async () => ({ value: undefined, env: {} }),
  mergeResultDescriptor: () => {}
};

describe('evaluateExecInvocationArgs', () => {
  it('keeps non-command structured object args cheap', async () => {
    let toJsonCalls = 0;
    const structured = wrapStructured(
      {
        ok: true,
        toJSON() {
          toJsonCalls += 1;
          return { ok: true };
        }
      },
      'object'
    );

    const result = await evaluateExecInvocationArgs({
      args: [structured],
      env: {} as any,
      commandName: 'inspect',
      definition: { type: 'code', language: 'js' } as any,
      services: SERVICES as any
    });

    expect(result.evaluatedArgs[0]).toBe(structured);
    expect(result.evaluatedArgStrings[0]).toBe('[object]');
    expect(toJsonCalls).toBe(0);
  });

  it('still materializes structured object args for command execution', async () => {
    let toJsonCalls = 0;
    const structured = wrapStructured(
      {
        ok: true,
        toJSON() {
          toJsonCalls += 1;
          return { ok: true };
        }
      },
      'object'
    );

    const result = await evaluateExecInvocationArgs({
      args: [structured],
      env: {} as any,
      commandName: 'shell',
      definition: { type: 'command' } as any,
      services: SERVICES as any
    });

    expect(result.evaluatedArgs[0]).toBe(structured);
    expect(result.evaluatedArgStrings[0]).toBe('{"ok":true}');
    expect(toJsonCalls).toBe(1);
  });
});
